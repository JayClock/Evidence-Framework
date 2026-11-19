import { describe, expect, it } from 'vitest';
import {
  createEmptyDomainModel,
  type EvidenceEntityAST,
} from '@evidence-poc/evidence-schema';
import {
  analyzeTraceability,
  buildFmCheckReport,
  buildKeyDataLedger,
  createEntityMutator,
  createRelationshipMutator,
  removeAttributeMutator,
  updateAttributeMutator,
  createModelSession,
  parseModelBundleText,
  parseModelSourceFiles,
  serializeDomainModel,
  serializeModelBundle,
} from '../index.js';

const evidence = (
  kind: EvidenceEntityAST['kind'],
  label: string,
): EvidenceEntityAST => ({
  type: 'entity',
  category: 'evidence',
  id: `evidence.${kind.replaceAll('_', '-')}`,
  kind,
  label,
});

const receipt = evidence('fulfillment_confirmation', '付款确认');

const reload = (document: ReturnType<typeof createEmptyDomainModel>) => [
  parseModelBundleText(serializeModelBundle(document), { validate: true }),
  parseModelSourceFiles(serializeDomainModel(document), { validate: true }),
];

describe('evidence-first authoring', () => {
  it('persists the four lifecycle kinds and supports undo back to an empty model', () => {
    const empty = createEmptyDomainModel();
    const nodes = [
      evidence('rfp', '询价'),
      evidence('proposal', '报价'),
      evidence('contract', '口头合同'),
      receipt,
    ];
    const session = createModelSession({
      document: empty,
      validateOnDispatch: true,
    });
    session.mutate((draft) =>
      nodes.forEach((node) => createEntityMutator(draft, node)),
    );
    for (const parsed of reload(session.getDocument())) {
      expect(parsed.issues).toEqual([]);
      expect(parsed.document.entities).toEqual(expect.arrayContaining(nodes));
      expect(parsed.document.manifest.entryContextRefs).toEqual([]);
    }
    expect(session.undo()).toBe(true);
    expect(session.getDocument()).toEqual(empty);
    for (const parsed of reload(empty)) expect(parsed.issues).toEqual([]);
    expect(session.redo()).toBe(true);
  });

  it('links a source and pairs the same confirmation without inventing a context or time', () => {
    const amount = {
      name: 'agreed_amount',
      label: '已确认交易金额',
      meaning: '交易双方约定的金额',
      valueType: 'int' as const,
      keyData: true,
    };
    const paymentRequest = {
      ...evidence('fulfillment_request', '收款主张'),
      attributes: [{ ...amount, source: { kind: 'request-input' as const } }],
    };
    const session = createModelSession({
      document: createEmptyDomainModel(),
      validateOnDispatch: true,
    });
    session.mutate((draft) =>
      createEntityMutator(draft, { ...receipt, attributes: [amount] }),
    );
    expect(buildKeyDataLedger(session.getDocument()).decisionOwed).toHaveLength(
      1,
    );

    const before = session.getDocument();
    session.mutate((draft) => {
      createEntityMutator(draft, paymentRequest);
      updateAttributeMutator(draft, receipt.id, amount.name, {
        source: {
          kind: 'preceding-evidence',
          entityRef: paymentRequest.id,
          attribute: amount.name,
        },
      });
      createRelationshipMutator(draft, {
        type: 'relationship',
        id: 'relation.receipt-confirms-request',
        kind: 'references',
        label: '确认引用请求',
        sourceRef: receipt.id,
        targetRef: paymentRequest.id,
      });
    });
    const after = session.getDocument();
    expect(
      session
        .getGraph()
        .fulfillmentPair(paymentRequest.id)
        ?.confirmations.map(({ id }) => id),
    ).toEqual([receipt.id]);
    expect(buildKeyDataLedger(after).entries[0]).toMatchObject({
      source: 'preceding-evidence',
      providers: [{ ref: paymentRequest.id, attribute: amount.name }],
    });
    expect(analyzeTraceability(after).document.edges).toEqual([
      {
        source: `${paymentRequest.id}#${amount.name}`,
        target: `${receipt.id}#${amount.name}`,
        sourceKind: 'preceding-evidence',
      },
    ]);
    for (const parsed of reload(after)) expect(parsed.issues).toEqual([]);
    expect(() =>
      session.mutate((draft) =>
        removeAttributeMutator(draft, paymentRequest.id, amount.name, {
          cascade: true,
        }),
      ),
    ).toThrow(/still referenced/);
    expect(() =>
      session.mutate((draft) =>
        updateAttributeMutator(draft, paymentRequest.id, amount.name, {
          source: {
            kind: 'preceding-evidence',
            entityRef: receipt.id,
            attribute: amount.name,
          },
        }),
      ),
    ).toThrow();
    expect(session.getDocument()).toBe(after);
    expect(session.undo()).toBe(true);
    expect(session.getDocument()).toEqual(before);
  });

  it('reports malformed source declarations as errors rather than tracing them', () => {
    const model = createEmptyDomainModel();
    model.entities.push({
      ...receipt,
      attributes: [
        {
          name: 'amount',
          label: '金额',
          meaning: '实付金额',
          keyData: true,
          source: null as never,
        },
      ],
    });
    const { report } = buildFmCheckReport({ model });
    expect(report.consistent).toBe(false);
    expect(report.errors.join('\n')).toContain('attributes[0].source');
  });

  it('reports missing responsibility and time as scope gaps, not graph errors', () => {
    const model = createEmptyDomainModel();
    const id = 'context.sales';
    model.entities.push(
      {
        type: 'entity',
        category: 'context',
        kind: 'contract',
        id,
        label: '销售',
      },
      { ...receipt, contextRef: id },
    );
    const { report } = buildFmCheckReport({ model, scopeRefs: [id] });
    expect(report).toMatchObject({
      consistent: true,
      complete: false,
      errors: [],
    });
    expect(report.gaps.join('\n')).toMatch(/responsibleRoleRef/);
    expect(report.gaps.join('\n')).toMatch(/occurrence/);
  });
});

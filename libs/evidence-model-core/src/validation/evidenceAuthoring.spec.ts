import { describe, expect, it } from 'vitest';
import {
  createEmptyDomainModel,
  type EvidenceEntityAST,
} from '@evidence-poc/evidence-schema';
import {
  buildFmCheckReport,
  createEntityMutator,
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
    expect(report.gaps.join('\n')).toMatch(/confirmed_at/);
  });
});

import { describe, expect, it } from 'vitest';
import { RelationshipASTSchema } from '@evidence-poc/evidence-schema';
import { createProcurementModel } from '../testing/modelFixture.js';
import { breachFlowGaps } from './breachFlow.js';
import { completenessGaps } from './scope.js';
import { createModelSession } from '../session/createModelSession.js';
import { setRelationshipFlowMutator } from '../mutations/relationshipMutations.js';

describe('explicit breach paths', () => {
  it('does not materialize defaults or infer breach semantics from names', () => {
    const model = createProcurementModel();
    const edge = model.relationships[0]!;
    expect(RelationshipASTSchema.parse(edge)).toEqual(edge);
    model.entities[0]!.label = '超时赔偿';
    expect(breachFlowGaps(model)).toEqual([]);
    expect(
      RelationshipASTSchema.safeParse({ ...edge, flowKind: 'unknown' }).success,
    ).toBe(false);
  });
  it('requires a new request to reference the breached request', () => {
    const model = createProcurementModel();
    model.relationships[0]!.flowKind = 'breach_compensation';
    expect(breachFlowGaps(model).join()).toContain(
      'breached Fulfillment Request',
    );
    model.relationships[1]!.flowKind = 'breach_compensation';
    expect(breachFlowGaps(model).join()).toContain('new Fulfillment Request');
  });
  it('checks compensation closure and cycles without guessing legal outcomes', () => {
    const model = createProcurementModel();
    const original = model.entities.find(
      (item) => item.id === 'request.payment',
    )!;
    model.entities.push({
      ...original,
      id: 'request.compensation',
      label: '违约补偿',
    });
    model.relationships.push({
      type: 'relationship',
      id: 'relation.compensation',
      kind: 'references',
      sourceRef: 'request.compensation',
      targetRef: original.id,
      label: '补偿原请求',
      flowKind: 'breach_compensation',
    });
    expect(breachFlowGaps(model)).toEqual([]);
    expect(completenessGaps(model, []).join()).toContain(
      'request.compensation: must be associated',
    );
    model.relationships.push({
      ...model.relationships.at(-1)!,
      id: 'relation.cycle',
      sourceRef: original.id,
      targetRef: 'request.compensation',
    });
    expect(breachFlowGaps(model).join()).toContain('cyclic');
  });
  it('requires an accountable escalation record with a named endpoint', () => {
    const model = createProcurementModel();
    const edge = model.relationships.find(
      (item) => item.sourceRef === 'evidence.bank-slip',
    )!;
    edge.flowKind = 'escalation';
    expect(breachFlowGaps(model).join()).toContain('hand-off endpoint');
    edge.notes = '移交争议处理专员；凭证仅证明受理，不代表法院裁定。';
    expect(breachFlowGaps(model)).toEqual([]);
  });
  it('edits a marker through a single undoable session mutation', () => {
    const session = createModelSession({ document: createProcurementModel() });
    const id = 'relation.slip-references-request';
    session.mutate(
      (draft) => setRelationshipFlowMutator(draft, id, 'escalation'),
      'set-flow',
    );
    expect(
      session.getDocument().relationships.find((item) => item.id === id)
        ?.flowKind,
    ).toBe('escalation');
    session.undo();
    expect(
      session.getDocument().relationships.find((item) => item.id === id)
        ?.flowKind,
    ).toBeUndefined();
  });
});

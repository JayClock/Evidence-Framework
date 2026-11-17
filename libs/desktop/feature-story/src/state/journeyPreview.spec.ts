import { collectFlowScenarios } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import modelText from '../../../../../examples/full-spectrum-procurement/model/full-spectrum-procurement.evidence.json?raw';
import { previewJourneyStep } from './journeyPreview';

const model = JSON.parse(modelText) as DomainModelDocument;
const flows = collectFlowScenarios(model);
const preview = (flowId: string, entityId: string) => {
  const flow = flows.find((f) => f.flowId === flowId)!;
  return previewJourneyStep(
    model,
    flow,
    flow.steps.find((s) => s.entityId === entityId)!,
  );
};

describe('journey scenario rehearsal', () => {
  it('replays every golden step without CEL errors or changing model facts', () => {
    const before = JSON.stringify(model);
    expect(flows.map((f) => f.flowId)).toEqual([
      'defect-escalation',
      'happy-path',
      'late-delivery',
    ]);
    for (const flow of flows)
      for (const step of flow.steps) {
        const rehearsal = previewJourneyStep(model, flow, step);
        expect(
          rehearsal.rules.filter((r) => r.error),
          `${flow.flowId}/${step.entityId}`,
        ).toEqual([]);
        if (flow.flowId === 'happy-path')
          expect(rehearsal.flowKind).toBe('primary');
      }
    expect(JSON.stringify(model)).toBe(before);
  });

  it('does not activate a branch or consume future examples before a breach occurs', () => {
    for (const flowId of ['happy-path', 'late-delivery', 'defect-escalation']) {
      expect(preview(flowId, 'doc-escrow-agreement').flowKind).toBe('primary');
      const early = preview(flowId, 'req-equipment-delivery');
      expect(early.triggeredRuleIds).toEqual([]);
      expect(
        early.rules.some((r) => r.id === 'rule-breach-detection-overdue'),
      ).toBe(false);
    }
    expect(preview('happy-path', 'conf-equipment-delivery').flowKind).toBe(
      'primary',
    );
  });

  it('detects overdue delivery, activates compensation and derives the modeled penalty', () => {
    const detection = preview('late-delivery', 'conf-equipment-delivery');
    expect(detection.flowKind).toBe('breach_compensation');
    expect(detection.triggeredRuleIds).toContain(
      'rule-breach-detection-overdue',
    );
    expect(detection.relatedEntityIds).toEqual(
      expect.arrayContaining(['req-breach-penalty', 'thing-tariff-calculator']),
    );
    const claim = preview('late-delivery', 'req-breach-penalty');
    expect(
      claim.rules.find((r) => r.id === 'rule-derive-penalty-amount')?.value,
    ).toEqual({ minorUnits: 100000, currency: 'CNY' });
    expect(claim.activeRelationshipIds).toContain('rel-breach-uses-calculator');
    expect(preview('late-delivery', 'conf-escrow-release').flowKind).toBe(
      'primary',
    );
  });

  it('upgrades a failed inspection to an independent escrow freeze and collateral role', () => {
    const inspection = preview('defect-escalation', 'doc-sgs-inspection-cert');
    expect(inspection.flowKind).toBe('escalation');
    expect(inspection.triggeredRuleIds).toContain('rule-defect-escalation');
    expect(inspection.relatedEntityIds).toContain('req-escrow-freeze');
    const freeze = preview('defect-escalation', 'req-escrow-freeze');
    expect(freeze.flowKind).toBe('escalation');
    expect(freeze.relatedEntityIds).toContain('role-collateral-voucher');
    expect(freeze.activeRelationshipIds).toContain(
      'rel-freeze-references-voucher',
    );
  });

  it('surfaces invalid CEL input instead of treating it as a passed check or a detected breach', () => {
    const flow = structuredClone(
      flows.find((f) => f.flowId === 'late-delivery')!,
    );
    const step = flow.steps.find(
      (s) => s.entityId === 'conf-equipment-delivery',
    )!;
    const invalid = {
      ...step,
      values: { ...step.values, confirmed_at: 'not-a-time' },
    };
    const result = previewJourneyStep(
      model,
      { ...flow, steps: flow.steps.map((s) => (s === step ? invalid : s)) },
      invalid,
    );
    expect(
      result.rules.find((r) => r.id === 'rule-breach-detection-overdue')?.error,
    ).toContain('timestamp');
    expect(result.triggeredRuleIds).toEqual([]);
  });
});

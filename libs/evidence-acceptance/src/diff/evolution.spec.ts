import { procurementEvolution } from '@evidence-poc/evidence-api/testing';
import { buildDelivery } from '@evidence-poc/evidence-api';
import { compareContracts } from './compareContracts.js';

const stages = procurementEvolution();

describe('procurement contract evolution', () => {
  it.each(stages.map((model, index) => [index + 1, model] as const))(
    'keeps stage %s immutable and reports no changes against itself',
    async (_stage, model) => {
      const original = structuredClone(model);
      const snapshot = buildDelivery(model);
      expect(snapshot.diagnostics).toEqual([]);
      const diff = await compareContracts(snapshot, snapshot);
      expect(diff.changes).toEqual([]);
      expect(diff.details).toEqual({});
      expect(diff.hasBreakingChanges).toBe(false);
      expect(model).toEqual(original);
    },
  );

  it('adds fulfillment branches without breaking existing operations', async () => {
    const result = await compareContracts(
      buildDelivery(stages[2]!),
      buildDelivery(stages[3]!),
    );
    expect(result.hasBreakingChanges).toBe(false);
    expect(
      result.changes.filter((change) => change.id === 'endpoint-added'),
    ).toHaveLength(8);
  });

  it('reports removed operations and required input additions', async () => {
    const result = await compareContracts(
      buildDelivery(stages[3]!),
      buildDelivery(stages[4]!),
    );
    expect(result.hasBreakingChanges).toBe(true);
    expect(
      result.changes.some(
        (change) => change.level === 3 && change.path?.includes('delivery'),
      ),
    ).toBe(true);
    expect(
      result.changes.some(
        (change) => change.level === 3 && change.text.includes('total_amount'),
      ),
    ).toBe(true);
    expect(result.changelog).toContain('total_amount');
  });
});

import { decideGovernance } from './governanceLoop.js';

const drift = (
  kind: string,
  severity: 'block' | 'warn',
  message = kind,
  evidenceRef: string | null = null,
) => ({ kind, severity, message, evidenceRef });

describe('decideGovernance', () => {
  it.each([
    { testCount: 0, passedCount: 0 },
    { testCount: 1.5, passedCount: 1.5 },
    { testCount: 1, passedCount: 1, errors: ['runner failed'] },
  ])(
    'never treats an empty or invalid runner summary as a green gate',
    (acceptance) => {
      const result = decideGovernance({
        drift: [
          {
            kind: 'UNMODELED_ATTRIBUTE_WRITTEN',
            severity: 'warn',
            message: 'new field',
          },
        ],
        acceptance,
      });
      expect(result.canPatchModel).toBe(false);
      expect(result.verdict).toBe('needs_repair');
    },
  );
  it('says healthy when production and the model agree', () => {
    const decision = decideGovernance({
      drift: [],
      acceptance: { testCount: 3, passedCount: 3 },
    });

    expect(decision).toEqual({
      verdict: 'healthy',
      rationale: ['生产与模型没有分歧。', '3/3 个测试通过 HTTP 验收。'],
      actions: [],
      canPatchModel: false,
    });
  });

  it('treats an unmodeled evidence as the model falling behind', () => {
    const decision = decideGovernance({
      drift: [
        drift(
          'UNMODELED_EVIDENCE_COMMITTED',
          'block',
          '模型里没有这张凭证。',
          'evidence.ghost',
        ),
      ],
      acceptance: { testCount: 2, passedCount: 2 },
    });

    expect(decision.verdict).toBe('model_lagging');
    expect(decision.actions).toEqual([
      {
        kind: 'adopt_production_change',
        target: 'evidence.ghost',
        reason: expect.stringContaining('补进所属上下文'),
        tool: 'roleify_and_invert_dependency',
      },
    ]);
    // The audit blocks, so absorbing the change needs a person first.
    expect(decision.canPatchModel).toBe(false);
  });

  it('never lets a derived value be absorbed into the model', () => {
    const decision = decideGovernance({
      drift: [
        drift(
          'DERIVED_VALUE_SUPPLIED',
          'block',
          'request.payment#amount 是算出来的。',
          'request.payment',
        ),
      ],
      acceptance: { testCount: 2, passedCount: 2 },
    });

    expect(decision.verdict).toBe('production_overreach');
    expect(decision.actions.map((item) => item.kind)).toEqual([
      'raise_blocking_ticket',
    ]);
    expect(decision.actions[0]?.tool).toBeNull();
    expect(decision.canPatchModel).toBe(false);
  });

  it('offers a patch when the only finding is a missing compensation path', () => {
    const decision = decideGovernance({
      drift: [
        drift(
          'BREACH_WITHOUT_FOLLOW_UP',
          'warn',
          '违约后没有后续。',
          'request.payment',
        ),
      ],
      acceptance: { testCount: 3, passedCount: 3 },
    });

    expect(decision.verdict).toBe('model_lagging');
    expect(decision.actions).toEqual([
      {
        kind: 'close_compensation_gap',
        target: 'request.payment',
        reason: expect.stringContaining('补偿履约对'),
        tool: 'add_breach_compensation',
      },
    ]);
    expect(decision.canPatchModel).toBe(true);
  });

  it('closes the patch path when HTTP acceptance fails', () => {
    const decision = decideGovernance({
      drift: [
        drift(
          'UNMODELED_ATTRIBUTE_WRITTEN',
          'warn',
          '多了一个字段。',
          'evidence.payment',
        ),
      ],
      acceptance: {
        testCount: 3,
        passedCount: 2,
        errors: ['scenario.payment: completed != pending'],
      },
    });

    expect(decision.verdict).toBe('needs_repair');
    expect(decision.actions.map((item) => item.kind)).toContain(
      'repair_implementation',
    );
    expect(decision.canPatchModel).toBe(false);
    expect(decision.rationale).toContain('2/3 个测试通过 HTTP 验收。');
  });

  it('refuses to patch when there is no HTTP acceptance result', () => {
    const decision = decideGovernance({
      drift: [drift('UNMODELED_ATTRIBUTE_WRITTEN', 'warn')],
    });

    expect(decision.canPatchModel).toBe(false);
    expect(decision.rationale).toContain(
      '没有 HTTP 验收结果：本轮不确认实现符合模型。',
    );
  });

  it('ranks a production overreach above a failed HTTP acceptance run', () => {
    const decision = decideGovernance({
      drift: [drift('DERIVED_VALUE_SUPPLIED', 'block')],
      acceptance: { testCount: 1, passedCount: 0 },
    });

    expect(decision.verdict).toBe('production_overreach');
    expect(decision.actions.map((item) => item.kind)).toEqual([
      'raise_blocking_ticket',
      'repair_implementation',
    ]);
  });

  it('hands an unknown kind to a person instead of guessing a remedy', () => {
    const decision = decideGovernance({
      drift: [drift('SOMETHING_NEW', 'warn')],
      acceptance: { testCount: 1, passedCount: 1 },
    });

    expect(decision.actions[0]).toMatchObject({
      kind: 'raise_blocking_ticket',
      tool: null,
      reason: expect.stringContaining('SOMETHING_NEW'),
    });
  });
});

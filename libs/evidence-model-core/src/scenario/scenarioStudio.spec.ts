import { createFulfillmentPairMutator } from '../mutations/fulfillmentMutations.js';
import { createProcurementModel } from '../testing/modelFixture.js';
import { createModelSession } from '../session/createModelSession.js';
import {
  cloneScenarioExamples,
  evaluateScenario,
  replaceScenarioExamples,
  scenarioExamples,
  type ScenarioExample,
} from './scenarioStudio.js';

const examples = (flow = '正常订阅'): ScenarioExample[] => [
  {
    entityRef: 'contract.procurement',
    example: {
      label: '订阅约定',
      value: { quantity: 2, signed_at: '2026-01-01T00:00:00Z' },
      test: { flow, actingRoleRef: 'role.buyer', asOf: '2026-01-01T00:00:00Z' },
    },
  },
  {
    entityRef: 'request.payment',
    example: {
      label: '请求付款',
      value: {
        started_at: '2026-01-01T00:00:00Z',
        expired_at: '2026-01-01T01:00:00Z',
        requested_minor_units: 200,
      },
      test: {
        flow,
        actingRoleRef: 'role.seller',
        asOf: '2026-01-01T00:01:00Z',
        basedOn: ['contract.procurement#订阅约定'],
      },
    },
  },
  {
    entityRef: 'confirmation.payment',
    example: {
      label: '付款事实',
      value: { confirmed_at: '2026-01-01T00:30:00Z', paid_minor_units: 200 },
      test: {
        flow,
        actingRoleRef: 'role.buyer',
        asOf: '2026-01-01T00:30:00Z',
        basedOn: ['request.payment#请求付款'],
      },
    },
  },
];

describe('scenario authoring and local oracle', () => {
  it('only replays compensation when the refund obligation and facts are explicitly modeled', () => {
    const model = createProcurementModel();
    const time = (name: string) => ({
      name,
      label: name,
      meaning: '合同约定的业务时间',
      valueType: 'timestamp' as const,
      required: true,
      keyData: true,
    });
    createFulfillmentPairMutator(model, {
      contextRef: 'context.procurement',
      request: {
        id: 'request.refund',
        label: '断供退款请求',
        responsibleRoleRef: 'role.buyer',
        attributes: [time('started_at'), time('expired_at')],
      },
      confirmation: {
        id: 'confirmation.refund',
        label: '退款确认',
        responsibleRoleRef: 'role.seller',
        attributes: [time('confirmed_at')],
      },
      contractReferenceId: 'relation.refund-contract',
    });
    const flow = '断供退款';
    const cases = examples(flow).slice(0, 1);
    cases.push({
      entityRef: 'request.refund',
      example: {
        label: '申请退款',
        value: {
          started_at: '2026-01-02T00:00:00Z',
          expired_at: '2026-01-03T00:00:00Z',
        },
        test: {
          flow,
          actingRoleRef: 'role.buyer',
          asOf: '2026-01-02T00:00:00Z',
          basedOn: ['contract.procurement#订阅约定'],
          tags: ['breach_compensation'],
        },
      },
    });
    cases.push({
      entityRef: 'confirmation.refund',
      example: {
        label: '退款到账',
        value: { confirmed_at: '2026-01-02T01:00:00Z' },
        test: {
          flow,
          actingRoleRef: 'role.seller',
          asOf: '2026-01-02T01:00:00Z',
          basedOn: ['request.refund#申请退款'],
          tags: ['breach_compensation'],
        },
      },
    });
    replaceScenarioExamples(model, flow, cases);
    const results = evaluateScenario(model, flow);
    expect(
      results[2].rules.find(
        (r) => r.ruleRef === 'rule.request.refund-completed',
      )?.value,
    ).toBe(true);
    expect(results.map((r) => r.ref)).toEqual([
      'contract.procurement#订阅约定',
      'request.refund#申请退款',
      'confirmation.refund#退款到账',
    ]);
    expect(scenarioExamples(model, 'unmodeled-refund')).toEqual([]);
  });
  it('runs normal, late and absent confirmation cases without inferring a refund workflow', () => {
    const model = createProcurementModel();
    replaceScenarioExamples(model, '正常订阅', examples());
    const before = JSON.stringify(model);
    const normal = evaluateScenario(model, '正常订阅');
    expect(normal[0].values.total_minor_units).toBe(200);
    expect(
      normal[2].rules.find((r) => r.ruleRef === 'rule.payment-completed')
        ?.value,
    ).toBe(true);
    expect(JSON.stringify(model)).toBe(before);
    const late = cloneScenarioExamples(model, '正常订阅', '逾期付款');
    late[2].example.value.confirmed_at = '2026-01-01T02:00:00Z';
    late[2].example.test!.asOf = '2026-01-01T02:00:00Z';
    replaceScenarioExamples(model, '逾期付款', late);
    expect(
      evaluateScenario(model, '逾期付款')[2].rules.find(
        (r) => r.ruleRef === 'rule.payment-completed',
      )?.value,
    ).toBe(false);
    const pending = cloneScenarioExamples(model, '正常订阅', '未付款').slice(
      0,
      2,
    );
    replaceScenarioExamples(model, '未付款', pending);
    expect(
      evaluateScenario(model, '未付款')[1].rules.find(
        (r) => r.ruleRef === 'rule.payment-completed',
      )?.value,
    ).toBe(false);
    expect(scenarioExamples(model, '正常订阅')).toEqual(examples());
  });
  it('never feeds expected derivations back into the oracle and reports missing values', () => {
    const model = createProcurementModel();
    const cases = examples();
    cases[0].example.value.total_minor_units = 999;
    replaceScenarioExamples(model, '正常订阅', cases);
    const result = evaluateScenario(model, '正常订阅');
    expect(result[0].values.total_minor_units).toBe(200);
    expect(result[0].gaps.join()).toContain('不一致');
    delete cases[0].example.value.quantity;
    replaceScenarioExamples(model, '正常订阅', cases);
    const missing = evaluateScenario(model, '正常订阅')[0];
    expect(missing.gaps.join()).toContain('采购数量');
    expect(missing.rules[0].error).toBeDefined();
    expect(missing.values.total_minor_units).toBeUndefined();
  });
  it('keeps scene changes in one undo step and rejects duplicate or cyclic references', () => {
    const session = createModelSession({ document: createProcurementModel() });
    session.mutate((draft) =>
      replaceScenarioExamples(draft, '正常订阅', examples()),
    );
    const saved = session.getDocument();
    const loop = examples();
    loop[0].example.test!.basedOn = ['confirmation.payment#付款事实'];
    expect(() =>
      session.mutate((draft) =>
        replaceScenarioExamples(draft, '正常订阅', loop),
      ),
    ).toThrow('CYCLIC_DEPENDENCY');
    expect(session.getDocument()).toBe(saved);
    expect(() =>
      session.mutate((draft) =>
        replaceScenarioExamples(draft, '正常订阅', [
          ...examples(),
          examples()[0],
        ]),
      ),
    ).toThrow('重复');
    expect(session.undo()).toBe(true);
    expect(scenarioExamples(session.getDocument(), '正常订阅')).toEqual([]);
    expect(session.redo()).toBe(true);
    expect(scenarioExamples(session.getDocument(), '正常订阅')).toHaveLength(3);
  });
  it('does not use a rejected operation as a fact in later steps', () => {
    const model = createProcurementModel();
    const cases = examples();
    cases[1].example.test!.expectedStatus = 422;
    replaceScenarioExamples(model, '正常订阅', cases);
    const result = evaluateScenario(model, '正常订阅');
    expect(result[1].gaps.join()).toContain('不会形成');
    expect(result[2].rules[0].error).toContain('前置用例');
  });
});

import {
  projectWorkbenchData,
  type CompiledModel,
  type WorkbenchData,
} from './workbenchProjection.js';

type JsonObject = Record<string, unknown>;

/** The fixture `test_generate_review.py` uses, so both engines see one model. */
const fixtureSource = (): {
  schemaVersion: string;
  model: JsonObject;
  entities: JsonObject[];
  relationships: JsonObject[];
  rules: JsonObject[];
} => ({
  schemaVersion: '5.0',
  model: { name: '测试模型' },
  entities: [
    { id: 'context.a', category: 'context', kind: 'contract', label: '约定' },
    {
      id: 'contract.a',
      category: 'evidence',
      kind: 'contract',
      contextRef: 'context.a',
      label: '协议',
    },
    {
      id: 'request.a',
      category: 'evidence',
      kind: 'fulfillment_request',
      contextRef: 'context.a',
      label: '付款请求',
      sourceRefs: ['SECRET'],
      notes: 'SECRET',
    },
    {
      id: 'role.proof',
      category: 'role',
      kind: 'evidence',
      contextRef: 'context.a',
      label: '付款证明',
    },
    {
      id: 'confirmation.other',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      label: '外部扣款',
    },
  ],
  relationships: [
    {
      id: 'relation.use',
      kind: 'references',
      sourceRef: 'request.a',
      targetRef: 'role.proof',
      label: '采信',
    },
    {
      id: 'relation.play',
      kind: 'plays_role',
      sourceRef: 'confirmation.other',
      targetRef: 'role.proof',
      label: '提供证明',
    },
  ],
  rules: [
    {
      id: 'rule.a',
      label: '已付款',
      kind: 'completion',
      contextRef: 'context.a',
      description: '以外部付款证明判断完成。',
      expression: 'proof.success',
      bindings: { proof: { ref: 'role.proof' } },
      sourceRefs: ['SECRET'],
    },
  ],
});

const fixture = (): CompiledModel => fixtureSource();

const project = (
  model: CompiledModel = fixture(),
  overrides: Partial<Parameters<typeof projectWorkbenchData>[0]> = {},
): WorkbenchData =>
  projectWorkbenchData({
    model,
    check: {},
    ...overrides,
  });

const nodeOf = (data: WorkbenchData, id: string): JsonObject =>
  data.nodes.find((node) => node.id === id) as JsonObject;

describe('projectWorkbenchData', () => {
  it('counts Contract Contexts without counting Contract evidence', () => {
    expect(project().counts.contracts).toBe(1);
  });

  it('keeps the request a pure graph object under its Context', () => {
    const data = project();
    const request = nodeOf(data, 'request.a');

    expect(data.nodes.some((node) => node.group === 'fulfillment')).toBe(false);
    expect(request['parent']).toBe('context.a');
    expect(request).not.toHaveProperty('fulfillmentRef');
  });

  it('projects explicit relationships as labelled edges', () => {
    const { edges } = project();

    expect(edges).toEqual(
      expect.arrayContaining([
        { from: 'request.a', to: 'role.proof', label: '采信' },
        { from: 'confirmation.other', to: 'role.proof', label: '提供证明' },
      ]),
    );
  });

  it('links an API binding scope through explicit references only', () => {
    const data = project(fixture(), {
      api: {
        bindings: [
          {
            id: 'binding.a',
            scopeResourceRef: 'resource.a',
            basis: { sourceRefs: ['SECRET'] },
          },
        ],
        resources: [{ id: 'resource.a', entityRef: 'request.a' }],
      },
    });

    expect(data.edges).toEqual(
      expect.arrayContaining([
        { from: 'binding.a', to: 'resource.a', label: '实例范围' },
      ]),
    );
    expect(JSON.stringify(data)).not.toContain('SECRET');
  });

  it('draws the inverse link from a rule to the object it binds', () => {
    const data = project();

    expect(
      data.edges.filter((edge) => edge.to === 'role.proof').map((edge) => edge.from),
    ).toContain('rule.a');
    expect(nodeOf(data, 'rule.a')['description']).toBe('以外部付款证明判断完成。');
  });

  it('reuses a derivation rule for the field it computes', () => {
    const model = fixtureSource();

    (model.entities[1] as JsonObject)['attributes'] = [
      { name: 'amount', valueType: 'int' },
    ];
    (model.entities[2] as JsonObject)['attributes'] = [
      {
        name: 'amount',
        valueType: 'int',
        derivedByRuleRef: 'rule.amount',
      },
      { name: 'currency', valueType: 'string' },
    ];
    model.rules.push({
      id: 'rule.amount',
      kind: 'derivation',
      description: '读取协议金额并乘以传入数量。',
      expression: 'agreement.amount * quantity',
      resultType: 'int',
      bindings: {
        agreement: { ref: 'contract.a' },
        quantity: { type: 'int', sourceRefs: ['SECRET'] },
      },
      target: { entityRef: 'request.a', attribute: 'amount' },
    });

    const data = project(model);
    const rule = nodeOf(data, 'rule.amount');

    expect(rule['bindings']).toEqual([
      { alias: 'agreement', ref: 'contract.a' },
      { alias: 'quantity', type: 'int' },
    ]);
    expect(rule['expression']).toBe('agreement.amount * quantity');
    expect(data.edges).toEqual(
      expect.arrayContaining([
        { from: 'request.a#amount', to: 'rule.amount', label: '由规则计算' },
        { from: 'rule.amount', to: 'request.a#amount', label: '计算结果' },
      ]),
    );
    expect(
      data.edges.some(
        (edge) => edge.from === 'request.a#currency' && edge.label === '由规则计算',
      ),
    ).toBe(false);
    expect(data.nodes.filter((node) => node.id === 'rule.amount')).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain('SECRET');
  });

  it('never embeds provenance, raw inputs or material sources', () => {
    const encoded = JSON.stringify(project());

    for (const forbidden of [
      'SECRET',
      'sourceRefs',
      'modelDigest',
      'inputFiles',
      'executions',
      'locations',
      'notes',
    ]) {
      expect(encoded).not.toContain(forbidden);
    }
    expect(project()).not.toHaveProperty('files');
  });

  it('reports a dangling reference instead of silently dropping it', () => {
    const model = fixtureSource();

    (model.rules[0] as JsonObject)['bindings'] = {
      proof: { ref: 'role.proof' },
      missing: { ref: 'unknown.object' },
    };

    expect(project(model).unresolved).toEqual(['unknown.object']);
  });

  it('fails on a duplicate id instead of overwriting the first object', () => {
    const model = fixtureSource();

    model.entities.push(model.entities[0] as JsonObject);

    expect(() => project(model)).toThrow(/重复对象 ID/);
  });

  it('treats a false result as a successful counterexample', () => {
    const data = project(fixture(), {
      scenarios: [
        {
          id: 'scenario.no',
          label: '未完成',
          evaluations: [{ ruleRef: 'rule.a', expectedResult: false }],
        },
      ],
      simulation: {
        scenarioResults: [
          {
            scenarioId: 'scenario.no',
            simulationPassed: true,
            evaluations: [{ ruleRef: 'rule.a', result: false, passed: true }],
          },
        ],
      },
    });
    const [evaluation] = nodeOf(data, 'scenario.no')['evaluations'] as JsonObject[];

    expect(evaluation).toEqual({
      ruleRef: 'rule.a',
      expected: false,
      actual: false,
      passed: true,
    });
  });

  it('makes an API rule binding navigable without its basis', () => {
    const data = project(fixture(), {
      api: {
        capabilities: [
          {
            id: 'capability.a',
            businessCapability: '登记',
            actorRoleRef: 'role.proof',
            effect: { targetRef: 'request.a' },
            ruleBindings: [{ ruleRef: 'rule.a' }],
            basis: { sourceRefs: ['SECRET'] },
          },
        ],
        http: { operations: [], representations: [], journeys: [] },
      },
    });

    expect(data.edges).toEqual(
      expect.arrayContaining([
        { from: 'capability.a', to: 'rule.a', label: '应用规则' },
      ]),
    );
    expect(JSON.stringify(data)).not.toContain('SECRET');
  });

  it('attaches interview traces to the Evidence they cite', () => {
    const data = project(fixture(), {
      traces: [
        {
          traceId: 'trace-1',
          focus: { evidenceRef: 'request.a' },
          narrative: { judgment: '测试采购请求依据', story: '测试故事' },
          qa: [{ questionId: 'Q1', question: '何时支付？' }],
          userInput: { rawText: '下单后15分钟', confirmedFacts: ['15分钟'] },
          targetBindings: [
            { evidenceRef: 'request.a', sourceType: 'interview_statement' },
          ],
        },
      ],
    });
    const request = nodeOf(data, 'request.a');

    expect(request['interviewTraces']).toEqual([
      expect.objectContaining({ traceId: 'trace-1' }),
    ]);
  });

  it('prints the check verdict the page displays', () => {
    const data = project(fixture(), {
      check: {
        consistent: true,
        complete: true,
        scopeRefs: ['context.a'],
        contextRefs: ['context.a'],
        gaps: [],
        simulationPassed: true,
        timelineSummary: { unresolvedOrderCount: 3 },
      },
      generatedAt: '2026-11-12T00:00:00.000Z',
    });

    expect(data.validation).toEqual({
      fm: true,
      consistent: true,
      complete: true,
      scopeRefs: ['context.a'],
      contextRefs: ['context.a'],
      gaps: [],
      simulationLimitations: [],
      simulation: true,
      api: null,
      runtime: false,
      unresolvedOrderCount: 3,
    });
    expect(data.generatedAt).toBe('2026-11-12T00:00:00.000Z');
    expect(data.title).toBe('测试模型');
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCurrentPrompt,
  buildDiscoveryPolicy,
  buildPhaseGuard,
} from './prompts.ts';
import { getPhaseDefinition } from './phases.ts';
import { answerQuestion } from './discovery.ts';
import { ContractViewSchema } from './discovery-schema.ts';
import {
  contractContent,
  discoveryContent,
  seedQuestions,
  saveDiscoveryContent,
} from './discovery-test-support.ts';
import {
  createInitialState,
  DEFAULT_CONFIG,
  readText,
  REQUIREMENTS_PATH,
  writeTextAtomic,
} from './storage.ts';

const guidePath =
  '.pi/skills/evidence-modeling/references/discovery-workshop.md';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'evidence-discovery-prompt-'));
  roots.push(root);
  const state = createInitialState('test', '从业务叙述开始发现');
  state.status = 'running';
  for (const path of [getPhaseDefinition('modeling').skillFile, guidePath]) {
    await writeTextAtomic(root, path, await readText(process.cwd(), path));
  }
  await writeTextAtomic(
    root,
    REQUIREMENTS_PATH,
    '# 业务输入\n我们想减少合作中的争议。',
  );
  return {
    root,
    state,
    prompt: () => buildCurrentPrompt(root, state, DEFAULT_CONFIG),
    policy: () => buildDiscoveryPolicy(root),
  };
}

const question = {
  id: 'Q-001',
  focus: 'responsibilities',
  target: null,
  prompt: '双方分别承诺什么？',
  impact: '识别真实约定义务，而不是把每个动作当作履约。',
  blocking: true,
  sourceRefs: ['INPUT'],
};

describe('context-led discovery prompt contract (not an LLM behavior evaluation)', () => {
  it('starts with candidate identification and keeps the canonical guide once in system policy, out of task history', async () => {
    const h = await setup();
    const before = structuredClone(h.state);
    const guide = (await readText(h.root, guidePath)).trim();
    const prompt = await h.prompt();
    expect(prompt).toContain('当前焦点：识别业务上下文');
    expect(prompt).not.toContain(guide);
    expect((await h.policy()).split(guide)).toHaveLength(2);
    expect(prompt).not.toContain('先定位问题与探索范围');
    expect(prompt).not.toContain('当前焦点：scope');
    expect(prompt).not.toContain('artifacts/01-requirements/story-map.md');
    expect(h.state).toEqual(before);
  });

  it('requires a sourced candidate before the next question without imposing an approval stage', async () => {
    const h = await setup();
    const first = await h.policy();
    await saveDiscoveryContent(h.root, h.state, contractContent());
    const resumed = await h.prompt();
    for (const prompt of [first, await h.policy()]) {
      for (const rule of [
        '提问前先展示有来源的候选结构、依据与不确定点',
        '履约请求 → 确认凭证',
        'Confirmation 不默认是人工审批',
        '不从权责方推导确认人',
        '独立验收须有业务依据',
        '先通过 evidence_save_discovery 追加本轮发现记录',
        '全未知的文本为 null，部分已知保留原依据',
        '没有约定依据时先问一件真实发生的事',
        'label 不含职责、来源、缺口、候选标记或建模纪律',
        '局部未知不抹去已知事实',
        '历史记录不可改写或删除',
        '详细分析放 description／notes',
      ])
        expect(prompt).toContain(rule);
    }
    expect(resumed).toContain('履约请求：作者 → 平台');
    expect(resumed).toContain('履约确认凭证：待明确');
    expect(resumed).toContain('当前展开：支付分成');
  });

  it.each([
    [
      'recursive responsibility discovery',
      [
        '逐项检查主要履约的违约情况',
        '对新增的补偿履约重复检查',
        '不因已有一项赔付就认为整个合同的异常已覆盖',
        '直到有依据地确认只能诉诸法律',
      ],
    ],
    [
      'sourced suggestions and terminal branches',
      [
        '先展示“前序履约 → 违约触发条件 → 新履约候选”',
        '缺少责任约定时，提出具体违约情景和责任缺口',
        '不默认存在罚息、退款、赔偿或直接诉讼',
        '自动作废且不产生额外义务',
        '不能仅因由系统自动执行就排除真实的退款或赔付义务',
        'parentFulfillmentRef',
      ],
    ],
    [
      'bounded interaction and recorded gaps',
      [
        '逐项检查是 Agent 的分析责任，不是预排问卷',
        '未检查、待核实、已明确新责任、已明确终点',
        '未知、跳过、暂缓和范围外都不等于责任链已经闭合',
        '人工停止后只保存已知结论与缺口',
        '不新建结构化检查表或第二套状态字段',
      ],
    ],
  ])('injects %s on initial and resumed discovery', async (_name, rules) => {
    const h = await setup();
    const first = await h.policy();
    await saveDiscoveryContent(h.root, h.state, contractContent());
    const resumed = await h.policy();
    for (const prompt of [first, resumed]) {
      for (const rule of rules) expect(prompt).toContain(rule);
      expect(prompt).toContain('每轮只问一个核心问题');
      expect(prompt).toContain('不换 Q-ID 重问同一缺口');
    }
  });

  it('keeps tool schema and formalization guidance aligned with non-derived type times', async () => {
    const schemaText = JSON.stringify(ContractViewSchema);
    expect(schemaText).toContain('不因缺公式清空已知结构');
    expect(schemaText).toContain('来源未知须标明，影响判断时澄清');
    expect(schemaText).toContain('字段非空不表示期限依据已解决');
    expect(schemaText).not.toContain('有来源的确定期限或计算依据；未知为 null');
    for (const file of [
      'format.md',
      'semantics.md',
      'validation.md',
      'migration-v3.md',
      'traceability-and-simulation.md',
      'README.md',
    ]) {
      const text = await readText(
        process.cwd(),
        `.pi/skills/evidence-modeling/references/${file}`,
      );
      expect(text).toContain('非派生');
      expect(text).toContain('四色');
      expect(text).toContain('业务来源');
      expect(text).not.toContain('缺依据保持发现阻塞');
      expect(text).not.toContain(
        '材料未明确截止时刻或计算依据时必须保持待确认',
      );
      expect(text).not.toContain('缺确定的截止时间依据须回到发现');
      expect(text).not.toContain('只有材料中额外规则的真实歧义才返回发现');
      expect(text).not.toContain('已有额外规则的真实歧义才回到发现');
    }
  });

  it('loads mandatory evidence time knowledge on the first discovery turn', async () => {
    const h = await setup();
    const prompt = (await h.policy()).replace(/[ \t]+/g, ' ');
    for (const rule of [
      '`rfp`、`proposal`、`fulfillment_request` | `start_at`、`expired_at`',
      '`contract` | `signed_at`',
      '`fulfillment_confirmation` | `confirmed_at`',
      '`other_evidence` | `created_at`',
      '不允许无期限或 `openEndedReason`',
      '最终 `entities/*.yaml` 的 `attributes`',
      '是否阻塞取决于业务依据缺口的影响，不取决于有没有公式',
    ])
      expect(prompt).toContain(rule);
  });

  it.each([
    [
      'rfp',
      '邀请的开始时间 start_at、回应截止时间 expired_at',
      '不默认开始等于编辑、发送或送达时刻',
    ],
    [
      'proposal',
      '方案的有效开始时间 start_at、有效截止时间 expired_at',
      '接受不自动等于签约',
    ],
    [
      'fulfillment_request',
      '本次请求的开始时间 start_at、截止时间 expired_at',
      '不赋予任意设定期限的权限',
    ],
    ['contract', '该合同的签约时间 signed_at', '不认定哪种行为构成签约'],
    [
      'fulfillment_confirmation',
      '该凭证的履约确认时间 confirmed_at',
      '不自动改成回调到达或入库时间',
    ],
    [
      'other_evidence',
      '该凭证的形成时间 created_at',
      '不把形成更正凭证当作原事件重发生',
    ],
  ])(
    'injects %s time meaning and boundaries on first and resumed turns',
    async (_kind, meaning, boundary) => {
      const h = await setup();
      const first = await h.policy();
      await saveDiscoveryContent(h.root, h.state, contractContent());
      for (const policy of [first, await h.policy()]) {
        expect(policy).toContain(meaning);
        expect(policy).toContain(boundary);
        expect(policy).toContain(
          '以上六类都不为展开时间属性索取实际日期、生成公式',
        );
        expect(policy).toContain('时刻属性，不额外补请求区间或有效期');
        expect(policy).toContain('不能把一个自由 timestamp 参数当成解决依据');
        expect(policy).toContain(
          '提供方和证明作用的缺口与“时间属性未展开”分开',
        );
        expect(policy).toContain('不新建发现 DSL');
      }
    },
  );

  it.each([
    [
      'type time structure without mandatory generation formulas',
      [
        '类型属性定义、实例时间值、额外生成规则是三个层次',
        '类型建模不要求先有实例值或生成公式',
        '只写“规定时间内付款”且已识别付款请求时',
        '这类付款请求的截止时间依据什么约定确定？',
        '已知类型语义不因未给时长退回 null',
        '类型模型的非派生时间属性无需 derivedByRuleRef',
        '实际实例缺 required 时间值仍校验失败',
        '这只表达类型含义，不证明期限来源已查明',
        '不得用 resolution 关闭期限确定依据问题',
      ],
    ],
    [
      'reuse of sourced time semantics',
      [
        '先补读和复用，只问影响当前业务判断的真实缺口',
        '按索引补读相关明细，不重新询问已经明确的事实',
        '凭证类型、时间业务含义及计算依据已明确时，直接复用对应属性',
        '保存规则和 `INPUT`／`SRC-*`／最新 `A-*` 来源',
        '付款请求.expired_at = 付款请求.start_at + 72小时',
        '支付确认.confirmed_at ≤ 付款请求.expired_at',
        '不提供当前业务事实或默认72小时期限',
      ],
    ],
    [
      'business ambiguity rather than invented time gaps',
      [
        '来源性质尚未确定时问“依据什么确定”',
        '不能仅凭 kind 推断时间起点与外部事件的对应关系',
        '不在材料之外臆造创建、发出、送达等竞争起点',
        '说明具体歧义及影响，再只问一个核心问题',
        '是否阻塞取决于业务依据缺口的影响，不取决于有没有公式',
      ],
    ],
    [
      'business provenance without physical storage interrogation',
      [
        '数据库表、日志、接口字段等物理记录映射留到 Architecture',
        '业务规则不交 Architecture 自定',
        '业务含义已明确时，不再问“实际以哪条业务记录为准”',
        '谁提供何种凭证、凭证中的时间证明哪个业务事件，在尚不明确且影响结果时仍须核实',
        '追溯是 Agent 的分析责任，不是逐字段问卷',
      ],
    ],
  ])('injects %s on initial and resumed discovery', async (_name, rules) => {
    const h = await setup();
    const first = await h.policy();
    await saveDiscoveryContent(h.root, h.state, contractContent());
    for (const policy of [first, await h.policy()]) {
      for (const rule of rules) expect(policy).toContain(rule);
      expect(policy).not.toContain('面向业务核实“从哪一刻开始');
      expect(policy).not.toContain('对金额、数量、比例和时间追问：');
      expect(policy).not.toContain('未知时间依据保持阻塞');
      expect(policy).not.toContain('材料没写期限就是未知');
      expect(policy).not.toContain('无确定截止依据不能作为合格模型交付');
    }
  });

  it.each([
    [
      'one four-color provenance loop for all key data',
      [
        '所有关键数据都先追溯业务来源，不以“Agent 觉得需要派生”为入口',
        '类型展开、直接输入和派生计算都在同一个循环内',
        '粉色关注产生与承载数据的凭证',
        '黄色核对提供、请求或确认数据的业务角色',
        '绿色关联参与者、地点、标的或领域对象',
        '蓝色追溯描述、约定、规则及适用版本',
        '公式可以没有，业务来源不能由字段存在代替',
        '不必等材料写“计算”或用户要求自动化',
        '将推断与已明确事实分开，不把推断写成已确认公式',
        '人工明确为非派生输入后应保留该事实',
        '人工停止／暂缓时只记录待澄清内容',
      ],
    ],
    [
      'direct and referenced provenance without a forced formula',
      [
        '直接记录的事实或逐次约定值',
        '依据充分就复用，不强造计算公式',
        '保留原凭证／对象属性、适用版本和当时可见性',
        '不能把复制后的字段当作无来源独立输入',
        '保留字段已存在这一事实和未知',
        '这些是发现说明中的业务区分，不新增 Schema 枚举',
      ],
    ],
    [
      'no resolution shortcut from types or machine lineage',
      [
        'asserted／derived 是表达分类，不是业务来源已查明的证明',
        '类型字段、合成实例、机器 lineage 通过或 resolution 都不能替代缺失依据',
        '不能只引用“规定时间内付款”就宣称来源已解决',
        '只有已有业务事实充分覆盖原题才关联解决',
        '非阻塞未知仍如实保留，不声称追溯已完整',
      ],
    ],
    [
      'all routes',
      [
        '所有主线共用的提问决策',
        '什么业务判断仍无法作出，已有依据为什么不能解决，回答将改变什么结果',
        '不问谁手工填写派生值',
        '不要求用户决定数据库主键',
        '不无限递归',
        '尚无真实实例时可构造标为合成的校验数据',
        '技术缺口、模型表达缺口和业务知识缺口分别记录',
      ],
    ],
    [
      'auditable gap resolutions',
      [
        '新问题须提供稳定 `gapKey`',
        '同一缺口沿用原 gapKey 与 Q-ID',
        '通过 `resolution` 追加已有事实与原问题的关联',
        '每个来源都须有摘录',
        'resolution 是可撤回的 Agent 解释，不是人工回答',
        '不得替代已有人工事实或排除决定',
        '不自动弹题或恢复人工停止／暂缓',
        '摘录存在的机器检查不证明推理成立',
      ],
    ],
  ])(
    'injects shared %s policy on first and resumed turns',
    async (_name, rules) => {
      const h = await setup();
      const first = await h.policy();
      await saveDiscoveryContent(h.root, h.state, contractContent());
      for (const policy of [first, await h.policy()]) {
        for (const rule of rules) expect(policy).toContain(rule);
        expect(policy).not.toContain('过时的阻塞项仍需人工有依据地解决或排除');
        expect(policy).not.toContain('请业务方讲具体实例，记录情节');
        expect(policy).not.toContain('旧题仅因已识别请求缺少生成公式而阻塞时');
        expect(policy).not.toContain(
          '仅有类型信息且没有其他派生需求线索时只展开类型',
        );
        expect(policy.split('### 四色追溯的统一循环')).toHaveLength(2);
      }
    },
  );

  it.each(['', '   \n'])(
    'fails closed on missing or empty guidance (%j)',
    async (content) => {
      const h = await setup();
      if (content) await writeTextAtomic(h.root, guidePath, content);
      else await rm(join(h.root, guidePath));
      await expect(h.prompt()).rejects.toThrow(
        `Evidence 指令文件不存在或为空：${guidePath}`,
      );
    },
  );

  it.each([
    ['scope', '核对具体业务边界'],
    ['responsibilities', '合同双方与候选履约结构'],
    ['evidence', '履约请求与确认凭证'],
    ['lineage', '关键数据与历史依据'],
    ['exceptions', '异常、更正与新责任'],
    ['domain', '领域对象与规则'],
    ['replay', '正常、边界与异常回放'],
  ] as const)(
    'resumes %s without restarting a scope questionnaire',
    async (focus, label) => {
      const h = await setup();
      await saveDiscoveryContent(h.root, h.state, {
        ...discoveryContent(),
        focus,
      });
      h.state.feedback = '只核实当前缺口，不扩张为整个企业。';
      const prompt = await h.prompt();
      expect(prompt).toContain(`当前焦点：${label}`);
      expect(prompt).toContain(h.state.discovery.path!);
      expect(prompt).toContain('承接当前候选与回放缺口');
      expect(prompt).toContain(h.state.feedback);
    },
  );

  it('consumes each answer without requiring the rest of the question registry even before the first content snapshot', async () => {
    const h = await setup();
    await seedQuestions(h.root, h.state, [
      question,
      { ...question, id: 'Q-002' },
    ]);
    await answerQuestion(h.root, h.state, {
      questionId: 'Q-001',
      text: '作者交稿，平台支付报酬。',
      respondent: 'github.com/test',
      status: 'answered',
    });
    expect(await h.prompt()).toContain('尚未回答：Q-002');
    expect(await h.prompt()).toContain('先保存消化结果，再决定下一问');
    await answerQuestion(h.root, h.state, {
      questionId: 'Q-002',
      text: '尚不清楚完成标准。',
      respondent: 'github.com/test',
      status: 'unknown',
    });
    const prompt = await h.prompt();
    expect(prompt).toContain('先保存消化结果，再决定下一问');
    expect(prompt).toContain('阻塞且仍未知：Q-002');
    await answerQuestion(h.root, h.state, {
      questionId: 'Q-002',
      text: '由编辑验收文章并确认。',
      respondent: 'github.com/test',
      status: 'answered',
    });
    expect(await h.prompt()).toContain('阻塞且仍未知：无');
  });

  it('allows a discovery checkpoint without demanding formal submission', async () => {
    const h = await setup();
    const guard = buildPhaseGuard(h.state);
    expect(guard).toContain('evidence_ask_questions');
    expect(guard).toContain('evidence_save_discovery');
    expect(guard).not.toContain(
      'Finish through the designated evidence_* submission tool',
    );
    h.state.discovery.stage = 'finalizing';
    expect(buildPhaseGuard(h.state)).toContain(
      'Finish through the designated evidence_* submission tool',
    );
  });

  it('ships complementary routes and safeguards rather than a keyword classifier', async () => {
    const guide = await readText(process.cwd(), guidePath);
    for (const requirement of [
      '候选合同上下文 → 双方角色与约定 → 履约项',
      '候选领域上下文与对象 → 身份 → 属性与关系',
      '真实邀请、报价或方案 → 请求与回应 → 协商规则',
      '不让用户先选择建模模式',
      '不按产品名称或关键词硬分类',
      '不把每个流程步骤都当成履约项',
      '范围是发现成果，不是前置问卷',
      '不补造 RFP',
      '仅在当前可见凭证下',
      '不因用户没有纠正就升级为明确事实',
    ])
      expect(guide).toContain(requirement);
  });
});

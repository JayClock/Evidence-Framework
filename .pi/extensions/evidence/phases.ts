import type {
  ActivePhase,
  ArtifactSpec,
  PhaseDefinition,
  WorkflowPhase,
} from './types.ts';

const prompt = (name: string) =>
  `.pi/extensions/evidence/templates/evidence-${name}.md`;

const requirementsInput = 'artifacts/00-input/requirements.md';
const testStrategyInput = 'artifacts/03-architecture/test-strategy.md';
const testProceduresInput = 'artifacts/03-architecture/test-procedures.md';

export const TESTING_CONTRACT_INPUTS = [
  testStrategyInput,
  testProceduresInput,
] as const;

const artifact = (
  value: Omit<ArtifactSpec, 'promptFile'> & { promptName: string },
): ArtifactSpec => ({
  ...value,
  promptFile: prompt(value.promptName),
});

// Kept at their existing paths for downstream US/AC contracts, but produced
// only AFTER the FM model, inside Modeling's shared gate.
const requirementsArtifacts = [
  artifact({
    key: 'personas',
    label: '用户画像与需求',
    output: 'artifacts/01-requirements/personas.md',
    promptName: 'personas',
    inputs: [requirementsInput, 'artifacts/02-modeling/fm-model'],
    minChars: 300,
    requiredSections: ['用户画像', '需求列表'],
  }),
  artifact({
    key: 'problem-statement',
    label: '问题陈述与 MVP 范围',
    output: 'artifacts/01-requirements/problem-statement.md',
    promptName: 'problem-statement',
    inputs: [requirementsInput, 'artifacts/01-requirements/personas.md'],
    minChars: 300,
    requiredSections: ['问题陈述', 'MVP', 'MoSCoW'],
  }),
  artifact({
    key: 'story-map',
    label: '用户故事地图',
    output: 'artifacts/01-requirements/story-map.md',
    promptName: 'story-map',
    inputs: [
      requirementsInput,
      'artifacts/01-requirements/personas.md',
      'artifacts/01-requirements/problem-statement.md',
    ],
    minChars: 400,
    requiredSections: ['用户故事地图', '验收标准'],
    minUniqueStoryIds: 1,
  }),
];

export const PHASE_DEFINITIONS = {
  modeling: {
    id: 'modeling',
    label: '统一建模',
    skillFile: '.agents/skills/evidence-discovery/SKILL.md',
    artifacts: [
      artifact({
        key: 'ubiquitous-language',
        label: '统一语言',
        output: 'artifacts/02-modeling/ubiquitous-language.md',
        promptName: 'ubiquitous-language',
        inputs: [requirementsInput],
        minChars: 400,
        requiredSections: ['统一语言'],
      }),
      artifact({
        key: 'fulfillment-model',
        label: '统一 FM 模型',
        output: 'artifacts/02-modeling/fm-model/status.md',
        promptName: 'fulfillment-model',
        kind: 'fm-model',
        inputs: [
          requirementsInput,
          'artifacts/02-modeling/ubiquitous-language.md',
        ],
        minChars: 250,
        requiredSections: ['适用性', '机器校验', '场景模拟', '业务确认'],
      }),
      ...requirementsArtifacts,
    ],
  },
  architecture: {
    id: 'architecture',
    label: '架构设计',
    skillFile: '.pi/skills/evidence-architecture/SKILL.md',
    artifacts: [
      artifact({
        key: 'context-map',
        label: '上下文映射',
        output: 'artifacts/03-architecture/context-map.md',
        promptName: 'context-map',
        inputs: [
          'artifacts/01-requirements/story-map.md',
          'artifacts/02-modeling/ubiquitous-language.md',
          'artifacts/02-modeling/fm-model',
        ],
        minChars: 800,
        requiredSections: ['上下文映射', 'FM 映射', '集成关系'],
        occurrences: [
          { needle: '```mermaid', minimum: 1, label: '上下文映射 Mermaid 图' },
        ],
      }),
      artifact({
        key: 'architecture-style',
        label: '架构风格与关键决策',
        output: 'artifacts/03-architecture/architecture-style.md',
        promptName: 'architecture-style',
        inputs: [
          'artifacts/01-requirements/problem-statement.md',
          'artifacts/03-architecture/context-map.md',
        ],
        minChars: 900,
        requiredSections: ['架构风格', '架构决策', '质量属性'],
        occurrences: [
          { needle: '```mermaid', minimum: 1, label: '系统架构 Mermaid 图' },
        ],
      }),
      artifact({
        key: 'tech-stack',
        label: '技术栈',
        output: 'artifacts/03-architecture/tech-stack.md',
        promptName: 'tech-stack',
        inputs: [
          'README.md',
          'package.json',
          'artifacts/03-architecture/architecture-style.md',
        ],
        minChars: 650,
        requiredSections: ['技术栈', '约束'],
        minTableRows: 7,
      }),
      artifact({
        key: 'module-structure',
        label: '模块结构',
        output: 'artifacts/03-architecture/module-structure.md',
        promptName: 'module-structure',
        inputs: [
          'artifacts/03-architecture/context-map.md',
          'artifacts/02-modeling/fm-model',
          'artifacts/03-architecture/architecture-style.md',
          'artifacts/03-architecture/tech-stack.md',
        ],
        minChars: 800,
        requiredSections: [
          '模块结构',
          '依赖规则',
          '目录结构',
          '按需领域设计',
          '表达缺口',
        ],
      }),
      artifact({
        key: 'api-contracts',
        label: 'API 契约',
        output: 'artifacts/03-architecture/api-contracts.md',
        promptName: 'api-contracts',
        inputs: [
          'artifacts/01-requirements/story-map.md',
          'artifacts/03-architecture/module-structure.md',
          'artifacts/02-modeling/fm-model',
        ],
        minChars: 900,
        requiredSections: ['API 契约', '错误模型'],
        minTableRows: 5,
      }),
      artifact({
        key: 'data-model',
        label: '数据模型',
        output: 'artifacts/03-architecture/data-model.md',
        promptName: 'data-model',
        inputs: [
          'artifacts/03-architecture/module-structure.md',
          'artifacts/03-architecture/api-contracts.md',
          'artifacts/02-modeling/fm-model',
        ],
        minChars: 800,
        requiredSections: ['数据模型', '约束', '迁移'],
        minTableRows: 6,
      }),
      artifact({
        key: 'test-strategy',
        label: '测试策略',
        output: testStrategyInput,
        promptName: 'test-strategy',
        inputs: [
          'artifacts/01-requirements/personas.md',
          'artifacts/01-requirements/problem-statement.md',
          'artifacts/01-requirements/story-map.md',
          'artifacts/02-modeling/fm-model',
          'artifacts/03-architecture/architecture-style.md',
          'artifacts/03-architecture/tech-stack.md',
          'artifacts/03-architecture/module-structure.md',
          'artifacts/03-architecture/api-contracts.md',
          'artifacts/03-architecture/data-model.md',
          'README.md',
          'package.json',
          '.pi/evidence.json',
          'apps',
        ],
        minChars: 1000,
        requiredSections: [
          '测试策略',
          '目标与风险',
          '四象限',
          '功能上下文',
          '测试替身',
          '追溯规则',
          '测试数据与环境',
          '执行与通过标准',
          '风险接受',
        ],
        minTableRows: 5,
      }),
      artifact({
        key: 'test-procedures',
        label: '测试工序',
        output: testProceduresInput,
        promptName: 'test-procedures',
        inputs: [
          testStrategyInput,
          'artifacts/03-architecture/tech-stack.md',
          'artifacts/03-architecture/module-structure.md',
          'artifacts/03-architecture/api-contracts.md',
          'artifacts/03-architecture/data-model.md',
          'package.json',
          'apps',
        ],
        minChars: 900,
        requiredSections: [
          '测试工序',
          '工序目录',
          '工序定义',
          '场景实例化规则',
          '证据与例外',
        ],
        minTableRows: 2,
      }),
    ],
  },
  planning: {
    id: 'planning',
    label: '迭代计划',
    skillFile: '.pi/skills/evidence-planning/SKILL.md',
    artifacts: [
      artifact({
        key: 'product-backlog',
        label: '产品待办列表',
        output: 'artifacts/04-planning/product-backlog.md',
        promptName: 'product-backlog',
        inputs: [
          'artifacts/01-requirements/story-map.md',
          'artifacts/02-modeling/fm-model',
          'artifacts/03-architecture/module-structure.md',
          ...TESTING_CONTRACT_INPUTS,
        ],
        minChars: 800,
        requiredSections: ['Product Backlog', '依赖'],
        minUniqueStoryIds: 1,
      }),
      artifact({
        key: 'sprint-plan',
        label: 'Sprint 计划',
        output: 'artifacts/04-planning/sprint-plan.md',
        promptName: 'sprint-plan',
        inputs: [
          'artifacts/04-planning/product-backlog.md',
          ...TESTING_CONTRACT_INPUTS,
        ],
        minChars: 650,
        requiredSections: ['Sprint 1', 'Sprint 目标', '风险'],
      }),
      artifact({
        key: 'sprint-1-backlog',
        label: 'Sprint 1 Backlog',
        output: 'artifacts/04-planning/sprint-1-backlog.md',
        promptName: 'sprint-1-backlog',
        inputs: [
          'artifacts/01-requirements/story-map.md',
          'artifacts/02-modeling/fm-model',
          'artifacts/04-planning/sprint-plan.md',
          'artifacts/03-architecture/module-structure.md',
          ...TESTING_CONTRACT_INPUTS,
        ],
        minChars: 800,
        requiredSections: ['Sprint 1 Backlog', '验收标准'],
        minTableRows: 6,
        minUniqueStoryIds: 1,
      }),
      artifact({
        key: 'definition-of-done',
        label: '完成定义',
        output: 'artifacts/04-planning/definition-of-done.md',
        promptName: 'definition-of-done',
        inputs: [
          'artifacts/04-planning/sprint-1-backlog.md',
          'artifacts/03-architecture/architecture-style.md',
          ...TESTING_CONTRACT_INPUTS,
        ],
        minChars: 650,
        requiredSections: ['Definition of Done', '验证'],
        minTableRows: 9,
      }),
    ],
  },
  coding: {
    id: 'coding',
    label: '编码与 TDD',
    skillFile: '.pi/skills/evidence-tdd/SKILL.md',
    artifacts: [],
  },
  review: {
    id: 'review',
    label: '最终审查',
    skillFile: '.pi/skills/evidence-review/SKILL.md',
    artifacts: [
      artifact({
        key: 'final-review',
        label: '最终审查报告',
        output: 'artifacts/06-review/final-review.md',
        promptName: 'final-review',
        inputs: [
          'artifacts/01-requirements/story-map.md',
          'artifacts/04-planning/sprint-1-backlog.md',
          ...TESTING_CONTRACT_INPUTS,
          'artifacts/03-architecture/architecture-style.md',
          'artifacts/03-architecture/module-structure.md',
          'artifacts/03-architecture/api-contracts.md',
          'artifacts/02-modeling/fm-model',
          'artifacts/04-planning/definition-of-done.md',
          'artifacts/05-coding',
          'reports',
          'apps',
        ],
        minChars: 1000,
        requiredSections: ['审查结论', '质量门', '问题清单', '后续行动'],
        minTableRows: 5,
      }),
    ],
  },
} satisfies Record<ActivePhase, PhaseDefinition>;

export const PHASE_ORDER: ActivePhase[] = [
  'modeling',
  'architecture',
  'planning',
  'coding',
  'review',
];

export function getPhaseDefinition(phase: ActivePhase): PhaseDefinition {
  return PHASE_DEFINITIONS[phase];
}

export function getNextPhase(phase: ActivePhase): WorkflowPhase {
  const index = PHASE_ORDER.indexOf(phase);
  return PHASE_ORDER[index + 1] ?? 'complete';
}

export function getPreviousPhase(phase: WorkflowPhase): ActivePhase | null {
  if (phase === 'complete') return 'review';
  const index = PHASE_ORDER.indexOf(phase);
  return index > 0 ? PHASE_ORDER[index - 1] : null;
}

export function getExpectedArtifact(
  phase: ActivePhase,
  index: number,
): ArtifactSpec | null {
  return PHASE_DEFINITIONS[phase].artifacts[index] ?? null;
}

export function isDocumentPhase(
  phase: WorkflowPhase,
): phase is Exclude<ActivePhase, 'coding'> {
  return phase !== 'complete' && phase !== 'coding';
}

export function phaseNumber(phase: ActivePhase): string {
  return String(PHASE_ORDER.indexOf(phase) + 1).padStart(3, '0');
}

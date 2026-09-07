import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCurrentPrompt, buildPhaseGuard } from './prompts.ts';
import { getPhaseDefinition } from './phases.ts';
import {
  answerQuestion,
  askQuestions,
  saveDiscoveryContent,
} from './discovery.ts';
import { discoveryContent } from './discovery-test-support.ts';
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
  };
}

const question = {
  id: 'Q-001',
  focus: 'responsibilities',
  prompt: '双方分别承诺什么？',
  impact: '识别真实约定义务，而不是把每个动作当作履约。',
  blocking: true,
  sourceRefs: ['INPUT'],
};

describe('context-led discovery prompt contract (not an LLM behavior evaluation)', () => {
  it('starts with candidate context identification and injects the canonical guide exactly once', async () => {
    const h = await setup();
    const before = structuredClone(h.state);
    const guide = (await readText(h.root, guidePath)).trim();
    const prompt = await h.prompt();
    expect(prompt).toContain('当前焦点：识别业务上下文');
    expect(prompt).toContain(guide);
    expect(prompt.split(guide)).toHaveLength(2);
    expect(prompt).not.toContain('先定位问题与探索范围');
    expect(prompt).not.toContain('当前焦点：scope');
    expect(prompt).not.toContain('artifacts/01-requirements/story-map.md');
    expect(h.state).toEqual(before);
  });

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
    ['responsibilities', '合同双方与履约项'],
    ['evidence', '请求、完成与确认凭证'],
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

  it('waits for partial answers, then consumes answers even before the first content snapshot', async () => {
    const h = await setup();
    await askQuestions(h.root, h.state, [
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
    expect(await h.prompt()).toContain(
      '等待 /evidence-answer，不重复提问或代答',
    );
    await answerQuestion(h.root, h.state, {
      questionId: 'Q-002',
      text: '尚不清楚完成标准。',
      respondent: 'github.com/test',
      status: 'unknown',
    });
    const prompt = await h.prompt();
    expect(prompt).toContain('先消化已保存的人工回答');
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

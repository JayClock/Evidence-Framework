import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDiscovery } from '../../state/discovery/index.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
  writeTextAtomic,
} from '../../storage.ts';
import {
  contractContent,
  discoveryContent,
} from '../../tests/support/discovery-test-support.ts';
import { qualityHarness } from '../../tests/support/quality-test-support.ts';
import { discussionTargetObjectRef } from './schema.ts';
import { businessViewLines, questionLabel } from './view.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function setup(contract = true) {
  const h = await qualityHarness(roots);
  const state = createInitialState('test', '合同权责显示，不是业务验收');
  state.status = 'running';
  await saveState(h.root, state);
  await h.saveDiscovery({
    expectedRevision: 0,
    content: contract ? contractContent() : discoveryContent(),
  });
  await h.tool('evidence_ask_questions', {
    expectedRevision: 1,
    questions: [
      {
        id: 'Q-001',
        gapKey: 'c-005.payment-proof',
        target: contract
          ? { kind: 'contract', contextRef: 'C-001', fulfillmentRef: 'C-005' }
          : null,
        focus: 'evidence',
        prompt: '什么凭证证明分成已支付？',
        impact: '确定完成依据',
        blocking: true,
        sourceRefs: ['INPUT'],
      },
    ],
  });
  return h;
}
async function view(h: Awaited<ReturnType<typeof setup>>) {
  return businessViewLines(await snapshot(h));
}
async function status(h: Awaited<ReturnType<typeof setup>>) {
  await h.command('evidence-status');
  return h.api.sendMessage.mock.lastCall![0].content as string;
}
async function snapshot(h: Awaited<ReturnType<typeof setup>>) {
  return loadDiscovery(h.root, (await loadState(h.root))!);
}

const noise =
  /工程阶段|分析活动|业务位置|round|waiting_answer|Gate|暂缓 \d|未解决阻塞|当前工件|发现 v\d|revision-\d/;
describe('contract-centered discovery messages', () => {
  it('shows two-way rights/obligations, the selected fulfillment and evidence gaps, without workflow navigation', async () => {
    const h = await setup();
    const state = (await loadState(h.root))!;
    const before = await readText(h.root, '.evidence/state.json');
    const original = await readText(h.root, state.discovery.path!);
    const text = (await view(h)).join('\n');
    for (const expected of [
      '当前建模位置：合同上下文 › 作者合作协议 › 支付分成',
      '上下文角色：平台 ↔ 作者',
      '候选履约（请求 → 确认凭证）',
      '▶ 支付分成',
      '权责：作者 → 平台（权利方 → 义务方）',
      '▶ 支付分成',
      '要求：合作协议、结算单',
      '请求时间：start_at=待明确；expired_at=待明确',
      '履约确认凭证：待明确',
      '逾期未支付 → 逾期补偿（候选）',
      'Q-001 什么凭证证明分成已支付？',
    ])
      expect(text).toContain(expected);
    expect(text).not.toMatch(noise);
    expect(text).not.toContain('已履约');
    const details = await status(h);
    expect(details).toContain('待审核 Gate');
    expect(details).toContain('来源引用：INPUT');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    expect(await readText(h.root, state.discovery.path!)).toBe(original);
  });

  it('uses the same business view in scene selection and answer editor, keeping finish at the scene level', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValueOnce(undefined);
    await h.command('evidence-answer');
    const [title, options] = h.ui.select.mock.lastCall!;
    expect(title).toContain(
      '当前建模位置：合同上下文 › 作者合作协议 › 支付分成',
    );
    expect(title).not.toMatch(noise);
    expect(options).toContain('结束本轮问答，整理已有信息');
    h.ui.select.mockResolvedValue('事实或决定');
    h.api.exec.mockResolvedValue({
      code: 0,
      killed: false,
      stdout: '{"login":"tester"}',
      stderr: '',
    });
    h.ui.editor.mockResolvedValue(undefined);
    await h.command('evidence-answer', 'Q-001');
    const heading = h.ui.editor.mock.lastCall![0];
    expect(heading).toContain('▶ 支付分成');
    expect(heading).toContain('权责：作者 → 平台');
    expect(heading).toContain('履约确认凭证：待明确');
    expect(heading).toContain('github.com/tester');
    expect(heading).not.toMatch(noise);
    expect(heading).not.toContain('焦点：');
    expect(h.ui.select.mock.lastCall![1]).not.toContain(
      '结束本轮问答，整理已有信息',
    );
  });

  it('does not fabricate contracts, parties or obligations for unlocated/domain discovery', async () => {
    const h = await setup(false);
    const text = (await view(h)).join('\n');
    expect(text).toContain('当前建模位置：尚未定位业务上下文');
    expect(text).not.toContain('作者合作协议');
    expect(text).not.toMatch(noise);
  });

  it('distinguishes domain objects and channel exchanges without fabricating contracts', async () => {
    const h = await setup(false);
    const value = await snapshot(h);
    const context = value.content!.businessView.contexts[0];
    value.content!.candidates.push({
      id: 'C-002',
      archetype: 'thing',
      evidenceKind: null,
      label: '专栏',
      description: '当前讨论的领域标的物。',
      confidence: 'explicit',
      sourceRefs: ['INPUT'],
      modelRefs: [],
    });
    context.thingRefs = ['C-002'];
    value.questions[0].target = {
      kind: 'domain',
      contextRef: 'C-001',
      objectRef: 'C-002',
    };
    expect(businessViewLines(value).join('\n')).toContain(
      '当前建模位置：领域上下文 › 测试对象规则 › 专栏',
    );
    expect(businessViewLines(value).join('\n')).toContain(
      '事实覆盖：领域对象 已知',
    );

    value.content!.candidates[0].label = '报价渠道';
    value.content!.candidates[1] = {
      ...value.content!.candidates[1],
      archetype: 'evidence',
      evidenceKind: 'proposal',
      label: '报价方案',
    };
    context.kind = 'channel';
    context.thingRefs = [];
    context.evidenceRefs = ['C-002'];
    value.questions[0].target = {
      kind: 'channel',
      contextRef: 'C-001',
      exchangeRef: 'C-002',
    };
    value.content!.businessView.current = value.questions[0].target;
    const channel = businessViewLines(value).join('\n');
    expect(channel).toContain('当前建模位置：渠道上下文 › 报价渠道 › 报价方案');
    expect(channel).toContain('事实覆盖：协商凭证 已知');
    expect(channel).not.toContain('候选履约');

    value.questions[0].target = {
      kind: 'domain',
      contextRef: 'C-001',
      objectRef: null,
    };
    expect(businessViewLines(value).join('\n')).toContain('依据或引用已失效');
  });

  it('renders unknown party slots without fabricating roles', async () => {
    const h = await setup();
    const value = await snapshot(h);
    value.content!.businessView.contexts[0].roleRefs[1] = null;
    for (const item of value.content!.businessView.contexts[0].fulfillments) {
      if (item.rightHolderRef === 'C-003') item.rightHolderRef = null;
      if (item.obligorRef === 'C-003') item.obligorRef = null;
    }
    const text = businessViewLines(value).join('\n');
    expect(text).toContain('上下文角色：平台 ↔ 待明确');
    expect(text).toContain('权责：待明确 → 平台');
  });

  it('preserves partial and cross-contract confirmation evidence without inventing an approver', async () => {
    const h = await setup();
    const value = await snapshot(h);
    const item = value.content!.businessView.contexts[0].fulfillments[1];
    item.confirmationEvidence.proves =
      '支付服务商提供的支付回执，证明本次分成已到账';
    item.requestEvidence.requirement = '作者依据结算单要求平台支付本期分成';
    item.requestEvidence.expiredAt = '结算单约定的到期日';
    const before = structuredClone(value);
    const text = businessViewLines(value).join('\n');
    expect(text).toContain(`证明：${item.confirmationEvidence.proves}`);
    expect(text).toContain(`要求：${item.requestEvidence.requirement}`);
    expect(text).toContain(`expired_at=${item.requestEvidence.expiredAt}`);
    expect(text).not.toMatch(/确认人：|审批人：|验收通过/);
    expect(value).toEqual(before);

    item.confirmationEvidence.proves = '银行流水；提供方待明确';
    expect(businessViewLines(value).join('\n')).toContain(
      '证明：银行流水；提供方待明确',
    );
    item.confirmationEvidence.proves = null;
    expect(businessViewLines(value).join('\n')).toContain(
      '履约确认凭证：待明确',
    );
  });

  it('keeps roles, actual participants, evidence providers and things distinct', async () => {
    const h = await setup();
    const value = await snapshot(h);
    const context = value.content!.businessView.contexts[0];
    const item = context.fulfillments[1];
    value.content!.candidates.push(
      {
        id: 'C-007',
        archetype: 'participant',
        evidenceKind: null,
        label: '张编辑',
        description: '平台编辑，代表平台形成本次付款请求。',
        confidence: 'explicit',
        sourceRefs: ['INPUT'],
        modelRefs: [],
      },
      {
        id: 'C-008',
        archetype: 'participant',
        evidenceKind: null,
        label: '支付服务商',
        description: '提供支付确认凭证，不是当前合同一方。',
        confidence: 'explicit',
        sourceRefs: ['INPUT'],
        modelRefs: [],
      },
      {
        id: 'C-009',
        archetype: 'thing',
        evidenceKind: null,
        label: '本期稿件',
        description: '本次分成对应的标的物。',
        confidence: 'explicit',
        sourceRefs: ['INPUT'],
        modelRefs: [],
      },
      {
        id: 'C-010',
        archetype: 'evidence',
        evidenceKind: 'fulfillment_request',
        label: '付款请求',
        description: '本次付款请求凭证。',
        confidence: 'explicit',
        sourceRefs: ['INPUT'],
        modelRefs: [],
      },
      {
        id: 'C-011',
        archetype: 'evidence',
        evidenceKind: 'fulfillment_confirmation',
        label: '支付回执',
        description: '由支付服务商提供并证明已支付。',
        confidence: 'explicit',
        sourceRefs: ['INPUT'],
        modelRefs: [],
      },
    );
    context.participantRefs = ['C-007', 'C-008'];
    context.thingRefs = ['C-009'];
    context.evidenceRefs = ['C-010', 'C-011'];
    item.participantRefs = ['C-007', 'C-008'];
    item.thingRefs = ['C-009'];
    item.requestEvidence.evidenceRef = 'C-010';
    item.requestEvidence.issuerRef = 'C-007';
    item.confirmationEvidence.evidenceRef = 'C-011';
    item.confirmationEvidence.providerRef = 'C-008';
    item.confirmationEvidence.proves = '本次分成已支付';
    const text = businessViewLines(value).join('\n');
    expect(text).toContain('上下文角色：平台 ↔ 作者');
    expect(text).toContain('参与人／组织：张编辑、支付服务商');
    expect(text).toContain('标的物：本期稿件');
    expect(text).toContain('履约请求凭证：付款请求');
    expect(text).toContain('提供方：支付服务商');
    expect(text).toContain('证明：本次分成已支付');
    expect(text).not.toMatch(/支付服务商 ↔ 作者|审批人|验收人/);
  });

  it('uses the selected question target, not the last saved cursor, and never falls back from a null target', async () => {
    const h = await setup();
    const value = await snapshot(h);
    value.questions.push({
      ...value.questions[0],
      id: 'Q-002',
      target: {
        kind: 'contract',
        contextRef: 'C-001',
        fulfillmentRef: 'C-004',
      },
    });
    expect(
      businessViewLines(value, { questionId: 'Q-002' }).join('\n'),
    ).toContain('▶ 交付稿件');
    value.questions[1].target = null;
    expect(
      businessViewLines(value, { questionId: 'Q-002' }).join('\n'),
    ).not.toContain('作者合作协议');
    expect(discussionTargetObjectRef(value.content!.businessView.current)).toBe(
      'C-005',
    );
  });

  it('preserves selected descendants in a large contract', async () => {
    const h = await setup();
    const value = await snapshot(h);
    const contract = value.content!.businessView.contexts[0];
    for (let i = 10; i < 20; i++) {
      value.content!.candidates.push({
        ...value.content!.candidates[0],
        id: `C-0${i}`,
        label: `其他履约${i}`,
        description: `其他履约${i}`,
        archetype: 'fulfillment',
        evidenceKind: null,
      });
      contract.fulfillments.unshift({
        ...contract.fulfillments[0],
        candidateRef: `C-0${i}`,
      });
    }
    const lines = businessViewLines(value);
    expect(lines.join('\n')).toContain('▶ 支付分成');
    expect(lines.join('\n')).toContain('权责：作者 → 平台');
    expect(lines.join('\n')).toContain('项见 /evidence-status');
  });

  it('retains only the business view across consolidation, manual stop, pause and reload', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue('暂不确定／跳过此题');
    await h.command('evidence-answer', 'Q-001');
    expect((await view(h)).join('\n')).toContain('当前问题：正在整理本次输入');
    expect((await view(h)).join('\n')).not.toMatch(noise);
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-discovery', 'finish');
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-pause');
    await h.events.get('session_start')!({}, h.ctx);
    expect((await view(h)).join('\n')).toContain('当前问题：本轮已结束');
    expect((await view(h)).join('\n')).not.toMatch(noise);
    expect((await snapshot(h)).interaction.stopped).toBe(true);
  });

  it('keeps modeling details on demand during formalization without including them in downstream status', async () => {
    const h = await setup();
    const state = (await loadState(h.root))!;
    state.discovery.stage = 'finalizing';
    state.status = 'ready';
    await saveState(h.root, state);
    expect(await status(h)).toContain('作者合作协议');
    state.phase = 'architecture';
    await saveState(h.root, state);
    expect(await status(h)).not.toContain('作者合作协议');
  });

  it('hides stale contract claims when either role or relation sources are corrected', async () => {
    const h = await setup();
    const value = await snapshot(h);
    value.content!.businessView.contexts[0].fulfillments[1].sourceRefs = [
      'A-001',
    ];
    expect(businessViewLines(value).join('\n')).toContain('依据或引用已失效');
    expect(businessViewLines(value).join('\n')).not.toContain('作者合作协议');
    expect(questionLabel(value, 'Q-001')).toContain('[原业务位置待核对]');
    expect(questionLabel(value, 'Q-001')).not.toContain('作者合作协议');
    value.content!.businessView.contexts[0].fulfillments[1].sourceRefs = [
      'INPUT',
    ];
    value.content!.candidates[1].sourceRefs = ['A-999'];
    expect(businessViewLines(value).join('\n')).toContain('依据或引用已失效');
  });

  it('switches between different contracts by question target without combining their roles', async () => {
    const h = await setup();
    const value = await snapshot(h);
    const other = structuredClone(value.content!.businessView.contexts[0]);
    const ref = (id: string | null) =>
      id === null ? null : id.replace('C-00', 'C-01');
    value.content!.candidates.push(
      ...value.content!.candidates.map((c) => ({
        ...c,
        id: ref(c.id)!,
        label: `另一合同的${c.label}`,
        description: `另一合同的${c.description}`,
      })),
    );
    other.contextRef = ref(other.contextRef)!;
    other.roleRefs = other.roleRefs.map(ref);
    other.fulfillments = other.fulfillments.map((f) => ({
      ...f,
      candidateRef: ref(f.candidateRef)!,
      rightHolderRef: ref(f.rightHolderRef),
      obligorRef: ref(f.obligorRef),
      parentFulfillmentRef: ref(f.parentFulfillmentRef),
    }));
    value.content!.businessView.contexts.push(other);
    value.questions.push({
      ...value.questions[0],
      id: 'Q-002',
      target: {
        kind: 'contract',
        contextRef: 'C-011',
        fulfillmentRef: 'C-015',
      },
    });
    const lines = businessViewLines(value, { questionId: 'Q-002' });
    expect(lines[0]).toBe(
      '当前建模位置：合同上下文 › 另一合同的作者合作协议 › 另一合同的支付分成',
    );
    expect(lines[1]).toBe('上下文角色：另一合同的平台 ↔ 另一合同的作者');
    expect(value.content!.businessView.current!.contextRef).toBe('C-001');
    value.questions[1].target = {
      kind: 'contract',
      contextRef: 'C-011',
      fulfillmentRef: 'C-005',
    };
    expect(
      businessViewLines(value, { questionId: 'Q-002' }).join('\n'),
    ).toContain('依据或引用已失效');
  });

  it('sanitizes multiline/control sequences and bounds display without changing candidate text', async () => {
    const h = await setup();
    const value = await snapshot(h);
    const original = `协议\n\u001b[31m${'名称'.repeat(1000)}`;
    value.content!.candidates[0].description = original;
    const lines = businessViewLines(value);
    expect(lines.every((line) => !/[\n\u001b]/.test(line))).toBe(true);
    expect(lines.join('\n').length).toBeLessThan(2000);
    expect(lines[0]).toBe('当前建模位置：合同上下文 › 作者合作协议 › 支付分成');
    const detailed = businessViewLines(value, { detailed: true });
    expect(detailed.every((line) => !/[\n\u001b]/.test(line))).toBe(true);
    expect(detailed.join('\n')).toContain('名称'.repeat(1000));
    expect(value.content!.candidates[0].description).toBe(original);
  });

  it('rejects questions targeting an unrecorded contract instead of showing the wrong context', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue('暂不确定／跳过此题');
    await h.command('evidence-answer', 'Q-001');
    await h.saveDiscovery({
      expectedRevision: 3,
      content: contractContent(),
    });
    const before = await readText(h.root, '.evidence/state.json');
    await expect(
      h.tool('evidence_ask_questions', {
        expectedRevision: 4,
        questions: [
          {
            ...(await snapshot(h)).questions[0],
            id: 'Q-002',
            target: {
              kind: 'contract',
              contextRef: 'C-999',
              fulfillmentRef: null,
            },
          },
        ],
      }),
    ).rejects.toThrow('讨论目标');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
  });

  it('shows corrupt snapshots as unavailable in status rather than stale contract claims', async () => {
    const h = await setup();
    const state = (await loadState(h.root))!;
    await writeTextAtomic(h.root, state.discovery.path!, '{}');
    const before = await readText(h.root, '.evidence/state.json');
    const text = await status(h);
    expect(text).toContain('业务视图不可用');
    expect(text).not.toContain('作者合作协议');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
  });

  it.each([
    'missing-candidate',
    'duplicate-role',
    'same-party',
    'foreign-party',
    'cycle',
    'foreign-parent',
    'missing-trigger',
    'source',
    'target',
    'foreign-fulfillment',
  ])(
    'rejects invalid %s relationships without writing a snapshot',
    async (kind) => {
      const h = await setup();
      await h.events.get('agent_settled')!({}, h.ctx);
      const state = (await loadState(h.root))!;
      state.status = 'running';
      await saveState(h.root, state);
      const content = contractContent(),
        contract = content.businessView.contexts[0],
        item = contract.fulfillments[1];
      if (kind === 'missing-candidate') contract.contextRef = 'C-999';
      if (kind === 'duplicate-role')
        contract.roleRefs[1] = contract.roleRefs[0];
      if (kind === 'same-party') item.obligorRef = item.rightHolderRef;
      if (kind === 'foreign-party') item.obligorRef = 'C-999';
      if (kind === 'cycle') {
        item.parentFulfillmentRef = 'C-006';
        item.trigger = '循环';
      }
      if (kind === 'foreign-parent')
        contract.fulfillments[2].parentFulfillmentRef = 'C-999';
      if (kind === 'missing-trigger') contract.fulfillments[2].trigger = null;
      if (kind === 'source') item.sourceRefs = ['A-999'];
      if (kind === 'target') content.businessView.current!.contextRef = 'C-999';
      if (kind === 'foreign-fulfillment')
        content.businessView.current = {
          kind: 'contract',
          contextRef: 'C-001',
          fulfillmentRef: 'C-999',
        };
      const before = await readText(h.root, '.evidence/state.json');
      await expect(
        h.saveDiscovery({ expectedRevision: 2, content }),
      ).rejects.toThrow();
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    },
  );
});

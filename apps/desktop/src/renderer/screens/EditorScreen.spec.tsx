import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoryInvalidatedEvent } from '@evidence-poc/desktop-contracts/story';
import { storyFlow, storyResult } from '@evidence-poc/desktop-testing/story';

import {
  applyModelPatches,
  batchAddEvidenceMutator,
  collectFlowScenarios,
  createModelPatch,
  growBreachCompensationMutator,
  splitEvidenceToPairMutator,
} from '@evidence-poc/evidence-model-core';
import { EditorScreen } from './EditorScreen';
import {
  healthyReport,
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

const readyProject = () =>
  installDesktopApi({
    openResult: {
      success: true,
      project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
      document: createDesktopFixture(),
      issues: [],
    },
  });

const readyCanvas = async () => {
  const title = await screen.findByText('桌面端夹具（Desktop Fixture）');
  await waitFor(() =>
    expect(screen.queryByText('正在计算画布布局…')).toBeNull(),
  );
  return title;
};

describe('EditorScreen', () => {
  it('defaults to journey and retains the selected object and camera across topology and ledger switches', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    expect(
      container.querySelector('[data-milestone-stage="rfp"]'),
    ).not.toBeNull();
    const world = () =>
      container.querySelector('.react-flow__viewport') as HTMLElement;
    fireEvent.keyDown(window, { key: '0', metaKey: true });
    await waitFor(() => expect(world().style.transform).toContain('scale(1)'));
    fireEvent.click(
      container.querySelector('[data-node-id="evidence.request"]')!,
    );
    fireEvent.keyDown(window, { code: 'Digit2', altKey: true });
    await waitFor(() =>
      expect(
        container.querySelector('[data-milestone-stage="rfp"]'),
      ).toBeNull(),
    );
    expect(screen.getByRole('button', { name: /拓扑图/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="evidence.request"]'),
      ).toHaveClass('ring-2'),
    );
    expect(world().style.transform).toContain('scale(1)');
    const ledger = screen.getByRole('button', { name: '总台账' });
    fireEvent.click(ledger);
    await screen.findByLabelText('领域模型总台账');
    fireEvent.click(ledger);
    await waitFor(() => expect(world().style.transform).toContain('scale(1)'));
    expect(screen.getByRole('button', { name: /拓扑图/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveClass('ring-2');
    expect(api.calls.save).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('opens swimlanes and saves a scenario into the story pipeline', async () => {
    const api = readyProject();
    api.projects.save = vi.fn(api.projects.save);
    api.story.listFlows = vi.fn(async ({ document }) =>
      collectFlowScenarios(document!),
    );
    api.story.project = vi.fn(async ({ document, flowId }) => ({
      ...storyResult(),
      flow: collectFlowScenarios(document!).find((f) => f.flowId === flowId)!,
    }));
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    expect(screen.getByRole('button', { name: '业务旅程' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-swimlane-kind="lane"]'),
      ).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: '更多画布工具' }));
    fireEvent.click(screen.getByRole('button', { name: '业务场景推演' }));
    fireEvent.change(screen.getByLabelText('新场景名称'), {
      target: { value: '正常签约案例' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建空白场景' }));
    fireEvent.change(screen.getByLabelText('添加业务操作'), {
      target: { value: 'evidence.contract' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加步骤' }));
    fireEvent.change(screen.getByLabelText('业务时刻'), {
      target: { value: '2026-01-01T00:00:00Z' },
    });
    fireEvent.change(screen.getByLabelText('签署时间'), {
      target: { value: '2026-01-01T00:00:00Z' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并放映' }));
    await waitFor(() =>
      expect(api.story.project).toHaveBeenCalledWith(
        expect.objectContaining({ flowId: '正常签约案例', skipAi: true }),
      ),
    );
    expect(screen.queryByRole('dialog', { name: '业务场景推演' })).toBeNull();
    expect(screen.getByLabelText('选择业务流')).toHaveValue('正常签约案例');
    expect(api.projects.save).not.toHaveBeenCalled();
  });
  it('starts storming in the Copilot without submitting an empty business example', async () => {
    const api = readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(
      within(screen.getByRole('complementary', { name: '实体目录' })).getByRole(
        'button',
        { name: '铺设凭证' },
      ),
    );
    expect(
      await screen.findByLabelText<HTMLTextAreaElement>('访谈内容'),
    ).toHaveProperty('value', expect.stringContaining('业务例子：'));
    expect(api.calls.prompt).toEqual([]);
    expect(api.calls.save).toEqual([]);
  });

  it('opens a read-only sourcing turn beside the exact evidence card', async () => {
    const api = readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    const trace = await screen.findByRole('button', {
      name: /^溯源：交付请求/,
    });
    trace.focus();
    fireEvent.click(trace);
    const dialog = await screen.findByRole('dialog', {
      name: /^关键数据溯源：交付请求/,
    });
    expect(trace).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() =>
      expect(api.calls.prompt).toEqual([
        expect.objectContaining({
          focus: { nodeId: 'evidence.request', inquiry: 'trace' },
          text: expect.stringContaining('待决数据项'),
        }),
      ]),
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.calls.save).toEqual([]);
  });

  it('offers What-If only for a paired card and pins the follow-up to that evidence', async () => {
    const api = readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    expect(
      screen.queryByRole('button', { name: /^What-If：采购协议/ }),
    ).toBeNull();
    fireEvent.click(
      await screen.findByRole('button', { name: /^What-If：交付确认/ }),
    );
    const dialog = within(
      await screen.findByRole('dialog', {
        name: /^What-If 异常履约：交付确认/,
      }),
    );
    await waitFor(() =>
      expect(api.calls.prompt[0]?.focus).toEqual({
        nodeId: 'evidence.confirmation',
        inquiry: 'what-if',
      }),
    );
    fireEvent.change(dialog.getByLabelText('访谈内容'), {
      target: { value: '超时则通知采购方。' },
    });
    await waitFor(() =>
      expect(dialog.getByRole('button', { name: '发送' })).toBeEnabled(),
    );
    fireEvent.click(dialog.getByRole('button', { name: '发送' }));
    await waitFor(() =>
      expect(api.calls.prompt[1]?.focus).toEqual({
        nodeId: 'evidence.confirmation',
      }),
    );
    expect(api.calls.save).toEqual([]);
  });

  it('grows a saved-model canvas from stormed evidence through a real pair and a compensation branch', async () => {
    let document = createDesktopFixture();
    document.manifest.entryContextRefs = [];
    document.entities = [];
    document.relationships = [];
    document.rules = [];
    const api = installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
        document,
        issues: [],
      },
    });
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const canvas = screen.getByRole('group', {
      name: '业务全生命周期四阶段泳道',
    });
    expect(canvas.querySelectorAll('[data-milestone-stage]')).toHaveLength(4);
    const apply = (
      requestId: string,
      build: Parameters<typeof createModelPatch>[1],
    ) => {
      const { patches } = createModelPatch(document, build);
      act(() =>
        api.agentMock.requestPatch({
          requestId,
          patch: { rationale: requestId, patches },
        }),
      );
      expect(api.agentMock.patchResponses.at(-1)).toMatchObject({
        requestId,
        result: { success: true },
      });
      document = applyModelPatches(document, patches);
    };
    apply('头脑风暴', (draft) =>
      batchAddEvidenceMutator(draft, {
        evidences: [
          { id: 'evidence.enquiry', label: '询价', stage: 'rfp' },
          { id: 'evidence.quotation', label: '报价', stage: 'proposal' },
          { id: 'evidence.sale', label: '口头合同', stage: 'contract' },
          {
            id: 'evidence.payment',
            label: '付款凭证',
            stage: 'fulfillment',
            times: [
              {
                name: 'paid_at',
                label: '付款时间',
                meaning: '到账时刻',
                timeRole: 'occurrence',
              },
            ],
            keyData: [
              {
                name: 'amount',
                label: '实付金额',
                meaning: '实际付款金额',
                valueType: 'decimal',
              },
            ],
          },
        ],
      }),
    );
    const trace = await screen.findByRole('button', { name: '溯源：付款凭证' });
    expect(
      screen.queryByRole('button', { name: 'What-If：付款凭证' }),
    ).toBeNull();
    expect(api.calls.prompt).toEqual([]);
    expect(api.calls.save).toEqual([]);
    const positionedX = (id: string) =>
      Number(
        (
          container.querySelector(`[data-id="${id}"]`) as HTMLElement
        ).style.transform.match(/translate\(([-.\d]+)px,/)?.[1],
      );
    expect(positionedX('evidence.enquiry')).toBeLessThan(
      positionedX('evidence.quotation'),
    );
    expect(positionedX('evidence.quotation')).toBeLessThan(
      positionedX('evidence.sale'),
    );
    expect(positionedX('evidence.sale')).toBeLessThan(
      positionedX('evidence.payment'),
    );

    fireEvent.click(trace);
    const sourcing = await screen.findByRole('dialog', {
      name: '关键数据溯源：付款凭证',
    });
    act(() =>
      api.agentMock.emitEvent({
        type: 'text-delta',
        delta: '实付金额来自哪里？',
      }),
    );
    expect(within(sourcing).getByLabelText('AI 回复')).toHaveTextContent(
      '实付金额来自哪里？',
    );
    const answer = async (dialog: HTMLElement, text: string) => {
      const panel = within(dialog);
      fireEvent.change(panel.getByLabelText('访谈内容'), {
        target: { value: text },
      });
      const send = panel.getByRole('button', { name: '发送' });
      await waitFor(() => expect(send).toBeEnabled());
      fireEvent.click(send);
    };
    await answer(sourcing, '金额由买方在付款申请中填写。');
    apply('溯源并配对', (draft) =>
      splitEvidenceToPairMutator(draft, {
        evidenceRef: 'evidence.payment',
        request: { mode: 'create', id: 'request.payment', label: '付款申请' },
        inputAttributes: [
          {
            confirmationAttribute: 'amount',
            requestAttribute: 'requested_amount',
          },
        ],
      }),
    );
    const request = await screen.findByRole('button', {
      name: '溯源：付款申请',
    });
    expect(request).toBeInTheDocument();
    expect(positionedX('request.payment')).toBeLessThan(
      positionedX('evidence.payment'),
    );
    expect(trace).toHaveAttribute('aria-expanded', 'true');
    expect(sourcing).toBeInTheDocument();
    expect(container.querySelector('[data-pair-link]')).not.toBeNull();
    fireEvent.click(within(sourcing).getByRole('button', { name: '关闭' }));

    fireEvent.click(screen.getByRole('button', { name: 'What-If：付款凭证' }));
    const whatIf = await screen.findByRole('dialog', {
      name: 'What-If 异常履约：付款凭证',
    });
    expect(screen.queryByRole('button', { name: '溯源：退款确认' })).toBeNull();
    await answer(whatIf, '超时之后按约定启动退款。');
    apply('生长补偿', (draft) =>
      growBreachCompensationMutator(draft, {
        requestRef: 'request.payment',
        condition: '超时之后按约定启动退款',
        request: { id: 'request.refund', label: '退款请求' },
        confirmation: { id: 'evidence.refund', label: '退款确认' },
      }),
    );
    expect(
      await screen.findByRole('button', { name: '溯源：退款确认' }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-corridor-kind="remedy_corridor"]'),
    ).not.toBeNull();
    expect(api.calls.prompt.map(({ focus }) => focus)).toEqual([
      { nodeId: 'evidence.payment', inquiry: 'trace' },
      { nodeId: 'evidence.payment' },
      { nodeId: 'evidence.payment', inquiry: 'what-if' },
      { nodeId: 'evidence.payment' },
    ]);
    expect(api.calls.save).toEqual([]);
    fireEvent.click(within(whatIf).getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));
    await waitFor(() =>
      expect(api.calls.save).toEqual(['/models/procurement']),
    );
  });

  it('shows the selected object’s source excerpt in the inspector', async () => {
    const document = createDesktopFixture();
    document.entities.find(
      (entity) => entity.id === 'evidence.request',
    )!.sourceSnippet = {
      text: '交货条款',
      source: 'contract',
      locator: '第 1 条',
    };
    installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
        document,
        issues: [],
      },
    });
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.click(
      container.querySelector('[data-node-id="evidence.request"]')!,
    );
    const excerpt = await screen.findByLabelText('依据条款原文');
    expect(excerpt).toHaveTextContent('交货条款');
    expect(excerpt).toHaveTextContent('第 1 条');
  });

  it('explains a missing project path instead of rendering an empty canvas', async () => {
    installDesktopApi();

    render(<EditorScreen rootPath="" />);

    expect(await screen.findByText(/缺少项目路径/)).toBeInTheDocument();
  });

  it('loads the source tree and draws the interactive canvas', async () => {
    readyProject();

    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );

    expect(await readyCanvas()).toBeInTheDocument();
    expect(
      container.querySelector('[data-node-id="evidence.contract"]'),
    ).not.toBeNull();
    expect(screen.getByText('业务对象 8')).toBeInTheDocument();
    // Inspection owns the right pane until the modeler switches to Copilot.
    expect(
      screen.getByText('选择画布上的业务对象查看属性。'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('AI 建模副驾')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'AI Copilot' }));
    expect(screen.getByLabelText('AI 建模副驾')).toBeInTheDocument();
    expect(screen.getByLabelText('访谈内容')).toBeInTheDocument();
    expect(screen.getByText('履约连线 1')).toBeInTheDocument();
    expect(screen.getByText('上下文 2')).toBeInTheDocument();
  });

  it('plays the walkthrough on the canvas and silently refreshes clean models', async () => {
    const api = readyProject();
    api.story.listFlows = vi.fn(async () => [storyFlow()]);
    api.story.project = vi.fn(async () => storyResult());
    let invalidate: (event: StoryInvalidatedEvent) => void = () => undefined;
    const unsubscribe = vi.fn();
    api.story.onInvalidated = (listener) => {
      invalidate = listener;
      return unsubscribe;
    };
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    expect(api.story.project).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    const modes = within(screen.getByRole('group', { name: '画布放映模式' }));
    expect(modes.getByRole('button', { name: '业务旅程' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(modes.getByRole('button', { name: '业务流放映' }));
    expect(modes.getByRole('button', { name: '业务流放映' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByLabelText('副视口')).toBeNull();
    expect(screen.queryByRole('region', { name: '业务故事' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '剧情详情' }));
    expect(await screen.findByText('采购方办理采购协议。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByText('采购方办理交付请求。')).toBeInTheDocument();
    expect(container.querySelector('[data-id="evidence.request"]')).toHaveClass(
      'evidence-story-active',
    );
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).not.toHaveAttribute('aria-disabled');
    const document = createDesktopFixture();
    document.entities.find(({ id }) => id === 'evidence.contract')!.label =
      '外部更新采购协议';
    api.projects.open = vi.fn(async () => ({
      success: true as const,
      project: projectSummary(),
      document,
      issues: [],
    }));
    act(() => invalidate({ rootPath: '/models/procurement' }));
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="evidence.contract"]'),
      ).toHaveTextContent('外部更新采购协议'),
    );
    await waitFor(() =>
      expect(screen.getByText('步骤 2/3：办理交付请求')).toBeInTheDocument(),
    );
    expect(api.story.project).toHaveBeenLastCalledWith(
      expect.objectContaining({ document }),
    );
    expect(
      container.querySelector('[data-node-id="evidence.contract"]'),
    ).toHaveAttribute('data-story-step', 'completed');
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveAttribute('data-story-step', 'active');
    fireEvent.keyDown(screen.getByRole('dialog', { name: '剧情详情' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog', { name: '剧情详情' })).toBeNull();
    expect(
      screen.getByRole('progressbar', { name: '放映进度' }),
    ).toHaveAttribute('value', '2');
    fireEvent.click(screen.getByRole('button', { name: '退出放映' }));
    expect(screen.queryByLabelText('业务流放映控制')).toBeNull();
    expect(screen.queryByRole('region', { name: '业务故事' })).toBeNull();
    expect(unsubscribe).toHaveBeenCalled();
    expect(container.querySelector('.evidence-story-active')).toBeNull();
    expect(screen.getByLabelText('聚焦范围')).toHaveValue('context.catalog');
  });

  it('reads pending disk changes before starting a walkthrough from topology mode', async () => {
    const api = readyProject();
    let changed: Parameters<typeof api.projects.onChanged>[0] = () => undefined;
    api.projects.onChanged = (listener) => {
      changed = listener;
      return () => undefined;
    };
    api.story.listFlows = vi.fn(async () => [storyFlow()]);
    api.story.project = vi.fn(async () => storyResult());
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    const document = createDesktopFixture();
    document.entities.find(({ id }) => id === 'evidence.contract')!.label =
      '进入前的外部修改';
    api.projects.open = vi.fn(async () => ({
      success: true as const,
      project: projectSummary(),
      document,
      issues: [],
    }));
    act(() =>
      changed({
        rootPath: '/models/procurement',
        paths: ['entities/contract.json'],
        changedAt: '2026-11-11T09:00:00Z',
      }),
    );
    fireEvent.keyDown(window, { code: 'Digit2', altKey: true });
    fireEvent.click(screen.getByRole('button', { name: /业务流放映/ }));
    await waitFor(() => expect(api.story.project).toHaveBeenCalledOnce());
    expect(api.story.project).toHaveBeenCalledWith(
      expect.objectContaining({ document }),
    );
  });

  it('slides the problems panel over the canvas with Alt+X', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    expect(screen.queryByLabelText('门禁问题面板')).toBeNull();
    fireEvent.keyDown(window, { code: 'KeyX', altKey: true });
    const stage = screen
      .getByLabelText('聚焦范围')
      .closest('[data-region="workspace-stage"]');
    expect(stage).toContainElement(
      await screen.findByLabelText('门禁问题面板'),
    );
    expect(
      screen.getByRole('region', { name: '检查与协同' }),
    ).not.toContainElement(screen.getByLabelText('门禁问题面板'));
    fireEvent.keyDown(window, { code: 'KeyX', altKey: true });
    expect(screen.queryByLabelText('门禁问题面板')).toBeNull();
  });

  it('shares one resizable right pane between inspection and Copilot', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    const pane = screen.getByRole('region', { name: '检查与协同' });
    const inspector = within(pane).getByRole('button', {
      name: '实体属性检查',
    });
    const copilot = within(pane).getByRole('button', { name: 'AI Copilot' });
    expect(inspector).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(copilot);
    expect(copilot).toHaveAttribute('aria-pressed', 'true');
    expect(pane).toContainElement(screen.getByLabelText('访谈内容'));

    fireEvent.keyDown(window, { key: 'i', metaKey: true });
    expect(pane).toHaveAttribute('inert');
    fireEvent.keyDown(window, { key: 'i', metaKey: true });
    expect(pane).not.toHaveAttribute('inert');
    expect(copilot).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(inspector);
    expect(inspector).toHaveAttribute('aria-pressed', 'true');
    expect(pane).toHaveTextContent('选择画布上的业务对象查看属性。');
  });

  it('returns keyboard focus to the selected node without clearing selection', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const node = container.querySelector<HTMLElement>(
      '[data-node-id="evidence.contract"]',
    )!;
    fireEvent.click(node);
    const pane = screen.getByRole('region', { name: '检查与协同' });
    const back = within(pane).getByRole('button', { name: '返回画布' });
    back.focus();
    fireEvent.keyDown(back, { key: 'Escape' });
    expect(node).toHaveFocus();
    expect(node).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches the ledger and still opens rail tools with Mod+1, Mod+2 and Mod+4', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();

    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(await screen.findByLabelText('门禁问题面板')).toBeInTheDocument();

    const directory = screen.getByRole('button', { name: '实体目录' });
    expect(directory).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: '4', metaKey: true });
    expect(
      screen.queryByRole('complementary', { name: '实体目录' }),
    ).toBeNull();
    fireEvent.click(directory);
    expect(
      screen.getByRole('complementary', { name: '实体目录' }),
    ).toBeVisible();
  });

  it('keeps the directory and canvas selection in sync, revealing nodes beyond the current scope', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    const directory = within(
      screen.getByRole('complementary', { name: '实体目录' }),
    );
    expect(
      directory.getByRole('heading', { name: '实体目录 (8)' }),
    ).toBeVisible();
    expect(
      directory.getByRole('heading', { name: '角色 (Role)' }),
    ).toBeVisible();
    const contract = directory.getByRole('button', { name: /采购协议/ });
    const request = directory.getByRole('button', { name: /交付请求/ });
    const contractNode = container.querySelector(
      '[data-node-id="evidence.contract"]',
    );
    if (contractNode === null)
      throw new Error('Expected the contract on canvas');
    fireEvent.click(contractNode);
    expect(contract).toHaveAttribute('aria-current', 'true');
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    fireEvent.click(request);
    expect(request).toHaveAttribute('aria-current', 'true');
    expect(contract).not.toHaveAttribute('aria-current');
    expect(screen.getByLabelText('聚焦范围')).toHaveValue('');
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveClass('ring-2');
    expect(
      within(screen.getByRole('banner', { name: '工作台顶栏' })).getByText(
        /交付请求.*凭证/,
      ),
    ).toBeVisible();
    expect(api.calls.save).toEqual([]);
  });

  it('keeps scope and view mode out of the document and undo history', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    fireEvent.change(screen.getByLabelText('密度'), {
      target: { value: 'standard' },
    });
    const world = container.querySelector(
      '.react-flow__viewport',
    ) as HTMLElement;
    const beforeKeys = world.style.transform;
    fireEvent.keyDown(screen.getByLabelText('聚焦范围'), { key: '+' });
    expect(world.style.transform).toBe(beforeKeys);
    await waitFor(() =>
      expect(
        container.querySelector('[data-node-id="role.inventory"]'),
      ).toHaveStyle({ height: '156px' }),
    );
    // Undo has no history to walk, and the hub reports that instead of the
    // header, which no longer carries a greyed-out history button.
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('option', { name: /撤销/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '快速命令' })).toBeNull(),
    );
    expect(screen.queryByTitle('有未保存修改')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));
    await waitFor(() => expect(api.calls.save).toHaveLength(1));
    expect(screen.queryByTitle('有未保存修改')).toBeNull();
  });

  it('resets scope when quick search selects an out-of-scope object', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.change(await screen.findByLabelText('搜索命令或业务对象'), {
      target: { value: '交付请求' },
    });
    fireEvent.click(screen.getByRole('option', { name: /交付请求/ }));
    expect(screen.getByLabelText('聚焦范围')).toHaveValue('');
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).not.toHaveAttribute('aria-disabled');
    expect(
      screen.getByDisplayValue('交付请求（Delivery Request）'),
    ).toBeInTheDocument();
  });

  it('saves the edited document to disk from the header', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);

    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));

    await waitFor(() => {
      expect(api.calls.save).toEqual(['/models/procurement']);
    });
    expect(await screen.findByText(/已保存/)).toBeInTheDocument();
  });

  it('opens command navigation from the header', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.click(screen.getByRole('button', { name: '打开快速命令' }));
    expect(
      await screen.findByRole('dialog', { name: '快速命令' }),
    ).toBeInTheDocument();
  });

  it('opens the delivery hub from its chord', async () => {
    const api = installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
        document: createDesktopFixture(),
        issues: [],
      },
      deliveryPreviewResult: {
        success: true,
        preview: {
          modelId: 'desktop-fixture',
          modelName: '桌面端夹具',
          modelVersion: '1.0.0',
          services: [
            {
              id: 'service.procurement',
              name: '商品采购',
              kind: 'fulfillment',
              contextRef: 'context.procurement',
              supplies: [],
              consumes: [],
              notes: '合同上下文。',
              routeCount: 4,
              routePrefixes: ['/product-procurements'],
              routes: [],
            },
          ],
          links: [],
          routes: [],
          limitations: [],
        },
      },
    });

    const project = api.projects;
    const originalPreview = project.deliveryLivePreview;
    const preview = vi
      .spyOn(project, 'deliveryLivePreview')
      .mockImplementation(async (input) => {
        const result = await originalPreview(input);
        return result.success && input.includeArtifacts
          ? {
              success: true,
              analysis: {
                ...result.analysis,
                artifacts: [
                  { path: 'openapi.json', content: '{"openapi":"3.1.0"}' },
                ],
              },
            }
          : result;
      });
    render(<EditorScreen rootPath="/models/procurement" />);

    await readyCanvas();
    fireEvent.keyDown(window, { code: 'KeyD', altKey: true });

    const hub = await screen.findByRole('dialog', { name: '交付与导出中枢' });
    expect(
      await within(hub).findByRole('button', { name: /OpenAPI 契约/ }),
    ).toBeInTheDocument();
    expect(preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArtifacts: true }),
    );
    fireEvent.click(within(hub).getByRole('button', { name: '契约全览' }));
    expect(within(hub).getByText('核心履约')).toBeInTheDocument();
    expect(api.calls.deliveryPreview).toEqual([]);
    fireEvent.keyDown(hub, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '交付与导出中枢' })).toBeNull();
    expect(
      screen.getByRole('button', { name: '保存模型' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const palette = await screen.findByRole('dialog', { name: '快速命令' });
    fireEvent.change(within(palette).getByRole('combobox'), {
      target: { value: '交付' },
    });
    fireEvent.click(
      within(palette).getByRole('option', { name: /打开交付契约/ }),
    );
    const reopened = await screen.findByRole('dialog', {
      name: '交付与导出中枢',
    });
    fireEvent.keyDown(reopened, { code: 'Digit2', altKey: true });
    fireEvent.click(
      within(reopened).getByRole('button', { name: '返回工作台' }),
    );
    expect(screen.getByRole('button', { name: '业务旅程' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows a save failure without claiming success', async () => {
    installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
        document: createDesktopFixture(),
        issues: [],
      },
      saveResult: { success: false, error: '磁盘不可写。' },
    });

    render(<EditorScreen rootPath="/models/procurement" />);

    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));

    expect(await screen.findByText('磁盘不可写。')).toBeInTheDocument();
  });

  it('surfaces an unreadable model tree', async () => {
    installDesktopApi({
      openResult: { success: false, error: 'model.json 无法解析。' },
    });

    render(<EditorScreen rootPath="/models/broken" />);

    expect(
      await screen.findByText('model.json 无法解析。'),
    ).toBeInTheDocument();
  });
});

describe('EditorScreen sensors', () => {
  it('shows the verdict, opens the drawer and jumps to the finding', async () => {
    const api = installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary(),
        document: createDesktopFixture(),
        issues: [],
      },
      sensorReport: healthyReport({
        passed: false,
        blockCount: 1,
        isStageGateReady: false,
        issues: [
          {
            issueId: 'check_fm:FM_INCONSISTENT:1',
            severity: 'block',
            source: 'check_fm',
            code: 'FM_INCONSISTENT',
            message: '采购协议缺少确认端',
            targetNodeId: 'evidence.contract#signed_at',
            suggestion: '补齐履约配对。',
          },
        ],
      }),
    });

    render(<EditorScreen rootPath="/models/procurement" />);

    await screen.findByLabelText('聚焦范围');
    expect(await screen.findByText('阻塞 1')).toBeInTheDocument();
    expect(api.calls.triggerSensors).toEqual(['/models/procurement']);

    fireEvent.click(screen.getByTitle('展开检查结果'));
    expect(await screen.findByLabelText('门禁问题面板')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '总台账' }));
    expect(screen.getByLabelText('领域模型总台账')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: '定位到 采购协议缺少确认端' }),
    );

    expect(
      await screen.findByDisplayValue('采购协议（Procurement Contract）'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();
    expect(screen.getByDisplayValue('签署时间').closest('tr')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('tells the main process when the model changes', async () => {
    const api = installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary(),
        document: createDesktopFixture(),
        issues: [],
      },
    });

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('商品采购（Product Procurement）');

    fireEvent.click(screen.getByRole('button', { name: '保存模型' }));

    expect(await screen.findByText(/已保存/)).toBeInTheDocument();
    expect(api.calls.save).toEqual(['/models/procurement']);
  });

  it('shows what an agent patch changed and reverts it on Escape', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.procurement' },
    });
    act(() =>
      api.agentMock.requestPatch({
        requestId: 'patch-review',
        patch: {
          rationale: '新增审计员参与方',
          patches: [
            {
              op: 'add',
              path: '/entities/-',
              value: {
                type: 'entity',
                id: 'party.auditor',
                category: 'participant',
                kind: 'party',
                label: '审计员',
              },
            },
          ],
        },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI Copilot' }));
    expect(await screen.findByLabelText('AI 补丁复核')).toBeInTheDocument();
    expect(screen.getByText('新增审计员参与方')).toBeInTheDocument();
    expect(screen.getByText('新增 1')).toBeInTheDocument();
    expect(
      await screen.findByLabelText('本次补丁新增 审计员'),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByLabelText('AI 补丁复核')).toBeNull();
    });
    expect(screen.queryByLabelText('本次补丁新增 审计员')).toBeNull();
    await waitFor(() =>
      expect(screen.getByLabelText('聚焦范围')).toHaveValue(
        'context.procurement',
      ),
    );
  });

  it('keeps an agent patch when the modeler accepts it', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    act(() =>
      api.agentMock.requestPatch({
        requestId: 'patch-keep',
        patch: {
          rationale: '新增审计员参与方',
          patches: [
            {
              op: 'add',
              path: '/entities/-',
              value: {
                type: 'entity',
                id: 'party.auditor',
                category: 'participant',
                kind: 'party',
                label: '审计员',
              },
            },
          ],
        },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI Copilot' }));
    fireEvent.click(await screen.findByRole('button', { name: '保留' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('AI 补丁复核')).toBeNull();
    });
    expect(screen.queryByLabelText('本次补丁新增 审计员')).toBeNull();
  });

  it('opens the command hub on Cmd+K and reaches the copilot from it', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(
      await screen.findByRole('dialog', { name: '快速命令' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /向 AI 建模副驾提问/ }));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('访谈内容')),
    );
    expect(screen.queryByRole('dialog', { name: '快速命令' })).toBeNull();
  });

  it('jumps to a business object from the command hub', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.change(await screen.findByLabelText('搜索命令或业务对象'), {
      target: { value: '采购协议' },
    });
    fireEvent.click(screen.getByRole('option', { name: /采购协议/ }));

    // Selecting a target moves the shared selection, which the inspector reads.
    expect(
      await screen.findByDisplayValue('采购协议（Procurement Contract）'),
    ).toBeInTheDocument();
  });

  it('runs the view commands from the hub without a header button', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.click(await screen.findByRole('option', { name: /拓扑图/ }));

    expect(screen.getByRole('button', { name: /拓扑图/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens the agent on the selection with Cmd+J', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();

    fireEvent.click(
      container.querySelector('[data-node-id="evidence.contract"]') as Element,
    );
    fireEvent.keyDown(window, { key: 'j', metaKey: true });

    expect(await screen.findByLabelText('行内 AI 协同')).toBeInTheDocument();
    expect(screen.getByTestId('inline-copilot-focus')).toHaveTextContent(
      '采购协议（Procurement Contract）',
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByLabelText('行内 AI 协同')).toBeNull(),
    );
    // Closing the card must not clear the object it was about: the inspector
    // still shows the contract the question named.
    expect(
      screen.getByDisplayValue('采购协议（Procurement Contract）'),
    ).toBeInTheDocument();
  });

  it('tells the copilot what the next question is about', async () => {
    readyProject();

    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: 'AI Copilot' }));

    expect(screen.queryByTestId('agent-copilot-focus')).toBeNull();

    fireEvent.click(
      container.querySelector('[data-node-id="evidence.contract"]') as Element,
    );

    expect(await screen.findByTestId('agent-copilot-focus')).toHaveTextContent(
      '焦点：',
    );
  });
});

describe('EditorScreen stage navigation', () => {
  // The ledger is virtualised; jsdom reports a zero-height viewport and would
  // render none of its rows.
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 1200,
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  });

  it('switches the ledger from the sidebar without keeping the canvas mounted', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();

    fireEvent.change(screen.getByLabelText('密度'), {
      target: { value: 'simplified' },
    });
    const rail = within(screen.getByRole('navigation', { name: '活动导轨' }));
    const ledger = rail.getByRole('button', { name: '总台账' });
    expect(screen.getAllByRole('button', { name: '总台账' })).toEqual([ledger]);
    expect(ledger).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(ledger);
    expect(ledger).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '全部实体 (8)' })).toBeChecked();
    expect(screen.getByRole('button', { name: '导出 CSV' })).toBeEnabled();
    expect(
      screen.queryByRole('complementary', { name: '实体目录' }),
    ).toBeNull();
    expect(
      container.querySelector('[data-region="canvas-viewport"]'),
    ).toBeNull();

    fireEvent.click(ledger);
    expect(ledger).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();
    expect(screen.getByLabelText('密度')).toHaveValue('simplified');
    expect(api.calls.save).toEqual([]);
  });

  it('resets the zoom with Cmd+0 and fits the model with Shift+1', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    // React Flow keeps the pan/zoom transform on its viewport element.
    const world = () =>
      container.querySelector('.react-flow__viewport') as HTMLElement;

    fireEvent.keyDown(window, { key: '0', metaKey: true });
    await waitFor(() => expect(world().style.transform).toContain('scale(1)'));

    const reset = world().style.transform;
    fireEvent.keyDown(window, { code: 'Digit1', shiftKey: true });
    await waitFor(() => expect(world().style.transform).not.toBe(reset));
  });

  it('removes the outline and split controls and their old shortcuts', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();

    expect(screen.queryByRole('button', { name: '业务结构' })).toBeNull();
    expect(screen.queryByRole('button', { name: /分屏/ })).toBeNull();
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    fireEvent.keyDown(window, { key: 'v' });
    for (const code of ['Digit3', 'Digit4', 'Digit5']) {
      fireEvent.keyDown(window, { code, altKey: true });
    }

    expect(screen.queryByLabelText('搜索业务对象')).toBeNull();
    expect(screen.queryByRole('dialog', { name: '快速命令' })).toBeNull();
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();
    expect(screen.queryByLabelText('副视口')).toBeNull();
    expect(
      container.querySelectorAll('[data-region="canvas-viewport"]'),
    ).toHaveLength(1);
  });

  it('opens diagnostics from the ledger and returns to the graph for graph-side rail tools', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    const ledger = screen.getByRole('button', { name: '总台账' });
    fireEvent.click(ledger);
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(await screen.findByLabelText('门禁问题面板')).toBeVisible();
    expect(ledger).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: '4', metaKey: true });
    expect(
      screen.getByRole('complementary', { name: '实体目录' }),
    ).toBeVisible();
    expect(ledger).toHaveAttribute('aria-pressed', 'false');
  });

  it('exports just the filtered ledger rows through the top bar', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '总台账' }));
    const topBar = screen.getByRole('banner', { name: '工作台顶栏' });
    expect(topBar).toHaveTextContent('领域总台账 (Domain Model Ledger)');
    expect(
      within(topBar).queryByRole('button', { name: '保存模型' }),
    ).toBeNull();
    const exportButton = within(topBar).getByRole('button', {
      name: '导出 CSV',
    });
    const search = screen.getByRole('searchbox', {
      name: '过滤实体或 CEL 规则',
    });
    fireEvent.change(search, { target: { value: 'non-existing-entity' } });
    expect(exportButton).toBeDisabled();
    fireEvent.change(search, { target: { value: 'evidence.request' } });

    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:ledger-test';
    });
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL,
        revokeObjectURL: vi.fn(),
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    try {
      fireEvent.click(exportButton);
      expect(click).toHaveBeenCalledOnce();
      const [blob] = blobs;
      if (blob === undefined) throw new Error('Missing CSV Blob');
      const csv = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      expect(csv).toContain('"evidence.request"');
      expect(csv).not.toContain('"evidence.contract"');
      expect(csv.trim().split('\r\n')).toHaveLength(2);
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('walks from a ledger row back to the same object on the canvas', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await readyCanvas();
    fireEvent.click(screen.getByRole('button', { name: '总台账' }));
    await screen.findByLabelText('领域模型总台账');

    fireEvent.click(
      screen.getByLabelText('在画布中定位 采购协议（Procurement Contract）'),
    );

    await waitFor(() =>
      expect(
        container.querySelector('[data-region="canvas-viewport"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByRole('button', { name: '业务旅程' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The breadcrumb names the object the table was reading.
    expect(
      screen.getAllByText('采购协议（Procurement Contract）').length,
    ).toBeGreaterThan(0);
  });
});

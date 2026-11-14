import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EditorScreen } from './EditorScreen';
import {
  healthyReport,
  installDesktopApi,
  projectSummary,
} from '../test-support/desktopApi';
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

describe('EditorScreen', () => {
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

    expect(
      await screen.findByText('桌面端夹具（Desktop Fixture）'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-node-id="evidence.contract"]'),
    ).not.toBeNull();
    expect(screen.getByText('业务对象 8')).toBeInTheDocument();
    // Inspection owns the right rail by default; the copilot is a drawer.
    expect(
      screen.getByText('选择画布上的业务对象查看属性。'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('AI 建模副驾')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'AI 协同' }));
    expect(screen.getByLabelText('AI 建模副驾')).toBeInTheDocument();
    expect(screen.getByLabelText('访谈内容')).toBeInTheDocument();
    expect(screen.getByText('履约对 1')).toBeInTheDocument();
    expect(screen.getByText('上下文 2')).toBeInTheDocument();
  });

  it('slides the problems panel over the canvas with Alt+X', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    expect(screen.queryByLabelText('门禁问题面板')).toBeNull();
    fireEvent.keyDown(window, { code: 'KeyX', altKey: true });
    expect(await screen.findByLabelText('门禁问题面板')).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'KeyX', altKey: true });
    expect(screen.queryByLabelText('门禁问题面板')).toBeNull();
  });

  it('opens and closes the outline drawer with Cmd+B', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    expect(screen.queryByLabelText('搜索业务对象')).toBeNull();
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(await screen.findByLabelText('搜索业务对象')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    await waitFor(() =>
      expect(screen.queryByLabelText('搜索业务对象')).toBeNull(),
    );
  });

  it('hands the canvas back once a drawer picked an object', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.click(screen.getByRole('button', { name: '业务结构' }));
    fireEvent.click(
      screen.getByRole('button', { name: '采购协议（Procurement Contract）' }),
    );

    // The selection reached the inspector, and the drawer stopped covering the
    // canvas it just navigated.
    expect(
      screen.getByDisplayValue('采购协议（Procurement Contract）'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('搜索业务对象')).toBeNull();
  });

  it('keeps a pinned drawer open while the modeler picks objects', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.click(screen.getByRole('button', { name: '业务结构' }));
    fireEvent.click(screen.getByRole('button', { name: '固定面板' }));

    const request = screen
      .getAllByText('交付请求（Delivery Request）')
      .find((item) => item.closest('button') !== null)!;
    fireEvent.click(request);

    expect(screen.getByLabelText('搜索业务对象')).toBeInTheDocument();
  });

  it('opens every rail drawer with Mod+1 to Mod+4', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(await screen.findByLabelText('搜索业务对象')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(await screen.findByLabelText('门禁问题面板')).toBeInTheDocument();
    expect(screen.queryByLabelText('搜索业务对象')).toBeNull();

    fireEvent.keyDown(window, { key: '4', metaKey: true });
    expect(await screen.findByLabelText('访谈内容')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '4', metaKey: true });
    await waitFor(() => expect(screen.queryByLabelText('访谈内容')).toBeNull());
  });

  it('keeps scope and view mode out of the document and undo history', async () => {
    const api = readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    fireEvent.click(screen.getByText('标准图'));
    const world = container.querySelector(
      '.react-flow__viewport',
    ) as HTMLElement;
    const beforeKeys = world.style.transform;
    fireEvent.keyDown(screen.getByLabelText('聚焦范围'), { key: '+' });
    expect(world.style.transform).toBe(beforeKeys);
    expect(
      container.querySelector('[data-node-id="role.inventory"]'),
    ).toHaveStyle({ height: '156px' });
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
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(api.calls.save).toHaveLength(1));
    expect(screen.queryByTitle('有未保存修改')).toBeNull();
  });

  it('resets scope when sidebar navigation selects an out-of-scope object', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    expect(
      container.querySelector('[data-node-id="evidence.request"]'),
    ).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: '业务结构' }));
    // The drawer remains a full-model navigator, not a second scope filter.
    const request = screen
      .getAllByText('交付请求（Delivery Request）')
      .find((item) => item.closest('button') !== null)!;
    fireEvent.click(request);
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

    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(api.calls.save).toEqual(['/models/procurement']);
    });
    expect(await screen.findByText(/已保存/)).toBeInTheDocument();
  });

  it('reports a finished export as a toast, not as a strip under the header', async () => {
    const api = installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
        document: createDesktopFixture(),
        issues: [],
      },
      exportReviewResult: {
        status: 'saved',
        path: '/models/procurement/review.html',
        counts: {
          contracts: 1,
          entities: 8,
          rules: 2,
          scenarios: 1,
          capabilities: 0,
        },
      },
    });

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.click(screen.getByRole('button', { name: '导出审查页' }));

    expect(await screen.findByText(/已导出审查页/)).toBeInTheDocument();
    expect(api.calls.exportReview).toEqual(['/models/procurement']);
    // The result is transient: it must not occupy a row of the layout.
    expect(screen.queryByRole('status')).toBeNull();
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
            },
          ],
          links: [],
          routes: [],
          limitations: [],
        },
      },
    });

    render(<EditorScreen rootPath="/models/procurement" />);

    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.keyDown(window, { code: 'KeyD', altKey: true });

    expect(await screen.findByLabelText('交付中心')).toBeInTheDocument();
    expect(await screen.findByText('核心履约')).toBeInTheDocument();
    expect(api.calls.deliveryLivePreview).toEqual(['/models/procurement']);
    expect(api.calls.deliveryPreview).toEqual([]);
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

    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.click(screen.getByText('保存'));

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

    await screen.findByText('商品采购（Product Procurement）');
    expect(await screen.findByText('阻塞 1')).toBeInTheDocument();
    expect(api.calls.triggerSensors).toEqual(['/models/procurement']);

    fireEvent.click(screen.getByTitle('展开检查结果'));
    expect(await screen.findByLabelText('门禁问题面板')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '定位到 采购协议缺少确认端' }),
    );

    expect(
      await screen.findByDisplayValue('采购协议（Procurement Contract）'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('签署时间')).toBeInTheDocument();
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

    fireEvent.click(screen.getByText('保存'));

    expect(await screen.findByText(/已保存/)).toBeInTheDocument();
    expect(api.calls.save).toEqual(['/models/procurement']);
  });

  it('shows what an agent patch changed and reverts it on Escape', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.procurement' },
    });
    act(() =>
      api.agentMock.requestPatch({
        requestId: 'patch-review',
        patch: {
          rationale: '新增审计员参与方',
          commands: [
            {
              type: 'create-entity',
              entity: {
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

    fireEvent.click(screen.getByRole('button', { name: 'AI 协同' }));
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
    expect(screen.getByLabelText('聚焦范围')).toHaveValue(
      'context.procurement',
    );
  });

  it('keeps an agent patch when the modeler accepts it', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    act(() =>
      api.agentMock.requestPatch({
        requestId: 'patch-keep',
        patch: {
          rationale: '新增审计员参与方',
          commands: [
            {
              type: 'create-entity',
              entity: {
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

    fireEvent.click(screen.getByRole('button', { name: 'AI 协同' }));
    fireEvent.click(await screen.findByRole('button', { name: '保留' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('AI 补丁复核')).toBeNull();
    });
    expect(screen.queryByLabelText('本次补丁新增 审计员')).toBeNull();
  });

  it('opens the command hub on Cmd+K and reaches the copilot from it', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(
      await screen.findByRole('dialog', { name: '快速命令' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /向 AI 建模副驾提问/ }));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('访谈内容')),
    );
    expect(screen.queryByRole('dialog', { name: '快速命令' })).toBeNull();

    // The outline search keeps its own chord, because "find this object" and
    // "run this action" are different questions.
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText('搜索业务对象'));
  });

  it('jumps to a business object from the command hub', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

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
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.click(await screen.findByRole('option', { name: /总台账/ }));

    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
  });

  it('opens the agent on the selection with Cmd+J', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');

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
    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.click(screen.getByRole('button', { name: 'AI 协同' }));

    expect(screen.queryByTestId('agent-copilot-focus')).toBeNull();

    fireEvent.click(
      container.querySelector('[data-node-id="evidence.contract"]') as Element,
    );

    expect(await screen.findByTestId('agent-copilot-focus')).toHaveTextContent(
      '焦点：',
    );
  });
});

describe('EditorScreen dual-mode stage', () => {
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

  it('switches stage and density from the floating island', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.click(screen.getByRole('button', { name: '简化图' }));
    expect(screen.getByRole('button', { name: '简化图' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /总台账/ }));
    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
  });

  it('resets the zoom with Cmd+0 and fits the model with Shift+1', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');
    // React Flow keeps the pan/zoom transform on its viewport element.
    const world = () =>
      container.querySelector('.react-flow__viewport') as HTMLElement;

    fireEvent.keyDown(window, { key: '0', metaKey: true });
    await waitFor(() => expect(world().style.transform).toContain('scale(1)'));

    const reset = world().style.transform;
    fireEvent.keyDown(window, { code: 'Digit1', shiftKey: true });
    await waitFor(() => expect(world().style.transform).not.toBe(reset));
  });

  it('reaches the ledger from the floating island without a header control', async () => {
    readyProject();
    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    // The header no longer carries a view switch: the island owns it.
    expect(screen.getAllByRole('button', { name: /拓扑图/ })).toHaveLength(1);
  });

  it('opens the whole ledger with Alt+2 and returns to the graph with Alt+1', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { code: 'Digit2', altKey: true });

    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
    expect(
      container.querySelector('[data-region="canvas-viewport"]'),
    ).toBeNull();
    expect(screen.getByText('8 个实体 · 4 个字段')).toBeInTheDocument();

    fireEvent.keyDown(window, { code: 'Digit1', altKey: true });

    await waitFor(() =>
      expect(
        container.querySelector('[data-region="canvas-viewport"]'),
      ).not.toBeNull(),
    );
    expect(screen.queryByLabelText('领域模型总台账')).toBeNull();
  });

  it('flips between the graph and the ledger on V', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { key: 'v' });
    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'v' });
    await waitFor(() =>
      expect(
        container.querySelector('[data-region="canvas-viewport"]'),
      ).not.toBeNull(),
    );
  });

  it('keeps both surfaces mounted in split mode', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { code: 'Digit3', altKey: true });

    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
    expect(
      container.querySelector('[data-region="canvas-viewport"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-panel-resize-handle-id]').length,
    ).toBeGreaterThan(0);
  });

  it('reads the projected contract, rules and sandbox beside the graph', async () => {
    installDesktopApi({
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
          modelVersion: '1.0',
          services: [],
          links: [],
          routes: [
            {
              method: 'POST',
              path: '/v1/procurement/orders',
              summary: '发起采购',
              serviceId: 'svc.procurement',
            },
          ],
          limitations: [],
        },
      },
    });
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { code: 'Digit3', altKey: true });

    expect(await screen.findByLabelText('副视口')).toBeInTheDocument();
    // The stage opens on the ledger, the projection the split always had.
    expect(screen.getByLabelText('领域模型总台账')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /交付契约/ }));
    expect(
      container.querySelector('[data-region="openapi-spec"]'),
    ).not.toBeNull();
    await waitFor(() =>
      expect(
        container.querySelector('[data-region="code-editor"]'),
      ).not.toBeNull(),
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-region="code-editor"]')?.textContent,
      ).toContain('openapi: 3.1.0'),
    );

    fireEvent.click(screen.getByRole('tab', { name: /派生规则/ }));
    expect(
      container.querySelector('[data-region="cel-rules"]'),
    ).not.toBeNull();

    // Closing the stage returns to the graph, not to a bare ledger.
    fireEvent.click(screen.getByRole('button', { name: '关闭分屏' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('副视口')).toBeNull(),
    );
    expect(
      container.querySelector('[data-region="canvas-viewport"]'),
    ).not.toBeNull();
  });

  it('opens the contract comparison with Alt+4 and flips its direction with Alt+S', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { code: 'Digit4', altKey: true });

    const stage = await screen.findByLabelText('副视口');
    expect(stage).toHaveAttribute('data-pane', 'openapi');
    expect(stage).toHaveAttribute('data-direction', 'horizontal');
    expect(
      container.querySelector('[data-region="openapi-spec"]'),
    ).not.toBeNull();

    fireEvent.keyDown(window, { code: 'KeyS', altKey: true });

    await waitFor(() =>
      expect(screen.getByLabelText('副视口')).toHaveAttribute(
        'data-direction',
        'vertical',
      ),
    );

    // The graph and the comparison share the stage in either direction.
    expect(
      container.querySelector('[data-region="canvas-viewport"]'),
    ).not.toBeNull();
  });

  it('travels from a ledger row to the object on the canvas beside it', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.keyDown(window, { code: 'Digit3', altKey: true });
    await screen.findByLabelText('领域模型总台账');

    // React Flow keeps the pan/zoom transform on its viewport element.
    const world = () =>
      container.querySelector('.react-flow__viewport') as HTMLElement;
    const before = world().style.transform;

    fireEvent.click(
      container.querySelector('[data-ledger-row="evidence.contract"]')!,
    );

    // The pane's request reaches the canvas on the same bus the canvas uses to
    // tell the pane which row to light.
    await waitFor(() => expect(world().style.transform).not.toBe(before));
    expect(
      container.querySelector('[data-row-flash]'),
    ).not.toBeNull();
  });

  it('walks from a ledger row back to the same object on the canvas', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.keyDown(window, { code: 'Digit2', altKey: true });
    await screen.findByLabelText('领域模型总台账');

    fireEvent.click(
      screen.getByLabelText('在拓扑图中定位 采购协议（Procurement Contract）'),
    );

    await waitFor(() =>
      expect(
        container.querySelector('[data-region="canvas-viewport"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByRole('button', { name: /拓扑图/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The breadcrumb names the object the table was reading.
    expect(
      screen.getAllByText('采购协议（Procurement Contract）').length,
    ).toBeGreaterThan(0);
  });
});

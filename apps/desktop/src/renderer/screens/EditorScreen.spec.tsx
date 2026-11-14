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
    // Inspection owns the right rail by default; the copilot shares it as a tab.
    expect(screen.getByRole('tab', { name: '属性' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByLabelText('AI 建模副驾')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /协同/ }));
    expect(screen.getByLabelText('AI 建模副驾')).toBeInTheDocument();
    expect(screen.getByLabelText('访谈内容')).toBeInTheDocument();
    expect(screen.getByText('履约对 1')).toBeInTheDocument();
    expect(screen.getByText('上下文 2')).toBeInTheDocument();
  });

  it('docks the console with Cmd+J instead of covering the canvas', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    expect(screen.queryByLabelText('工作台控制台')).toBeNull();
    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(await screen.findByLabelText('工作台控制台')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(screen.queryByLabelText('工作台控制台')).toBeNull();
  });

  it('collapses and restores the outline rail with Cmd+B', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');
    const rail = () => container.querySelector('[data-panel-id="left-rail"]');

    expect(rail()).toHaveAttribute('data-panel-collapsible', 'true');
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    await waitFor(() =>
      expect(rail()?.getAttribute('data-panel-size')).toBe('0.0'),
    );
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    await waitFor(() =>
      expect(Number(rail()?.getAttribute('data-panel-size'))).toBeGreaterThan(
        0,
      ),
    );
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
      '[data-region="canvas-world"]',
    ) as HTMLElement;
    const beforeKeys = world.style.transform;
    fireEvent.keyDown(screen.getByLabelText('聚焦范围'), { key: '+' });
    expect(world.style.transform).toBe(beforeKeys);
    expect(
      container.querySelector('[data-node-id="role.inventory"]'),
    ).toHaveStyle({ height: '156px' });
    expect(screen.getByTitle('撤销（Cmd/Ctrl+Z）')).toBeDisabled();
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
    // The sidebar remains a full-model navigator, not a second scope filter.
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

  it('opens the delivery hub from the header', async () => {
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
    fireEvent.click(screen.getByText('交付'));

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
    expect(await screen.findByLabelText('检查结果')).toBeInTheDocument();

    fireEvent.click(screen.getByText('采购协议缺少确认端'));

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

    fireEvent.click(screen.getByRole('tab', { name: /协同/ }));
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

    fireEvent.click(screen.getByRole('tab', { name: /协同/ }));
    fireEvent.click(await screen.findByRole('button', { name: '保留' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('AI 补丁复核')).toBeNull();
    });
    expect(screen.queryByLabelText('本次补丁新增 审计员')).toBeNull();
  });

  it('focuses the agent composer on Cmd+K and the search on Cmd+F', async () => {
    readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(
      await screen.findByLabelText('访谈内容'),
    );

    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText('搜索业务对象'));
  });

  it('tells the copilot what the next question is about', async () => {
    readyProject();

    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.click(screen.getByRole('tab', { name: /协同/ }));

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

  it('opens the whole ledger with Mod+2 and returns to the graph with Mod+1', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    fireEvent.keyDown(window, { key: '2', metaKey: true });

    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
    expect(
      container.querySelector('[data-region="canvas-viewport"]'),
    ).toBeNull();
    expect(screen.getByText('8 个实体 · 4 个字段')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '1', metaKey: true });

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

    fireEvent.keyDown(window, { key: '3', metaKey: true });

    expect(await screen.findByLabelText('领域模型总台账')).toBeInTheDocument();
    expect(
      container.querySelector('[data-region="canvas-viewport"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-panel-resize-handle-id]').length,
    ).toBeGreaterThan(0);
  });

  it('walks from a ledger row back to the same object on the canvas', async () => {
    readyProject();
    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');
    fireEvent.keyDown(window, { key: '2', metaKey: true });
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

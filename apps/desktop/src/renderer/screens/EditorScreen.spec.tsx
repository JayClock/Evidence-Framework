import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EditorScreen } from './EditorScreen';
import {
  healthyReport,
  installDesktopApi,
  projectSummary,
} from '../test-support/desktopApi';
import { createDesktopFixture } from '../test-support/modelFixture';

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
    expect(screen.getByLabelText('AI 访谈输入')).toBeInTheDocument();
    expect(screen.getByText('AI 访谈与操控')).toBeInTheDocument();
    expect(screen.getByText('履约对 1')).toBeInTheDocument();
    expect(screen.getByText('上下文 2')).toBeInTheDocument();
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
    expect(api.calls.deliveryPreview).toEqual(['/models/procurement']);
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
    expect(document.activeElement).toBe(screen.getByLabelText('访谈内容'));

    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText('搜索业务对象'));
  });

  it('tells the dock what the next question is about', async () => {
    readyProject();

    const { container } = render(
      <EditorScreen rootPath="/models/procurement" />,
    );
    await screen.findByText('桌面端夹具（Desktop Fixture）');

    expect(screen.queryByTestId('prompt-dock-focus')).toBeNull();

    fireEvent.click(
      container.querySelector('[data-node-id="evidence.contract"]') as Element,
    );

    expect(await screen.findByTestId('prompt-dock-focus')).toHaveTextContent(
      '焦点：',
    );
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(
      await screen.findByText('尚无访谈记录。在下方输入经营事实开始第一轮。'),
    ).toBeInTheDocument();
    expect(screen.getByText('履约对 1')).toBeInTheDocument();
    expect(screen.getByText('上下文 2')).toBeInTheDocument();
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
    expect(screen.getByText('签署时间')).toBeInTheDocument();
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
});

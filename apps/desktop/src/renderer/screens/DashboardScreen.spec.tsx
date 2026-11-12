import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardScreen } from './DashboardScreen';
import {
  defaultTemplates,
  installDesktopApi,
  projectSummary,
} from '../test-support/desktopApi';

describe('DashboardScreen', () => {
  it('explains the empty state and where models live', async () => {
    installDesktopApi({ projects: [] });

    render(<DashboardScreen />);

    expect(await screen.findByText('还没有打开过模型')).toBeInTheDocument();
    expect(screen.getByText('.evidence/fm/')).toBeInTheDocument();
  });

  it('lists recent projects with their real counts', async () => {
    installDesktopApi({ projects: [projectSummary()] });

    render(<DashboardScreen />);

    expect(
      await screen.findByText('商品采购（Product Procurement）'),
    ).toBeInTheDocument();
    expect(screen.getByText('业务对象 12')).toBeInTheDocument();
    expect(screen.getByText('关系 8')).toBeInTheDocument();
    expect(screen.getByText('规则 3')).toBeInTheDocument();
  });

  it('opens a recent project in a new editor window', async () => {
    const api = installDesktopApi({ projects: [projectSummary()] });

    render(<DashboardScreen />);

    fireEvent.click(await screen.findByText('商品采购（Product Procurement）'));

    await waitFor(() => {
      expect(api.calls.openEditorWindow).toEqual(['/models/procurement']);
    });
    expect(api.calls.open).toEqual(['/models/procurement']);
  });

  it('surfaces parse errors instead of opening a broken tree', async () => {
    const api = installDesktopApi({
      projects: [projectSummary()],
      openResult: { success: false, error: 'model.json 无法解析。' },
    });

    render(<DashboardScreen />);

    fireEvent.click(await screen.findByText('商品采购（Product Procurement）'));

    expect(
      await screen.findByText('model.json 无法解析。'),
    ).toBeInTheDocument();
    expect(api.calls.openEditorWindow).toEqual([]);
  });

  it('opens the folder picker before touching the project store', async () => {
    const api = installDesktopApi({
      dialogResult: { success: true, rootPath: '/models/warehouse' },
    });

    render(<DashboardScreen />);

    fireEvent.click(screen.getByText('打开本地项目…'));

    await waitFor(() => {
      expect(api.calls.showOpenDialog).toBe(1);
    });
    expect(api.calls.open).toEqual(['/models/warehouse']);
  });
});

describe('DashboardScreen starters', () => {
  it('offers the lecture cases on the empty screen', async () => {
    installDesktopApi({ projects: [] });

    render(<DashboardScreen />);

    expect(await screen.findByText('公对公商品采购履约')).toBeInTheDocument();
    expect(
      screen.getByText(
        '询价与报价、采购协议，加上发货、支付、开票三组履约项与对应凭证。',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('空白模型')).not.toBeInTheDocument();
  });

  it('creates a project from a starter card and opens the editor', async () => {
    const api = installDesktopApi({
      projects: [],
      createDialogResult: {
        success: true,
        targetPath: '/models/new-procurement',
        kind: 'directory',
      },
      createResult: {
        success: true,
        project: projectSummary({
          rootPath: '/models/new-procurement',
          modelRoot: '/models/new-procurement/.evidence/fm',
          name: '采购履约模型',
        }),
        document: { manifest: {} } as never,
      },
    });

    render(<DashboardScreen />);

    fireEvent.click(await screen.findByText('公对公商品采购履约'));

    const nameInput = await screen.findByLabelText('模型名称');

    fireEvent.change(nameInput, { target: { value: '采购履约模型' } });
    fireEvent.click(screen.getByText('选择位置并创建'));

    await waitFor(() => {
      expect(api.calls.create).toEqual([
        {
          targetPath: '/models/new-procurement',
          name: '采购履约模型',
          templateId: 'procurement',
          kind: 'directory',
        },
      ]);
    });
    expect(api.calls.showCreateDialog).toEqual([
      { kind: 'directory', suggestedName: '采购履约模型.evidence.json' },
    ]);
    expect(api.calls.openEditorWindow).toEqual(['/models/new-procurement']);
    expect(await screen.findByText('/models/new-procurement')).toBeInTheDocument();
  });

  it('starts from the header button with the recommended starter', async () => {
    const api = installDesktopApi({ projects: [] });

    render(<DashboardScreen />);

    fireEvent.click(await screen.findByText('新建模型'));

    const dialog = await screen.findByRole('dialog', { name: '新建模型' });

    expect(
      within(dialog).getByRole('button', { name: /公对公商品采购履约/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(api.calls.create).toEqual([]);
  });

  it('keeps the dialog open and reports a refused destination', async () => {
    installDesktopApi({
      projects: [],
      createDialogResult: {
        success: true,
        targetPath: '/models/taken',
        kind: 'directory',
      },
      createResult: {
        success: false,
        error: '目标目录已有模型（.evidence/fm/model.json），请直接打开它或换一个目录。',
      },
    });

    render(<DashboardScreen />);

    fireEvent.click(await screen.findByText('新建模型'));
    fireEvent.click(await screen.findByText('选择位置并创建'));

    expect(
      await screen.findByText(/目标目录已有模型/),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '新建模型' })).toBeInTheDocument();
  });

  it('switches to a single-file model when asked', async () => {
    const api = installDesktopApi({
      projects: [],
      createDialogResult: {
        success: true,
        targetPath: '/models/mailed.evidence.json',
        kind: 'file',
      },
      createResult: {
        success: true,
        project: projectSummary({
          rootPath: '/models/mailed.evidence.json',
          modelRoot: '/models/mailed.evidence.json',
          kind: 'file',
        }),
        document: { manifest: {} } as never,
      },
      templates: defaultTemplates(),
    });

    render(<DashboardScreen />);

    fireEvent.click(await screen.findByText('新建模型'));
    fireEvent.click(await screen.findByText('单文件'));
    fireEvent.click(screen.getByText('选择位置并创建'));

    await waitFor(() => {
      expect(api.calls.create).toHaveLength(1);
    });
    expect(api.calls.create[0]?.kind).toBe('file');
    expect(api.calls.showCreateDialog[0]?.kind).toBe('file');
  });
});

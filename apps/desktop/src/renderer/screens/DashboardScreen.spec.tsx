import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { version } from '../../../package.json';
import { AiConfigurationProvider } from '../state/AiConfiguration';

import { DashboardScreen } from './DashboardScreen';
import {
  defaultTemplates,
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';

describe('DashboardScreen', () => {
  it('explains the empty state and where models live', async () => {
    installDesktopApi({ projects: [] });

    render(<DashboardScreen />);

    expect(await screen.findByText('还没有打开过模型')).toBeInTheDocument();
    expect(screen.getByText('.evidence/fm/')).toBeInTheDocument();
  });

  it('lists real counts and highlights only the most recent project', async () => {
    installDesktopApi({
      projects: [
        projectSummary(),
        projectSummary({
          rootPath: '/models/warehouse.evidence.json',
          kind: 'file',
          name: '仓储履约',
          entityCount: 5,
          ruleCount: 0,
        }),
      ],
    });

    render(<DashboardScreen />);

    const recents = screen.getByRole('region', { name: '最近打开的项目' });
    const cards = await within(recents).findAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('12 个实体 · 3 条 CEL 规则');
    expect(cards[0]).toHaveTextContent('最近打开');
    expect(cards[1]).toHaveTextContent('5 个实体 · 0 条 CEL 规则');
    expect(cards[1]).not.toHaveTextContent('最近打开');
    expect(within(recents).getByText(/共 2 个项目/)).toBeInTheDocument();
    const quickStart = screen.getByRole('region', {
      name: '快速开始与智能摄取',
    });
    expect(
      within(quickStart).getByRole('button', { name: /空白模型/ }),
    ).toBeInTheDocument();
  });

  it('opens a recent project in a new editor window', async () => {
    const api = installDesktopApi({ projects: [projectSummary()] });

    render(<DashboardScreen />);

    fireEvent.click(
      await screen.findByRole('button', { name: /打开工作台：商品采购/ }),
    );

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

    fireEvent.click(
      await screen.findByRole('button', { name: /打开工作台：商品采购/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'model.json 无法解析。',
    );
    expect(
      screen.getByRole('button', { name: /打开工作台：商品采购/ }),
    ).toBeEnabled();
    expect(api.calls.openEditorWindow).toEqual([]);
  });

  it('opens the folder picker before touching the project store', async () => {
    const api = installDesktopApi({
      dialogResult: { success: true, rootPath: '/models/warehouse' },
    });

    render(<DashboardScreen />);

    fireEvent.click(screen.getByRole('button', { name: '打开本地项目' }));

    await waitFor(() => {
      expect(api.calls.showOpenDialog).toBe(1);
    });
    expect(api.calls.open).toEqual(['/models/warehouse']);
  });

  it.each(['metaKey', 'ctrlKey'])(
    'opens the picker with %s+O and does not stack a second picker',
    async (modifier) => {
      const api = installDesktopApi();
      render(<DashboardScreen />);
      const openButton = screen.getByRole('button', { name: '打开本地项目' });

      fireEvent.keyDown(window, { key: 'o', [modifier]: true });
      expect(openButton).toBeDisabled();
      fireEvent.keyDown(window, { key: 'o', [modifier]: true });
      expect(api.calls.showOpenDialog).toBe(1);

      await waitFor(() => expect(openButton).toBeEnabled());
      expect(api.calls.open).toEqual([]);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('does not intercept the open shortcut while an existing dialog is shown', async () => {
    const api = installDesktopApi();
    render(<DashboardScreen />);
    fireEvent.click(screen.getByRole('button', { name: '开始智能提取向导' }));
    const dialog = await screen.findByRole('dialog', {
      name: /Smart Ingestion/,
    });

    fireEvent.keyDown(dialog, { key: 'o', metaKey: true });

    expect(api.calls.showOpenDialog).toBe(0);
  });

  it('shows template loading failures without breaking recent projects', async () => {
    const api = installDesktopApi({ projects: [projectSummary()] });
    api.projects.listTemplates = async () => ({
      success: false,
      error: '模板不可用。',
    });

    render(<DashboardScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('模板不可用。');
    expect(screen.getByRole('button', { name: '新建业务模型' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /打开工作台：商品采购/ }),
    ).toBeEnabled();
  });

  it('shows the package version and opens settings from the real AI status', async () => {
    const api = installDesktopApi();
    api.aiConfig.getStatus = async () => ({
      isConfigured: true,
      activeProviderId: 'magpie',
      activeModelId: 'routing/flash',
      activeModelName: 'Flash Gateway',
      agentDir: '/test/pi',
      thinkingLevel: 'off',
      availableModels: [],
    });

    render(
      <AiConfigurationProvider>
        <DashboardScreen />
      </AiConfigurationProvider>,
    );

    expect(
      screen.getByText(`v${version} · Fulfillment Modeling`),
    ).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: '配置大模型：Flash Gateway' }),
    );
    expect(
      await screen.findByRole('dialog', { name: /AI Model Settings/ }),
    ).toBeInTheDocument();
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
    expect(screen.getByText('空白模型')).toBeInTheDocument();
  });

  it('preselects the blank template from its own card', async () => {
    installDesktopApi({ projects: [projectSummary()] });
    render(<DashboardScreen />);

    fireEvent.click(await screen.findByRole('button', { name: /空白模型/ }));

    const dialog = screen.getByRole('dialog', { name: '新建模型' });
    expect(
      within(dialog).getByRole('button', { name: /空白模型/ }),
    ).toHaveAttribute('aria-pressed', 'true');
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

    fireEvent.click(
      await screen.findByRole('button', { name: /公对公商品采购履约/ }),
    );

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
    expect(
      await screen.findByText('/models/new-procurement'),
    ).toBeInTheDocument();
  });

  it('starts from the header button with the recommended starter', async () => {
    const api = installDesktopApi({ projects: [] });

    render(<DashboardScreen />);

    await screen.findByText('公对公商品采购履约');
    fireEvent.click(screen.getByRole('button', { name: '新建业务模型' }));

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
        error:
          '目标目录已有模型（.evidence/fm/model.json），请直接打开它或换一个目录。',
      },
    });

    render(<DashboardScreen />);

    await screen.findByText('公对公商品采购履约');
    fireEvent.click(screen.getByRole('button', { name: '新建业务模型' }));
    fireEvent.click(await screen.findByText('选择位置并创建'));

    expect(await screen.findByText(/目标目录已有模型/)).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '新建模型' }),
    ).toBeInTheDocument();
  });

  it('offers a business text as a way to start, next to the templates', async () => {
    installDesktopApi({ projects: [] });

    render(<DashboardScreen />);

    fireEvent.click(screen.getByRole('button', { name: '开始智能提取向导' }));

    expect(
      await screen.findByRole('dialog', { name: /Smart Ingestion/ }),
    ).toBeInTheDocument();
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

    await screen.findByText('公对公商品采购履约');
    fireEvent.click(screen.getByRole('button', { name: '新建业务模型' }));
    fireEvent.click(await screen.findByText('单文件'));
    fireEvent.click(screen.getByText('选择位置并创建'));

    await waitFor(() => {
      expect(api.calls.create).toHaveLength(1);
    });
    expect(api.calls.create[0]?.kind).toBe('file');
    expect(api.calls.showCreateDialog[0]?.kind).toBe('file');
  });
});

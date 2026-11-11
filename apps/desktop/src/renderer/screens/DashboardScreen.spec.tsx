import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardScreen } from './DashboardScreen';
import { installDesktopApi, projectSummary } from '../test-support/desktopApi';

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

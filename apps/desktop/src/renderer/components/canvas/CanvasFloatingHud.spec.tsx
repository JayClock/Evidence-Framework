import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceViewMode } from '@evidence-poc/desktop-ui-kit';

import { CanvasFloatingHud } from './CanvasFloatingHud';

const setup = (
  overrides: {
    viewMode?: WorkspaceViewMode;
    density?: 'simplified' | 'standard';
    hasSelection?: boolean;
    zoom?: number;
  } = {},
) => {
  const handlers = {
    onViewModeChange: vi.fn(),
    onDensityChange: vi.fn(),
    onClearSelection: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    fitToContent: vi.fn(),
  };

  render(
    <CanvasFloatingHud
      {...handlers}
      viewMode={overrides.viewMode ?? 'graph'}
      density={overrides.density ?? 'standard'}
      hasSelection={overrides.hasSelection ?? false}
      zoom={overrides.zoom ?? 1}
    />,
  );

  return handlers;
};

describe('CanvasFloatingHud', () => {
  it('names the stage the modeler is looking at', () => {
    setup({ viewMode: 'table' });

    expect(screen.getByRole('button', { name: /总台账/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /拓扑图/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switches the stage and the card density it reports', () => {
    const handlers = setup({ density: 'standard' });

    expect(screen.getByRole('button', { name: '标准图' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /分屏/ }));
    expect(handlers.onViewModeChange).toHaveBeenCalledWith('split');

    fireEvent.click(screen.getByRole('button', { name: '简化图' }));
    expect(handlers.onDensityChange).toHaveBeenCalledWith('simplified');
  });

  it('drives the zoom the viewport handed it', () => {
    const handlers = setup({ zoom: 0.75 });

    expect(screen.getByRole('button', { name: /75%/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    fireEvent.click(screen.getByRole('button', { name: '缩小' }));
    fireEvent.click(screen.getByRole('button', { name: /重置为 100%/ }));
    fireEvent.click(screen.getByRole('button', { name: '适应内容' }));

    expect(handlers.zoomIn).toHaveBeenCalled();
    expect(handlers.zoomOut).toHaveBeenCalled();
    expect(handlers.resetZoom).toHaveBeenCalled();
    expect(handlers.fitToContent).toHaveBeenCalled();
  });

  it('turns the pointer button back into "nothing is selected"', () => {
    const handlers = setup({ hasSelection: true });

    const pointer = screen.getByRole('button', { name: '选取工具' });
    expect(pointer).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pointer);

    expect(handlers.onClearSelection).toHaveBeenCalled();
  });

  it('does not invent business objects', () => {
    setup();

    // Placement belongs to the inspector and the agent: a Contract only exists
    // once its Context, root and roles do.
    expect(screen.queryByRole('button', { name: /新增|放置/ })).toBeNull();
  });
});

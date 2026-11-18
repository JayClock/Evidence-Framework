import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GraphViewMode } from '@evidence-poc/desktop-ui-kit';

import { CanvasFloatingHud } from './CanvasFloatingHud';

const setup = (
  overrides: {
    viewMode?: GraphViewMode;
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
    onGridChange: vi.fn(),
  };

  render(
    <CanvasFloatingHud
      {...handlers}
      viewMode={overrides.viewMode ?? 'journey'}
      density={overrides.density ?? 'standard'}
      hasSelection={overrides.hasSelection ?? false}
      zoom={overrides.zoom ?? 1}
      grid="dots"
      minimapOpen={false}
      onToggleMinimap={vi.fn()}
    />,
  );

  return handlers;
};

describe('CanvasFloatingHud', () => {
  it('promotes journey and keeps the topology fallback separate from density', () => {
    const handlers = setup();
    expect(screen.getByRole('button', { name: /业务旅程/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /拓扑图/ }));
    expect(handlers.onViewModeChange).toHaveBeenCalledWith('topology');
    expect(handlers.onDensityChange).not.toHaveBeenCalled();
  });
  it('marks the active graph layout', () => {
    setup({ viewMode: 'topology' });

    expect(screen.getByRole('button', { name: /拓扑图/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /业务旅程/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switches the card density', () => {
    const handlers = setup({ density: 'standard' });

    expect(screen.getByRole('button', { name: '标准图' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: '简化图' }));
    expect(handlers.onDensityChange).toHaveBeenCalledWith('simplified');
  });

  it('cycles the paper the model sits on', () => {
    const handlers = setup();

    fireEvent.click(screen.getByRole('button', { name: /画布底纹/ }));

    expect(handlers.onGridChange).toHaveBeenCalledWith('lines');
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

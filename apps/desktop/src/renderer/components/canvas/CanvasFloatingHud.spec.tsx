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
    onGridChange: vi.fn(),
    onOpenSplit: vi.fn(),
    onCloseSplit: vi.fn(),
    onShowLedger: vi.fn(),
  };

  render(
    <CanvasFloatingHud
      {...handlers}
      viewMode={overrides.viewMode ?? 'graph'}
      density={overrides.density ?? 'standard'}
      hasSelection={overrides.hasSelection ?? false}
      zoom={overrides.zoom ?? 1}
      grid="dots"
      splitPane="ledger"
      minimapOpen={false}
      onToggleMinimap={vi.fn()}
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

    // The segmented control prints its chord beside the label.
    fireEvent.click(screen.getByRole('button', { name: /分屏⌥3/ }));
    expect(handlers.onViewModeChange).toHaveBeenCalledWith('split');

    fireEvent.click(screen.getByRole('button', { name: '简化图' }));
    expect(handlers.onDensityChange).toHaveBeenCalledWith('simplified');
  });

  it('opens a chosen comparison beside the graph', () => {
    const handlers = setup({ viewMode: 'split' });

    fireEvent.click(screen.getByRole('button', { name: /选择分屏对照/ }));
    fireEvent.click(screen.getByRole('button', { name: /交付契约/ }));

    expect(handlers.onOpenSplit).toHaveBeenCalledWith('openapi');
    expect(
      screen.getByRole('button', { name: /选择分屏对照/ }),
    ).toHaveTextContent('关键台账');
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

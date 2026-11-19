import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasFloatingHud } from './CanvasFloatingHud';

const setup = () => {
  const handlers = {
    onDensityChange: vi.fn(),
    onClearSelection: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    fitToContent: vi.fn(),
    onGridChange: vi.fn(),
    onOpenScenarios: vi.fn(),
  };

  render(
    <CanvasFloatingHud
      {...handlers}
      density="standard"
      hasSelection
      zoom={0.75}
      grid="dots"
      minimapOpen={false}
      onToggleMinimap={vi.fn()}
    />,
  );
  return handlers;
};

describe('CanvasFloatingHud', () => {
  it('keeps density and zoom in the main toolbar', () => {
    const handlers = setup();
    const density = screen.getByLabelText('密度');
    expect(density).toHaveValue('standard');
    fireEvent.change(density, { target: { value: 'simplified' } });
    expect(handlers.onDensityChange).toHaveBeenCalledWith('simplified');

    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    fireEvent.click(screen.getByRole('button', { name: '缩小' }));
    fireEvent.click(screen.getByRole('button', { name: /75%.*重置为 100%/ }));
    fireEvent.click(screen.getByRole('button', { name: '适应画布' }));
    expect(handlers.zoomIn).toHaveBeenCalled();
    expect(handlers.zoomOut).toHaveBeenCalled();
    expect(handlers.resetZoom).toHaveBeenCalled();
    expect(handlers.fitToContent).toHaveBeenCalled();
  });

  it('keeps secondary tools available without adding them to the capture', () => {
    const handlers = setup();
    const more = screen.getByRole('button', { name: '更多画布工具' });
    fireEvent.click(more);
    expect(
      screen.getByRole('dialog', { name: '更多画布工具' }),
    ).toHaveAttribute('data-evidence-capture-hide');
    fireEvent.change(screen.getByLabelText('画布底纹'), {
      target: { value: 'lines' },
    });
    expect(handlers.onGridChange).toHaveBeenCalledWith('lines');
    fireEvent.click(screen.getByRole('button', { name: '清除选择' }));
    expect(handlers.onClearSelection).toHaveBeenCalled();
    fireEvent.click(more);
    fireEvent.click(screen.getByRole('button', { name: '业务场景推演' }));
    expect(handlers.onOpenScenarios).toHaveBeenCalled();
  });
});

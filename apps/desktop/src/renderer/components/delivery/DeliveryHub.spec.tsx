import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeliveryHubController } from '../../state/useDeliveryHub';
import { liveDeliveryPreview } from '../../test-support/liveDelivery';
import { DeliveryHub } from './DeliveryHub';

const controller = (
  overrides: Partial<DeliveryHubController> = {},
): DeliveryHubController => ({
  loading: false,
  stale: false,
  error: null,
  busy: false,
  notice: null,
  analysis: liveDeliveryPreview(),
  preview: {
    modelId: 'procurement',
    modelName: '商品采购',
    modelVersion: '1.0',
    services: [
      {
        id: 'service.procurement',
        name: '采购',
        kind: 'fulfillment',
        contextRef: 'context.procurement',
        supplies: [],
        consumes: [],
        notes: '',
        routeCount: 2,
      },
    ],
    links: [],
    routes: [],
    limitations: ['尚无确认。'],
  },
  exportDelivery: vi.fn(async () => undefined),
  dismissNotice: vi.fn(),
  ...overrides,
});

describe('DeliveryHub', () => {
  it('switches between the full contract and incremental diff', () => {
    render(<DeliveryHub hub={controller()} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('tab', { name: '本次增量变更' }));
    expect(screen.getByRole('tab', { name: '本次增量变更' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('无路由变更')).toBeInTheDocument();
    expect(screen.queryByText('核心履约')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '契约全览' }));
    expect(screen.getByText('核心履约')).toBeInTheDocument();
  });
  it('lists the contract with an explicit session baseline and draft status', () => {
    render(<DeliveryHub hub={controller()} onClose={() => undefined} />);
    expect(screen.getByText('核心履约')).toBeInTheDocument();
    expect(screen.getByText('尚无确认。')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('保存不会重置差异');
  });
  it('exports only the current accepted draft', () => {
    const hub = controller();
    render(<DeliveryHub hub={hub} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '导出当前草稿' }));
    expect(hub.exportDelivery).toHaveBeenCalledOnce();
  });
  it('disables export when stale or failed and never labels disk data as live', () => {
    render(
      <DeliveryHub
        hub={controller({ stale: true, error: '预览失败', analysis: null })}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('预览失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出当前草稿' })).toBeDisabled();
  });
});

describe('DeliveryHub in the console', () => {
  it('docks as a region instead of a blocking dialog', () => {
    render(
      <DeliveryHub hub={controller()} onClose={() => undefined} embedded />,
    );

    expect(screen.getByRole('region', { name: '交付中心' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

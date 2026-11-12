import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DeliveryPreview } from '../../../shared/projects';
import { installDesktopApi } from '../../test-support/desktopApi';
import { DeliveryHub } from './DeliveryHub';

const preview = (): DeliveryPreview => ({
  modelId: 'procurement',
  modelName: '商品采购',
  modelVersion: '1.1.0',
  services: [
    {
      id: 'service.procurement',
      name: '采购',
      kind: 'fulfillment',
      contextRef: 'context.procurement',
      supplies: [],
      consumes: [],
      notes: '合同上下文：拥有独立的履约账本。',
      routeCount: 2,
    },
    {
      id: 'service.wechat-payment',
      name: '微信支付',
      kind: 'capability',
      contextRef: 'context.wechat-payment',
      supplies: ['role.payment-proof'],
      consumes: [],
      notes: '能力支撑上下文。',
      routeCount: 1,
    },
  ],
  links: [
    {
      id: 'link.capability',
      from: 'service.wechat-payment',
      to: 'service.procurement',
      kind: 'capability',
      mode: 'async',
      label: '扮演支付凭证',
      viaRef: 'role.payment-proof',
    },
  ],
  routes: [],
  limitations: ['request.delivery 没有履约确认，未生成确认回调接口。'],
});

describe('DeliveryHub', () => {
  it('lists the services, the crossings and what is still open', async () => {
    installDesktopApi({
      deliveryPreviewResult: { success: true, preview: preview() },
    });

    render(<DeliveryHub rootPath="/models/procurement" onClose={() => undefined} />);

    expect(await screen.findByText('核心履约')).toBeInTheDocument();
    expect(screen.getByText('能力支撑')).toBeInTheDocument();
    expect(screen.getByText('异步回调')).toBeInTheDocument();
    expect(
      screen.getByText('request.delivery 没有履约确认，未生成确认回调接口。'),
    ).toBeInTheDocument();
  });

  it('writes the delivery where the main process says it did', async () => {
    const api = installDesktopApi({
      deliveryPreviewResult: { success: true, preview: preview() },
      exportDeliveryResult: {
        status: 'saved',
        directory: '/exports/procurement',
        files: ['openapi.json', 'topology.json'],
        serviceCount: 2,
        routeCount: 3,
      },
    });

    render(<DeliveryHub rootPath="/models/procurement" onClose={() => undefined} />);

    await screen.findByText('核心履约');
    fireEvent.click(screen.getByRole('button', { name: '导出到文件夹' }));

    await waitFor(() => {
      expect(api.calls.exportDelivery).toEqual(['/models/procurement']);
    });
    expect(
      await screen.findByText(/已写入 \/exports\/procurement/),
    ).toBeInTheDocument();
  });

  it('shows why a model cannot be projected instead of an empty panel', async () => {
    installDesktopApi({
      deliveryPreviewResult: { success: false, error: 'FM 未通过，不生成视图' },
    });

    render(<DeliveryHub rootPath="/models/procurement" onClose={() => undefined} />);

    expect(await screen.findByText('FM 未通过，不生成视图')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出到文件夹' })).toBeDisabled();
  });
});

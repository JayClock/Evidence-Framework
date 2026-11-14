import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { liveDeliveryPreview } from '../../test-support/liveDelivery';
import { OpenApiSpecViewer } from './OpenApiSpecViewer';

const analysis = () => {
  const preview = liveDeliveryPreview();

  return {
    ...preview,
    preview: {
      ...preview.preview,
      routes: [
        {
          method: 'POST',
          path: '/v1/procurement/orders',
          summary: '发起采购',
          serviceId: 'svc.procurement',
        },
      ],
    },
    bindings: [
      {
        id: 'route.1',
        entityRef: 'contract.product-procurement',
        method: 'POST',
        path: '/v1/procurement/orders',
        roleRefs: [],
        exposure: 'external' as const,
        fields: [],
      },
    ],
    openapi: {
      openapi: '3.1.0' as const,
      info: { title: '采购', version: '1.0', description: '' },
      'x-evidence-model': 'procurement',
      paths: { '/v1/procurement/orders': { post: { summary: '发起采购' } } },
      components: {
        schemas: {
          contract_product_procurement: { type: 'object' },
        },
      },
      'x-evidence-services': [],
    },
  };
};

const content = () =>
  document.querySelector('.cm-content')?.textContent ?? '';

describe('OpenApiSpecViewer', () => {
  it('reads the projected contract as YAML and names its route count', () => {
    render(
      <OpenApiSpecViewer
        analysis={analysis()}
        stale={false}
        loading={false}
        error={null}
      />,
    );

    expect(screen.getByText(/1 条路由 · 1 个 Schema/)).toBeInTheDocument();
    expect(content()).toContain('openapi: 3.1.0');
    expect(content()).toContain('contract_product_procurement');
  });

  it('switches the same contract to JSON without changing the analysis', () => {
    render(
      <OpenApiSpecViewer
        analysis={analysis()}
        stale={false}
        loading={false}
        error={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));

    expect(content()).toContain('"openapi": "3.1.0"');
    expect(screen.getByText('openapi.json')).toBeInTheDocument();
  });

  it('marks a contract that describes an older revision', () => {
    render(
      <OpenApiSpecViewer
        analysis={analysis()}
        stale
        loading={false}
        error={null}
      />,
    );

    expect(document.querySelector('[data-stale-contract]')).not.toBeNull();
  });

  it('explains itself when there is no contract yet', () => {
    const { rerender } = render(
      <OpenApiSpecViewer
        analysis={null}
        stale={false}
        loading
        error={null}
      />,
    );
    expect(screen.getByText('正在投影交付契约…')).toBeInTheDocument();

    rerender(
      <OpenApiSpecViewer
        analysis={null}
        stale={false}
        loading={false}
        error={null}
      />,
    );
    expect(
      screen.getByText('当前模型还没有可交付的路由。'),
    ).toBeInTheDocument();

    rerender(
      <OpenApiSpecViewer
        analysis={null}
        stale={false}
        loading={false}
        error="模型缺少契约"
      />,
    );
    expect(screen.getByText(/无法投影契约：模型缺少契约/)).toBeInTheDocument();
  });
});

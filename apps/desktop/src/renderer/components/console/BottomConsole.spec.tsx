import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BottomConsole, type BottomConsoleProps } from './BottomConsole';
import { healthyReport } from '../../test-support/desktopApi';
import { liveDeliveryPreview } from '../../test-support/liveDelivery';

const delivery = (): BottomConsoleProps['delivery'] => ({
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
    services: [],
    links: [],
    routes: [],
    limitations: [],
  },
  exportDelivery: vi.fn(async () => undefined),
  dismissNotice: vi.fn(),
});

const props = (
  overrides: Partial<BottomConsoleProps> = {},
): BottomConsoleProps => ({
  rootPath: '/models/procurement',
  activeTab: 'diagnostics',
  onTabChange: vi.fn(),
  onClose: vi.fn(),
  report: healthyReport({ blockCount: 1, warnCount: 2 }),
  reportStale: false,
  reportLoading: false,
  reportError: null,
  activeIssueIds: [],
  onFocusIssue: vi.fn(),
  onRerunDiagnostics: vi.fn(),
  delivery: delivery(),
  reviewInput: null,
  canLocate: () => true,
  onPromptIssue: vi.fn(),
  onFocusEntity: vi.fn(),
  ...overrides,
});

describe('BottomConsole', () => {
  it('shows the sensor verdict in the diagnostics tab', () => {
    render(<BottomConsole {...props()} />);

    expect(screen.getByRole('tab', { name: /门禁与诊断/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('检查结果')).toBeInTheDocument();
  });

  it('switches tabs without closing the console', () => {
    const onTabChange = vi.fn();
    render(<BottomConsole {...props({ onTabChange })} />);

    fireEvent.click(screen.getByRole('tab', { name: /交付契约/ }));

    expect(onTabChange).toHaveBeenCalledWith('delivery');
  });

  it('renders the docked delivery hub on its own tab', () => {
    render(<BottomConsole {...props({ activeTab: 'delivery' })} />);

    expect(
      screen.getByRole('region', { name: '交付中心' }),
    ).toBeInTheDocument();
  });

  it('asks for the review input before offering the review tab', () => {
    render(<BottomConsole {...props({ activeTab: 'review' })} />);

    expect(screen.queryByLabelText('审查中心')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('explains an idle or failed sensor run instead of an empty list', () => {
    const { rerender } = render(
      <BottomConsole {...props({ report: null, reportLoading: true })} />,
    );

    expect(screen.getByText('正在运行检查器…')).toBeInTheDocument();

    rerender(
      <BottomConsole {...props({ report: null, reportError: '检查器崩溃' })} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('检查器崩溃');
  });

  it('closes through the header button', () => {
    const onClose = vi.fn();
    render(<BottomConsole {...props({ onClose })} />);

    fireEvent.click(screen.getByTitle('收起控制台（Cmd/Ctrl+J）'));

    expect(onClose).toHaveBeenCalledOnce();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { liveDeliveryPreview } from '../../test-support/liveDelivery';
import { IncrementalDiffPanel } from './IncrementalDiffPanel';

const analysis = () => {
  const value = liveDeliveryPreview();
  const breaking = {
    kind: 'INPUT_FIELD_REMOVED' as const,
    path: '/contract',
    method: 'POST' as const,
    description: '不再接受金额输入',
    remediationHint: '迁移客户端',
  };
  value.diff.summary = {
    routesAdded: 0,
    routesRemoved: 0,
    routesModified: 1,
    breakingChangeCount: 1,
    hasBreakingChanges: true,
  };
  value.diff.routes = [
    {
      id: 'route.contract',
      entityRef: 'evidence.contract',
      serviceId: 'service.test',
      operationId: 'sign',
      path: '/contract',
      method: 'POST',
      changeType: 'modified',
      breaking: true,
      breakingChanges: [breaking],
      fieldDiffs: [
        {
          name: 'total',
          label: '总额',
          changeType: 'modified',
          shifted: 'to_derived',
          after: {
            name: 'total',
            label: '总额',
            valueType: 'decimal',
            required: true,
            reason: 'derived',
            meaning: '总额',
            ruleRef: 'rule.total',
            ruleExpression: '10 * 2',
          },
        },
      ],
    },
  ];
  return value;
};
afterEach(() => vi.unstubAllGlobals());

it('shows breaking changes, field transitions, rules and model navigation', () => {
  const onFocusEntity = vi.fn();
  render(
    <IncrementalDiffPanel
      analysis={analysis()}
      stale={false}
      onFocusEntity={onFocusEntity}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('未授权发布');
  expect(screen.getByText(/Input → CEL Derived/)).toBeInTheDocument();
  expect(screen.getByText('rule.total: 10 * 2')).toBeInTheDocument();
  expect(screen.getByText(/迁移客户端/)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: '定位模型：evidence.contract' }),
  );
  expect(onFocusEntity).toHaveBeenCalledWith('evidence.contract');
});

it('copies the exact change log and disables stale actions', async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const value = analysis();
  const { rerender } = render(
    <IncrementalDiffPanel analysis={value} stale={false} />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: '复制 Markdown 变更日志' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('已复制变更日志'),
  );
  expect(writeText).toHaveBeenCalledWith(value.changeLog);
  rerender(<IncrementalDiffPanel analysis={value} stale={true} />);
  expect(
    screen.getByRole('button', { name: '复制 Markdown 变更日志' }),
  ).toBeDisabled();
});

it('reports clipboard failure instead of claiming success', async () => {
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: async () => {
        throw new Error('denied');
      },
    },
  });
  render(<IncrementalDiffPanel analysis={analysis()} stale={false} />);
  fireEvent.click(
    screen.getByRole('button', { name: '复制 Markdown 变更日志' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('复制失败：denied'),
  );
});

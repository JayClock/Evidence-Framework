import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { liveDeliveryPreview } from '../../test-support/liveDelivery';
import { IncrementalDiffPanel } from './IncrementalDiffPanel';

const analysis = () => {
  const value = liveDeliveryPreview();
  value.diff.hasBreakingChanges = true;
  value.diff.changes = [
    {
      id: 'request-property-removed',
      text: '不再接受金额输入',
      level: 3,
      operation: 'POST',
      path: '/contract',
    },
  ];
  value.bindings = [
    {
      id: 'route.contract',
      entityRef: 'evidence.contract',
      method: 'POST',
      path: '/contract',
      roleRefs: [],
      exposure: 'external',
      fields: [],
    },
  ];
  return value;
};
afterEach(() => vi.unstubAllGlobals());

it('shows native contract findings and model navigation', () => {
  const onFocusEntity = vi.fn();
  render(
    <IncrementalDiffPanel
      analysis={analysis()}
      stale={false}
      onFocusEntity={onFocusEntity}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('未授权发布');
  expect(screen.getByText(/不再接受金额输入/)).toBeInTheDocument();
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

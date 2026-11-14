import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InlinePatchCard } from './InlinePatchCard';
import type { PatchReview } from '../../state/usePatchReview';

const review = (overrides: Partial<PatchReview> = {}): PatchReview => ({
  rationale: '补齐退款履约现场',
  commands: ['create-fulfillment-pair'],
  addedIds: ['request.refund'],
  removedIds: [],
  modifiedIds: ['request.payment'],
  overlay: { marks: new Map() },
  revertable: true,
  ...overrides,
});

describe('InlinePatchCard', () => {
  it('states the rationale and how many objects moved', () => {
    render(
      <InlinePatchCard
        review={review()}
        onAccept={() => undefined}
        onRevert={() => undefined}
      />,
    );

    expect(screen.getByLabelText('AI 补丁复核')).toBeInTheDocument();
    expect(screen.getByText('补齐退款履约现场')).toBeInTheDocument();
    expect(screen.getByText('新增 1')).toBeInTheDocument();
    expect(screen.getByText('修改 1')).toBeInTheDocument();
    expect(
      screen.getByText('⌘/Ctrl + Enter 保留 · Esc 撤销这次补丁'),
    ).toBeInTheDocument();
  });

  it('pans the canvas to an object the patch touched', () => {
    const onFocusEntity = vi.fn();

    render(
      <InlinePatchCard
        review={review()}
        onAccept={() => undefined}
        onRevert={() => undefined}
        onFocusEntity={onFocusEntity}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: '定位补丁对象 request.payment' }),
    );

    expect(onFocusEntity).toHaveBeenCalledWith('request.payment');
  });

  it('does not offer to locate an object it just removed', () => {
    render(
      <InlinePatchCard
        review={review({ removedIds: ['party.auditor'], addedIds: [] })}
        onAccept={() => undefined}
        onRevert={() => undefined}
        onFocusEntity={() => undefined}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '定位补丁对象 party.auditor' }),
    ).toBeNull();
    expect(screen.getByText(/party\.auditor/)).toBeInTheDocument();
  });

  it('offers both decisions while the patch is still the newest edit', () => {
    const onAccept = vi.fn();
    const onRevert = vi.fn();

    render(
      <InlinePatchCard
        review={review()}
        onAccept={onAccept}
        onRevert={onRevert}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '撤销补丁' }));
    fireEvent.click(screen.getByRole('button', { name: '保留' }));

    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('hides revert once later edits buried the patch', () => {
    render(
      <InlinePatchCard
        review={review({ revertable: false })}
        onAccept={() => undefined}
        onRevert={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: '撤销补丁' })).toBeNull();
    expect(
      screen.getByText(
        '模型之后又有改动，撤销已不可用；可在顶部按 ⌘Z 逐步回退',
      ),
    ).toBeInTheDocument();
  });

  it('does not pretend a structural no-op changed something', () => {
    render(
      <InlinePatchCard
        review={review({ addedIds: [], modifiedIds: [], removedIds: [] })}
        onAccept={() => undefined}
        onRevert={() => undefined}
      />,
    );

    expect(screen.getByText('结构未变')).toBeInTheDocument();
    expect(screen.queryByLabelText('补丁涉及的对象')).toBeNull();
  });
});

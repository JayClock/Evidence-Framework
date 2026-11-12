import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PatchReviewBar } from './PatchReviewBar';
import type { PatchReview } from '../../state/usePatchReview';

const review = (overrides: Partial<PatchReview> = {}): PatchReview => ({
  rationale: '补齐退款履约现场',
  commands: ['create-fulfillment-pair'],
  addedIds: ['request.refund', 'confirmation.refund'],
  removedIds: [],
  modifiedIds: ['request.payment'],
  overlay: { marks: new Map() },
  revertable: true,
  ...overrides,
});

describe('PatchReviewBar', () => {
  it('says what the agent changed and how many objects moved', () => {
    render(
      <PatchReviewBar
        review={review()}
        onAccept={() => undefined}
        onRevert={() => undefined}
      />,
    );

    expect(screen.getByLabelText('AI 补丁复核')).toBeInTheDocument();
    expect(screen.getByText('补齐退款履约现场')).toBeInTheDocument();
    expect(screen.getByText('新增 2 · 修改 1')).toBeInTheDocument();
    expect(
      screen.getByText('⌘/Ctrl + Enter 保留 · Esc 撤销这次补丁'),
    ).toBeInTheDocument();
  });

  it('offers both decisions while the patch is still the newest edit', () => {
    const onAccept = vi.fn();
    const onRevert = vi.fn();

    render(
      <PatchReviewBar
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

  it('hides the revert control once the patch is buried under later edits', () => {
    render(
      <PatchReviewBar
        review={review({ revertable: false })}
        onAccept={() => undefined}
        onRevert={() => undefined}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '撤销补丁' }),
    ).toBeNull();
    expect(
      screen.getByText('模型之后又有改动，撤销已不可用；可在顶部按 ⌘Z 逐步回退'),
    ).toBeInTheDocument();
  });

  it('does not pretend a structural no-op changed something', () => {
    render(
      <PatchReviewBar
        review={review({ addedIds: [], modifiedIds: [], removedIds: [] })}
        onAccept={() => undefined}
        onRevert={() => undefined}
      />,
    );

    expect(screen.getByText('结构未变')).toBeInTheDocument();
  });
});

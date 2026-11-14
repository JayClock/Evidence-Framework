import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './Sheet';

const Harness = ({ side }: { side?: 'right' | 'bottom' }) => (
  <Sheet>
    <SheetTrigger>展开台账</SheetTrigger>
    <SheetContent side={side}>
      <SheetHeader>
        <SheetTitle>采购合同 · 关键数据台账</SheetTitle>
      </SheetHeader>
      <SheetBody>字段表</SheetBody>
    </SheetContent>
  </Sheet>
);

describe('Sheet', () => {
  it('slides in from the right with a readable width', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: '展开台账' }));

    const panel = await screen.findByRole('dialog', {
      name: '采购合同 · 关键数据台账',
    });

    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(panel).toHaveAttribute('data-side', 'right');
    expect(panel).toHaveClass('max-w-2xl');
    expect(panel).toHaveClass('border-l');
  });

  it('keeps the canvas mounted underneath instead of routing away', async () => {
    render(
      <div>
        <p>画布仍然存在</p>
        <Harness side="bottom" />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: '展开台账' }));

    expect(await screen.findByText('字段表')).toBeInTheDocument();
    expect(screen.getByText('画布仍然存在')).toBeInTheDocument();
  });

  it('dismisses with Escape', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: '展开台账' }));
    await screen.findByRole('dialog');

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

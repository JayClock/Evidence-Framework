import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './Dialog';

const Harness = () => (
  <Dialog>
    <DialogTrigger>打开</DialogTrigger>
    <DialogContent>
      <DialogTitle>导出离线审查页</DialogTitle>
      <p>正在写入单文件 HTML。</p>
    </DialogContent>
  </Dialog>
);

describe('Dialog', () => {
  it('stays out of the document until the trigger runs', () => {
    render(<Harness />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('portals the content and names it by its title', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: '打开' }));

    const dialog = await screen.findByRole('dialog', {
      name: '导出离线审查页',
    });

    expect(dialog).toHaveAttribute('data-slot', 'dialog-content');
    expect(dialog.parentElement).toBe(document.body);
  });

  it('closes on Escape, which is the key Radix owns', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    await screen.findByRole('dialog');

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('renders the close affordance unless the caller draws its own header', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: '打开' }));

    expect(
      await screen.findByRole('button', { name: '关闭' }),
    ).toBeInTheDocument();
  });
});

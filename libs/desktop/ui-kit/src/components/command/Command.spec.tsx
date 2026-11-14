import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from './Command';

const Harness = ({
  onSelect = vi.fn(),
  onOpenChange = vi.fn(),
}: {
  onSelect?: () => void;
  onOpenChange?: (open: boolean) => void;
}) => (
  <CommandDialog open onOpenChange={onOpenChange} label="快速命令">
    <CommandInput placeholder="搜索命令或实体" />
    <CommandList>
      <CommandEmpty>未匹配到相关命令</CommandEmpty>
      <CommandGroup heading="核心操作">
        <CommandItem onSelect={onSelect}>
          <span>保存模型源文件</span>
          <CommandShortcut chord="⌘+S" />
        </CommandItem>
        <CommandItem onSelect={onSelect}>撤销上一步</CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
);

describe('CommandDialog', () => {
  it('opens as a named modal with grouped rows and their chords', () => {
    render(<Harness />);

    expect(
      screen.getByRole('dialog', { name: '快速命令' }),
    ).toBeInTheDocument();
    expect(screen.getByText('核心操作')).toBeInTheDocument();
    expect(screen.getByText('保存模型源文件')).toBeInTheDocument();
    expect(screen.getByText('⌘')).toBeInTheDocument();
  });

  it('narrows the list to what the query matches', () => {
    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText('搜索命令或实体'), {
      target: { value: '撤销' },
    });

    expect(screen.queryByText('保存模型源文件')).toBeNull();
    expect(screen.getByText('撤销上一步')).toBeInTheDocument();
  });

  it('explains an empty result instead of showing a blank box', () => {
    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText('搜索命令或实体'), {
      target: { value: '不存在的动作' },
    });

    expect(screen.getByText('未匹配到相关命令')).toBeInTheDocument();
  });

  it('runs the highlighted row on Enter and leaves dismissal to the caller', () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();

    render(<Harness onSelect={onSelect} onOpenChange={onOpenChange} />);

    const input = screen.getByPlaceholderText('搜索命令或实体');
    fireEvent.change(input, { target: { value: '保存' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledTimes(1);
    // A row may open a sheet or ask a follow-up question, so the primitive does
    // not assume the palette is done; the caller decides.
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

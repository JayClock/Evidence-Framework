import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Save, ShieldCheck } from 'lucide-react';

import { CommandPalette } from './CommandPalette';
import type { CommandItem } from '../../state/commandRegistry';

const commands: readonly CommandItem[] = [
  {
    id: 'model.save',
    title: '保存模型',
    subtitle: '写回 .evidence/fm 源树',
    category: 'model',
    shortcut: '⌘+S',
    icon: Save,
    keywords: ['save'],
    perform: () => undefined,
  },
  {
    id: 'model.redo',
    title: '重做',
    category: 'model',
    icon: ShieldCheck,
    disabled: true,
    perform: () => undefined,
  },
  {
    id: 'model.storming',
    title: '铺设业务凭证',
    category: 'model',
    perform: () => undefined,
  },
];

const Harness = ({
  onOpenChange = vi.fn(),
  onFocusTarget = vi.fn(),
}: {
  onOpenChange?: (open: boolean) => void;
  onFocusTarget?: (nodeId: string) => void;
}) => (
  <CommandPalette
    open
    onOpenChange={onOpenChange}
    commands={commands}
    targets={[
      {
        id: 'evidence.contract',
        label: '采购合同',
        category: '凭证',
        path: ['采购上下文'],
      },
    ]}
    onFocusTarget={onFocusTarget}
  />
);

describe('CommandPalette', () => {
  it('opens as a menu of grouped actions', () => {
    render(<Harness />);

    expect(
      screen.getByRole('dialog', { name: '快速命令' }),
    ).toBeInTheDocument();
    expect(screen.getByText('核心操作')).toBeInTheDocument();
    expect(screen.getByText('保存模型')).toBeInTheDocument();
    expect(screen.getByText('写回 .evidence/fm 源树')).toBeInTheDocument();
    expect(screen.getByText('⌘')).toBeInTheDocument();
  });

  it('keeps business objects out of an empty query', () => {
    render(<Harness />);

    expect(screen.queryByText('业务对象')).toBeNull();
    expect(screen.queryByText('采购合同')).toBeNull();
  });

  it('searches objects and actions with the same query', () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('搜索命令或业务对象'), {
      target: { value: '采购' },
    });

    expect(screen.getByText('业务对象')).toBeInTheDocument();
    expect(screen.getByText('采购合同')).toBeInTheDocument();
    expect(screen.queryByText('保存模型')).toBeNull();
  });

  it('runs a command and dismisses the palette first', async () => {
    const onOpenChange = vi.fn();

    render(<Harness onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('option', { name: /铺设业务凭证/ }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('cannot run a disabled row', () => {
    const onOpenChange = vi.fn();

    render(<Harness onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('option', { name: /重做/ }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('jumps to the object the row names', async () => {
    const onFocusTarget = vi.fn();

    render(<Harness onFocusTarget={onFocusTarget} />);

    fireEvent.change(screen.getByLabelText('搜索命令或业务对象'), {
      target: { value: '采购合同' },
    });
    fireEvent.click(screen.getByRole('option', { name: /采购合同/ }));

    await waitFor(() =>
      expect(onFocusTarget).toHaveBeenCalledWith('evidence.contract'),
    );
  });

  it('shows the trail that disambiguates same-named objects', () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('搜索命令或业务对象'), {
      target: { value: '采购' },
    });

    expect(screen.getByText('采购上下文 · 凭证')).toBeInTheDocument();
  });
});

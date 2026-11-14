import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('renders the outline control at desktop density by default', () => {
    render(<Button>保存</Button>);

    const button = screen.getByRole('button', { name: '保存' });

    expect(button).toHaveAttribute('data-slot', 'button');
    expect(button).toHaveClass('h-7');
    expect(button).toHaveClass('border-evidence-line');
  });

  it('lets the caller pick a variant and a size', () => {
    render(
      <Button variant="default" size="md">
        保存
      </Button>,
    );

    const button = screen.getByRole('button', { name: '保存' });

    expect(button).toHaveClass('bg-evidence-accent');
    expect(button).toHaveClass('h-8');
  });

  it('keeps a caller utility over the component default', () => {
    render(<Button className="h-6">紧凑</Button>);

    expect(screen.getByRole('button', { name: '紧凑' })).toHaveClass('h-6');
  });

  it('disables itself and reports busy while loading', () => {
    render(<Button loading>导出中</Button>);

    const button = screen.getByRole('button', { name: /导出中/ });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('[data-slot="button-spinner"]')).not.toBeNull();
  });

  it('reports the click once, not twice', () => {
    const onClick = vi.fn();

    render(<Button onClick={onClick}>执行</Button>);
    fireEvent.click(screen.getByRole('button', { name: '执行' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

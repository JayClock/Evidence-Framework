import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '../button/Button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './Tooltip';

const Harness = () => (
  <TooltipProvider delayDuration={0}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button>保存</Button>
      </TooltipTrigger>
      <TooltipContent shortcut="⌘+S">保存到磁盘</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

describe('Tooltip', () => {
  it('explains the control and prints the chord beside it', async () => {
    render(<Harness />);

    fireEvent.focus(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('保存到磁盘');
    // The chord is rendered one cap per key, exactly as the palette rows do.
    expect(screen.getByRole('tooltip')).toHaveTextContent('⌘');
    expect(screen.getByRole('tooltip')).toHaveTextContent('S');
  });

  it('stays closed until the pointer or the focus arrives', () => {
    render(<Harness />);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

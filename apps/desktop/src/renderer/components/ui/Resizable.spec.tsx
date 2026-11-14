import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from './Resizable';

describe('Resizable workspace primitives', () => {
  it('renders every region and the gutter between them', () => {
    const { container } = render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel id="left" order={1} defaultSize={20}>
          <p>左栏内容</p>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="stage" order={2}>
          <p>画布内容</p>
        </ResizablePanel>
      </ResizablePanelGroup>,
    );

    expect(screen.getByText('左栏内容')).toBeInTheDocument();
    expect(screen.getByText('画布内容')).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-panel-resize-handle-id]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-panel-group-direction="horizontal"]'),
    ).not.toBeNull();
  });
});

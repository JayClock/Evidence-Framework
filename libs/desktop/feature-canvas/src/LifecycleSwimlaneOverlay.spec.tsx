import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { computeSwimlaneLayout } from '@evidence-poc/evidence-canvas-interaction';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { LifecycleSwimlaneOverlay } from './LifecycleSwimlaneOverlay';

describe('LifecycleSwimlaneOverlay', () => {
  it('draws four headings and three separators from the world-space layout', () => {
    const layout = computeSwimlaneLayout(
      createDomainGraph(createDesktopFixture()),
    );
    render(
      <LifecycleSwimlaneOverlay
        width={layout.bounds.width}
        height={layout.bounds.height}
        milestones={layout.journeyMilestones!}
        regions={layout.swimlaneRegions!}
      />,
    );
    const board = screen.getByRole('group', {
      name: '业务全生命周期四阶段泳道',
    });
    expect(within(board).getByText('业务生命周期 →')).toBeInTheDocument();
    expect(
      [...board.querySelectorAll('[data-milestone-stage]')].map((el) =>
        el.getAttribute('data-milestone-stage'),
      ),
    ).toEqual(['rfp', 'proposal', 'contract', 'fulfillment']);
    const lines = board.querySelectorAll('line');
    expect(lines).toHaveLength(3);
    for (const [i, line] of [...lines].entries()) {
      const column = layout.journeyMilestones![i + 1]!;
      expect(Number(line.getAttribute('x1'))).toBeLessThan(column.x);
      expect(Number(line.getAttribute('x1'))).toBeGreaterThan(
        Number(line.getAttribute('x2')),
      );
    }
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createDomainGraph } from '@evidence-poc/evidence-model-core/browser';
import { createLifecycleSwimlaneLayout } from '@evidence-poc/evidence-canvas-interaction';

import { LifecycleBanner, laneTint } from './LifecycleBanner';
import { createDesktopFixture } from '../../test-support/modelFixture';

const layoutOf = () =>
  createLifecycleSwimlaneLayout(createDomainGraph(createDesktopFixture()));

describe('LifecycleBanner', () => {
  it('heads every stage with its name, English name and caption', () => {
    render(<LifecycleBanner layout={layoutOf()} />);

    expect(screen.getByText('邀请投标')).toBeInTheDocument();
    expect(screen.getByText('Request for Proposal')).toBeInTheDocument();
    expect(screen.getByText('合同签约')).toBeInTheDocument();
    expect(screen.getByText('履约履行')).toBeInTheDocument();
    expect(screen.getByText('时段：询价、比价、方案征询')).toBeInTheDocument();
  });

  it('numbers the stages in reading order', () => {
    const { container } = render(<LifecycleBanner layout={layoutOf()} />);
    const stages = [...container.querySelectorAll('[data-swimlane-stage]')].map(
      (element) => element.getAttribute('data-swimlane-stage'),
    );

    expect(stages).toEqual(['rfp', 'proposal', 'contract', 'fulfillment']);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('04')).toBeInTheDocument();
  });

  it('labels the shared band so it is not read as a stage', () => {
    render(<LifecycleBanner layout={layoutOf()} />);

    expect(
      screen.getByText('参与方与标的物（不做生命周期归位）'),
    ).toBeInTheDocument();
  });

  it('gives each stage its own tint and falls back for unknown stages', () => {
    expect(laneTint('contract').accent).not.toBe(laneTint('rfp').accent);
    expect(laneTint('unknown')).toEqual(laneTint('unknown'));
  });
});

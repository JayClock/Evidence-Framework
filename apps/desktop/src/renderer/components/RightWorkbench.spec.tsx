import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createModelSession } from '@evidence-poc/evidence-model-core/browser';

import { RightWorkbench } from './RightWorkbench';
import type { AgentSessionController } from '../state/useAgentSession';
import { createDesktopFixture } from '../test-support/modelFixture';

const agent = (): AgentSessionController => ({
  state: {
    running: false,
    transcript: '',
    activities: [],
    error: null,
    activeToolName: null,
  },
  submit: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  dismissError: vi.fn(),
});

const setup = () => {
  const session = createModelSession({ document: createDesktopFixture() });

  return render(
    <RightWorkbench
      graph={session.getGraph()}
      session={session}
      selection={{ nodeId: null, attributeName: null }}
      agent={agent()}
    />,
  );
};

describe('RightWorkbench', () => {
  it('opens on inspection and keeps the agent stream one tab away', () => {
    setup();

    expect(screen.getByRole('tab', { name: '属性' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByText('选择画布上的业务对象查看属性。'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '协同' }));

    expect(screen.getByText('AI 访谈与操控')).toBeInTheDocument();
    expect(screen.queryByText('选择画布上的业务对象查看属性。')).toBeNull();
  });
});

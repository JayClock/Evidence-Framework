import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createModelSession } from '@evidence-poc/evidence-model-core';

import { RightWorkbench, type RightWorkbenchProps } from './RightWorkbench';
import type { AgentSessionController } from '../state/useAgentSession';
import type { PatchReviewController } from '../state/usePatchReview';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

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

const patchReview = (): PatchReviewController => ({
  review: {
    rationale: '新增审计员参与方',
    commands: ['create-entity'],
    addedIds: ['party.auditor'],
    removedIds: [],
    modifiedIds: [],
    overlay: { marks: new Map() },
    revertable: true,
  },
  accept: vi.fn(),
  revert: vi.fn(),
  record: vi.fn(),
});

const setup = (props: Partial<RightWorkbenchProps> = {}) => {
  const session = createModelSession({ document: createDesktopFixture() });
  const build = (overrides: Partial<RightWorkbenchProps> = {}) => (
    <RightWorkbench
      graph={session.getGraph()}
      session={session}
      selection={{ nodeId: null, attributeName: null }}
      agent={agent()}
      {...props}
      {...overrides}
    />
  );
  const view = render(build());

  return {
    rerenderWith: (overrides: Partial<RightWorkbenchProps>) => {
      view.rerender(build(overrides));
    },
  };
};

describe('RightWorkbench', () => {
  it('opens on inspection and keeps the copilot one tab away', () => {
    setup();

    expect(screen.getByRole('tab', { name: '属性' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByText('选择画布上的业务对象查看属性。'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /协同/ }));

    expect(screen.getByLabelText('AI 建模副驾')).toBeInTheDocument();
    expect(screen.queryByText('选择画布上的业务对象查看属性。')).toBeNull();
  });

  it('flags a pending patch without stealing the inspector', () => {
    setup({ patchReview: patchReview() });

    expect(screen.getByLabelText('有待审查的 AI 补丁')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '属性' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens the copilot when the keyboard asks for the composer', () => {
    const workbench = setup();

    workbench.rerenderWith({ focusToken: 1 });

    expect(screen.getByLabelText('AI 建模副驾')).toBeInTheDocument();
  });

  it('opens the copilot when a finding fills the composer', () => {
    const workbench = setup();

    workbench.rerenderWith({
      prefill: { token: 1, text: '请分析这条审查发现' },
    });

    expect(screen.getByLabelText('访谈内容')).toHaveValue('请分析这条审查发现');
  });
});

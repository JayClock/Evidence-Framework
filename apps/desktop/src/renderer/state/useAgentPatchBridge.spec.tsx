import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createModelSession } from '@evidence-poc/evidence-model-core/browser';
import type { EntityAST } from '@evidence-poc/evidence-schema';

import { useAgentPatchBridge, type AppliedPatch } from './useAgentPatchBridge';
import { installDesktopApi } from '../test-support/desktopApi';
import { createDesktopFixture } from '../test-support/modelFixture';

const BridgeHarness = ({
  session,
  onApplied,
}: {
  session: ReturnType<typeof createModelSession>;
  onApplied?: (patch: AppliedPatch) => void;
}) => {
  useAgentPatchBridge(session, onApplied);

  return <p>bridge</p>;
};

const extraParticipant = (): EntityAST => ({
  type: 'entity',
  id: 'party.auditor',
  category: 'participant',
  kind: 'party',
  label: '审计员',
});

describe('useAgentPatchBridge', () => {
  it('applies an agent patch through the session so undo still works', () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });
    const before = session.getDocument();

    render(<BridgeHarness session={session} />);
    api.agentMock.requestPatch({
      requestId: 'patch-1',
      patch: {
        rationale: '新增审计员',
        commands: [{ type: 'create-entity', entity: extraParticipant() }],
      },
    });

    expect(
      session
        .getDocument()
        .entities.some((entity) => entity.id === 'party.auditor'),
    ).toBe(true);
    expect(api.agentMock.patchResponses).toEqual([
      {
        requestId: 'patch-1',
        result: {
          success: true,
          appliedCommands: ['create-entity'],
        },
      },
    ]);

    session.undo();
    expect(session.getDocument()).toEqual(before);
  });

  it('reports a rejected patch with the guard message', () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });

    render(<BridgeHarness session={session} />);
    api.agentMock.requestPatch({
      requestId: 'patch-2',
      patch: {
        rationale: '删掉根合同',
        commands: [{ type: 'delete-entity', entityId: 'evidence.contract' }],
      },
    });

    const response = api.agentMock.patchResponses[0] as {
      requestId: string;
      result: { success: boolean; error?: string };
    };

    expect(response.requestId).toBe('patch-2');
    expect(response.result.success).toBe(false);
    expect(response.result.error).toBeTruthy();
    expect(
      session
        .getDocument()
        .entities.some((entity) => entity.id === 'evidence.contract'),
    ).toBe(true);
  });

  it('rejects a malformed patch without touching the document', () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });
    const before = session.getDocument();

    render(<BridgeHarness session={session} />);
    api.agentMock.requestPatch({
      requestId: 'patch-3',
      patch: { rationale: '坏数据', commands: [{ type: 'drop-table' }] },
    });

    expect(api.agentMock.patchResponses).toEqual([
      {
        requestId: 'patch-3',
        result: {
          success: false,
          error:
            "commands[0].type 'drop-table' is not a supported model command.",
        },
      },
    ]);
    expect(session.getDocument()).toEqual(before);
  });

  it('hands both snapshots to the caller so a review can offer one-step revert', () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });
    const before = session.getDocument();
    const onApplied = vi.fn<(patch: AppliedPatch) => void>();

    render(<BridgeHarness session={session} onApplied={onApplied} />);
    api.agentMock.requestPatch({
      requestId: 'patch-5',
      patch: {
        rationale: '新增审计员',
        commands: [{ type: 'create-entity', entity: extraParticipant() }],
      },
    });

    expect(onApplied).toHaveBeenCalledTimes(1);
    const patch = onApplied.mock.calls[0]?.[0] as AppliedPatch;

    expect(patch.rationale).toBe('新增审计员');
    expect(patch.commands).toEqual(['create-entity']);
    expect(patch.before).toBe(before);
    expect(patch.after).toBe(session.getDocument());
  });

  it('never reports a rejected patch as applied', () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });
    const onApplied = vi.fn<(patch: AppliedPatch) => void>();

    render(<BridgeHarness session={session} onApplied={onApplied} />);
    api.agentMock.requestPatch({
      requestId: 'patch-6',
      patch: {
        rationale: '删掉根合同',
        commands: [{ type: 'delete-entity', entityId: 'evidence.contract' }],
      },
    });

    expect(onApplied).not.toHaveBeenCalled();
  });

  it('stops listening once the harness unmounts', () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });
    const { unmount } = render(<BridgeHarness session={session} />);

    unmount();
    api.agentMock.requestPatch({
      requestId: 'patch-4',
      patch: { rationale: '延迟到达', commands: [] },
    });

    expect(api.agentMock.patchResponses).toEqual([]);
    expect(screen.queryByText('bridge')).toBeNull();
  });
});

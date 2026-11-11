import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createModelSession } from '@evidence-poc/evidence-model-core/browser';
import type { EntityAST } from '@evidence-poc/evidence-schema';

import { useAgentPatchBridge } from './useAgentPatchBridge';
import { installDesktopApi } from '../test-support/desktopApi';
import { createDesktopFixture } from '../test-support/modelFixture';

const BridgeHarness = ({
  session,
}: {
  session: ReturnType<typeof createModelSession>;
}) => {
  useAgentPatchBridge(session);

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

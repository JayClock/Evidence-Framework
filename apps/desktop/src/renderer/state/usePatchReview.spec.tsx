import { render } from '@testing-library/react';
import { act, useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  createModelSession,
  decodeModelPatch,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';
import type { EntityAST } from '@evidence-poc/evidence-schema';

import { usePatchReview, type PatchReviewController } from './usePatchReview';
import { installDesktopApi } from '../test-support/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

const participant = (id: string, label: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'participant',
  kind: 'party',
  label,
});

const ReviewHarness = ({
  session,
  onReady,
}: {
  session: ModelSession;
  onReady: (controller: PatchReviewController) => void;
}) => {
  // The editor re-renders on every session event; the harness has to as well,
  // or the hook keeps seeing a document the rest of the app already replaced.
  const [version, bump] = useState(0);

  useEffect(() => session.subscribe(() => bump((value) => value + 1)), [session]);

  const controller = usePatchReview(session, session.getDocument());

  onReady(controller);

  return <p>review {version}</p>;
};

const setup = () => {
  installDesktopApi();

  const session = createModelSession({ document: createDesktopFixture() });
  const before = session.getDocument();
  let controller: PatchReviewController | null = null;

  render(
    <ReviewHarness
      session={session}
      onReady={(next) => {
        controller = next;
      }}
    />,
  );

  const current = (): PatchReviewController => {
    if (controller === null) {
      throw new Error('the harness never rendered');
    }

    return controller;
  };

  /** Applies one agent-shaped patch and records it as the pending review. */
  const apply = (
    entities: readonly EntityAST[],
    rationale = '新增审计员',
  ): void => {
    act(() => {
      session.dispatchAll(
        decodeModelPatch(
          entities.map((entity) => ({ type: 'create-entity', entity })),
        ),
        `agent:${rationale}`,
      );
    });

    act(() => {
      current().record({
        rationale,
        commands: ['create-entity'],
        before,
        after: session.getDocument(),
      });
    });
  };

  return {
    session,
    before,
    apply,
    current,
    settle: (action: 'accept' | 'revert') => {
      act(() => {
        current()[action]();
      });
    },
    editOnTop: () => {
      act(() => {
        session.dispatchAll(
          decodeModelPatch([
            {
              type: 'create-entity',
              entity: participant('party.witness', '见证人'),
            },
          ]),
        );
      });
    },
  };
};

describe('usePatchReview', () => {
  it('keeps nothing pending until a patch is recorded', () => {
    expect(setup().current().review).toBeNull();
  });

  it('names what the patch added, changed and removed', () => {
    const harness = setup();

    harness.apply([participant('party.auditor', '审计员')]);

    expect(harness.current().review).toMatchObject({
      rationale: '新增审计员',
      commands: ['create-entity'],
      addedIds: ['party.auditor'],
      removedIds: [],
      modifiedIds: [],
      revertable: true,
    });
    expect(harness.current().review?.overlay.marks.get('party.auditor')).toBe(
      'added',
    );
  });

  it('reverts the patch when it is still the newest edit', () => {
    const harness = setup();

    harness.apply([participant('party.auditor', '审计员')]);
    harness.settle('revert');

    expect(harness.current().review).toBeNull();
    expect(
      harness.session
        .getDocument()
        .entities.some((entity) => entity.id === 'party.auditor'),
    ).toBe(false);
  });

  it('accepts without touching the model', () => {
    const harness = setup();

    harness.apply([participant('party.auditor', '审计员')]);
    harness.settle('accept');

    expect(harness.current().review).toBeNull();
    expect(
      harness.session
        .getDocument()
        .entities.some((entity) => entity.id === 'party.auditor'),
    ).toBe(true);
  });

  it('refuses to revert once a later edit landed on top', () => {
    const harness = setup();

    harness.apply([participant('party.auditor', '审计员')]);
    harness.editOnTop();

    expect(harness.current().review?.revertable).toBe(false);

    harness.settle('revert');
    expect(harness.current().review).toBeNull();
    expect(
      harness.session
        .getDocument()
        .entities.some((entity) => entity.id === 'party.auditor'),
    ).toBe(true);
    expect(
      harness.session
        .getDocument()
        .entities.some((entity) => entity.id === 'party.witness'),
    ).toBe(true);
  });
});

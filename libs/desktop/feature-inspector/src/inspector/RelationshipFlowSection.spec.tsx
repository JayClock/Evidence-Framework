import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createModelSession } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { RelationshipFlowSection } from './RelationshipFlowSection';

describe('relationship flow editor', () => {
  it('sets an explicit marker and removes it on undo', () => {
    const session = createModelSession({ document: createDesktopFixture() });
    const props = {
      entityId: 'evidence.confirmation',
      session,
      graph: session.getGraph(),
    };
    render(<RelationshipFlowSection {...props} />);
    const select = screen.getAllByRole('combobox')[0]!;
    fireEvent.change(select, { target: { value: 'escalation' } });
    expect(
      session
        .getDocument()
        .relationships.some((edge) => edge.flowKind === 'escalation'),
    ).toBe(true);
    act(() => session.undo());
    expect(
      session
        .getDocument()
        .relationships.every((edge) => edge.flowKind === undefined),
    ).toBe(true);
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createModelSession } from '@evidence-poc/evidence-model-core';

import type {
  DiagnosticIndex,
  DiagnosticStatus,
} from '@evidence-poc/desktop-feature-canvas';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import {
  bilateralSync,
  requestFocusEntity,
} from '../../state/useBilateralSync';
import { DomainLedgerTable } from './DomainLedgerTable';

// jsdom reports every element as zero-sized, and the virtual list only renders
// the rows inside its measured viewport. A real window measures itself.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 640,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: 1200,
  });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
});

const sessionOf = () =>
  createModelSession({ document: createDesktopFixture() });

const ledgerRow = (container: HTMLElement, id: string): HTMLElement => {
  const element = container.querySelector<HTMLElement>(
    `[data-ledger-row="${id}"]`,
  );

  if (element === null) throw new Error(`missing ledger row: ${id}`);

  return element;
};

const renderTable = (
  session: ReturnType<typeof sessionOf>,
  overrides: Partial<Parameters<typeof DomainLedgerTable>[0]> = {},
) =>
  render(
    <DomainLedgerTable
      document={session.getDocument()}
      session={session}
      selectedNodeId={null}
      {...overrides}
    />,
  );

const diagnostics = (): DiagnosticIndex =>
  new Map<string, DiagnosticStatus>([
    [
      'evidence.contract',
      {
        severity: 'warn' as const,
        issues: [
          {
            issueId: 'issue.contract',
            severity: 'warn' as const,
            source: 'check_fm' as const,
            code: 'FM_CONTRACT_ROLE',
            message: '合同角色缺失。',
            targetNodeId: 'evidence.contract',
          },
        ],
      },
    ],
  ]);

describe('DomainLedgerTable', () => {
  it('reads the whole model as contexts, entities and fields', () => {
    const session = sessionOf();

    const { container } = renderTable(session);

    expect(screen.getByLabelText('领域模型总台账')).toBeInTheDocument();
    expect(screen.getByText('8 个实体 · 4 个字段')).toBeInTheDocument();
    expect(
      container.querySelector('[data-ledger-row="context.procurement"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-ledger-row="evidence.contract#signed_at"]',
      ),
    ).not.toBeNull();
    // Every fixture field is a recorded fact, none is derived.
    expect(screen.getAllByText('—— 事实录入 ——')).toHaveLength(4);
    expect(screen.getByDisplayValue('签署时间')).toBeInTheDocument();
  });

  it('narrows the ledger to the field that matched and keeps its owner', () => {
    const session = sessionOf();

    const { container } = renderTable(session);
    fireEvent.change(screen.getByLabelText('台账筛选'), {
      target: { value: '交付请求' },
    });

    expect(
      container.querySelector('[data-ledger-row="evidence.request"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-ledger-row="evidence.request#started_at"]',
      ),
    ).not.toBeNull();
    // The contract is filtered out, and so is its field.
    expect(
      container.querySelector('[data-ledger-row="evidence.contract"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-ledger-row="evidence.contract#signed_at"]',
      ),
    ).toBeNull();
  });

  it('narrows a matched block to the matching field', () => {
    const session = sessionOf();

    const { container } = renderTable(session);
    fireEvent.change(screen.getByLabelText('台账筛选'), {
      target: { value: '签署时间' },
    });

    expect(
      container.querySelector(
        '[data-ledger-row="evidence.contract#signed_at"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-ledger-row="evidence.request"]'),
    ).toBeNull();
  });

  it('commits a label edit through the command bus and undoes it', async () => {
    const session = sessionOf();

    renderTable(session);

    const input = screen.getByLabelText('业务名: 签署时间');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '合同签署时间' } });
    fireEvent.blur(input);

    await waitFor(() => {
      const contract = session.getGraph().getEntity('evidence.contract');
      expect(contract?.attributes?.[0]?.label).toBe('合同签署时间');
    });
    expect(session.canUndo()).toBe(true);

    session.undo();
    expect(
      session.getGraph().getEntity('evidence.contract')?.attributes?.[0]?.label,
    ).toBe('签署时间');
  });

  it('selects the attribute a row stands for', () => {
    const session = sessionOf();

    const { container } = renderTable(session);
    fireEvent.click(ledgerRow(container, 'evidence.contract#signed_at'));

    expect(session.getSelection()).toEqual({
      nodeId: 'evidence.contract',
      attributeName: 'signed_at',
    });
  });

  it('collapses a context to its summary line', () => {
    const session = sessionOf();

    const { container } = renderTable(session);
    const contextRow = () => ledgerRow(container, 'context.procurement');

    expect(contextRow()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(contextRow());

    expect(contextRow()).toHaveAttribute('aria-expanded', 'false');
    expect(
      container.querySelector('[data-ledger-row="evidence.contract"]'),
    ).toBeNull();
    // The summary keeps the count the hidden children would have shown.
    expect(contextRow().textContent).toContain('5 个实体');

    fireEvent.click(contextRow());
    expect(
      container.querySelector('[data-ledger-row="evidence.contract"]'),
    ).not.toBeNull();
  });

  it('shows only findings when the toolbar asks for issues', () => {
    const session = sessionOf();

    const { container } = renderTable(session, {
      diagnostics: diagnostics(),
    });
    // The default grid still shows a clean entity.
    expect(
      container.querySelector('[data-ledger-row="evidence.confirmation"]'),
    ).not.toBeNull();

    fireEvent.click(screen.getByText('全部门禁'));

    expect(screen.getByText(/仅看门禁发现/)).toBeInTheDocument();
    expect(
      container.querySelector('[data-ledger-row="evidence.contract"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-ledger-row="evidence.confirmation"]'),
    ).toBeNull();
  });

  it('lights the row the canvas pointed at and lets it fade', async () => {
    const session = sessionOf();
    const { container } = renderTable(session);

    act(() => {
      requestFocusEntity('evidence.request', 'canvas');
    });

    expect(
      container.querySelector('[data-row-flash][data-row-entity="evidence.request"]'),
    ).not.toBeNull();

    await waitFor(
      () => expect(container.querySelector('[data-row-flash]')).toBeNull(),
      { timeout: 3000 },
    );
  });

  it('announces a pressed row so the canvas can travel to it', () => {
    const session = sessionOf();
    const seen = vi.fn();
    const unsubscribe = bilateralSync.subscribe(seen);

    const { container } = renderTable(session);
    fireEvent.click(ledgerRow(container, 'evidence.request'));
    unsubscribe();

    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'focus-entity',
        entityId: 'evidence.request',
        source: 'table',
      }),
    );
  });

  it('scrolls to the selected object when the stage hands over a target', () => {
    const session = sessionOf();

    const { container } = renderTable(session, {
      focusNodeId: 'evidence.request',
    });

    expect(
      container.querySelector('[data-ledger-row="evidence.request"]'),
    ).not.toBeNull();
  });
});

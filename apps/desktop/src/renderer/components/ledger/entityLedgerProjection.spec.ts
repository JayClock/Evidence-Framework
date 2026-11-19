import { describe, expect, it } from 'vitest';

import type { DiagnosticIndex } from '@evidence-poc/desktop-feature-canvas';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import type { RuleAST } from '@evidence-poc/evidence-schema';

import {
  countLedgerCategories,
  filterEntityLedger,
  projectEntityLedger,
} from './entityLedgerProjection';

const invariant: RuleAST = {
  type: 'rule',
  kind: 'invariant',
  id: 'rule.contract-date',
  label: '合同时间',
  description: '检查签署时间',
  contextRef: 'context.procurement',
  resultType: 'bool',
  bindings: {
    contract: { ref: 'evidence.contract' },
    copy: { ref: 'evidence.contract' },
    request: { ref: 'evidence.request' },
    limit: { type: 'timestamp' },
  },
  expression: 'contract.signed_at < limit',
};

const fixture = () => {
  const model = createDesktopFixture();
  model.rules.push(
    { ...invariant, id: 'rule.before-signing', kind: 'precondition' },
    invariant,
    {
      ...invariant,
      id: 'rule.second',
      expression: 'request.started_at < limit',
    },
  );
  return model;
};

const rowIds = (rows: ReturnType<typeof projectEntityLedger>) =>
  rows.map(({ id }) => id);

describe('entity ledger projection', () => {
  it('projects only business entities and counts fields, categories and context references', () => {
    const model = fixture();
    const rows = projectEntityLedger(model, null);
    expect(rowIds(rows)).toEqual(
      model.entities
        .filter(({ category }) => category !== 'context')
        .map(({ id }) => id),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        id: 'evidence.contract',
        contextId: 'context.procurement',
        fieldCount: 1,
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'participant',
        contextId: null,
        contextLabel: null,
      }),
    );
    expect(countLedgerCategories(rows)).toEqual({
      all: 8,
      evidence: 3,
      participant: 5,
      thread: 0,
    });
  });

  it('indexes all actual invariants once per bound entity and ignores other rule kinds', () => {
    const rows = projectEntityLedger(fixture(), null);
    expect(
      rows
        .find(({ id }) => id === 'evidence.contract')
        ?.invariants.map(({ id }) => id),
    ).toEqual(['rule.contract-date', 'rule.second']);
    expect(
      rows.find(({ id }) => id === 'evidence.request')?.invariants,
    ).toHaveLength(2);
    expect(
      rows.find(({ category }) => category === 'participant')?.invariants,
    ).toEqual([]);
  });

  it('combines category and case-insensitive searches over IDs, labels, context and all CEL rules', () => {
    const rows = projectEntityLedger(fixture(), null);
    expect(
      rowIds(filterEntityLedger(rows, 'evidence', ' STARTED_AT < ')),
    ).toEqual(['evidence.contract', 'evidence.request']);
    expect(rowIds(filterEntityLedger(rows, 'all', 'rule.second'))).toEqual([
      'evidence.contract',
      'evidence.request',
    ]);
    expect(rowIds(filterEntityLedger(rows, 'all', ' 采购协议 '))).toEqual([
      'evidence.contract',
    ]);
    expect(
      filterEntityLedger(rows, 'participant', 'context.procurement').some(
        ({ category }) => category === 'role',
      ),
    ).toBe(true);
    expect(
      filterEntityLedger(rows, 'participant', 'evidence.contract'),
    ).toEqual([]);
    expect(filterEntityLedger(rows, 'thread', '')).toEqual([]);
  });

  it('distinguishes an unverified revision from a scan with no findings and preserves diagnostic severity', () => {
    const model = fixture();
    expect(
      projectEntityLedger(model, null).every(
        ({ gate }) => gate === 'unchecked',
      ),
    ).toBe(true);
    const diagnostics: DiagnosticIndex = new Map([
      ['evidence.contract', { severity: 'block', issues: [] }],
      ['evidence.request', { severity: 'warn', issues: [] }],
      ['context.procurement', { severity: 'block', issues: [] }],
    ]);
    expect(projectEntityLedger(model, diagnostics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'evidence.contract', gate: 'block' }),
        expect.objectContaining({ id: 'evidence.request', gate: 'warn' }),
        expect.objectContaining({ category: 'participant', gate: 'clear' }),
      ]),
    );
  });
});

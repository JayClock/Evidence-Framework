import { describe, expect, it } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type { DiagnosticIndex } from '@evidence-poc/desktop-feature-canvas';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import {
  filterLedgerRows,
  projectDocumentToLedgerRows,
  summarizeLedger,
} from './domainLedgerAdapter';

const withDerivedAmount = (): DomainModelDocument => {
  const document = createDesktopFixture();
  const request = document.entities.find(
    (entity) => entity.id === 'evidence.request',
  );

  if (request === undefined) throw new Error('fixture lost its request');

  request.attributes = [
    ...(request.attributes ?? []),
    {
      name: 'total_amount',
      label: '订单总金额（Total Amount）',
      meaning: '由请求数量与单价派生，不接受前端传入。',
      valueType: 'decimal',
      required: true,
      keyData: true,
      derivedByRuleRef: 'rule.total-amount',
    },
    {
      name: 'discount_rate',
      label: '折扣率（Discount Rate）',
      meaning: '业务尚未决定由谁提供。',
      valueType: 'decimal',
      keyData: true,
    },
  ];
  document.rules = [
    ...document.rules,
    {
      type: 'rule',
      id: 'rule.total-amount',
      kind: 'derivation',
      label: '订单总金额（Total Amount）',
      description: '数量乘以单价。',
      contextRef: 'context.procurement',
      bindings: { request: { ref: 'evidence.request' } },
      expression: 'request.quantity * request.unit_price',
      resultType: 'decimal',
      target: { entityRef: 'evidence.request', attribute: 'total_amount' },
    },
  ];

  return document;
};

const diagnostics = (): DiagnosticIndex =>
  new Map([
    [
      'context.procurement',
      {
        severity: 'info' as const,
        issues: [
          {
            issueId: 'issue.context',
            severity: 'info' as const,
            source: 'check_fm' as const,
            code: 'FM_CONTEXT_EMPTY',
            message: '上下文没有入口。',
            contextRef: 'context.procurement',
          },
        ],
      },
    ],
    [
      'evidence.request',
      {
        severity: 'warn' as const,
        issues: [
          {
            issueId: 'issue.request',
            severity: 'warn' as const,
            source: 'check_fm' as const,
            code: 'FM_REQUEST_INPUT',
            message: '请求缺少业务时间。',
            targetNodeId: 'evidence.request',
          },
          {
            issueId: 'issue.amount',
            severity: 'block' as const,
            source: 'check_fm' as const,
            code: 'FM_DERIVATION_TARGET',
            message: '派生目标不完整。',
            targetNodeId: 'evidence.request#total_amount',
          },
        ],
      },
    ],
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

describe('projectDocumentToLedgerRows', () => {
  it('projects the outline into context, entity and attribute lines', () => {
    const rows = projectDocumentToLedgerRows(createDesktopFixture());
    const contexts = rows.filter((row) => row.rowKind === 'context');
    const entities = rows.filter((row) => row.rowKind === 'entity');
    const attributes = rows.filter((row) => row.rowKind === 'attribute');

    expect(contexts.map((row) => row.contextLabel)).toEqual([
      '商品采购（Procurement）',
      '商品目录（Catalog）',
      '未归属上下文',
    ]);
    expect(entities).toHaveLength(8);
    expect(attributes).toHaveLength(4);
    // The context line owns the counts its children report.
    expect(contexts[0]?.childCount).toBe(5);
    // `expired_at` is not a request-formation field, so it still owes a provider.
    expect(contexts[0]?.decisionOwedCount).toBe(1);
    // A party is not a boundary, so it lands in the unassigned group.
    expect(contexts[2]?.contextId).toBeNull();
    expect(
      entities.find((row) => row.entityId === 'participant.buyer')
        ?.contextLabel,
    ).toBe('未归属上下文');
  });

  it('resolves the derivation rule and the key data decision of an attribute', () => {
    const rows = projectDocumentToLedgerRows(withDerivedAmount());
    const amount = rows.find(
      (row) => row.rowId === 'evidence.request#total_amount',
    );
    const discount = rows.find(
      (row) => row.rowId === 'evidence.request#discount_rate',
    );

    expect(amount?.attribute).toMatchObject({
      valueType: 'decimal',
      required: true,
      keyData: true,
      derivedByRuleRef: 'rule.total-amount',
      expression: 'request.quantity * request.unit_price',
      keyDataSource: 'derived',
      decisionOwed: false,
    });
    expect(discount?.attribute).toMatchObject({
      expression: null,
      keyDataSource: 'needs-decision',
      decisionOwed: true,
    });
    // The entity and its context both surface the owed decisions.
    expect(
      rows.find((row) => row.rowId === 'evidence.request')?.decisionOwedCount,
    ).toBe(2);
    expect(summarizeLedger(rows).decisionOwed).toBe(2);
  });

  it('charges an attribute finding to its row, not to the whole entity', () => {
    const rows = projectDocumentToLedgerRows(
      withDerivedAmount(),
      diagnostics(),
    );
    const entity = rows.find((row) => row.rowId === 'evidence.request');
    const amount = rows.find(
      (row) => row.rowId === 'evidence.request#total_amount',
    );
    const context = rows.find((row) => row.rowId === 'context.procurement');

    // The entity line is a summary of its block, so it carries both findings;
    // the attribute row carries only the one aimed at the field.
    expect(entity).toMatchObject({ issueCount: 2, issueSeverity: 'block' });
    expect(amount).toMatchObject({ issueCount: 1, issueSeverity: 'block' });
    expect(context?.issueSeverity).toBe('block');
    expect(context?.issueCount).toBe(4);
  });

  it('keeps the entity that owns a matching attribute when filtering', () => {
    const rows = projectDocumentToLedgerRows(withDerivedAmount());

    const matched = filterLedgerRows(rows, { query: '总金额' });

    expect(matched.map((row) => row.rowId)).toEqual([
      'context.procurement',
      'evidence.request',
      'evidence.request#total_amount',
    ]);
  });

  it('drops a collapsed context’s children but keeps its summary', () => {
    const rows = projectDocumentToLedgerRows(withDerivedAmount());

    const filtered = filterLedgerRows(rows, {
      collapsedContextIds: new Set(['context.procurement']),
    });

    expect(filtered.map((row) => row.rowId)).toContain('context.procurement');
    expect(filtered.map((row) => row.rowId)).not.toContain('evidence.request');
    expect(filtered.map((row) => row.rowId)).toContain('context.catalog');
  });

  it('keeps only findings when the toolbar asks for issues', () => {
    const rows = projectDocumentToLedgerRows(
      withDerivedAmount(),
      diagnostics(),
    );

    const filtered = filterLedgerRows(rows, { onlyIssues: true });
    const ids = filtered.map((row) => row.rowId);

    expect(ids).toContain('context.procurement');
    expect(ids).toContain('evidence.request');
    expect(ids).toContain('evidence.request#total_amount');
    expect(ids).toContain('evidence.contract');
    expect(ids).not.toContain('evidence.confirmation');
    // Contexts without findings disappear entirely.
    expect(ids).not.toContain('context.catalog');
  });
});

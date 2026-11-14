import { describe, expect, it } from 'vitest';

import type { CelCandidate } from '@evidence-poc/evidence-model-core';

import { computeCelCompletions } from './celCompletion';

const candidates: readonly CelCandidate[] = [
  {
    alias: 'self',
    label: '发货请求（Shipment Request）',
    ref: 'evidence.request',
    attributes: [
      { name: 'quantity', label: '数量（Quantity）', valueType: 'int' },
      { name: 'total_amount', label: '请求金额（Total Amount）' },
    ],
  },
  {
    alias: 'contract',
    label: '采购协议（Procurement Contract）',
    ref: 'evidence.contract',
    attributes: [
      { name: 'unit_price', label: '单价（Unit Price）', valueType: 'money' },
    ],
  },
  {
    alias: 'confirmations',
    label: '交付确认（Delivery Confirmation）',
    cardinality: 'many',
    attributes: [{ name: 'confirmed_at', label: '确认时间' }],
  },
];

describe('computeCelCompletions', () => {
  it('suggests aliases for a bare word', () => {
    const result = computeCelCompletions({
      expression: 'con',
      caret: 3,
      candidates,
    });

    expect(result.options).toEqual([
      {
        label: 'contract',
        detail: '采购协议（Procurement Contract）',
        insert: 'contract',
        kind: 'alias',
      },
      {
        label: 'confirmations',
        detail: '交付确认（Delivery Confirmation）（集合）',
        insert: 'confirmations',
        kind: 'alias',
      },
    ]);
    expect(result.from).toBe(0);
  });

  it('suggests the attributes of the alias before the dot', () => {
    const result = computeCelCompletions({
      expression: 'self.qu',
      caret: 7,
      candidates,
    });

    expect(result.options).toEqual([
      {
        label: 'quantity',
        detail: '数量（Quantity） · int',
        insert: 'quantity',
        kind: 'attribute',
      },
    ]);
    expect(result.from).toBe(5);
  });

  it('offers every attribute once the dot is typed', () => {
    const result = computeCelCompletions({
      expression: 'contract.',
      caret: 9,
      candidates,
    });

    expect(result.options.map((option) => option.label)).toEqual([
      'unit_price',
    ]);
    expect(result.from).toBe(9);
  });

  it('offers the collection macros on a collection alias', () => {
    const result = computeCelCompletions({
      expression: 'confirmations.',
      caret: 14,
      candidates,
    });

    expect(result.options.map((option) => option.label)).toEqual([
      'exists',
      'all',
      'filter',
      'confirmed_at',
    ]);
    expect(result.options[0]?.insert).toBe('exists(c, c)');
  });

  it('offers nothing for an unknown alias', () => {
    expect(
      computeCelCompletions({
        expression: 'nope.',
        caret: 5,
        candidates,
      }).options,
    ).toEqual([]);
  });

  it('offers nothing when the caret follows an operator', () => {
    expect(
      computeCelCompletions({
        expression: 'self.quantity > ',
        caret: 16,
        candidates,
      }).options,
    ).toEqual([]);
  });

  it('lists everything on an explicit request', () => {
    const result = computeCelCompletions({
      expression: '',
      caret: 0,
      candidates,
      explicit: true,
    });

    expect(result.options.map((option) => option.label)).toEqual([
      'self',
      'contract',
      'confirmations',
      'exists',
      'all',
      'filter',
    ]);
    expect(result.from).toBe(0);
  });
});

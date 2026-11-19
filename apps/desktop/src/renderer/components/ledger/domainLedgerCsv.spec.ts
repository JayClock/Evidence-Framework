import { describe, expect, it, vi } from 'vitest';

import { downloadLedgerCsv, serializeLedgerCsv } from './domainLedgerCsv';
import type { LedgerEntityRow } from './entityLedgerProjection';

const row: LedgerEntityRow = {
  id: 'evidence.contract',
  label: '采购, "协议"\n第二行',
  category: 'evidence',
  contextId: 'context.procurement',
  contextLabel: '采购',
  fieldCount: 2,
  invariants: [
    { id: 'rule.amount', expression: 'po.amount > 0' },
    { id: 'rule.status', expression: 'po.status == "active"' },
  ],
  gate: 'unchecked',
};

describe('ledger CSV export', () => {
  it('writes BOM, six data columns, escaped labels and every invariant', () => {
    expect(serializeLedgerCsv([row])).toBe(
      '\uFEFF"实体标识 (ID)","中文名称 / 分类","所属上下文 (Context)","字段数","业务不变量 (CEL 规则)","门禁状态"\r\n' +
        '"evidence.contract","采购, ""协议""\n第二行 · Evidence","context.procurement","2","po.amount > 0\npo.status == ""active""","待检查"\r\n',
    );
  });

  it.each(['=1+1', '  +1', '\tname', '\nname', '-7', '@test', '＝1'])(
    'writes %j as literal spreadsheet text',
    (label) => {
      expect(
        serializeLedgerCsv([{ ...row, label, contextId: null }]),
      ).toContain(`"'${label} · Evidence",""`);
    },
  );

  it('downloads an attached Blob link with a safe filename and releases it after navigation starts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
    const create = vi.fn(() => 'blob:ledger');
    const revoke = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.isConnected).toBe(true);
        expect(this.download).toBe('采购-合同-ledger-2026-11-19.csv');
        expect(this.href).toBe('blob:ledger');
      });
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: create,
        revokeObjectURL: revoke,
      }),
    );
    try {
      downloadLedgerCsv('采购/合同', [row]);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'text/csv;charset=utf-8' }),
      );
      expect(click).toHaveBeenCalledOnce();
      expect(document.querySelector('a[download]')).toBeNull();
      expect(revoke).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith('blob:ledger');
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

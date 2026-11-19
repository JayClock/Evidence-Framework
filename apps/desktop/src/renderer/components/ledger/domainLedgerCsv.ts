import {
  LEDGER_CATEGORY_LABELS,
  LEDGER_GATE_LABELS,
  type LedgerEntityRow,
} from './entityLedgerProjection';

const HEADERS = [
  '实体标识 (ID)',
  '中文名称 / 分类',
  '所属上下文 (Context)',
  '字段数',
  '业务不变量 (CEL 规则)',
  '门禁状态',
];

const encodeCell = (value: string | number) => {
  // Quoting alone doesn't prevent spreadsheet programs from evaluating cells.
  const text = String(value);
  const unsafe =
    typeof value === 'string' && /^(?:[\t\r\n]|\s*[=+\-@＝＋－＠])/u.test(text);
  return `"${unsafe ? "'" : ''}${text.replaceAll('"', '""')}"`;
};

/** UTF-8 BOM for spreadsheet readers; CRLF and quoted fields for CSV parsers. */
export const serializeLedgerCsv = (
  rows: readonly LedgerEntityRow[],
): string => {
  const line = (cells: readonly (string | number)[]) =>
    cells.map(encodeCell).join(',');
  return `\uFEFF${[
    line(HEADERS),
    ...rows.map((row) =>
      line([
        row.id,
        `${row.label} · ${LEDGER_CATEGORY_LABELS[row.category]}`,
        row.contextId ?? '',
        row.fieldCount,
        row.invariants.map(({ expression }) => expression).join('\n'),
        LEDGER_GATE_LABELS[row.gate],
      ]),
    ),
  ].join('\r\n')}\r\n`;
};

export const downloadLedgerCsv = (
  projectName: string,
  rows: readonly LedgerEntityRow[],
) => {
  const name = projectName
    .replace(/[<>:"/\\|?*.\p{Cc}]/gu, '-')
    .trim()
    .slice(0, 80);
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([serializeLedgerCsv(rows)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const release = URL.revokeObjectURL.bind(URL, url);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name || 'evidence-project'}-ledger-${date}.csv`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Chromium must have a chance to consume the Blob before it is released.
    window.setTimeout(release, 1_000);
  }
};

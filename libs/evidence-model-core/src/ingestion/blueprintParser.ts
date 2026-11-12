import {
  normalizeDraftEvidenceKind,
  type EvidenceKind,
  type IngestionDraft,
} from '@evidence-poc/evidence-schema';

import {
  assembleDraftFromRows,
  inferContractSide,
  inferEvidenceKind,
  type DraftRow,
} from './draftAssembly.js';

/**
 * The blueprint columns the lecture names as the entry point into modeling.
 *
 * The variant table is deliberately close to what a business workshop already
 * produces: a stage, an activity, the document the step leaves behind, who
 * signs it and what it is about. Everything else in the draft is derived from
 * those five columns.
 */
export const BLUEPRINT_COLUMNS = [
  'stage',
  'activity',
  'evidence',
  'kind',
  'party',
  'thing',
  'system',
] as const;

export type BlueprintColumn = (typeof BLUEPRINT_COLUMNS)[number];

/**
 * Header spellings each column accepts.
 *
 * A workshop table is written by people, so the header is matched by
 * containment instead of equality: `阶段 (Stage)` and `Stage` both land on
 * `stage`.
 */
const COLUMN_ALIASES: Readonly<Record<BlueprintColumn, readonly string[]>> = {
  stage: ['阶段', 'stage', '环节'],
  activity: [
    '活动',
    '客户旅程',
    '前台',
    '行为',
    'activity',
    'touchpoint',
    'journey',
  ],
  evidence: ['业务凭证', '凭证', '单据', 'evidence', 'document'],
  kind: ['凭证类型', '类型', 'type', 'kind'],
  party: ['当事人', '责任人', '参与人', 'party', 'owner', 'actor'],
  thing: ['标的物', '标的', '对象', 'thing', 'object', 'subject'],
  system: ['支撑系统', '系统', 'support', 'system'],
};

export interface BlueprintIssue {
  /** 1-based row number in the source, or absent when the issue is the table. */
  line?: number;
  message: string;
}

export interface BlueprintParseOptions {
  modelName?: string;
  contractContextLabel?: string;
  preContractContextLabel?: string;
  domainContextLabel?: string;
}

export interface BlueprintParseSuccess {
  success: true;
  draft: IngestionDraft;
  issues: readonly BlueprintIssue[];
}

export interface BlueprintParseFailure {
  success: false;
  error: string;
  issues: readonly BlueprintIssue[];
}

export type BlueprintParseResult = BlueprintParseSuccess | BlueprintParseFailure;

const splitCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const isMarkdownSeparator = (line: string): boolean =>
  /^\|?[\s:|-]+\|?$/.test(line) && line.includes('-');

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const normalizeHeader = (cell: string): string =>
  cell.toLowerCase().replaceAll(/[\s()（）[\]【】]/g, '');

const matchColumn = (header: string): BlueprintColumn | undefined =>
  BLUEPRINT_COLUMNS.find((column) =>
    COLUMN_ALIASES[column].some((alias) => header.includes(normalizeHeader(alias))),
  );

const splitNames = (cell: string): string[] =>
  cell
    .split(/[,，、/;；]|和|与/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

interface ParsedTable {
  rows: DraftRow[];
  issues: BlueprintIssue[];
}

const readTable = (content: string, format: 'markdown' | 'csv'): ParsedTable => {
  const issues: BlueprintIssue[] = [];
  const lines = content
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(({ text }) => text.trim().length > 0);

  const tableRows = lines.filter(({ text }) =>
    format === 'csv' ? true : text.includes('|'),
  );

  const [headerLine, ...bodyLines] = tableRows;

  if (headerLine === undefined) {
    issues.push({ message: '没有读到任何表格行。' });
    return { rows: [], issues };
  }

  const headerCells =
    format === 'csv'
      ? parseCsvLine(headerLine.text)
      : splitCells(headerLine.text);

  const columnIndex = new Map<BlueprintColumn, number>();

  headerCells.forEach((cell, index) => {
    const column = matchColumn(normalizeHeader(cell));

    if (column !== undefined && !columnIndex.has(column)) {
      columnIndex.set(column, index);
    }
  });

  if (columnIndex.size === 0) {
    issues.push({
      line: headerLine.line,
      message:
        '表头没有可识别的列，至少需要「业务凭证 / 凭证」列；支持阶段、活动、凭证类型、当事人、标的物。',
    });
    return { rows: [], issues };
  }

  const columnValue = (
    cells: readonly string[],
    column: BlueprintColumn,
  ): string => {
    const index = columnIndex.get(column);

    return index === undefined ? '' : (cells[index] ?? '').trim();
  };

  const rows: DraftRow[] = [];

  for (const { line, text } of bodyLines) {
    if (format === 'markdown' && isMarkdownSeparator(text)) {
      continue;
    }

    const cells = format === 'csv' ? parseCsvLine(text) : splitCells(text);
    const evidenceLabel = columnValue(cells, 'evidence');

    if (evidenceLabel.length === 0) {
      issues.push({ line, message: '该行缺少业务凭证名称，已跳过。' });
      continue;
    }

    const rawKind = columnValue(cells, 'kind');
    const kind =
      rawKind.length === 0 ? undefined : normalizeDraftEvidenceKind(rawKind);

    if (rawKind.length > 0 && kind === undefined) {
      issues.push({
        line,
        message: `凭证类型「${rawKind}」无法识别，将由凭证名称推断。`,
      });
    }

    const thing = columnValue(cells, 'thing');

    rows.push({
      line,
      stage: columnValue(cells, 'stage') || '未分阶段',
      activity: columnValue(cells, 'activity'),
      evidence: evidenceLabel,
      ...(kind === undefined ? {} : { kind }),
      parties: splitNames(columnValue(cells, 'party')),
      ...(thing.length === 0 ? {} : { thing }),
    });
  }

  return { rows, issues };
};

/**
 * Reads the lecture's service-blueprint variant into an ingestion draft.
 *
 * Table reading stays here; the three structural readings (contract split,
 * request/confirmation pairing, two Party Roles) are shared with the prose
 * reader in {@link assembleDraftFromRows}. The support-system column is accepted
 * so a real workshop table parses, but it is not compiled: a supporting system
 * becomes a change point later, never an evidence.
 */
export const parseBlueprint = (
  content: string,
  options: BlueprintParseOptions & { format?: 'markdown' | 'csv' | 'auto' } = {},
): BlueprintParseResult => {
  const format =
    options.format === undefined || options.format === 'auto'
      ? content.includes('|')
        ? 'markdown'
        : 'csv'
      : options.format;

  const { rows, issues } = readTable(content, format);

  if (rows.length === 0) {
    return {
      success: false,
      error: '没有读到可用的蓝图行，请检查表头是否包含「业务凭证 / 凭证」列。',
      issues,
    };
  }

  const assembled = assembleDraftFromRows(rows, {
    modelName: options.modelName ?? '服务蓝图履约模型',
    source: 'blueprint',
    description:
      '由服务蓝图变种导入：阶段与活动落成凭证，合约前后的边界按合同行切分。',
    ...(options.contractContextLabel === undefined
      ? {}
      : { contractContextLabel: options.contractContextLabel }),
    ...(options.preContractContextLabel === undefined
      ? {}
      : { preContractContextLabel: options.preContractContextLabel }),
    ...(options.domainContextLabel === undefined
      ? {}
      : { domainContextLabel: options.domainContextLabel }),
  });

  return {
    success: true,
    draft: assembled.draft,
    issues: [
      ...issues,
      ...assembled.issues.map((message) => ({ message })),
    ],
  };
};

/** Reading a cell that holds several names, kept for callers that show it. */
export const partyNamesOf = splitNames;

export { inferContractSide, inferEvidenceKind };

export type { EvidenceKind };

import {
  createEmptyIngestionDraft,
  normalizeDraftEvidenceKind,
  type DraftContext,
  type DraftEvidence,
  type DraftFulfillmentPair,
  type DraftParticipant,
  type DraftRole,
  type DraftThing,
  type EvidenceKind,
  type IngestionDraft,
  type ProvenanceSnippet,
} from '@evidence-poc/evidence-schema';

import {
  evidenceIdPrefix,
  mandatoryTimeAttributes,
  uniqueId,
} from './draftSupport.js';

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
  /** 1-based row number in the source, or the header when the row is absent. */
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

export type BlueprintParseResult =
  | BlueprintParseSuccess
  | BlueprintParseFailure;

/** Keywords that mark a row as a breach repair rather than a main fulfilment. */
const BREACH_KEYWORDS = ['违约', '退款', '退货', '补偿', '赔付', '罚息', '违约赔付'];

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

const matchColumn = (
  header: string,
): BlueprintColumn | undefined =>
  BLUEPRINT_COLUMNS.find((column) =>
    COLUMN_ALIASES[column].some((alias) =>
      header.includes(normalizeHeader(alias)),
    ),
  );

const splitNames = (cell: string): string[] =>
  cell
    .split(/[,，、/;；]|和|与/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

interface BlueprintRow {
  line: number;
  stage: string;
  activity: string;
  evidence: string;
  kind?: EvidenceKind;
  rawKind?: string;
  parties: string[];
  thing?: string;
}

interface ParsedTable {
  rows: BlueprintRow[];
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
    format === 'csv' ? parseCsvLine(headerLine.text) : splitCells(headerLine.text);

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

  const rows: BlueprintRow[] = [];

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
      ...(rawKind.length === 0 ? {} : { rawKind }),
      parties: splitNames(columnValue(cells, 'party')),
      ...(thing.length === 0 ? {} : { thing }),
    });
  }

  return { rows, issues };
};

/** Reads the evidence kind out of the document's own name when no type column exists. */
export const inferEvidenceKind = (label: string): EvidenceKind => {
  const text = label.toLowerCase();

  if (/询价|征集|索取|招标|rfp|inquiry/.test(text)) return 'rfp';
  if (/报价|提案|方案|套餐|投标|proposal|quotation/.test(text)) return 'proposal';
  if (/合同|协议|签约|contract|agreement/.test(text)) return 'contract';
  if (/申请|请求|通知|要求|request/.test(text)) return 'fulfillment_request';
  if (/确认|到账|签收|验收|完成|confirmation/.test(text)) {
    return 'fulfillment_confirmation';
  }

  return 'other_evidence';
};

const isBreachLabel = (row: BlueprintRow): boolean =>
  BREACH_KEYWORDS.some(
    (keyword) => row.evidence.includes(keyword) || row.activity.includes(keyword),
  );

const snippetOf = (row: BlueprintRow): ProvenanceSnippet => ({
  text: [row.stage, row.activity, row.evidence].filter((part) => part.length > 0).join(' / '),
  locator: `第 ${row.line} 行`,
  source: 'blueprint',
});

/**
 * Reads the lecture's service-blueprint variant into an ingestion draft.
 *
 * The two structural readings the method insists on are made here rather than
 * left to the compiler: the contract row splits the pre-contract context from
 * the contract context, and a confirmation is paired with the request it
 * answers. A row that cannot be paired keeps its issue, so the review panel can
 * show a gap instead of the model quietly inventing a partner.
 *
 * The support-system column is accepted so a real workshop table parses, but it
 * is not compiled: a supporting system becomes a change point later, never an
 * evidence.
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

  const draft = createEmptyIngestionDraft({
    modelName: options.modelName ?? '服务蓝图履约模型',
    source: 'blueprint',
  });

  draft.description =
    '由服务蓝图变种导入：阶段与活动落成凭证，合约前后的边界按合同行切分。';

  const contractLabel = options.contractContextLabel ?? '合约上下文';
  const preContractLabel = options.preContractContextLabel ?? '合约前上下文';
  const domainLabel = options.domainContextLabel ?? '领域上下文';

  const contractRowIndex = rows.findIndex(
    (row) => (row.kind ?? inferEvidenceKind(row.evidence)) === 'contract',
  );

  const contractContext: DraftContext = {
    id: 'context.contract',
    label: contractLabel,
    kind: 'contract',
  };
  const preContractContext: DraftContext = {
    id: 'context.pre-contract',
    label: preContractLabel,
    kind: 'pre_contract',
    parentContextRef: contractContext.id,
  };
  const domainContext: DraftContext = { id: 'context.domain', label: domainLabel, kind: 'domain' };

  const takenEvidenceIds = new Set<string>();
  const takenRoleIds = new Set<string>();
  const takenPartyIds = new Set<string>();
  const takenThingIds = new Set<string>();

  const rolesByParty = new Map<string, DraftRole>();
  const partiesByLabel = new Map<string, DraftParticipant>();
  const thingsByLabel = new Map<string, DraftThing>();

  const contextFor = (row: BlueprintRow): DraftContext =>
    contractRowIndex >= 0 && rows.indexOf(row) < contractRowIndex
      ? preContractContext
      : contractContext;

  const roleFor = (partyLabel: string, contextRef: string): DraftRole => {
    const existing = rolesByParty.get(partyLabel);

    if (existing !== undefined) {
      return existing;
    }

    const participantId = uniqueId('party', partyLabel, takenPartyIds);
    const participant: DraftParticipant = {
      id: participantId,
      label: partyLabel,
      kind: 'party',
    };
    partiesByLabel.set(partyLabel, participant);
    draft.participants.push(participant);

    const role: DraftRole = {
      id: uniqueId('role', partyLabel, takenRoleIds),
      label: partyLabel,
      kind: 'party',
      contextRef,
      playedByParticipantRef: participantId,
    };
    rolesByParty.set(partyLabel, role);
    draft.roles.push(role);

    return role;
  };

  const evidencesByRow = new Map<BlueprintRow, DraftEvidence>();

  for (const row of rows) {
    const context = contextFor(row);
    const kind = row.kind ?? inferEvidenceKind(row.evidence);
    const id = uniqueId(evidenceIdPrefix(kind), row.evidence, takenEvidenceIds);

    const rowRoles = row.parties.map((partyLabel) =>
      roleFor(partyLabel, context.id),
    );

    const evidence: DraftEvidence = {
      id,
      label: row.evidence,
      kind,
      contextRef: context.id,
      attributes: [...mandatoryTimeAttributes(kind)],
      provenance: snippetOf(row),
      ...(kind === 'contract'
        ? {}
        : { responsibleRoleRef: rowRoles[0]?.id }),
    };

    evidencesByRow.set(row, evidence);
    draft.evidences.push(evidence);

    if (row.thing !== undefined) {
      let thing = thingsByLabel.get(row.thing);

      if (thing === undefined) {
        thing = {
          id: uniqueId('thing', row.thing, takenThingIds),
          label: row.thing,
          meaning: `${row.thing}（蓝图标的物）`,
          contextRef: domainContext.id,
        };
        thingsByLabel.set(row.thing, thing);
        draft.things.push(thing);
      }

      draft.relationships.push({
        id: `relation.${id}-refs-${thing.id}`,
        kind: 'references',
        sourceRef: id,
        targetRef: thing.id,
        label: `${row.evidence}针对${row.thing}`,
      });
    }
  }

  // A contract is a two-sided agreement; the role pair is what makes it one.
  const contractRow = contractRowIndex >= 0 ? rows[contractRowIndex] : undefined;
  const contractEvidence =
    contractRow === undefined ? undefined : evidencesByRow.get(contractRow);
  const contractRoles = contractRow?.parties ?? [];

  if (contractEvidence !== undefined) {
    const roleIds = contractRoles.map(
      (partyLabel) => rolesByParty.get(partyLabel)?.id,
    );

    if (roleIds.length === 2 && roleIds[0] !== undefined && roleIds[1] !== undefined) {
      contractEvidence.roleRefs = [roleIds[0], roleIds[1]];
    } else {
      issues.push({
        line: contractRow?.line,
        message:
          '合同行需要正好两位当事人；已用占位角色补齐，请在审核面板中改成真实双方。',
      });
      const placeholderA = roleFor('甲方', contractContext.id);
      const placeholderB = roleFor('乙方', contractContext.id);
      contractEvidence.roleRefs = [placeholderA.id, placeholderB.id];
    }
  }

  const pending = new Map<string, { row: BlueprintRow; evidence: DraftEvidence }[]>();
  const lastConfirmation = new Map<string, DraftEvidence>();
  const pairForRow = new Map<BlueprintRow, DraftFulfillmentPair>();

  for (const row of rows) {
    const evidence = evidencesByRow.get(row);

    if (evidence === undefined) {
      continue;
    }

    if (evidence.kind === 'fulfillment_request') {
      const queue = pending.get(evidence.contextRef) ?? [];
      queue.push({ row, evidence });
      pending.set(evidence.contextRef, queue);
      continue;
    }

    if (evidence.kind === 'fulfillment_confirmation') {
      const queue = pending.get(evidence.contextRef) ?? [];
      const queued = queue.shift();
      const request = queued?.evidence;

      if (request === undefined) {
        issues.push({
          line: row.line,
          message: `「${row.evidence}」没有对应的履约请求，请在审核面板中补上请求端。`,
        });
        lastConfirmation.set(evidence.contextRef, evidence);
        continue;
      }

      const pair: DraftFulfillmentPair = {
        id: `pair.${request.id}-${evidence.id}`,
        label: `${request.label} → ${evidence.label}`,
        requestRef: request.id,
        confirmationRef: evidence.id,
        description: row.activity,
        provenance: snippetOf(row),
      };
      draft.fulfillmentPairs.push(pair);
      pairForRow.set(row, pair);
      lastConfirmation.set(evidence.contextRef, evidence);
      continue;
    }

    if (evidence.kind === 'other_evidence') {
      // A proving document belongs to the confirmation it proves; without one
      // it is a standalone record, not a gap.
      const confirmation = lastConfirmation.get(evidence.contextRef);
      const pair = [...pairForRow.entries()].reverse().find(
        ([, candidate]) =>
          candidate.confirmationRef === confirmation?.id,
      )?.[1];

      if (pair !== undefined) {
        pair.proofRef = evidence.id;
      }
    }
  }

  // Anything left pending never got confirmed.
  for (const [contextRef, queue] of pending) {
    for (const { row, evidence } of queue) {
      issues.push({
        line: row.line,
        message: `「${evidence.label}」在${contextRef === preContractContext.id ? '合约前' : '合约'}上下文中缺少履约确认。`,
      });
    }
  }

  const breachPairs = draft.fulfillmentPairs.filter((pair) => {
    const row = [...pairForRow.entries()].find(([, candidate]) => candidate === pair)?.[0];

    return row !== undefined && isBreachLabel(row);
  });

  for (const pair of breachPairs) {
    const index = draft.fulfillmentPairs.indexOf(pair);
    const trigger = draft.fulfillmentPairs
      .slice(0, index)
      .reverse()
      .find((candidate) => !breachPairs.includes(candidate));

    if (trigger === undefined) {
      continue;
    }

    draft.breachCompensations.push({
      id: `breach.${pair.id}`,
      label: pair.label,
      triggeredByPairRef: trigger.id,
      compensationPairRef: pair.id,
      conditionDescription: pair.description ?? '未按约定完成履约时触发的补偿',
      ...(pair.provenance === undefined ? {} : { provenance: pair.provenance }),
    });
  }

  const hasPreContract = draft.evidences.some(
    (evidence) => evidence.contextRef === preContractContext.id,
  );

  draft.contexts.push(contractContext);

  if (hasPreContract) {
    draft.contexts.push(preContractContext);
  }

  if (draft.things.length > 0) {
    draft.contexts.push(domainContext);
  }

  const contractIds = draft.evidences
    .filter((evidence) => evidence.kind === 'contract')
    .map((evidence) => evidence.id);

  // Contract roots are what makes an FM context complete.
  const roots = contractIds.length > 0
    ? contractIds
    : draft.evidences
        .filter((evidence) => evidence.contextRef === contractContext.id)
        .map((evidence) => evidence.id);

  if (roots.length > 0) {
    contractContext.rootRefs = roots;
  }

  // Requests and confirmations cite the contract; a confirmation cites its request.
  for (const pair of draft.fulfillmentPairs) {
    const contractId = contractIds[0];

    if (contractId !== undefined) {
      draft.relationships.push({
        id: `relation.${pair.requestRef}-refs-contract`,
        kind: 'references',
        sourceRef: pair.requestRef,
        targetRef: contractId,
        label: '履约请求引用合约',
      });
    }

    draft.relationships.push({
      id: `relation.${pair.confirmationRef}-references-${pair.requestRef}`,
      kind: 'references',
      sourceRef: pair.confirmationRef,
      targetRef: pair.requestRef,
      label: '确认引用所属请求',
    });

    if (pair.proofRef !== undefined) {
      draft.relationships.push({
        id: `relation.${pair.proofRef}-references-${pair.confirmationRef}`,
        kind: 'references',
        sourceRef: pair.proofRef,
        targetRef: pair.confirmationRef,
        label: '凭证印证履约确认',
      });
    }
  }

  if (contractIds[0] !== undefined) {
    for (const evidence of draft.evidences) {
      if (evidence.kind !== 'rfp' && evidence.kind !== 'proposal') {
        continue;
      }

      draft.relationships.push({
        id: `relation.${evidence.id}-refs-contract`,
        kind: 'references',
        sourceRef: contractIds[0],
        targetRef: evidence.id,
        label: '合约引用合约前的凭证作为签订依据',
      });
    }
  }

  for (const role of draft.roles) {
    if (role.playedByParticipantRef === undefined) {
      continue;
    }

    draft.relationships.push({
      id: `relation.${role.playedByParticipantRef}-plays-${role.id}`,
      kind: 'plays_role',
      sourceRef: role.playedByParticipantRef,
      targetRef: role.id,
      label: `${role.label}扮演${role.label}角色`,
    });
  }

  return { success: true, draft, issues };
};

/** Reading a cell that holds several names, kept for callers that show it. */
export const partyNamesOf = splitNames;

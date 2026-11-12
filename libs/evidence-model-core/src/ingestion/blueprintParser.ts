import {
  createEmptyIngestionDraft,
  normalizeDraftEvidenceKind,
  type ContextKind,
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
 * those columns.
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

export type BlueprintParseResult = BlueprintParseSuccess | BlueprintParseFailure;

/** Keywords that mark a row as a breach repair rather than a main fulfilment. */
const BREACH_KEYWORDS = ['违约', '退款', '退货', '补偿', '赔付', '罚息'];

/** Job words a party name carries but the side of the contract does not. */
const ROLE_WORDS =
  /代表|专员|经理|主管|财务|采购员|销售|库管|顾问|负责人|人员|员|岗|部门/g;

/** Bits of a party name that reveal which side of the contract it is on. */
const FIRST_SIDE = /甲方|买方|采购|需求|客户|读者|发包|委托/;
const SECOND_SIDE = /乙方|卖方|供应|销售|平台|承运|承包|受托/;

const stripRoleWord = (label: string): string =>
  label.replaceAll(ROLE_WORDS, '').trim();

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

interface BlueprintRow {
  line: number;
  stage: string;
  activity: string;
  evidence: string;
  kind?: EvidenceKind;
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
    (keyword) =>
      row.evidence.includes(keyword) || row.activity.includes(keyword),
  );

const snippetOf = (row: BlueprintRow): ProvenanceSnippet => ({
  text: [row.stage, row.activity, row.evidence]
    .filter((part) => part.length > 0)
    .join(' / '),
  locator: `第 ${row.line} 行`,
  source: 'blueprint',
});

/**
 * Decides which side of the contract a party is on.
 *
 * A contract has exactly two Party Roles and everyone else plays one of them,
 * so a job title like 甲方财务 has to resolve to a side rather than become a
 * third role the contract cannot bind. Names are compared with the job word
 * stripped first, then by the vocabulary each side uses, so 甲方采购员 and
 * 甲方代表 both land on the same side.
 *
 * `undefined` means the table did not say; the caller reports that instead of
 * silently choosing a side.
 */
export const inferContractSide = (
  partyLabel: string,
  sideLabels: readonly string[],
): number | undefined => {
  const stripped = stripRoleWord(partyLabel);

  const exact = sideLabels.findIndex(
    (sideLabel, index) =>
      stripped.length > 0 &&
      (stripped.includes(stripRoleWord(sideLabel)) ||
        sideLabel.includes(stripped) ||
        partyLabel.includes(stripRoleWord(sideLabel))) &&
      stripRoleWord(sideLabel).length > 0 &&
      index < 2,
  );

  if (exact >= 0) {
    return exact;
  }

  if (FIRST_SIDE.test(partyLabel)) {
    return 0;
  }

  if (SECOND_SIDE.test(partyLabel)) {
    return 1;
  }

  return undefined;
};

/**
 * Reads the lecture's service-blueprint variant into an ingestion draft.
 *
 * Three structural readings the method insists on are made here rather than in
 * the compiler:
 *
 * - the contract row splits the pre-contract context from the contract context;
 * - a confirmation is paired with the request it answers;
 * - the contract keeps exactly two Party Roles, and every other party in the
 *   table is a participant that plays one of them, which is what lets a model
 *   stay valid while 甲方财务 and 乙方财务 sign different documents.
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

  const contractContext: DraftContext = {
    id: 'context.contract',
    label: options.contractContextLabel ?? '合约上下文',
    kind: 'contract',
  };
  const preContractContext: DraftContext = {
    id: 'context.pre-contract',
    label: options.preContractContextLabel ?? '合约前上下文',
    kind: 'pre_contract',
    parentContextRef: contractContext.id,
  };
  const domainContext: DraftContext = {
    id: 'context.domain',
    label: options.domainContextLabel ?? '领域上下文',
    kind: 'domain',
  };

  const contractRowIndex = rows.findIndex(
    (row) => (row.kind ?? inferEvidenceKind(row.evidence)) === 'contract',
  );
  const contractRow = contractRowIndex >= 0 ? rows[contractRowIndex] : undefined;

  const sideLabels: string[] =
    contractRow !== undefined && contractRow.parties.length >= 2
      ? contractRow.parties.slice(0, 2)
      : ['甲方', '乙方'];

  if (contractRow !== undefined && contractRow.parties.length !== 2) {
    issues.push({
      line: contractRow.line,
      message:
        '合同行需要正好两位当事人；已按「甲方 / 乙方」补齐角色，请在审核面板中改成真实双方。',
    });
  }

  const takenEvidenceIds = new Set<string>();
  const takenRoleIds = new Set<string>();
  const takenPartyIds = new Set<string>();
  const takenThingIds = new Set<string>();

  const sides: DraftRole[] = sideLabels.map((sideLabel) => ({
    id: uniqueId('role', sideLabel, takenRoleIds),
    label: sideLabel,
    kind: 'party',
    contextRef: contractContext.id,
  }));
  draft.roles.push(...sides);

  const partyByLabel = new Map<string, DraftParticipant>();
  const thingByLabel = new Map<string, DraftThing>();
  const played = new Set<string>();

  const partyFor = (partyLabel: string): DraftParticipant => {
    const existing = partyByLabel.get(partyLabel);

    if (existing !== undefined) {
      return existing;
    }

    const participant: DraftParticipant = {
      id: uniqueId('party', partyLabel, takenPartyIds),
      label: partyLabel,
      kind: 'party',
    };
    partyByLabel.set(partyLabel, participant);
    draft.participants.push(participant);

    return participant;
  };

  const sideOf = (partyLabel: string, line: number): DraftRole => {
    const index = inferContractSide(partyLabel, sideLabels);
    const role = sides[index ?? 0] ?? sides[0];
    const participant = partyFor(partyLabel);

    if (index === undefined) {
      issues.push({
        line,
        message: `无法判断当事人「${partyLabel}」属于合同哪一方，已暂时归到「${role.label}」。`,
      });
    }

    const relationshipId = `relation.${participant.id}-plays-${role.id}`;

    if (!played.has(relationshipId) && role !== undefined) {
      played.add(relationshipId);
      draft.relationships.push({
        id: relationshipId,
        kind: 'plays_role',
        sourceRef: participant.id,
        targetRef: role.id,
        label: `${partyLabel}扮演${role.label}的角色`,
      });
    }

    if (role === undefined) {
      throw new Error('合同缺少角色，无法继续解析。');
    }

    return role;
  };

  const contextFor = (row: BlueprintRow): DraftContext =>
    contractRowIndex >= 0 && rows.indexOf(row) < contractRowIndex
      ? preContractContext
      : contractContext;

  const evidencesByRow = new Map<BlueprintRow, DraftEvidence>();

  for (const row of rows) {
    const context = contextFor(row);
    const kind = row.kind ?? inferEvidenceKind(row.evidence);
    const id = uniqueId(evidenceIdPrefix(kind), row.evidence, takenEvidenceIds);

    const rowSides = row.parties.map((partyLabel) => sideOf(partyLabel, row.line));

    const evidence: DraftEvidence = {
      id,
      label: row.evidence,
      kind,
      contextRef: context.id,
      attributes: [...mandatoryTimeAttributes(kind)],
      provenance: snippetOf(row),
      ...(kind === 'contract'
        ? {
            roleRefs: sides
              .map((side) => side.id)
              .filter((ref): ref is string => ref !== undefined),
          }
        : { ...(rowSides[0] === undefined ? {} : { responsibleRoleRef: rowSides[0].id }) }),
    };

    evidencesByRow.set(row, evidence);
    draft.evidences.push(evidence);

    if (row.thing !== undefined && row.thing.length > 0) {
      let thing = thingByLabel.get(row.thing);

      if (thing === undefined) {
        thing = {
          id: uniqueId('thing', row.thing, takenThingIds),
          label: row.thing,
          meaning: `${row.thing}（蓝图标的物）`,
          contextRef: domainContext.id,
        };
        thingByLabel.set(row.thing, thing);
        draft.things.push(thing);
      }

      draft.relationships.push({
        id: `relation.${id}-references-${thing.id}`,
        kind: 'references',
        sourceRef: id,
        targetRef: thing.id,
        label: `${row.evidence}针对${row.thing}`,
      });
    }
  }

  const pending = new Map<string, { row: BlueprintRow; evidence: DraftEvidence }[]>();
  const lastConfirmation = new Map<string, DraftEvidence>();
  const pairByRow = new Map<BlueprintRow, DraftFulfillmentPair>();

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
      pairByRow.set(row, pair);
      lastConfirmation.set(evidence.contextRef, evidence);
      continue;
    }

    if (evidence.kind === 'other_evidence') {
      const confirmation = lastConfirmation.get(evidence.contextRef);
      const pair = [...pairByRow.entries()]
        .reverse()
        .find(([, candidate]) => candidate.confirmationRef === confirmation?.id)?.[1];

      if (pair !== undefined) {
        pair.proofRef = evidence.id;
      }
    }
  }

  for (const [contextRef, queue] of pending) {
    for (const { row, evidence } of queue) {
      issues.push({
        line: row.line,
        message: `「${evidence.label}」在${contextRef === preContractContext.id ? '合约前' : '合约'}上下文中缺少履约确认。`,
      });
    }
  }

  const breachPairs = new Set(
    [...pairByRow.entries()]
      .filter(([row]) => isBreachLabel(row))
      .map(([, pair]) => pair),
  );

  for (const pair of breachPairs) {
    const index = draft.fulfillmentPairs.indexOf(pair);
    const trigger = draft.fulfillmentPairs
      .slice(0, index)
      .reverse()
      .find((candidate) => !breachPairs.has(candidate));

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

  const evidencesIn = (contextId: string): DraftEvidence[] =>
    draft.evidences.filter((evidence) => evidence.contextRef === contextId);

  const preContractEvidences = evidencesIn(preContractContext.id);
  const contractEvidences = evidencesIn(contractContext.id);
  const contractId = contractEvidences.find(
    (evidence) => evidence.kind === 'contract',
  )?.id;

  // A context is only readable once it names its roots: the contract it holds,
  // the sourcing documents that led to it, and the things it is about.
  if (contractId !== undefined) {
    contractContext.rootRefs = [contractId];
  }

  if (preContractEvidences.length > 0) {
    preContractContext.rootRefs = preContractEvidences.map((evidence) => evidence.id);
    draft.contexts.push(preContractContext);
  }

  if (draft.things.length > 0) {
    domainContext.rootRefs = draft.things.map((thing) => thing.id);
    draft.contexts.push(domainContext);
  }

  draft.contexts.unshift(contractContext);

  for (const pair of draft.fulfillmentPairs) {
    if (contractId !== undefined) {
      draft.relationships.push({
        id: `relation.${pair.requestRef}-references-${contractId}`,
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

  if (contractId !== undefined) {
    for (const evidence of preContractEvidences) {
      draft.relationships.push({
        id: `relation.${contractId}-references-${evidence.id}`,
        kind: 'references',
        sourceRef: contractId,
        targetRef: evidence.id,
        label: '合约引用合约前的凭证作为签订依据',
      });
    }
  }

  return { success: true, draft, issues };
};

/** Reading a cell that holds several names, kept for callers that show it. */
export const partyNamesOf = splitNames;

/** Re-exported so a caller can label a context the same way the parser does. */
export type { ContextKind };

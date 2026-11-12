import {
  createEmptyIngestionDraft,
  isIngestionDraftShape,
  normalizeDraftEvidenceKind,
  type IngestionDraft,
  type IngestionSourceKind,
} from '@evidence-poc/evidence-schema';

export interface DraftJsonReadSuccess {
  success: true;
  draft: IngestionDraft;
  issues: readonly string[];
}

export interface DraftJsonReadFailure {
  success: false;
  error: string;
  issues: readonly string[];
}

export type DraftJsonReadResult = DraftJsonReadSuccess | DraftJsonReadFailure;

/** Cuts the JSON body out of a reply that may still carry prose or a fence. */
export const jsonBodyOf = (reply: string): string | undefined => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply)?.[1];

  if (fenced !== undefined) {
    return fenced.trim();
  }

  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');

  return start >= 0 && end > start ? reply.slice(start, end + 1) : undefined;
};

export const DRAFT_COLLECTIONS = [
  'contexts',
  'participants',
  'roles',
  'things',
  'evidences',
  'fulfillmentPairs',
  'breachCompensations',
  'relationships',
] as const;

type DraftCollection = (typeof DRAFT_COLLECTIONS)[number];

/** A missing collection means "nothing to say"; a wrong-typed one is a mistake. */
const collectionOf = (
  source: Record<string, unknown>,
  key: DraftCollection,
  issues: string[],
): unknown[] => {
  const value = source[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push(`${key} 不是数组，已忽略其内容。`);
    return [];
  }

  return value;
};

/**
 * Reads a draft out of a large model's reply.
 *
 * A reply is a suggestion, not a document: it may arrive inside a code fence,
 * omit an array it had nothing to say about, or use the short kind names the
 * prompt mentions. Those are repaired here and reported, because a draft the
 * review panel can open is worth more than a parse error. What is *not*
 * repaired is a kind nobody recognises — that would silently turn an unknown
 * business document into "other evidence".
 */
export const readIngestionDraftJson = (reply: string): DraftJsonReadResult => {
  const body = jsonBodyOf(reply);

  if (body === undefined) {
    return { success: false, error: '回复里没有找到 JSON 对象。', issues: [] };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      success: false,
      error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
      issues: [],
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { success: false, error: 'JSON 顶层不是对象。', issues: [] };
  }

  const issues: string[] = [];
  const source = parsed as Record<string, unknown>;

  const draft = createEmptyIngestionDraft({
    modelName:
      typeof source['modelName'] === 'string' && source['modelName'].trim().length > 0
        ? source['modelName'].trim()
        : '文本导入的履约模型',
    source: 'unknown',
  });

  if (typeof source['description'] === 'string') {
    draft.description = source['description'];
  }

  if (typeof source['source'] === 'string') {
    draft.source = source['source'] as IngestionSourceKind;
  }

  draft.contexts = collectionOf(
    source,
    'contexts',
    issues,
  ) as IngestionDraft['contexts'];
  draft.participants = collectionOf(
    source,
    'participants',
    issues,
  ) as IngestionDraft['participants'];
  draft.roles = collectionOf(source, 'roles', issues) as IngestionDraft['roles'];
  draft.things = collectionOf(
    source,
    'things',
    issues,
  ) as IngestionDraft['things'];
  draft.evidences = collectionOf(
    source,
    'evidences',
    issues,
  ) as IngestionDraft['evidences'];
  draft.fulfillmentPairs = collectionOf(
    source,
    'fulfillmentPairs',
    issues,
  ) as IngestionDraft['fulfillmentPairs'];
  draft.breachCompensations = collectionOf(
    source,
    'breachCompensations',
    issues,
  ) as IngestionDraft['breachCompensations'];
  draft.relationships = collectionOf(
    source,
    'relationships',
    issues,
  ) as IngestionDraft['relationships'];

  if (!isIngestionDraftShape(draft)) {
    return {
      success: false,
      error: '草稿结构不完整：每个元素都需要 id，且七个集合都必须存在。',
      issues,
    };
  }

  for (const evidence of draft.evidences) {
    const kind = normalizeDraftEvidenceKind(
      (evidence as { kind?: unknown }).kind,
    );

    if (kind === undefined) {
      issues.push(
        `凭证「${evidence.label}」的类型无法识别，已按「其它凭证」保留，请在审核面板中修改。`,
      );
      evidence.kind = 'other_evidence';
      continue;
    }

    evidence.kind = kind;
  }

  return { success: true, draft, issues };
};

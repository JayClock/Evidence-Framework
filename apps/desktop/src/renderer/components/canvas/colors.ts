import type { EntityAST } from '@evidence-poc/evidence-schema';

export const CATEGORY_COLORS = {
  evidence: '#b43656',
  participant: '#3d7553',
  role: '#8d6200',
} as const;

const EVIDENCE_KIND_LABELS: Record<string, string> = {
  rfp: '询价',
  proposal: '方案',
  contract: '合同',
  fulfillment_request: '履约请求',
  fulfillment_confirmation: '履约确认',
  other_evidence: '其他凭证',
};

const PARTICIPANT_KIND_LABELS: Record<string, string> = {
  party: '参与方',
  thing: '业务对象',
};

const ROLE_KIND_LABELS: Record<string, string> = {
  party: '合同角色',
  domain: '领域角色',
  third_party: '第三方角色',
  context: '上下文角色',
  evidence: '凭证角色',
};

const CONTEXT_KIND_LABELS: Record<string, string> = {
  contract: '合同上下文',
  pre_contract: '前期上下文',
  domain: '领域上下文',
};

export const entityKindLabel = (entity: EntityAST): string => {
  switch (entity.category) {
    case 'evidence':
      return EVIDENCE_KIND_LABELS[entity.kind] ?? entity.kind;
    case 'participant':
      return PARTICIPANT_KIND_LABELS[entity.kind] ?? entity.kind;
    case 'role':
      return ROLE_KIND_LABELS[entity.kind] ?? entity.kind;
    case 'context':
      return CONTEXT_KIND_LABELS[entity.kind] ?? entity.kind;
  }
};

export const entityColor = (entity: EntityAST): string =>
  entity.category === 'context' ? '#5b6472' : CATEGORY_COLORS[entity.category];

/** Evidence keeps square corners, roles and participants are rounded cards. */
export const entityRadius = (entity: EntityAST): number =>
  entity.category === 'evidence' ? 2 : 12;

/** Evidence time attributes already modeled, shown inside the node. */
export const TYPED_TIME_ATTRIBUTES = [
  'started_at',
  'expired_at',
  'signed_at',
  'confirmed_at',
  'created_at',
] as const;

/**
 * Short forms of the five business-time attributes.
 *
 * Used only as a fallback when a project modeled the attribute without a label.
 * The modeled label wins, because a workshop board has to say what the model
 * says; a long label is truncated by the card and revealed on hover.
 */
const TIME_SHORT_LABELS: Record<string, string> = {
  started_at: '开始',
  expired_at: '截止',
  signed_at: '签署',
  confirmed_at: '确认',
  created_at: '创建',
};

/**
 * The business time a card shows, in reading order.
 *
 * A window joins its two ends with an arrow (`开始 → 截止`) so the card states a
 * period; a single attribute stays one word because a signing or a confirmation
 * is an instant.
 */
export const formatBusinessTimeWindow = (
  names: readonly string[],
  labelOf: (name: string) => string | undefined,
): string | null => {
  if (names.length === 0) {
    return null;
  }

  return names
    .map((name) => labelOf(name) ?? TIME_SHORT_LABELS[name] ?? name)
    .join(' → ');
};

/** How a node states its relationship to the clock. */
export type NodeShape = 'interval' | 'moment' | 'card';

/**
 * Shape of one card: a period, an instant, or neither.
 *
 * RFP, Proposal and Fulfillment Request all require both `started_at` and
 * `expired_at`, so they are the same shape — a window. Contract and Fulfillment
 * Confirmation require one timestamp, so they are stamps. `other_evidence` needs
 * only `created_at` and carries no claim about obligations, so it stays a plain
 * note.
 */
export const entityShape = (entity: EntityAST): NodeShape => {
  if (entity.category !== 'evidence') {
    return 'card';
  }

  switch (entity.kind) {
    case 'rfp':
    case 'proposal':
    case 'fulfillment_request':
      return 'interval';
    case 'contract':
    case 'fulfillment_confirmation':
      return 'moment';
    case 'other_evidence':
      return 'card';
  }
};

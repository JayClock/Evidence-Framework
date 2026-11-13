import type { EntityAST } from '@evidence-poc/evidence-schema';
import {
  CONTEXT_KIND_LABELS,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_TIME_ATTRIBUTE_LABELS,
  PARTICIPANT_KIND_LABELS,
  ROLE_KIND_LABELS,
} from '@evidence-poc/evidence-schema';

export const CATEGORY_TOKENS = {
  context: { stroke: '#5b6472', fill: '#f8fafc', radius: 8, label: '业务边界' },
  evidence: {
    stroke: '#bd6b83',
    fill: '#fff1f5',
    radius: 2,
    label: '业务凭证',
  },
  participant: {
    stroke: '#78a788',
    fill: '#eff8f1',
    radius: 12,
    label: '参与者 / 标的',
  },
  role: { stroke: '#b79b56', fill: '#fff8e8', radius: 12, label: '业务角色' },
} as const;

export const EDGE_STYLES = {
  stroke: '#98a2b3',
  highlighted: '#2f5d8f',
  dashed: '4 4',
  width: 1.5,
  activeWidth: 2.2,
} as const;

export const CATEGORY_COLORS = {
  evidence: '#b43656',
  participant: '#3d7553',
  role: '#8d6200',
} as const;

/**
 * How a boundary crossing is drawn, by the reason it exists.
 *
 * One grey dashed line for every crossing hides the difference between a fact
 * another boundary already settled, a capability that can be replaced, and an
 * object two agreements happen to share. Those are the three places a reader of
 * the board has to act differently on.
 */
export const CROSS_CONTEXT_EDGE_STYLES = {
  moment_trace: {
    stroke: '#2f5d8f',
    dasharray: undefined,
    width: 1.8,
    label: '时刻追溯：引用另一个边界已落定的凭证',
  },
  role_inversion: {
    stroke: '#b79b56',
    dasharray: '6 4',
    width: 1.6,
    label: '能力插槽：外部凭证扮演本边界的角色',
  },
  shared_thing: {
    stroke: '#78a788',
    dasharray: '2 3',
    width: 1.4,
    label: '共享标的：两个边界围绕同一对象展开',
  },
  standard_cross: {
    stroke: EDGE_STYLES.stroke,
    dasharray: EDGE_STYLES.dashed,
    width: EDGE_STYLES.width,
    label: '其它跨边界引用',
  },
} as const;

/**
 * Kind of a node, in the words the model uses.
 *
 * The names come from the schema vocabulary so the canvas, the inspector and the
 * review page cannot label the same kind differently.
 */
export const entityKindLabel = (entity: EntityAST): string => {
  switch (entity.category) {
    case 'evidence':
      return EVIDENCE_KIND_LABELS[entity.kind];
    case 'participant':
      return PARTICIPANT_KIND_LABELS[entity.kind];
    case 'role':
      return ROLE_KIND_LABELS[entity.kind];
    case 'context':
      return CONTEXT_KIND_LABELS[entity.kind];
  }
};

export const entityColor = (entity: EntityAST): string =>
  entity.category === 'context' ? '#5b6472' : CATEGORY_COLORS[entity.category];

/** Evidence keeps square corners, roles and participants are rounded cards. */
export const entityRadius = (entity: EntityAST): number =>
  CATEGORY_TOKENS[entity.category].radius;

/**
 * Short form of a recognised business-time attribute name.
 *
 * Used only as a fallback when a project modeled the attribute without a label.
 * The modeled label wins, because a workshop board has to say what the model
 * says; a long label is truncated by the card and revealed on hover.
 */
const timeShortLabel = (name: string): string =>
  EVIDENCE_TIME_ATTRIBUTE_LABELS[
    name as keyof typeof EVIDENCE_TIME_ATTRIBUTE_LABELS
  ] ?? name;

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

  return names.map((name) => labelOf(name) ?? timeShortLabel(name)).join(' → ');
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

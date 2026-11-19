import type { EntityAST } from '@evidence-poc/evidence-schema';
import {
  CONTEXT_KIND_LABELS,
  EVIDENCE_KIND_LABELS,
  timeAttributeOf,
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

export const FLOW_EDGE_STYLES = {
  primary: { stroke: '#21835b', width: 2.5 },
  breach_compensation: { stroke: '#d97706', width: 2, dash: '6 4' },
  escalation: { stroke: '#7e22ce', width: 6 },
} as const;

export const CATEGORY_COLORS = {
  evidence: '#b43656',
  participant: '#3d7553',
  role: '#8d6200',
} as const;

/**
 * Kind of a node, in the words the model uses.
 *
 * The names come from the schema vocabulary so the canvas and the inspector
 * cannot label the same kind differently.
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
  entity.category === 'participant' && entity.domainRole
    ? 16
    : CATEGORY_TOKENS[entity.category].radius;

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

  return names.map((name) => labelOf(name) ?? name).join(' → ');
};

/** How a node states its relationship to the clock. */
export type NodeShape = 'interval' | 'moment' | 'capability' | 'card';

export const entityShape = (entity: EntityAST): NodeShape => {
  if (entity.category !== 'evidence') {
    return entity.category === 'participant' && entity.domainRole
      ? 'capability'
      : 'card';
  }

  switch (entity.kind) {
    case 'proposal':
      return timeAttributeOf(entity, 'occurrence') ? 'moment' : 'interval';
    case 'rfp':
    case 'fulfillment_request':
      return 'interval';
    case 'contract':
    case 'fulfillment_confirmation':
      return 'moment';
    case 'other_evidence':
      return 'card';
  }
};

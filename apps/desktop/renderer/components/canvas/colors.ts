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

import { z } from 'zod';
import { AttributeNameSchema, DomainIdSchema } from './id.js';
import { JsonObjectSchema } from './json.js';
import { ExampleTestASTSchema } from './example.js';
import { ProvenanceSnippetSchema } from './provenance.js';
import { ValueTypeSchema } from './values.js';
import {
  isVocabularyId,
  vocabularyField,
  vocabularyIds,
  vocabularyLabels,
} from '../vocabulary.js';

/** Business object categories of the pure graph fulfillment model. */
export const ENTITY_CATEGORY_DEFINITIONS = {
  evidence: { label: '凭证' },
  participant: { label: '参与方' },
  role: { label: '角色' },
  context: { label: '上下文' },
} as const satisfies Record<string, { readonly label: string }>;

export type EntityCategory = keyof typeof ENTITY_CATEGORY_DEFINITIONS;

export const ENTITY_CATEGORIES = vocabularyIds(ENTITY_CATEGORY_DEFINITIONS);
export const ENTITY_CATEGORY_LABELS = vocabularyLabels(
  ENTITY_CATEGORY_DEFINITIONS,
);
export const EntityCategorySchema = z.enum(
  ENTITY_CATEGORIES as unknown as [EntityCategory, ...EntityCategory[]],
);

export interface EvidenceKindDefinition {
  readonly label: string;
  readonly requiredTimeAttributes: readonly string[];
}

export const EVIDENCE_KIND_DEFINITIONS = {
  rfp: { label: '询价', requiredTimeAttributes: ['started_at', 'expired_at'] },
  proposal: {
    label: '方案',
    requiredTimeAttributes: ['started_at', 'expired_at'],
  },
  contract: { label: '合同', requiredTimeAttributes: ['signed_at'] },
  fulfillment_request: {
    label: '履约请求',
    requiredTimeAttributes: ['started_at', 'expired_at'],
  },
  fulfillment_confirmation: {
    label: '履约确认',
    requiredTimeAttributes: ['confirmed_at'],
  },
  other_evidence: {
    label: '其他凭证',
    requiredTimeAttributes: ['created_at'],
  },
} as const satisfies Record<string, EvidenceKindDefinition>;

export type EvidenceKind = keyof typeof EVIDENCE_KIND_DEFINITIONS;
export const EVIDENCE_KINDS = vocabularyIds(EVIDENCE_KIND_DEFINITIONS);
export const EVIDENCE_KIND_LABELS = vocabularyLabels(EVIDENCE_KIND_DEFINITIONS);
export const EvidenceKindSchema = z.enum(
  EVIDENCE_KINDS as unknown as [EvidenceKind, ...EvidenceKind[]],
);

export const REQUIRED_EVIDENCE_TIME_ATTRIBUTES: Record<
  EvidenceKind,
  readonly string[]
> = vocabularyField(EVIDENCE_KIND_DEFINITIONS, 'requiredTimeAttributes');

export const PARTICIPANT_KIND_DEFINITIONS = {
  party: { label: '参与方' },
  thing: { label: '业务对象' },
} as const satisfies Record<string, { readonly label: string }>;

export type ParticipantKind = keyof typeof PARTICIPANT_KIND_DEFINITIONS;
export const PARTICIPANT_KINDS = vocabularyIds(PARTICIPANT_KIND_DEFINITIONS);
export const PARTICIPANT_KIND_LABELS = vocabularyLabels(
  PARTICIPANT_KIND_DEFINITIONS,
);
export const ParticipantKindSchema = z.enum(
  PARTICIPANT_KINDS as unknown as [ParticipantKind, ...ParticipantKind[]],
);

export const DOMAIN_COMPONENT_ROLE_DEFINITIONS = {
  calculator: { label: '计算器' },
  checker: { label: '检查器' },
} as const satisfies Record<string, { readonly label: string }>;

export type DomainComponentRole =
  keyof typeof DOMAIN_COMPONENT_ROLE_DEFINITIONS;
export const DOMAIN_COMPONENT_ROLES = vocabularyIds(
  DOMAIN_COMPONENT_ROLE_DEFINITIONS,
);
export const DOMAIN_COMPONENT_ROLE_LABELS = vocabularyLabels(
  DOMAIN_COMPONENT_ROLE_DEFINITIONS,
);
export const DomainComponentRoleSchema = z.enum(
  DOMAIN_COMPONENT_ROLES as unknown as [
    DomainComponentRole,
    ...DomainComponentRole[],
  ],
);

export const ROLE_KIND_DEFINITIONS = {
  party: { label: '合同角色' },
  domain: { label: '领域角色' },
  third_party: { label: '第三方角色' },
  context: { label: '上下文角色' },
  evidence: { label: '凭证角色' },
} as const satisfies Record<string, { readonly label: string }>;

export type RoleKind = keyof typeof ROLE_KIND_DEFINITIONS;
export const ROLE_KINDS = vocabularyIds(ROLE_KIND_DEFINITIONS);
export const ROLE_KIND_LABELS = vocabularyLabels(ROLE_KIND_DEFINITIONS);
export const RoleKindSchema = z.enum(
  ROLE_KINDS as unknown as [RoleKind, ...RoleKind[]],
);

export const CONTEXT_KIND_DEFINITIONS = {
  contract: { label: '合同上下文' },
  pre_contract: { label: '前期上下文' },
  domain: { label: '领域上下文' },
} as const satisfies Record<string, { readonly label: string }>;

export type ContextKind = keyof typeof CONTEXT_KIND_DEFINITIONS;
export const CONTEXT_KINDS = vocabularyIds(CONTEXT_KIND_DEFINITIONS);
export const CONTEXT_KIND_LABELS = vocabularyLabels(CONTEXT_KIND_DEFINITIONS);
export const ContextKindSchema = z.enum(
  CONTEXT_KINDS as unknown as [ContextKind, ...ContextKind[]],
);

export const EVIDENCE_TIME_ATTRIBUTE_DEFINITIONS = {
  started_at: { label: '开始' },
  expired_at: { label: '截止' },
  signed_at: { label: '签署' },
  confirmed_at: { label: '确认' },
  created_at: { label: '创建' },
} as const satisfies Record<string, { readonly label: string }>;

export const EVIDENCE_TIME_ATTRIBUTE_NAMES = vocabularyIds(
  EVIDENCE_TIME_ATTRIBUTE_DEFINITIONS,
);
export const EVIDENCE_TIME_ATTRIBUTE_LABELS = vocabularyLabels(
  EVIDENCE_TIME_ATTRIBUTE_DEFINITIONS,
);

export const AttributeASTSchema = z
  .object({
    name: AttributeNameSchema,
    label: z.string().min(1),
    meaning: z.string().min(1),
    valueType: ValueTypeSchema.optional(),
    required: z.boolean().optional(),
    keyData: z.boolean().optional(),
    derivedByRuleRef: DomainIdSchema.optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();
export type AttributeAST = z.infer<typeof AttributeASTSchema>;

export const ModelExampleASTSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().min(1).optional(),
    value: JsonObjectSchema,
    test: ExampleTestASTSchema.optional(),
  })
  .strict();
export type ModelExampleAST = z.infer<typeof ModelExampleASTSchema>;

const EntityBaseSchema = z.object({
  type: z.literal('entity'),
  id: DomainIdSchema,
  label: z.string().min(1),
  aliases: z.array(z.string().min(1)).optional(),
  attributes: z.array(AttributeASTSchema).optional(),
  examples: z.array(ModelExampleASTSchema).optional(),
  notes: z.string().min(1).optional(),
  sourceSnippet: ProvenanceSnippetSchema.optional(),
});

/** Evidence objects carry a context and may own responsibility metadata. */
export const EvidenceEntitySchema = EntityBaseSchema.extend({
  category: z.literal('evidence'),
  kind: EvidenceKindSchema,
  contextRef: DomainIdSchema,
  responsibleRoleRef: DomainIdSchema.optional(),
  roleRefs: z.array(DomainIdSchema).optional(),
}).strict();

/** Participant parties are global; participant things belong to a domain context. */
export const ParticipantEntitySchema = EntityBaseSchema.extend({
  category: z.literal('participant'),
  kind: ParticipantKindSchema,
  contextRef: DomainIdSchema.optional(),
  domainRole: DomainComponentRoleSchema.optional(),
}).strict();

export const RoleEntitySchema = EntityBaseSchema.extend({
  category: z.literal('role'),
  kind: RoleKindSchema,
  contextRef: DomainIdSchema,
}).strict();

export const ContextEntitySchema = EntityBaseSchema.extend({
  category: z.literal('context'),
  kind: ContextKindSchema,
  parentContextRef: DomainIdSchema.optional(),
  rootRefs: z.array(DomainIdSchema).optional(),
}).strict();

/** One discriminated Zod union is the source of every entity AST type. */
export const EntityASTSchema = z.discriminatedUnion('category', [
  EvidenceEntitySchema,
  ParticipantEntitySchema,
  RoleEntitySchema,
  ContextEntitySchema,
]);

export type EvidenceEntityAST = z.infer<typeof EvidenceEntitySchema>;
export type ParticipantEntityAST = z.infer<typeof ParticipantEntitySchema>;
export type RoleEntityAST = z.infer<typeof RoleEntitySchema>;
export type ContextEntityAST = z.infer<typeof ContextEntitySchema>;
export type EntityAST = z.infer<typeof EntityASTSchema>;

/** Composite `category.kind` signature used by graph and validation checks. */
export type EntitySignature = `${EntityCategory}.${string}`;

export function entitySignature(entity: {
  category: EntityCategory;
  kind: string;
}): EntitySignature {
  return `${entity.category}.${entity.kind}`;
}

export function isEvidenceEntity(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return entity?.category === 'evidence';
}

export function isContractEntity(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return entity?.category === 'evidence' && entity.kind === 'contract';
}

export function isFulfillmentRequest(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return (
    entity?.category === 'evidence' && entity.kind === 'fulfillment_request'
  );
}

export function isFulfillmentConfirmation(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return (
    entity?.category === 'evidence' &&
    entity.kind === 'fulfillment_confirmation'
  );
}

export function isEvidenceMoment(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return (
    entity?.category === 'evidence' &&
    (entity.kind === 'fulfillment_confirmation' ||
      entity.kind === 'other_evidence')
  );
}

export function isRoleEntity(
  entity: EntityAST | undefined,
): entity is RoleEntityAST {
  return entity?.category === 'role';
}

export function isPartyRole(
  entity: EntityAST | undefined,
): entity is RoleEntityAST {
  return entity?.category === 'role' && entity.kind === 'party';
}

export function isParticipantEntity(
  entity: EntityAST | undefined,
): entity is ParticipantEntityAST {
  return entity?.category === 'participant';
}

export const isDomainComponentRole = (
  value: unknown,
): value is DomainComponentRole =>
  isVocabularyId(DOMAIN_COMPONENT_ROLE_DEFINITIONS, value);

export function isDomainComponent(
  entity: EntityAST | undefined,
): entity is ParticipantEntityAST & { domainRole: DomainComponentRole } {
  return (
    entity?.category === 'participant' &&
    entity.kind === 'thing' &&
    entity.domainRole !== undefined
  );
}

export function isContextEntity(
  entity: EntityAST | undefined,
): entity is ContextEntityAST {
  return entity?.category === 'context';
}

export function isContractContext(
  entity: EntityAST | undefined,
): entity is ContextEntityAST {
  return entity?.category === 'context' && entity.kind === 'contract';
}

/** Locates one attribute by name without normalising the source value. */
export function findAttribute(
  entity: EntityAST | undefined,
  attributeName: string,
): AttributeAST | undefined {
  return entity?.attributes?.find(
    (attribute) => attribute.name === attributeName,
  );
}

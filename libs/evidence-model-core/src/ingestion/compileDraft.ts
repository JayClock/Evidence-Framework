import {
  isDomainId,
  type AttributeAST,
  type ContextEntityAST,
  type DomainModelDocument,
  type EntityAST,
  type EvidenceEntityAST,
  type IngestionDraft,
  type ParticipantEntityAST,
  type RelationshipAST,
  type RoleEntityAST,
  type RuleAST,
  type ValueType,
} from '@evidence-poc/evidence-schema';

import { evidenceIdPrefix, uniqueId } from './draftSupport.js';

export interface CompileDraftOptions {
  /** Manifest id; must already satisfy the schema id pattern. */
  modelId: string;
  modelVersion?: string;
  description?: string;
}

export interface CompileIssue {
  /** Draft element the issue is about, when it is about one. */
  draftId?: string;
  message: string;
}

export interface CompileDraftResult {
  document: DomainModelDocument;
  /** Draft id to the entity id that was written, for the review panel. */
  writtenIds: Readonly<Record<string, string>>;
  /** Draft ids that could not be written; each has an issue explaining why. */
  droppedIds: readonly string[];
  issues: readonly CompileIssue[];
}

const DEFAULT_VERSION = '0.1.0';

const DEFAULT_COMPLETION_EXPRESSION =
  'confirmations.exists(c, c.confirmed_at >= request.started_at && c.confirmed_at <= request.expired_at)';

const idAllocator = () => {
  const taken = new Set<string>();

  return {
    /** Keeps a valid draft id, otherwise mints one from the label. */
    allocate(
      preferred: string | undefined,
      prefix: string,
      label: string,
    ): string {
      if (
        preferred !== undefined &&
        isDomainId(preferred) &&
        !taken.has(preferred)
      ) {
        taken.add(preferred);
        return preferred;
      }

      return uniqueId(prefix, label, taken);
    },
  };
};

const attributeOf = (
  draftAttribute: {
    name: string;
    label: string;
    meaning: string;
    valueType?: ValueType;
    required?: boolean;
    keyData?: boolean;
  },
): AttributeAST => ({
  name: draftAttribute.name,
  label: draftAttribute.label,
  meaning: draftAttribute.meaning,
  ...(draftAttribute.valueType === undefined
    ? {}
    : { valueType: draftAttribute.valueType }),
  ...(draftAttribute.required === undefined
    ? {}
    : { required: draftAttribute.required }),
  ...(draftAttribute.keyData === undefined
    ? {}
    : { keyData: draftAttribute.keyData }),
});

/**
 * Compiles an ingestion draft into a model the schema accepts.
 *
 * The compiler never repairs a gap by guessing: an evidence without a written
 * context, a contract without two roles or a context without a root is dropped
 * and reported, so `strictValidateDomainModel` stays the judge of what may be
 * saved. Dropping is deliberately transitive — losing a contract drops the
 * context it rooted, which drops the evidences that context owned — because a
 * half-kept context would validate while meaning nothing.
 */
export const compileIngestionDraft = (
  draft: IngestionDraft,
  options: CompileDraftOptions,
): CompileDraftResult => {
  const issues: CompileIssue[] = [];
  const droppedIds: string[] = [];
  const allocate = idAllocator();

  const contextIds = new Map<string, string>();
  const roleIds = new Map<string, string>();
  const partyIds = new Map<string, string>();
  const thingIds = new Map<string, string>();
  const evidenceIds = new Map<string, string>();
  const writtenIds: Record<string, string> = {};

  for (const context of draft.contexts) {
    contextIds.set(context.id, allocate.allocate(context.id, 'context', context.label));
  }

  for (const role of draft.roles) {
    roleIds.set(role.id, allocate.allocate(role.id, 'role', role.label));
  }

  for (const participant of draft.participants) {
    partyIds.set(
      participant.id,
      allocate.allocate(
        participant.id,
        participant.kind === 'thing' ? 'thing' : 'party',
        participant.label,
      ),
    );
  }

  for (const thing of draft.things) {
    thingIds.set(thing.id, allocate.allocate(thing.id, 'thing', thing.label));
  }

  for (const evidence of draft.evidences) {
    evidenceIds.set(
      evidence.id,
      allocate.allocate(evidence.id, evidenceIdPrefix(evidence.kind), evidence.label),
    );
  }

  // Writability is one fixpoint over four sets, because every one of them can
  // invalidate another: a contract roots its context, that context owns the
  // evidence, and every evidence names a role the contract must bind. Removing
  // from an optimistic start is monotone, so the loop always settles, and each
  // removal is reported once instead of leaving a dangling reference behind.
  const writableContext = new Set(draft.contexts.map((context) => context.id));
  const writableRole = new Set(draft.roles.map((role) => role.id));
  const writableThing = new Set([
    ...draft.things.map((thing) => thing.id),
    ...draft.participants
      .filter((participant) => participant.kind === 'thing')
      .map((participant) => participant.id),
  ]);
  const writableEvidence = new Set(
    draft.evidences.map((evidence) => evidence.id),
  );

  const dropped = new Set<string>();

  const drop = (draftId: string, message: string): void => {
    if (dropped.has(draftId)) {
      return;
    }

    dropped.add(draftId);
    droppedIds.push(draftId);
    issues.push({ draftId, message });
  };

  const rootsWritable = (context: (typeof draft.contexts)[number]): boolean => {
    const roots = context.rootRefs ?? [];

    return roots.length > 0 && roots.every((rootRef) =>
      context.kind === 'domain'
        ? writableThing.has(rootRef)
        : writableEvidence.has(rootRef),
    );
  };

  for (let pass = 0; pass < 8; pass += 1) {
    const before = dropped.size;

    for (const context of draft.contexts) {
      if (!writableContext.has(context.id)) {
        continue;
      }

      if (!rootsWritable(context)) {
        writableContext.delete(context.id);
        drop(
          context.id,
          `${context.kind === 'domain' ? '领域' : context.kind === 'pre_contract' ? '合约前' : '合约'}上下文「${context.label}」没有可追溯的根凭证，已跳过。`,
        );
        continue;
      }

      if (
        context.parentContextRef !== undefined &&
        !writableContext.has(context.parentContextRef)
      ) {
        writableContext.delete(context.id);
        drop(
          context.id,
          `上下文「${context.label}」赖以溯源的合约上下文没有落地，已跳过。`,
        );
      }
    }

    for (const role of draft.roles) {
      if (!writableRole.has(role.id)) {
        continue;
      }

      if (!writableContext.has(role.contextRef)) {
        writableRole.delete(role.id);
        drop(role.id, `角色「${role.label}」所在的上下文没有落地，角色已跳过。`);
      }
    }

    for (const thing of draft.things) {
      if (!writableThing.has(thing.id)) {
        continue;
      }

      if (
        thing.contextRef === undefined ||
        !writableContext.has(thing.contextRef)
      ) {
        writableThing.delete(thing.id);
        drop(thing.id, `标的物「${thing.label}」没有可落地的领域上下文，已跳过。`);
      }
    }

    for (const participant of draft.participants) {
      if (
        participant.kind !== 'thing' ||
        !writableThing.has(participant.id)
      ) {
        continue;
      }

      if (
        participant.contextRef === undefined ||
        !writableContext.has(participant.contextRef)
      ) {
        writableThing.delete(participant.id);
        drop(
          participant.id,
          `标的物「${participant.label}」没有可落地的领域上下文，已跳过。`,
        );
      }
    }

    for (const evidence of draft.evidences) {
      if (!writableEvidence.has(evidence.id)) {
        continue;
      }

      if (!writableContext.has(evidence.contextRef)) {
        writableEvidence.delete(evidence.id);
        drop(
          evidence.id,
          `凭证「${evidence.label}」的上下文没有落地，凭证已跳过。`,
        );
        continue;
      }

      if (evidence.kind === 'contract') {
        const playable = (evidence.roleRefs ?? []).filter((ref) =>
          writableRole.has(ref),
        );

        if (playable.length !== 2) {
          writableEvidence.delete(evidence.id);
          drop(
            evidence.id,
            `合同「${evidence.label}」需要正好两位已落地的当事人角色，实际 ${playable.length} 位，合同已跳过。`,
          );
        }

        continue;
      }

      if (
        evidence.responsibleRoleRef === undefined ||
        !writableRole.has(evidence.responsibleRoleRef)
      ) {
        writableEvidence.delete(evidence.id);
        drop(
          evidence.id,
          `凭证「${evidence.label}」缺少对凭证负责的当事人角色，凭证已跳过。`,
        );
      }
    }

    if (dropped.size === before) {
      break;
    }
  }

  const writableRoles = writableRole;

  const entities: EntityAST[] = [];

  for (const context of draft.contexts) {
    if (!writableContext.has(context.id)) {
      continue;
    }

    const id = contextIds.get(context.id);

    if (id === undefined) {
      continue;
    }

    const rootRefs = (context.rootRefs ?? [])
      .filter((rootRef) =>
        context.kind === 'domain'
          ? thingIds.has(rootRef)
          : writableEvidence.has(rootRef),
      )
      .map((rootRef) => evidenceIds.get(rootRef) ?? thingIds.get(rootRef))
      .filter((ref): ref is string => ref !== undefined);

    const parentContextRef =
      context.parentContextRef === undefined
        ? undefined
        : contextIds.get(context.parentContextRef);

    const entity: ContextEntityAST = {
      type: 'entity',
      id,
      category: 'context',
      kind: context.kind,
      label: context.label,
      ...(rootRefs.length === 0 ? {} : { rootRefs }),
      ...(parentContextRef === undefined ? {} : { parentContextRef }),
      ...(context.provenance === undefined
        ? {}
        : { sourceSnippet: context.provenance }),
    };

    entities.push(entity);
    writtenIds[context.id] = id;
  }

  for (const role of draft.roles) {
    if (!writableRoles.has(role.id)) {
      continue;
    }

    const id = roleIds.get(role.id);
    const contextRef = contextIds.get(role.contextRef);

    if (id === undefined || contextRef === undefined) {
      continue;
    }

    const entity: RoleEntityAST = {
      type: 'entity',
      id,
      category: 'role',
      kind: role.kind,
      label: role.label,
      contextRef,
      ...(role.provenance === undefined ? {} : { sourceSnippet: role.provenance }),
    };

    entities.push(entity);
    writtenIds[role.id] = id;
  }

  for (const participant of draft.participants) {
    const id = partyIds.get(participant.id);
    const contextRef =
      participant.contextRef === undefined
        ? undefined
        : contextIds.get(participant.contextRef);

    if (id === undefined) {
      continue;
    }

    if (participant.kind === 'thing' && contextRef === undefined) {
      issues.push({
        draftId: participant.id,
        message: `标的物「${participant.label}」没有可落地的领域上下文，已跳过。`,
      });
      droppedIds.push(participant.id);
      continue;
    }

    const entity: ParticipantEntityAST = {
      type: 'entity',
      id,
      category: 'participant',
      kind: participant.kind,
      label: participant.label,
      ...(contextRef === undefined ? {} : { contextRef }),
      ...(participant.provenance === undefined
        ? {}
        : { sourceSnippet: participant.provenance }),
    };

    entities.push(entity);
    writtenIds[participant.id] = id;
  }

  for (const thing of draft.things) {
    const id = thingIds.get(thing.id);
    const contextRef =
      thing.contextRef === undefined ? undefined : contextIds.get(thing.contextRef);

    if (id === undefined) {
      continue;
    }

    if (contextRef === undefined) {
      issues.push({
        draftId: thing.id,
        message: `标的物「${thing.label}」没有可落地的领域上下文，已跳过。`,
      });
      droppedIds.push(thing.id);
      continue;
    }

    const entity: ParticipantEntityAST = {
      type: 'entity',
      id,
      category: 'participant',
      kind: 'thing',
      label: thing.label,
      contextRef,
      ...(thing.meaning === undefined
        ? {}
        : {
            attributes: [
              {
                name: 'name',
                label: thing.label,
                meaning: thing.meaning,
                valueType: 'string',
              },
            ],
          }),
      ...(thing.provenance === undefined
        ? {}
        : { sourceSnippet: thing.provenance }),
    };

    entities.push(entity);
    writtenIds[thing.id] = id;
  }

  for (const evidence of draft.evidences) {
    if (!writableEvidence.has(evidence.id)) {
      continue;
    }

    const id = evidenceIds.get(evidence.id);
    const contextRef = contextIds.get(evidence.contextRef);

    if (id === undefined || contextRef === undefined) {
      continue;
    }

    const roleRefs =
      evidence.kind === 'contract'
        ? (evidence.roleRefs ?? [])
            .map((ref) => roleIds.get(ref))
            .filter((ref): ref is string => ref !== undefined)
        : undefined;

    const responsibleRoleRef =
      evidence.responsibleRoleRef === undefined
        ? undefined
        : roleIds.get(evidence.responsibleRoleRef);

    const entity: EvidenceEntityAST = {
      type: 'entity',
      id,
      category: 'evidence',
      kind: evidence.kind,
      label: evidence.label,
      contextRef,
      ...(responsibleRoleRef === undefined ? {} : { responsibleRoleRef }),
      ...(roleRefs === undefined ? {} : { roleRefs }),
      ...(evidence.attributes === undefined || evidence.attributes.length === 0
        ? {}
        : { attributes: evidence.attributes.map(attributeOf) }),
      ...(evidence.provenance === undefined
        ? {}
        : { sourceSnippet: evidence.provenance }),
    };

    entities.push(entity);
    writtenIds[evidence.id] = id;
  }

  const contextOf = new Map<string, string>();

  for (const evidence of draft.evidences) {
    const id = evidenceIds.get(evidence.id);
    const contextRef = contextIds.get(evidence.contextRef);

    if (id !== undefined && contextRef !== undefined) {
      contextOf.set(evidence.id, contextRef);
    }
  }

  const relationships: RelationshipAST[] = [];
  const relationshipIds = new Set<string>();

  // `uniqueId` already reserves the id it returns, so a duplicate check on the
  // allocated id would reject every relationship it just named.
  const seenDraftRelationshipIds = new Set<string>();

  for (const relationship of draft.relationships) {
    if (seenDraftRelationshipIds.has(relationship.id)) {
      continue;
    }

    seenDraftRelationshipIds.add(relationship.id);

    const sourceRef =
      evidenceIds.get(relationship.sourceRef) ??
      roleIds.get(relationship.sourceRef) ??
      partyIds.get(relationship.sourceRef) ??
      thingIds.get(relationship.sourceRef);
    const targetRef =
      evidenceIds.get(relationship.targetRef) ??
      roleIds.get(relationship.targetRef) ??
      partyIds.get(relationship.targetRef) ??
      thingIds.get(relationship.targetRef);

    if (sourceRef === undefined || targetRef === undefined) {
      issues.push({
        draftId: relationship.id,
        message: `关系「${relationship.label}」的端点没有落地，关系已跳过。`,
      });
      droppedIds.push(relationship.id);
      continue;
    }

    relationships.push({
      type: 'relationship',
      id: uniqueId('relation', relationship.id, relationshipIds),
      kind: relationship.kind,
      sourceRef,
      targetRef,
      label: relationship.label,
      ...(relationship.kind === 'references'
        ? {
            sourceCardinality: { min: 1, max: 1 },
            targetCardinality: { min: 1, max: 1 },
          }
        : {}),
    });
  }

  for (const role of draft.roles) {
    if (role.playedByParticipantRef === undefined) {
      continue;
    }

    const sourceRef = partyIds.get(role.playedByParticipantRef);
    const targetRef = roleIds.get(role.id);

    if (sourceRef === undefined || targetRef === undefined) {
      continue;
    }

    relationships.push({
      type: 'relationship',
      id: uniqueId('relation', `${sourceRef}-plays-${targetRef}`, relationshipIds),
      kind: 'plays_role',
      sourceRef,
      targetRef,
      label: `${role.label}扮演${role.label}角色`,
    });
  }

  const rules: RuleAST[] = [];
  const ruleIds = new Set<string>();

  for (const pair of draft.fulfillmentPairs) {
    const requestRef = evidenceIds.get(pair.requestRef);
    const confirmationRef = evidenceIds.get(pair.confirmationRef);

    if (
      requestRef === undefined ||
      confirmationRef === undefined ||
      !writableEvidence.has(pair.requestRef) ||
      !writableEvidence.has(pair.confirmationRef)
    ) {
      issues.push({
        draftId: pair.id,
        message: `履约对「${pair.label}」的请求端或确认端没有落地，完成规则已跳过。`,
      });
      droppedIds.push(pair.id);
      continue;
    }

    const contextRef = contextOf.get(pair.requestRef);

    if (contextRef === undefined || contextRef !== contextOf.get(pair.confirmationRef)) {
      issues.push({
        draftId: pair.id,
        message: `履约对「${pair.label}」的两端不在同一个合约上下文，完成规则已跳过。`,
      });
      droppedIds.push(pair.id);
      continue;
    }

    // The confirmation has to reference its request, otherwise the pair is a
    // rule over two unrelated documents.
    const hasReference = relationships.some(
      (relationship) =>
        relationship.sourceRef === confirmationRef &&
        relationship.targetRef === requestRef,
    );

    if (!hasReference) {
      relationships.push({
        type: 'relationship',
        id: uniqueId(
          'relation',
          `${confirmationRef}-references-${requestRef}`,
          relationshipIds,
        ),
        kind: 'references',
        sourceRef: confirmationRef,
        targetRef: requestRef,
        label: '确认引用所属请求',
        sourceCardinality: { min: 1, max: 1 },
        targetCardinality: { min: 1, max: 1 },
      });
    }

    const requestLabel =
      draft.evidences.find((evidence) => evidence.id === pair.requestRef)?.label ??
      requestRef;
    const confirmationLabel =
      draft.evidences.find((evidence) => evidence.id === pair.confirmationRef)
        ?.label ?? confirmationRef;

    const ruleId = uniqueId('rule', `${requestRef}-completed`, ruleIds);
    const rule: RuleAST = {
      type: 'rule',
      id: ruleId,
      kind: 'completion',
      label: `${requestLabel}完成判断`,
      description: `${confirmationLabel}在请求有效期内形成时，${requestLabel}履约完成。`,
      contextRef,
      bindings: {
        request: { ref: requestRef },
        confirmations: { ref: confirmationRef, cardinality: 'many' },
      },
      expression: DEFAULT_COMPLETION_EXPRESSION,
      resultType: 'bool',
    };

    rules.push(rule);
    writtenIds[pair.id] = ruleId;
  }

  const contractContextRefs = draft.contexts
    .filter(
      (context) => context.kind === 'contract' && writableContext.has(context.id),
    )
    .map((context) => contextIds.get(context.id))
    .filter((ref): ref is string => ref !== undefined);

  const document: DomainModelDocument = {
    manifest: {
      type: 'fm_model',
      schemaVersion: '5.0',
      id: options.modelId,
      name: draft.modelName,
      version: options.modelVersion ?? DEFAULT_VERSION,
      ruleLanguage: 'CEL',
      entryContextRefs: contractContextRefs,
      ...(options.description === undefined && draft.description === undefined
        ? {}
        : { description: options.description ?? draft.description }),
    },
    entities,
    relationships,
    rules,
  };

  return { document, writtenIds, droppedIds, issues };
};

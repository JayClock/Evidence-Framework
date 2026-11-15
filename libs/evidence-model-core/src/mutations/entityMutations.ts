import type {
  ContextEntityAST,
  DomainModelDocument,
  EntityAST,
  EvidenceEntityAST,
} from '@evidence-poc/evidence-schema';

import {
  assertEntityInsertable,
  fail,
  requireContext,
  requireEntity,
} from './guards.js';

/** Undefined removes an optional field rather than persisting a dirty key. */
export const assignFields = <T extends object>(
  target: T,
  patch: Readonly<Partial<T>>,
): void => {
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value === undefined) delete target[key];
    else target[key] = value;
  }
};

export const createEntityMutator = (
  draft: DomainModelDocument,
  entity: EntityAST,
  index = draft.entities.length,
): EntityAST => {
  assertEntityInsertable(draft, entity);
  draft.entities.splice(Math.max(0, index), 0, entity);
  return entity;
};

export const createContractMutator = (
  draft: DomainModelDocument,
  entity: EvidenceEntityAST,
): EvidenceEntityAST => {
  if (entity.kind !== 'contract')
    fail(
      'context.responsibility',
      'createContractMutator requires a Contract.',
    );
  const context = requireContext(draft, entity.contextRef);
  if ((context.rootRefs ?? []).length > 0) {
    fail(
      'context.rootMissing',
      `Contract Context '${context.id}' already declares rootRefs.`,
      context.rootRefs,
    );
  }
  createEntityMutator(draft, entity);
  replaceContextRootsMutator(draft, context.id, [entity.id]);
  return entity;
};

export const updateEntityMutator = (
  draft: DomainModelDocument,
  entityId: string,
  patch: Readonly<Partial<EntityAST>>,
): EntityAST => {
  const entity = requireEntity(draft, entityId);
  if ('id' in patch || 'category' in patch || 'type' in patch) {
    fail(
      'entity.immutableField',
      'id, type and category are immutable once the object is saved.',
    );
  }
  assignFields(entity, patch);
  return entity;
};

export interface DeleteEntityOptions {
  /** Responsibility references still block a cascading delete. */
  cascade?: boolean;
}

export interface EntityReference {
  id: string;
  description: string;
  removable: boolean;
}

/** All incoming references, including the responsibility edges cascade may not drop. */
export const entityReferences = (
  document: DomainModelDocument,
  entityId: string,
): EntityReference[] => {
  const references: EntityReference[] = [];
  for (const relationship of document.relationships) {
    if (
      relationship.sourceRef === entityId ||
      relationship.targetRef === entityId
    ) {
      references.push({
        id: relationship.id,
        description: `relationship '${relationship.id}'`,
        removable: true,
      });
    }
  }
  for (const entity of document.entities) {
    if (entity.id === entityId) continue;
    for (const field of [
      'contextRef',
      'parentContextRef',
      'responsibleRoleRef',
    ] as const) {
      if (
        field in entity &&
        entity[field as keyof typeof entity] === entityId
      ) {
        references.push({
          id: entity.id,
          description: `entity '${entity.id}' ${field}`,
          removable: false,
        });
      }
    }
    if ('roleRefs' in entity && entity.roleRefs?.includes(entityId)) {
      references.push({
        id: entity.id,
        description: `entity '${entity.id}' roleRefs`,
        removable: false,
      });
    }
    if ('rootRefs' in entity && entity.rootRefs?.includes(entityId)) {
      references.push({
        id: entity.id,
        description: `entity '${entity.id}' rootRefs`,
        removable: true,
      });
    }
  }
  for (const rule of document.rules) {
    if (
      rule.contextRef === entityId ||
      rule.target?.entityRef === entityId ||
      Object.values(rule.bindings).some(
        (binding) => 'ref' in binding && binding.ref === entityId,
      )
    ) {
      references.push({
        id: rule.id,
        description: `rule '${rule.id}'`,
        removable: true,
      });
    }
  }
  return references;
};

export const deleteEntityMutator = (
  draft: DomainModelDocument,
  entityId: string,
  options: DeleteEntityOptions = {},
): boolean => {
  requireEntity(draft, entityId);
  const references = entityReferences(draft, entityId);
  const remaining = options.cascade
    ? references.filter((reference) => !reference.removable)
    : references;
  if (remaining.length > 0) {
    fail(
      'entity.referenced',
      `entity '${entityId}' is still referenced.`,
      remaining.map((reference) => reference.description),
    );
  }
  const removedIds = new Set(references.map((reference) => reference.id));
  draft.entities.splice(
    draft.entities.findIndex((entity) => entity.id === entityId),
    1,
  );
  if (references.length > 0) {
    draft.relationships = draft.relationships.filter(
      (relationship) => !removedIds.has(relationship.id),
    );
    // Clear derivation owners as well as the rules that referenced the entity.
    for (const entity of draft.entities) {
      if ('rootRefs' in entity && entity.rootRefs?.includes(entityId)) {
        entity.rootRefs = entity.rootRefs.filter((ref) => ref !== entityId);
      }
      for (const attribute of entity.attributes ?? []) {
        if (
          attribute.derivedByRuleRef !== undefined &&
          removedIds.has(attribute.derivedByRuleRef)
        )
          delete attribute.derivedByRuleRef;
      }
    }
    draft.rules = draft.rules.filter((rule) => !removedIds.has(rule.id));
  }
  return true;
};

export const replaceContextRootsMutator = (
  draft: DomainModelDocument,
  contextId: string,
  rootRefs: readonly string[] | undefined,
): ContextEntityAST => {
  const context = requireContext(draft, contextId);
  for (const ref of rootRefs ?? []) requireEntity(draft, ref);
  if (rootRefs === undefined) delete context.rootRefs;
  else context.rootRefs = [...rootRefs];
  return context;
};

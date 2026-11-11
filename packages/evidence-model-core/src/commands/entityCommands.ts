import {
  type ContextEntityAST,
  type DomainModelDocument,
  type EntityAST,
  type EvidenceEntityAST,
} from '@evidence-poc/evidence-schema';

import {
  assertEntityInsertable,
  fail,
  requireContext,
  requireEntity,
} from './guards.js';
import { CommandSequence, ReplaceDocumentCommand } from './sequence.js';
import type { ModelCommand, ModelCommandOutcome } from './types.js';

const insertAt = <TItem>(
  items: readonly TItem[],
  item: TItem,
  index?: number,
): TItem[] => {
  if (index === undefined || index >= items.length) {
    return [...items, item];
  }

  return [...items.slice(0, index), item, ...items.slice(index)];
};

const withEntity = (
  document: DomainModelDocument,
  entity: EntityAST,
  index?: number,
): DomainModelDocument => ({
  ...document,
  entities: insertAt(document.entities, entity, index),
});

const withoutEntity = (
  document: DomainModelDocument,
  entityId: string,
): DomainModelDocument => ({
  ...document,
  entities: document.entities.filter((entity) => entity.id !== entityId),
});

const replaceEntity = (
  document: DomainModelDocument,
  entity: EntityAST,
): DomainModelDocument => ({
  ...document,
  entities: document.entities.map((candidate) =>
    candidate.id === entity.id ? entity : candidate,
  ),
});

export class CreateEntityCommand implements ModelCommand<EntityAST> {
  readonly type = 'create-entity';

  constructor(
    private readonly entity: EntityAST,
    private readonly index?: number,
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<EntityAST> {
    assertEntityInsertable(document, this.entity);

    return {
      document: withEntity(document, this.entity, this.index),
      inverse: new DeleteEntityCommand(this.entity.id, { cascade: true }),
      affectedIds: [this.entity.id],
      result: this.entity,
    };
  }
}

/**
 * Creates a Contract and binds it as the single root of its Contract Context.
 *
 * A Contract saved without a root listing fails static validation, so both
 * writes are one command and therefore one undo step.
 */
export class CreateContractCommand implements ModelCommand<EvidenceEntityAST> {
  readonly type = 'create-contract';

  constructor(private readonly entity: EvidenceEntityAST) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<EvidenceEntityAST> {
    if (this.entity.kind !== 'contract') {
      fail('context.responsibility', 'CreateContractCommand requires a Contract.');
    }

    const context = requireContext(document, this.entity.contextRef);
    const currentRoots = context.rootRefs ?? [];

    if (currentRoots.length > 0) {
      fail(
        'context.rootMissing',
        `Contract Context '${context.id}' already declares rootRefs.`,
        currentRoots,
      );
    }

    const created = new CreateEntityCommand(this.entity).apply(document);
    const linkRoot = new ReplaceContextRootsCommand(context.id, [
      this.entity.id,
    ]).apply(created.document);

    return {
      document: linkRoot.document,
      inverse: new CommandSequence([linkRoot.inverse, created.inverse]),
      affectedIds: [this.entity.id, context.id],
      result: this.entity,
    };
  }
}

export class UpdateEntityCommand implements ModelCommand<EntityAST> {
  readonly type = 'update-entity';

  constructor(
    private readonly entityId: string,
    private readonly patch: Readonly<Partial<EntityAST>>,
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<EntityAST> {
    const entity = requireEntity(document, this.entityId);

    if ('id' in this.patch || 'category' in this.patch || 'type' in this.patch) {
      fail(
        'entity.immutableField',
        'id, type and category are immutable once the object is saved.',
      );
    }

    const previous: Record<string, unknown> = {};
    const next = { ...entity } as unknown as Record<string, unknown>;

    for (const [key, value] of Object.entries(this.patch)) {
      previous[key] = (entity as unknown as Record<string, unknown>)[key];

      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }

    const updated = next as unknown as EntityAST;

    return {
      document: replaceEntity(document, updated),
      inverse: new UpdateEntityCommand(
        this.entityId,
        previous as Partial<EntityAST>,
      ),
      affectedIds: [this.entityId],
      result: updated,
    };
  }
}

export interface DeleteEntityOptions {
  /**
   * Also removes relationships, rules and `rootRefs` entries that would dangle.
   * Required responsibility fields still block the delete.
   */
  cascade?: boolean;
}

export interface EntityReference {
  /** Object that holds the reference. */
  id: string;
  description: string;
  /** True when cascade may drop the edge instead of refusing the delete. */
  removable: boolean;
}

/** Every place that points at an entity, split into edges and responsibility. */
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
    if (entity.id === entityId) {
      continue;
    }

    if ('contextRef' in entity && entity.contextRef === entityId) {
      references.push({
        id: entity.id,
        description: `entity '${entity.id}' contextRef`,
        removable: false,
      });
    }

    if ('parentContextRef' in entity && entity.parentContextRef === entityId) {
      references.push({
        id: entity.id,
        description: `entity '${entity.id}' parentContextRef`,
        removable: false,
      });
    }

    if (
      'responsibleRoleRef' in entity &&
      entity.responsibleRoleRef === entityId
    ) {
      references.push({
        id: entity.id,
        description: `entity '${entity.id}' responsibleRoleRef`,
        removable: false,
      });
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
    if (rule.contextRef === entityId) {
      references.push({
        id: rule.id,
        description: `rule '${rule.id}' contextRef`,
        removable: true,
      });
    }

    if (rule.target?.entityRef === entityId) {
      references.push({
        id: rule.id,
        description: `rule '${rule.id}' target`,
        removable: true,
      });
    }

    for (const [alias, binding] of Object.entries(rule.bindings)) {
      if ('ref' in binding && binding.ref === entityId) {
        references.push({
          id: rule.id,
          description: `rule '${rule.id}' binding '${alias}'`,
          removable: true,
        });
      }
    }
  }

  return references;
};

export class DeleteEntityCommand implements ModelCommand<boolean> {
  readonly type = 'delete-entity';

  constructor(
    private readonly entityId: string,
    private readonly options: DeleteEntityOptions = {},
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<boolean> {
    const entity = requireEntity(document, this.entityId);
    const references = entityReferences(document, this.entityId);
    const cascade = this.options.cascade === true;
    const remaining = cascade
      ? references.filter((reference) => !reference.removable)
      : references;

    if (remaining.length > 0) {
      fail(
        'entity.referenced',
        cascade
          ? `entity '${this.entityId}' still holds responsibility references.`
          : `entity '${this.entityId}' is still referenced.`,
        remaining.map((reference) => reference.description),
      );
    }

    if (references.length === 0) {
      return {
        document: withoutEntity(document, this.entityId),
        inverse: new CreateEntityCommand(
          entity,
          document.entities.findIndex((item) => item.id === this.entityId),
        ),
        affectedIds: [this.entityId],
        result: true,
      };
    }

    const removedIds = new Set(
      [...references.map((reference) => reference.id), this.entityId],
    );

    return {
      document: {
        ...document,
        entities: document.entities
          .filter((candidate) => candidate.id !== this.entityId)
          .map((candidate) => stripRootRefs(candidate, this.entityId)),
        relationships: document.relationships.filter(
          (relationship) => !removedIds.has(relationship.id),
        ),
        rules: document.rules.filter((rule) => !removedIds.has(rule.id)),
      },
      inverse: new ReplaceDocumentCommand(document),
      affectedIds: [...removedIds],
      result: true,
    };
  }
}

const stripRootRefs = (entity: EntityAST, removedId: string): EntityAST => {
  if (!('rootRefs' in entity) || entity.rootRefs === undefined) {
    return entity;
  }

  const rootRefs = entity.rootRefs.filter((ref) => ref !== removedId);

  return rootRefs.length === entity.rootRefs.length
    ? entity
    : { ...entity, rootRefs };
};

/** Replaces the `rootRefs` list of a Context, keeping order. */
export class ReplaceContextRootsCommand implements ModelCommand<ContextEntityAST> {
  readonly type = 'replace-context-roots';

  constructor(
    private readonly contextId: string,
    private readonly rootRefs: readonly string[] | undefined,
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<ContextEntityAST> {
    const context = requireContext(document, this.contextId);

    for (const ref of this.rootRefs ?? []) {
      requireEntity(document, ref);
    }

    const { rootRefs: _previous, ...rest } = context;
    const next: ContextEntityAST =
      this.rootRefs === undefined
        ? rest
        : { ...context, rootRefs: [...this.rootRefs] };

    return {
      document: replaceEntity(document, next),
      inverse: new ReplaceContextRootsCommand(this.contextId, context.rootRefs),
      affectedIds: [this.contextId, ...(this.rootRefs ?? [])],
      result: next,
    };
  }
}

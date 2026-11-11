import {
  type AttributeAST,
  type DomainModelDocument,
  type EntityAST,
  isAttributeName,
} from '@evidence-poc/evidence-schema';

import { UpdateEntityCommand } from './entityCommands.js';
import { fail, requireAttribute, requireEntity } from './guards.js';
import { DeleteRuleCommand } from './ruleCommands.js';
import { CommandSequence } from './sequence.js';
import type { ModelCommand, ModelCommandOutcome } from './types.js';

const withAttributes = (
  attributes: readonly AttributeAST[],
): Partial<EntityAST> =>
  (attributes.length === 0
    ? { attributes: undefined }
    : { attributes }) as Partial<EntityAST>;

const assertAttributeShape = (attribute: AttributeAST): void => {
  if (!isAttributeName(attribute.name)) {
    fail(
      'id.invalid',
      `attribute name '${attribute.name}' must use lower snake_case.`,
    );
  }

  if (attribute.label.trim() === '') {
    fail('attribute.notFound', 'attribute label must not be empty.');
  }

  if (attribute.meaning.trim() === '') {
    fail(
      'attribute.notFound',
      `attribute '${attribute.name}' must state who provides the value.`,
    );
  }
};

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

/**
 * Adds one attribute to an entity.
 *
 * Attribute names are the identity CEL expressions read, so a duplicate name is
 * rejected instead of silently shadowing the modeled field.
 */
export class AddAttributeCommand implements ModelCommand<AttributeAST> {
  readonly type = 'add-attribute';

  constructor(
    private readonly entityId: string,
    private readonly attribute: AttributeAST,
    private readonly index?: number,
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<AttributeAST> {
    const entity = requireEntity(document, this.entityId);
    const attributes = entity.attributes ?? [];

    assertAttributeShape(this.attribute);

    if (attributes.some((item) => item.name === this.attribute.name)) {
      fail(
        'attribute.duplicate',
        `entity '${entity.id}' already has attribute '${this.attribute.name}'.`,
      );
    }

    return {
      document: new UpdateEntityCommand(
        this.entityId,
        withAttributes(insertAt(attributes, this.attribute, this.index)),
      ).apply(document).document,
      inverse: new RemoveAttributeCommand(this.entityId, this.attribute.name),
      affectedIds: [this.entityId],
      result: this.attribute,
    };
  }
}

export interface RemoveAttributeOptions {
  /** Also deletes the derivation rule that writes the attribute. */
  cascade?: boolean;
}

/**
 * Removes one attribute.
 *
 * A derived attribute owns its rule, so removal either cascades or is refused;
 * leaving a rule that targets a missing attribute would break the saved tree.
 */
export class RemoveAttributeCommand implements ModelCommand<boolean> {
  readonly type = 'remove-attribute';

  constructor(
    private readonly entityId: string,
    private readonly attributeName: string,
    private readonly options: RemoveAttributeOptions = {},
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<boolean> {
    const entity = requireEntity(document, this.entityId);
    const attribute = requireAttribute(entity, this.attributeName);
    const ruleId = attribute.derivedByRuleRef;

    if (ruleId !== undefined && this.options.cascade !== true) {
      fail(
        'rule.referenced',
        `attribute '${entity.id}.${attribute.name}' is written by rule '${ruleId}'.`,
        [ruleId],
      );
    }

    if (ruleId !== undefined) {
      // The rule is deleted first so the attribute loses its owner before it
      // disappears; the sequence inverse restores both in one undo step.
      const sequence = new CommandSequence(
        [
          new DeleteRuleCommand(ruleId, { cascade: true }),
          new RemoveAttributeCommand(this.entityId, this.attributeName),
        ],
        this.type,
      );

      return sequence.apply(document) as unknown as ModelCommandOutcome<boolean>;
    }

    const attributes = entity.attributes ?? [];
    const index = attributes.findIndex((item) => item.name === this.attributeName);
    const remaining = attributes.filter((item) => item.name !== this.attributeName);

    return {
      document: new UpdateEntityCommand(
        this.entityId,
        withAttributes(remaining),
      ).apply(document).document,
      inverse: new AddAttributeCommand(
        this.entityId,
        attribute,
        index < 0 ? undefined : index,
      ),
      affectedIds: [this.entityId],
      result: true,
    };
  }
}

/**
 * Updates one attribute in place, refusing renames that would silently break CEL.
 *
 * Other rules read attributes by name inside their expression text, which cannot
 * be rewritten reliably here; the guard therefore keeps the identity stable while
 * a derivation rule still writes the attribute.
 */
export class UpdateAttributeCommand implements ModelCommand<AttributeAST> {
  readonly type = 'update-attribute';

  constructor(
    private readonly entityId: string,
    private readonly attributeName: string,
    private readonly patch: Readonly<Partial<AttributeAST>>,
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<AttributeAST> {
    const entity = requireEntity(document, this.entityId);
    const attribute = requireAttribute(entity, this.attributeName);
    const renamed =
      this.patch.name !== undefined && this.patch.name !== attribute.name;

    if (renamed) {
      const writers = document.rules.filter(
        (rule) =>
          rule.target?.entityRef === entity.id &&
          rule.target.attribute === attribute.name,
      );

      if (writers.length > 0) {
        fail(
          'rule.referenced',
          `attribute '${entity.id}.${attribute.name}' is written by a rule and cannot be renamed.`,
          writers.map((rule) => rule.id),
        );
      }

      if ((entity.attributes ?? []).some((item) => item.name === this.patch.name)) {
        fail(
          'attribute.duplicate',
          `entity '${entity.id}' already has attribute '${this.patch.name}'.`,
        );
      }
    }

    const merged = { ...attribute, ...this.patch } as AttributeAST;

    assertAttributeShape(merged);

    const next = (entity.attributes ?? []).map((item) =>
      item.name === this.attributeName ? merged : item,
    );
    const previous: Record<string, unknown> = {};

    for (const key of Object.keys(this.patch)) {
      previous[key] = (attribute as unknown as Record<string, unknown>)[key];
    }

    return {
      document: new UpdateEntityCommand(
        this.entityId,
        withAttributes(next),
      ).apply(document).document,
      inverse: new UpdateAttributeCommand(
        this.entityId,
        merged.name,
        previous as Partial<AttributeAST>,
      ),
      affectedIds: [this.entityId],
      result: merged,
    };
  }
}

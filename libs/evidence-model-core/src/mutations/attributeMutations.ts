import {
  type AttributeAST,
  type DomainModelDocument,
  isAttributeName,
} from '@evidence-poc/evidence-schema';
import { assignFields } from './entityMutations.js';
import { fail, requireAttribute, requireEntity } from './guards.js';
import { deleteRuleMutator } from './ruleMutations.js';

const assertAttributeShape = (attribute: AttributeAST): void => {
  if (!isAttributeName(attribute.name))
    fail(
      'id.invalid',
      `attribute name '${attribute.name}' must use lower snake_case.`,
    );
  if (attribute.label.trim() === '')
    fail('attribute.notFound', 'attribute label must not be empty.');
  if (attribute.meaning.trim() === '')
    fail(
      'attribute.notFound',
      `attribute '${attribute.name}' must state who provides the value.`,
    );
};

export const addAttributeMutator = (
  draft: DomainModelDocument,
  entityId: string,
  attribute: AttributeAST,
  index?: number,
): AttributeAST => {
  const entity = requireEntity(draft, entityId);
  assertAttributeShape(attribute);
  if (entity.attributes?.some((item) => item.name === attribute.name)) {
    fail(
      'attribute.duplicate',
      `entity '${entity.id}' already has attribute '${attribute.name}'.`,
    );
  }
  entity.attributes ??= [];
  entity.attributes.splice(
    Math.max(0, index ?? entity.attributes.length),
    0,
    attribute,
  );
  return attribute;
};

export interface RemoveAttributeOptions {
  cascade?: boolean;
}

export const removeAttributeMutator = (
  draft: DomainModelDocument,
  entityId: string,
  attributeName: string,
  options: RemoveAttributeOptions = {},
): boolean => {
  const entity = requireEntity(draft, entityId);
  const attribute = requireAttribute(entity, attributeName);
  if (attribute.derivedByRuleRef !== undefined) {
    if (!options.cascade)
      fail(
        'rule.referenced',
        `attribute '${entity.id}.${attribute.name}' is written by rule '${attribute.derivedByRuleRef}'.`,
        [attribute.derivedByRuleRef],
      );
    deleteRuleMutator(draft, attribute.derivedByRuleRef, { cascade: true });
  }
  entity.attributes?.splice(
    entity.attributes.findIndex((item) => item.name === attributeName),
    1,
  );
  if (entity.attributes?.length === 0) delete entity.attributes;
  return true;
};

export const updateAttributeMutator = (
  draft: DomainModelDocument,
  entityId: string,
  attributeName: string,
  patch: Readonly<Partial<AttributeAST>>,
): AttributeAST => {
  const entity = requireEntity(draft, entityId);
  const attribute = requireAttribute(entity, attributeName);
  if (patch.name !== undefined && patch.name !== attribute.name) {
    const writers = draft.rules.filter(
      (rule) =>
        rule.target?.entityRef === entity.id &&
        rule.target.attribute === attribute.name,
    );
    if (writers.length > 0)
      fail(
        'rule.referenced',
        `attribute '${entity.id}.${attribute.name}' is written by a rule and cannot be renamed.`,
        writers.map((rule) => rule.id),
      );
    if (entity.attributes?.some((item) => item.name === patch.name))
      fail(
        'attribute.duplicate',
        `entity '${entity.id}' already has attribute '${patch.name}'.`,
      );
  }
  assertAttributeShape({ ...attribute, ...patch });
  assignFields(attribute, patch);
  return attribute;
};

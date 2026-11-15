import {
  type DomainModelDocument,
  type RuleAST,
  isBooleanRuleKind,
  isContextEntity,
} from '@evidence-poc/evidence-schema';

import {
  assertId,
  assertUniqueId,
  fail,
  requireAttribute,
  requireEntity,
} from './guards.js';
import { assignFields } from './entityMutations.js';
/** Guards that keep a rule resolvable and consistent with its target. */
export const assertRuleInsertable = (
  document: DomainModelDocument,
  rule: RuleAST,
): void => {
  assertId(rule.id);
  assertUniqueId(document, rule.id);

  const context = requireEntity(document, rule.contextRef);

  if (!isContextEntity(context)) {
    fail(
      'rule.context',
      `rule contextRef '${rule.contextRef}' is not a Context.`,
    );
  }

  if (isBooleanRuleKind(rule.kind) && rule.resultType !== 'bool') {
    fail('rule.context', `${rule.kind} rules must return bool.`);
  }

  if (rule.kind !== 'derivation' && rule.target !== undefined) {
    fail('rule.context', 'only derivation rules may declare a target.');
  }

  if (rule.kind === 'derivation') {
    if (rule.target === undefined) {
      fail(
        'rule.context',
        'derivation rules must declare the target attribute.',
      );
    }

    const entity = requireEntity(document, rule.target.entityRef);
    const attribute = requireAttribute(entity, rule.target.attribute);

    if (attribute.derivedByRuleRef !== undefined) {
      fail(
        'derivation.alreadyBound',
        `'${entity.id}.${attribute.name}' is already derived by '${attribute.derivedByRuleRef}'.`,
      );
    }

    if (!('contextRef' in entity)) {
      fail(
        'rule.context',
        `entity '${entity.id}' has no Context, so it cannot own a derivation rule.`,
      );
    }

    if (entity.contextRef !== rule.contextRef) {
      fail(
        'rule.context',
        'derivation rule must belong to the target Entity Context.',
      );
    }
  }

  for (const [alias, binding] of Object.entries(rule.bindings)) {
    if (
      'ref' in binding &&
      !document.entities.some((e) => e.id === binding.ref)
    ) {
      fail(
        'rule.context',
        `binding '${alias}' references unknown id '${binding.ref}'.`,
      );
    }
  }
};

export const createRuleMutator = (
  draft: DomainModelDocument,
  rule: RuleAST,
  index = draft.rules.length,
): RuleAST => {
  assertRuleInsertable(draft, rule);
  draft.rules.splice(Math.max(0, index), 0, rule);
  return rule;
};

export const updateRuleMutator = (
  draft: DomainModelDocument,
  ruleId: string,
  patch: Readonly<Partial<RuleAST>>,
): RuleAST => {
  const rule = draft.rules.find((candidate) => candidate.id === ruleId);
  if (rule === undefined) fail('rule.notFound', `unknown rule '${ruleId}'.`);
  if (
    ['id', 'type', 'kind', 'contextRef', 'target'].some((key) => key in patch)
  ) {
    fail(
      'rule.context',
      'id, type, kind, contextRef and target are immutable once a rule is saved.',
    );
  }
  const next = { ...rule, ...patch };
  if (isBooleanRuleKind(next.kind) && next.resultType !== 'bool')
    fail('rule.context', `${next.kind} rules must return bool.`);
  assignFields(rule, patch);
  return rule;
};

export interface DeleteRuleOptions {
  cascade?: boolean;
}

export const deleteRuleMutator = (
  draft: DomainModelDocument,
  ruleId: string,
  options: DeleteRuleOptions = {},
): boolean => {
  const index = draft.rules.findIndex((rule) => rule.id === ruleId);
  if (index === -1) fail('rule.notFound', `unknown rule '${ruleId}'.`);
  const holders = draft.entities.filter((entity) =>
    entity.attributes?.some(
      (attribute) => attribute.derivedByRuleRef === ruleId,
    ),
  );
  if (holders.length > 0 && !options.cascade)
    fail(
      'rule.referenced',
      `rule '${ruleId}' is still the derivation of an attribute.`,
      holders.map((entity) => entity.id),
    );
  for (const entity of holders) {
    for (const attribute of entity.attributes ?? []) {
      if (attribute.derivedByRuleRef === ruleId)
        delete attribute.derivedByRuleRef;
    }
  }
  draft.rules.splice(index, 1);
  return true;
};

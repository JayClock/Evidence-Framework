import {
  type DomainModelDocument,
  type EntityAST,
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
import { ReplaceDocumentCommand } from './sequence.js';
import type { ModelCommand, ModelCommandOutcome } from './types.js';

const withRule = (
  document: DomainModelDocument,
  rule: RuleAST,
  index?: number,
): DomainModelDocument => {
  const rules = [...document.rules];

  if (index === undefined || index >= rules.length) {
    rules.push(rule);
  } else {
    rules.splice(index, 0, rule);
  }

  return { ...document, rules };
};

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

export class CreateRuleCommand implements ModelCommand<RuleAST> {
  readonly type = 'create-rule';

  constructor(
    private readonly rule: RuleAST,
    private readonly index?: number,
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<RuleAST> {
    assertRuleInsertable(document, this.rule);

    return {
      document: withRule(document, this.rule, this.index),
      inverse: new DeleteRuleCommand(this.rule.id, { cascade: true }),
      affectedIds: [this.rule.id],
      result: this.rule,
    };
  }
}

/**
 * Edits the parts of a rule a modeler may change after it is saved.
 *
 * Identity, kind, Context and the derivation target stay immutable: changing
 * them would silently repoint the attribute that reads the rule.
 */
export class UpdateRuleCommand implements ModelCommand<RuleAST> {
  readonly type = 'update-rule';

  constructor(
    private readonly ruleId: string,
    private readonly patch: Readonly<Partial<RuleAST>>,
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<RuleAST> {
    const rule = document.rules.find(
      (candidate) => candidate.id === this.ruleId,
    );

    if (rule === undefined) {
      fail('rule.notFound', `unknown rule '${this.ruleId}'.`);
    }

    const {
      id: _id,
      type: _type,
      kind: _kind,
      contextRef: _contextRef,
      target: _target,
      ...patch
    } = this.patch;

    if (
      this.patch.id !== undefined ||
      this.patch.type !== undefined ||
      this.patch.kind !== undefined ||
      this.patch.contextRef !== undefined ||
      this.patch.target !== undefined
    ) {
      fail(
        'rule.context',
        'id, type, kind, contextRef and target are immutable once a rule is saved.',
      );
    }

    const next: RuleAST = { ...rule, ...patch };

    if (isBooleanRuleKind(next.kind) && next.resultType !== 'bool') {
      fail('rule.context', `${next.kind} rules must return bool.`);
    }

    const previous: Record<string, unknown> = {};

    for (const key of Object.keys(patch)) {
      previous[key] = (rule as unknown as Record<string, unknown>)[key];
    }

    return {
      document: {
        ...document,
        rules: document.rules.map((candidate) =>
          candidate.id === this.ruleId ? next : candidate,
        ),
      },
      inverse: new UpdateRuleCommand(this.ruleId, previous as Partial<RuleAST>),
      affectedIds: [this.ruleId],
      result: next,
    };
  }
}

export interface DeleteRuleOptions {
  /** Also clears `derivedByRuleRef` from the attribute the rule writes. */
  cascade?: boolean;
}

export class DeleteRuleCommand implements ModelCommand<boolean> {
  readonly type = 'delete-rule';

  constructor(
    private readonly ruleId: string,
    private readonly options: DeleteRuleOptions = {},
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<boolean> {
    const rule = document.rules.find(
      (candidate) => candidate.id === this.ruleId,
    );

    if (rule === undefined) {
      fail('rule.notFound', `unknown rule '${this.ruleId}'.`);
    }

    const holders: EntityAST[] = document.entities.filter((entity) =>
      entity.attributes?.some(
        (attribute) => attribute.derivedByRuleRef === this.ruleId,
      ),
    );

    if (holders.length > 0 && this.options.cascade !== true) {
      fail(
        'rule.referenced',
        `rule '${this.ruleId}' is still the derivation of an attribute.`,
        holders.map((entity) => entity.id),
      );
    }

    if (holders.length === 0) {
      return {
        document: {
          ...document,
          rules: document.rules.filter(
            (candidate) => candidate.id !== this.ruleId,
          ),
        },
        inverse: new CreateRuleCommand(
          rule,
          document.rules.findIndex((candidate) => candidate.id === this.ruleId),
        ),
        affectedIds: [this.ruleId],
        result: true,
      };
    }

    return {
      document: {
        ...document,
        entities: document.entities.map((entity) =>
          entity.attributes === undefined
            ? entity
            : {
                ...entity,
                attributes: entity.attributes.map((attribute) => {
                  if (attribute.derivedByRuleRef !== this.ruleId) {
                    return attribute;
                  }

                  const { derivedByRuleRef: _removed, ...rest } = attribute;

                  return rest;
                }),
              },
        ),
        rules: document.rules.filter(
          (candidate) => candidate.id !== this.ruleId,
        ),
      },
      inverse: new ReplaceDocumentCommand(document),
      affectedIds: [this.ruleId, ...holders.map((entity) => entity.id)],
      result: true,
    };
  }
}

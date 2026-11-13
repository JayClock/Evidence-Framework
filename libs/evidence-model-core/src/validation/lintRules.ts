import {
  isDomainComponent,
  type DomainModelDocument,
  type EntityAST,
} from '@evidence-poc/evidence-schema';

/**
 * Non-blocking modelling advice.
 *
 * An advisory never invalidates a model: it points at something that reads as a
 * shortcut in a board a business person has to review. The check report keeps
 * them apart from `errors` so a consistent model can still carry advice.
 */
export type ModelAdvisoryCode = 'ROLE_DOMAIN_NAME_NOT_ANTHROPOMORPHIC';

export interface ModelAdvisory {
  code: ModelAdvisoryCode;
  /** Object the advice is about. */
  entityId: string;
  message: string;
  /** A name shape the modeler can adopt without losing meaning. */
  suggestion: string;
}

/**
 * Endings that make a domain component read as a thing that acts.
 *
 * A domain component is not a table or a function name: it is the neutral
 * participant that prices, checks or judges on behalf of the contract. Naming it
 * after the work (`计价员`, `资格检查器`) keeps the capability a change point a
 * contract can depend on, instead of an algorithm copied into the contract.
 */
const ANTHROPOMORPHIC_SUFFIXES: readonly string[] = [
  '员',
  '器',
  '师',
  '官',
  '者',
  '专员',
  '计算器',
  '检查器',
  '判定器',
  '规则器',
  'calculator',
  'checker',
  'evaluator',
  'inspector',
  'validator',
  'assessor',
  'resolver',
  'pricer',
  'engine',
];

/**
 * Trailing words that name the work instead of the participant doing it.
 *
 * The replacement keeps the business noun and swaps the implementation word for
 * the shape of component the contract can depend on, so the suggestion reads as
 * a rename rather than a rewrite.
 */
const IMPLEMENTATION_SUFFIXES: readonly {
  suffix: string;
  replacement: string;
}[] = [
  { suffix: '算法', replacement: '计算器' },
  { suffix: '计算', replacement: '计算器' },
  { suffix: '逻辑', replacement: '规则器' },
  { suffix: '判定', replacement: '判定器' },
  { suffix: '校验', replacement: '检查器' },
  { suffix: '核算', replacement: '核算员' },
];

/** The noun a component name is built on, with any existing suffix removed. */
const stemOf = (label: string): string => {
  const trimmed = label.trim();
  const suffix = ANTHROPOMORPHIC_SUFFIXES.find(
    (candidate) => candidate.length < trimmed.length && trimmed.endsWith(candidate),
  );

  return suffix === undefined ? trimmed : trimmed.slice(0, -suffix.length);
};

/** A rename that keeps the business noun and fixes only the tail. */
const suggestionFor = (label: string): string => {
  const trimmed = label.trim();
  const implementation = IMPLEMENTATION_SUFFIXES.find((candidate) =>
    trimmed.endsWith(candidate.suffix),
  );

  if (implementation !== undefined) {
    return `${trimmed.slice(0, -implementation.suffix.length)}${implementation.replacement}`;
  }

  const stem = stemOf(trimmed);

  return stem === '' ? `${trimmed}器` : `${stem}器`;
};

/**
 * A domain component, or the role that abstracts one.
 *
 * Both shapes appear in real models: a `role.domain` abstracts the capability,
 * and a `participant.thing` with a `domainRole` is the component itself.
 */
const isNamedActor = (entity: EntityAST): boolean =>
  isDomainComponent(entity) ||
  (entity.category === 'role' && entity.kind === 'domain');

/**
 * Reports domain components whose name states the work instead of the actor.
 *
 * `折扣算法` and `价格计算` describe an implementation, and an implementation
 * cannot be swapped by another contract. Renaming them to `折扣计算器` or
 * `价格计算器` is the whole advice; nothing else in the model has to change.
 */
export const auditDomainComponentNaming = (
  model: DomainModelDocument,
): ModelAdvisory[] =>
  model.entities.filter(isNamedActor).flatMap((entity) => {
    const label = entity.label.trim();
    const lowerCase = label.toLowerCase();
    const named = ANTHROPOMORPHIC_SUFFIXES.some(
      (suffix) =>
        label.endsWith(suffix) || lowerCase.endsWith(suffix.toLowerCase()),
    );

    if (named) {
      return [];
    }

    const suggestion = suggestionFor(label);

    return [
      {
        code: 'ROLE_DOMAIN_NAME_NOT_ANTHROPOMORPHIC' as const,
        entityId: entity.id,
        message: `领域组件「${label}」建议改成能承担动作的名字（如「${suggestion}」），让它是合同可以依赖的能力，而不是一段算法。`,
        suggestion,
      },
    ];
  });

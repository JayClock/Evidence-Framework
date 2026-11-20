import {
  createDomainGraph,
  evaluateRuleOnExample,
  validateTypedValue,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  compactCanonicalJson,
  type RuleAST,
} from '@evidence-poc/evidence-schema';

import {
  WHAT_IF_EXPLANATION_PROMPT,
  WHAT_IF_EXTRACTION_PROMPT,
} from './prompts.js';
import {
  HypothesisSchema,
  ImpactExplanationSchema,
  responseObject,
} from './responseSchemas.js';
import { createStoryAgent } from './storyAgent.js';
import type {
  StoryAgent,
  WhatIfInput,
  WhatIfResult,
  WhatIfRuleOutcome,
} from './types.js';

export interface WhatIfSimulatorOptions {
  readonly agent?: StoryAgent;
}

type DerivationRule = RuleAST & { target: NonNullable<RuleAST['target']> };

const exampleRef = (step: FlowStepTrace): string =>
  `${step.entityId}#${step.exampleLabel}`;

/**
 * A transient model-rule sandbox, not an execution or backend-acceptance claim.
 * The agent extracts inputs and explains decisions; native CEL alone decides.
 */
export async function simulateWhatIf(
  input: WhatIfInput,
  options: WhatIfSimulatorOptions = {},
): Promise<WhatIfResult> {
  // Snapshot before the first await: editor changes must not mix model revisions.
  const {
    model,
    flow,
    currentStepSequence,
    hypothesisQuestion,
    ruleId,
    hypothesis: suppliedHypothesis,
  } = structuredClone(input);
  const selected = flow.steps.filter(
    (step) => step.sequence === currentStepSequence,
  );
  const current = selected[0];
  if (selected.length !== 1 || current === undefined) {
    throw new Error(
      `What-If requires one current step at sequence ${currentStepSequence}.`,
    );
  }
  const entity = model.entities.find((item) => item.id === current.entityId);
  if (entity === undefined)
    throw new Error(`Unknown current entity '${current.entityId}'.`);

  const stepsByRef = new Map<string, FlowStepTrace>();
  const aliases = new Map<string, Set<FlowStepTrace>>();
  for (const step of flow.steps) {
    const ref = exampleRef(step);
    if (stepsByRef.has(ref)) throw new Error(`Ambiguous example '${ref}'.`);
    stepsByRef.set(ref, step);
    for (const value of [step.values.id, step.values.ref]) {
      if (typeof value !== 'string' || value.length === 0) continue;
      const matches = aliases.get(value) ?? new Set<FlowStepTrace>();
      matches.add(step);
      aliases.set(value, matches);
    }
  }
  const resolveDependency = (ref: string): FlowStepTrace => {
    const exact = stepsByRef.get(ref);
    if (exact !== undefined) return exact;
    const candidates = [...(aliases.get(ref) ?? [])];
    if (candidates.length > 1)
      throw new Error(`Ambiguous dependency '${ref}'.`);
    const source = candidates[0];
    if (source === undefined) throw new Error(`Missing dependency '${ref}'.`);
    return source;
  };
  const ancestors = (step: FlowStepTrace): FlowStepTrace[] => {
    const found = new Map<string, FlowStepTrace>();
    const visit = (consumer: FlowStepTrace): void => {
      for (const ref of consumer.basedOn) {
        const source = resolveDependency(ref);
        if (source.sequence >= consumer.sequence) {
          throw new Error(
            `Dependency '${ref}' must precede '${exampleRef(consumer)}'.`,
          );
        }
        const sourceRef = exampleRef(source);
        if (!found.has(sourceRef)) {
          found.set(sourceRef, source);
          visit(source);
        }
      }
    };
    visit(step);
    return [...found.values()].sort((a, b) => a.sequence - b.sequence);
  };
  const upstream = ancestors(current);
  const related = new Set([current.entityId]);
  for (const pair of createDomainGraph(model).fulfillmentPairs()) {
    if (pair.confirmations.some(({ id }) => id === current.entityId)) {
      related.add(pair.request.id);
    }
  }
  const rules = model.rules
    .filter(
      (rule) =>
        (rule.kind === 'completion' || rule.kind === 'breach') &&
        (ruleId === undefined || rule.id === ruleId) &&
        Object.values(rule.bindings).some(
          (binding) => 'ref' in binding && related.has(binding.ref),
        ),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (rules.length === 0)
    throw new Error(
      'No relevant completion/breach rule is modeled for this step.',
    );

  const isDerived = (name: string): boolean =>
    entity.attributes?.find((attribute) => attribute.name === name)
      ?.derivedByRuleRef !== undefined ||
    model.rules.some(
      (rule) =>
        rule.kind === 'derivation' &&
        rule.target?.entityRef === entity.id &&
        rule.target.attribute === name,
    );
  const inputAttributes = (entity.attributes ?? []).filter(
    ({ name }) => !isDerived(name),
  );
  const agent = options.agent ?? createStoryAgent();
  const hypothesis = HypothesisSchema.parse(
    responseObject(
      suppliedHypothesis ??
        (await agent.generate({
          systemPrompt: WHAT_IF_EXTRACTION_PROMPT,
          userPrompt: compactCanonicalJson({
            hypothesisQuestion,
            step: current,
            inputAttributes,
            upstream: upstream.map(
              ({ entityId, entityLabel, asOf, values }) => ({
                entityId,
                entityLabel,
                asOf,
                values,
              }),
            ),
          }),
        })),
    ),
  );
  for (const [name, value] of Object.entries(hypothesis.values ?? {})) {
    const attribute = inputAttributes.find((item) => item.name === name);
    if (attribute === undefined)
      throw new Error(
        `Hypothesis cannot override unknown or derived field '${name}'.`,
      );
    const problem = validateTypedValue(value, attribute.valueType ?? 'dynamic');
    if (problem !== null) throw new Error(`Hypothesis ${name} ${problem}`);
  }
  const asOf = hypothesis.asOf ?? current.asOf;
  if (upstream.some((source) => Date.parse(source.asOf) > Date.parse(asOf))) {
    throw new Error('Hypothesis clock precedes its dependency facts.');
  }

  const materialized = new Map<string, Record<string, unknown>>();
  const bindingsFor = (
    rule: RuleAST,
    step: FlowStepTrace,
    local: Record<string, unknown>,
  ): Record<string, unknown> => {
    const bindings: Record<string, unknown> = {};
    for (const [alias, binding] of Object.entries(rule.bindings)) {
      // evaluateRuleOnExample injects only the explicit now/asOf clock; other
      // type-only bindings are deliberately unavailable, never guessed by AI.
      if ('type' in binding) continue;
      const candidates =
        binding.ref === step.entityId
          ? [local]
          : ancestors(step)
              .filter((source) => source.entityId === binding.ref)
              .map(materialize);
      if (binding.cardinality === 'many') bindings[alias] = candidates;
      else {
        if (candidates.length !== 1)
          throw new Error(
            `${rule.id}: binding '${alias}' requires one '${binding.ref}' example, found ${candidates.length}.`,
          );
        bindings[alias] = candidates[0];
      }
    }
    return bindings;
  };
  const materialize = (step: FlowStepTrace): Record<string, unknown> => {
    const ref = exampleRef(step);
    const cached = materialized.get(ref);
    if (cached !== undefined) return cached;
    const values = structuredClone({
      ...step.values,
      ...(ref === exampleRef(current) ? hypothesis.values : {}),
    });
    const modeledEntity = model.entities.find(
      (item) => item.id === step.entityId,
    );
    if (modeledEntity === undefined)
      throw new Error(`Unknown entity '${step.entityId}'.`);
    const derivations = model.rules.filter(
      (rule): rule is DerivationRule =>
        rule.kind === 'derivation' && rule.target?.entityRef === step.entityId,
    );
    for (const attribute of modeledEntity.attributes ?? []) {
      if (
        attribute.derivedByRuleRef !== undefined &&
        !derivations.some(
          (rule) =>
            rule.id === attribute.derivedByRuleRef &&
            rule.target?.attribute === attribute.name,
        )
      ) {
        throw new Error(
          `Missing derivation '${attribute.derivedByRuleRef}' for '${step.entityId}.${attribute.name}'.`,
        );
      }
    }
    // Never use asserted derived values as oracle inputs, including values
    // supplied directly by a hand-constructed trace. Recompute from raw facts.
    for (const rule of derivations) delete values[rule.target.attribute];
    materialized.set(ref, values);
    let pending = derivations;
    while (pending.length > 0) {
      const remaining: DerivationRule[] = [];
      const errors: string[] = [];
      for (const rule of pending) {
        try {
          values[rule.target.attribute] = evaluateRuleOnExample(model, rule, {
            asOf: ref === exampleRef(current) ? asOf : step.asOf,
            bindings: bindingsFor(rule, step, values),
          });
        } catch (error) {
          remaining.push(rule);
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      if (remaining.length === pending.length) {
        materialized.delete(ref);
        throw new Error(
          `Cannot compute '${ref}' derivations: ${errors.join('; ')}`,
        );
      }
      pending = remaining;
    }
    return values;
  };

  const local = materialize(current);
  const ruleOutcomes: WhatIfRuleOutcome[] = rules.map((rule) => {
    const result = evaluateRuleOnExample(model, rule, {
      asOf,
      bindings: bindingsFor(rule, current, local),
    });
    if (typeof result !== 'boolean')
      throw new Error(`${rule.id}: a decision rule must return boolean.`);
    return { ruleId: rule.id, result };
  });
  const explanation = ImpactExplanationSchema.parse(
    responseObject(
      await agent.generate({
        systemPrompt: WHAT_IF_EXPLANATION_PROMPT,
        userPrompt: compactCanonicalJson({
          hypothesisQuestion,
          hypothesis,
          asOf,
          currentValues: local,
          ruleOutcomes: rules.map((rule, index) => ({
            ...ruleOutcomes[index],
            kind: rule.kind,
            label: rule.label,
            description: rule.description,
            notes: rule.notes,
          })),
        }),
      }),
    ),
  );
  return {
    hypothesis,
    ruleOutcome: ruleOutcomes[0]!,
    ruleOutcomes,
    businessImpactExplanation: explanation.businessImpactExplanation,
  };
}

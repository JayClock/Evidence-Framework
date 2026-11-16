import { current, isDraft } from 'immer';
import {
  ModelExampleASTSchema,
  type DomainModelDocument,
  type ModelExampleAST,
} from '@evidence-poc/evidence-schema';
import { collectFlowScenarios } from '../trace/flowAggregator.js';
import { evaluateRuleOnExample } from '../cel/transientSandbox.js';
import {
  validateTypedValue,
  jsonValuesEqual,
} from '../validation/typedValues.js';

export interface ScenarioExample {
  entityRef: string;
  example: ModelExampleAST;
}
export const scenarioExamples = (
  model: DomainModelDocument,
  flow: string,
): ScenarioExample[] =>
  model.entities.flatMap((entity) =>
    (entity.examples ?? [])
      .filter((e) => e.test?.flow === flow)
      .map((example) => ({
        entityRef: entity.id,
        example: structuredClone(example),
      })),
  );

/** Clone only examples; all references remain canonical and isolated to the new flow. */
export const cloneScenarioExamples = (
  model: DomainModelDocument,
  sourceFlow: string,
  targetFlow: string,
): ScenarioExample[] => {
  if (!targetFlow.trim() || sourceFlow === targetFlow)
    throw new Error('请填写不同的新场景名称。');
  const items = scenarioExamples(model, sourceFlow);
  const refs = new Map(
    items.map(({ entityRef, example }) => [
      `${entityRef}#${example.label}`,
      `${entityRef}#${example.label} · ${targetFlow}`,
    ]),
  );
  return items.map(({ entityRef, example }) => ({
    entityRef,
    example: {
      ...example,
      label: `${example.label} · ${targetFlow}`,
      test: {
        ...example.test!,
        flow: targetFlow,
        ...(example.test?.basedOn
          ? { basedOn: example.test.basedOn.map((ref) => refs.get(ref) ?? ref) }
          : {}),
        ...(example.test?.pathParameters
          ? {
              pathParameters: Object.fromEntries(
                Object.entries(example.test.pathParameters).map(
                  ([key, value]) => [
                    key,
                    {
                      ...value,
                      exampleRef:
                        refs.get(value.exampleRef) ?? value.exampleRef,
                    },
                  ],
                ),
              ),
            }
          : {}),
      },
    },
  }));
};

/** One transactional edit; incomplete but structurally valid examples stay authorable. */
export const replaceScenarioExamples = (
  draft: DomainModelDocument,
  flow: string,
  items: readonly ScenarioExample[],
): void => {
  if (!flow.trim()) throw new Error('请填写场景名称。');
  const refs = new Set<string>();
  for (const item of items) {
    ModelExampleASTSchema.parse(item.example);
    if (item.example.test?.flow !== flow)
      throw new Error('用例必须属于当前场景。');
    const entity = draft.entities.find((e) => e.id === item.entityRef);
    if (!entity) throw new Error(`业务对象已删除：${item.entityRef}`);
    for (const [name, value] of Object.entries(item.example.value)) {
      const attribute = entity.attributes?.find((a) => a.name === name);
      if (!attribute) throw new Error(`【${entity.label}】没有字段 ${name}。`);
      const problem = validateTypedValue(
        value,
        attribute.valueType ?? 'dynamic',
      );
      if (problem)
        throw new Error(`【${entity.label}.${attribute.label}】：${problem}`);
    }
    const ref = `${item.entityRef}#${item.example.label}`;
    if (
      refs.has(ref) ||
      entity.examples?.some(
        (e) => e.test?.flow !== flow && e.label === item.example.label,
      )
    )
      throw new Error(`用例名称重复：${ref}`);
    refs.add(ref);
  }
  for (const entity of draft.entities) {
    const rest = (entity.examples ?? []).filter((e) => e.test?.flow !== flow);
    const added = items
      .filter((item) => item.entityRef === entity.id)
      .map((item) => structuredClone(item.example));
    if (rest.length || added.length) entity.examples = [...rest, ...added];
    else if (entity.examples) delete entity.examples;
  }
  // Detect missing/cyclic/cross-flow dependencies before publishing a session edit.
  collectFlowScenarios(isDraft(draft) ? current(draft) : draft);
};

export interface ScenarioEvaluation {
  ref: string;
  values: Record<string, unknown>;
  rules: { ruleRef: string; label: string; value?: unknown; error?: string }[];
  gaps: string[];
}

/** Local oracle only, not a workflow executor or proof of HTTP acceptance. */
export const evaluateScenario = (
  model: DomainModelDocument,
  flowId: string,
): readonly ScenarioEvaluation[] => {
  const flow = collectFlowScenarios(model).find((f) => f.flowId === flowId);
  if (!flow) return [];
  const facts = new Map<
    string,
    { entityRef: string; values: Record<string, unknown> }
  >();
  const ancestors = new Map<string, Set<string>>();
  const results: ScenarioEvaluation[] = [];
  for (const step of flow.steps) {
    const ref = `${step.entityId}#${step.exampleLabel}`;
    const entity = model.entities.find((e) => e.id === step.entityId);
    const example = entity?.examples?.find(
      (e) => e.label === step.exampleLabel,
    );
    if (!entity || !example) throw new Error(`用例已不存在：${ref}`);
    const negative = (example.test?.expectedStatus ?? 201) >= 400;
    const deps = new Set<string>();
    for (const dependency of step.basedOn) {
      const prior =
        flow.steps.find(
          (s) => `${s.entityId}#${s.exampleLabel}` === dependency,
        ) ??
        flow.steps.find(
          (s) => s.values.id === dependency || s.values.ref === dependency,
        );
      if (prior) {
        const key = `${prior.entityId}#${prior.exampleLabel}`;
        deps.add(key);
        for (const ancestor of ancestors.get(key) ?? []) deps.add(ancestor);
      }
    }
    ancestors.set(ref, deps);
    const values = structuredClone(example.value);
    const result: ScenarioEvaluation = { ref, values, rules: [], gaps: [] };
    const derived = model.rules.filter(
      (r) => r.kind === 'derivation' && r.target?.entityRef === entity.id,
    );
    // Never feed an expected answer back into its derivation.
    for (const rule of derived)
      if (rule.target) delete values[rule.target.attribute];
    for (const attribute of entity.attributes ?? []) {
      if (attribute.derivedByRuleRef) continue;
      if (!Object.hasOwn(values, attribute.name)) {
        if (attribute.required && !negative)
          result.gaps.push(`尚未输入【${entity.label}.${attribute.label}】。`);
      } else {
        const problem = validateTypedValue(
          values[attribute.name],
          attribute.valueType ?? 'dynamic',
        );
        if (problem) result.gaps.push(`【${attribute.label}】：${problem}`);
      }
    }
    const evaluate = (rule: DomainModelDocument['rules'][number]) => {
      const bindings: Record<string, unknown> = {};
      for (const [alias, binding] of Object.entries(rule.bindings)) {
        if ('type' in binding) continue;
        const sources =
          binding.ref === entity.id
            ? [values]
            : [...deps].flatMap((d) => {
                const fact = facts.get(d);
                return fact?.entityRef === binding.ref ? [fact.values] : [];
              });
        if (binding.cardinality === 'many') bindings[alias] = sources;
        else {
          if (sources.length !== 1)
            throw new Error(
              `【${model.entities.find((e) => e.id === binding.ref)?.label ?? binding.ref}】需要一个明确的前置用例，当前为 ${sources.length} 个。`,
            );
          bindings[alias] = sources[0];
        }
      }
      return evaluateRuleOnExample(model, rule, { bindings, asOf: step.asOf });
    };
    if (!negative) {
      let pending = [...derived];
      while (pending.length) {
        const remaining: typeof pending = [];
        for (const rule of pending) {
          if (!rule.target) continue;
          try {
            const value = evaluate(rule);
            values[rule.target.attribute] = value;
            result.rules.push({ ruleRef: rule.id, label: rule.label, value });
            const expected = example.value[rule.target.attribute];
            if (expected !== undefined && !jsonValuesEqual(expected, value))
              result.gaps.push(`【${rule.label}】计算值与填写的预期值不一致。`);
          } catch {
            remaining.push(rule);
          }
        }
        if (remaining.length === pending.length) {
          for (const rule of remaining)
            try {
              evaluate(rule);
            } catch (error) {
              result.rules.push({
                ruleRef: rule.id,
                label: rule.label,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          break;
        }
        pending = remaining;
      }
      for (const rule of model.rules.filter(
        (r) =>
          r.contextRef === step.contextRef &&
          r.kind !== 'derivation' &&
          Object.values(r.bindings).some(
            (b) => 'ref' in b && b.ref === entity.id,
          ),
      )) {
        try {
          result.rules.push({
            ruleRef: rule.id,
            label: rule.label,
            value: evaluate(rule),
          });
        } catch (error) {
          result.rules.push({
            ruleRef: rule.id,
            label: rule.label,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      facts.set(ref, { entityRef: entity.id, values });
    } else
      result.gaps.push(
        '负向请求不会形成后续凭证；HTTP 拒绝结果需运行后端验收。',
      );
    results.push(result);
  }
  return results;
};

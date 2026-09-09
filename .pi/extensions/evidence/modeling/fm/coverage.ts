import { Type } from 'typebox';
import { Value } from 'typebox/value';
import type { DiscoverySnapshot } from '../discovery/schema.ts';
import type { FmModelFile } from './contracts.ts';
const modelRefs = Type.Array(Type.String({ minLength: 1 }), {
  minItems: 1,
  maxItems: 100,
  uniqueItems: true,
});
const contextMapping = Type.Object(
  {
    contextRef: Type.String({ minLength: 1 }),
    status: Type.Union([
      Type.Literal('ready'),
      Type.Literal('support'),
      Type.Literal('pending'),
    ]),
    modelRefs: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    retainedFactRefs: Type.Array(Type.String({ minLength: 1 }), {
      uniqueItems: true,
    }),
    remainingScope: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
const factMapping = Type.Object(
  { factRef: Type.String({ minLength: 1 }), modelRefs },
  { additionalProperties: false },
);
const CoverageSchema = Type.Object(
  {
    version: Type.Literal(1),
    kind: Type.Literal('discovery-coverage'),
    revision: Type.Integer({ minimum: 0 }),
    contexts: Type.Array(contextMapping, { maxItems: 200 }),
    facts: Type.Array(factMapping, { maxItems: 1000 }),
  },
  { additionalProperties: false },
);

// Staged coverage is mandatory. No old candidate-wide mapping or implicit full scope.
export function discoveryCoverage(
  snapshot: DiscoverySnapshot,
  files: FmModelFile[],
): (compiled: unknown) => void {
  const formalization = snapshot.formalization;
  if (!formalization) throw new Error('缺少 Context assessment，不能发布 FM');
  const content =
    files.find((f) => f.path === 'discovery/formalization.md')?.content ?? '';
  const blocks = [...content.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 1)
    throw new Error(
      'discovery/formalization.md 须包含唯一 discovery-coverage JSON',
    );
  const raw: unknown = JSON.parse(blocks[0][1]);
  if (!Value.Check(CoverageSchema, raw))
    throw new Error('模型覆盖格式无效；必须提交 Context 与事实级映射');
  const coverage = raw;
  if (coverage.revision !== snapshot.revision)
    throw new Error('模型覆盖记录版本无效');
  const exact = (actual: string[], expected: string[]) =>
    new Set(actual).size === actual.length &&
    actual.length === expected.length &&
    expected.every((ref) => actual.includes(ref));
  if (
    !exact(
      coverage.contexts.map((ctx) => ctx.contextRef),
      formalization.contexts.map((ctx) => ctx.contextRef),
    ) ||
    !exact(
      coverage.facts.map((f) => f.factRef),
      formalization.includedFactRefs,
    )
  )
    throw new Error(
      '模型须覆盖全部纳入 Context 与事实；支撑投影不能扩大为整个候选，待完善事实不得映射为正式事实',
    );
  for (const context of coverage.contexts) {
    const result = formalization.contexts.find(
      (ctx) => ctx.contextRef === context.contextRef,
    )!;
    const assessed = formalization.assessment.contexts.find(
      (ctx) => ctx.contextRef === context.contextRef,
    )!;
    const retained = assessed.facts
      .map((f) => `${context.contextRef}.${f.key}`)
      .filter((ref) => !result.includedFactRefs.includes(ref));
    if (
      context.status !== result.status ||
      (result.status === 'pending') !== (context.modelRefs.length === 0) ||
      !exact(context.retainedFactRefs, retained) ||
      context.remainingScope !== assessed.remainingScope
    )
      throw new Error(
        '覆盖必须保留 Context 的支撑／待完善状态、未纳入事实和剩余职责，不能宣称整体完成',
      );
  }
  return (compiled: unknown) => {
    const objects = new Map<string, Record<string, unknown>>();
    const collect = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }
      const object = value as Record<string, unknown>;
      if (typeof object.id === 'string') objects.set(object.id, object);
      Object.values(object).forEach(collect);
    };
    collect(compiled);
    for (const item of [...coverage.contexts, ...coverage.facts])
      for (const ref of item.modelRefs)
        if (!objects.has(ref)) throw new Error(`映射的模型 ID 不存在：${ref}`);
    for (const context of coverage.contexts.filter(
      (ctx) => ctx.status !== 'pending',
    )) {
      const kind = formalization.assessment.contexts.find(
        (ctx) => ctx.contextRef === context.contextRef,
      )!.kind;
      if (
        !context.modelRefs.some(
          (ref) =>
            objects.get(ref)?.category === 'context' &&
            objects.get(ref)?.kind === kind,
        )
      )
        throw new Error(
          `Context ${context.contextRef} 未映射到同类型 ${kind} 模型上下文`,
        );
    }
  };
}

import type { DiscoverySnapshot } from '../../modeling/discovery/schema.ts';
import type { FmModelFile } from '../../modeling/fm/contracts.ts';
// Synthetic coverage supplied by test callers, not inferred production provenance.
export function contextCoverage(
  snapshot: DiscoverySnapshot,
  modelRef: string,
): FmModelFile {
  const result = snapshot.formalization!;
  return {
    path: 'discovery/formalization.md',
    content:
      '# 合成模型更新覆盖\n```json\n' +
      JSON.stringify({
        version: 1,
        kind: 'discovery-coverage',
        revision: snapshot.revision,
        contexts: result.contexts.map((ctx) => {
          const assessed = result.assessment.contexts.find(
            (c) => c.contextRef === ctx.contextRef,
          )!;
          return {
            contextRef: ctx.contextRef,
            status: ctx.status,
            modelRefs: ctx.status === 'pending' ? [] : [modelRef],
            retainedFactRefs: assessed.facts
              .map((f) => `${ctx.contextRef}.${f.key}`)
              .filter((ref) => !ctx.includedFactRefs.includes(ref)),
            remainingScope: assessed.remainingScope,
          };
        }),
        facts: result.includedFactRefs.map((factRef) => ({
          factRef,
          modelRefs: [modelRef],
        })),
      }) +
      '\n```\n',
  };
}

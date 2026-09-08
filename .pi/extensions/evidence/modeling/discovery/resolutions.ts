import { createHash } from 'node:crypto';
import { REQUIREMENTS_PATH } from '../../contracts/paths.ts';
import type { ReadSource } from './ports.ts';
import { latestAnswer } from './questions.ts';
import type {
  DiscoveryRecord,
  DiscoverySnapshot,
  QuestionResolution,
} from './schema.ts';

export function createResolutionChecks(readText: ReadSource) {
  function sourcePath(
    snapshot: DiscoverySnapshot,
    ref: string,
  ): string | undefined {
    return ref === 'INPUT'
      ? REQUIREMENTS_PATH
      : snapshot.content?.sources.find((source) => source.id === ref)?.path;
  }

  async function quotedSource(
    root: string,
    snapshot: DiscoverySnapshot,
    ref: string,
  ): Promise<string> {
    const path = sourcePath(snapshot, ref);
    if (path) {
      const raw = await readText(root, path);
      if (
        createHash('sha256').update(raw).digest('hex') !==
        snapshot.sourceHashes[path]
      )
        throw new Error(`解决依据的原始材料已变化，须显式更新来源：${ref}`);
      return raw;
    }
    const answer = snapshot.answers.find((value) => value.id === ref);
    if (
      !answer ||
      answer.status !== 'answered' ||
      latestAnswer(snapshot, answer.questionId)?.id !== ref
    )
      throw new Error(
        `解决依据只能引用原始材料或最新有效事实回答，不能引用未知、排除或 Agent 解释：${ref}`,
      );
    return answer.text;
  }

  async function validateResolution(
    root: string,
    snapshot: DiscoverySnapshot,
    value: QuestionResolution,
  ): Promise<void> {
    const answer = latestAnswer(snapshot, value.questionId);
    if (answer && answer.status !== 'unknown')
      throw new Error(
        `已有人工事实或排除决定，不得用解决依据替代：${value.questionId}`,
      );
    if (!value.conclusion.trim() || !value.reasoning.trim())
      throw new Error('解决结论和推理说明不能为空');
    const texts = new Map<string, string>();
    for (const ref of value.sourceRefs)
      texts.set(ref, await quotedSource(root, snapshot, ref));
    for (const citation of value.citations) {
      if (
        !citation.quote.trim() ||
        !texts.get(citation.sourceRef)?.includes(citation.quote)
      )
        throw new Error(
          `解决依据摘录须逐字存在于声明的来源中：${citation.sourceRef}`,
        );
    }
    if (
      value.sourceRefs.some(
        (ref) =>
          !value.citations.some((citation) => citation.sourceRef === ref),
      )
    )
      throw new Error('每项解决来源都须有原文摘录');
  }

  // Quotes authenticate provenance, not entailment. The agent must explain complete
  // coverage and conflicting facts still require a human decision. No A-* is created.
  async function validateResolutionRecords(
    root: string,
    snapshot: DiscoverySnapshot,
    records: DiscoveryRecord[],
  ): Promise<void> {
    for (const record of records) {
      if (record.kind === 'resolution')
        await validateResolution(root, snapshot, record.value);
    }
  }

  // File edits can precede a new SRC assertion. Do not present those associations as
  // current while waiting for the explicit source update; never refresh stored hashes.
  async function markChangedResolutionSources(
    root: string,
    snapshot: DiscoverySnapshot,
  ): Promise<string[]> {
    const changed = new Set<string>();
    const checked = new Map<string, boolean>();
    for (const value of snapshot.questionResolutions) {
      for (const ref of value.sourceRefs) {
        const path = sourcePath(snapshot, ref);
        if (!path) continue;
        if (!checked.has(path)) {
          const raw = await readText(root, path);
          checked.set(
            path,
            createHash('sha256').update(raw).digest('hex') !==
              snapshot.sourceHashes[path],
          );
        }
        if (checked.get(path)) changed.add(`resolution:${value.questionId}`);
      }
    }
    snapshot.staleRecordKeys = [
      ...new Set([...snapshot.staleRecordKeys, ...changed]),
    ];
    return [...changed];
  }

  // External edits are not journal facts. Before selecting a question whose
  // association changed only on disk, require explicit source reconciliation so
  // interaction replay cannot silently choose a different question after reload.
  async function assertResolutionSelectionFresh(
    root: string,
    snapshot: DiscoverySnapshot,
    questionId?: string,
  ): Promise<void> {
    const changed = await markChangedResolutionSources(root, snapshot);
    if (
      changed.some((key) => !questionId || key === `resolution:${questionId}`)
    )
      throw new Error(
        '解决依据的原始材料已变化；先运行 /evidence-run 显式更新来源或撤回关联，再恢复或重选问题；也可按 Q-ID 补充人工回答',
      );
  }
  return {
    validateResolutionRecords,
    markChangedResolutionSources,
    assertResolutionSelectionFresh,
  };
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, DialogClose } from '@evidence-poc/desktop-ui-kit';

import type {
  ClauseAnnotation,
  DraftEvidence,
  IngestionDraft,
} from '@evidence-poc/evidence-schema';

import type {
  CompileDraftInput,
  IngestionReader,
} from '@evidence-poc/desktop-contracts/ingestion';

import { ClauseSplit } from './ClauseSplit';
import type {
  EvidenceProjectSummary,
  ProjectStorageKind,
} from '@evidence-poc/desktop-contracts/projects';

/** Evidence kinds the panel offers, with the name the method uses for each. */
const KIND_CHOICES: readonly { kind: DraftEvidence['kind']; label: string }[] =
  [
    { kind: 'rfp', label: '索取提案（时段）' },
    { kind: 'proposal', label: '提案（时段）' },
    { kind: 'contract', label: '合约（时刻）' },
    { kind: 'fulfillment_request', label: '履约请求（时段）' },
    { kind: 'fulfillment_confirmation', label: '履约确认（时刻）' },
    { kind: 'other_evidence', label: '其它凭证' },
  ];

const READER_LABELS: Record<IngestionReader, string> = {
  blueprint: '读自服务蓝图',
  contract: '读自合同条款',
  'text-rules': '读自本地规则',
  'text-model': '读自模型',
};

export interface DraftReviewPanelProps {
  draft: IngestionDraft;
  reader: IngestionReader;
  issues: readonly string[];
  /** Clause split the contract reader produced, when it produced one. */
  annotations?: readonly ClauseAnnotation[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onBack: () => void;
  onCompiled: (project: EvidenceProjectSummary) => void;
}

const isMoment = (kind: DraftEvidence['kind']): boolean =>
  kind === 'contract' ||
  kind === 'fulfillment_confirmation' ||
  kind === 'other_evidence';

/**
 * Shows what the reader produced, before anything is written.
 *
 * The extraction is a reading, so the panel is where a person corrects it: the
 * kind of every evidence can be changed, a sentence can be re-read next to the
 * element it produced, and a wrong element can be dropped. Gaps the reader
 * reported stay visible, because "we could not pair this request" is the most
 * useful thing on the screen.
 *
 * The contract's role pair is not editable here: compiling an unbalanced
 * contract is what the compiler refuses, and inventing the missing side is
 * exactly the decision the method forbids an extractor to make.
 */
export const DraftReviewPanel = ({
  draft,
  reader,
  issues,
  annotations,
  busy,
  onBusyChange,
  onBack,
  onCompiled,
}: DraftReviewPanelProps) => {
  const [evidences, setEvidences] = useState<readonly DraftEvidence[]>(
    draft.evidences,
  );
  const [kind, setKind] = useState<ProjectStorageKind>('directory');
  const [name, setName] = useState(draft.modelName);
  const [error, setError] = useState<string | null>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    summaryHeading.current?.focus();
  }, []);

  const keptIds = useMemo(
    () => new Set(evidences.map((evidence) => evidence.id)),
    [evidences],
  );

  const pairs = draft.fulfillmentPairs.filter(
    (pair) => keptIds.has(pair.requestRef) && keptIds.has(pair.confirmationRef),
  );

  const orphans = draft.fulfillmentPairs.length - pairs.length;

  const rename = (id: string, label: string): void => {
    setEvidences((current) =>
      current.map((evidence) =>
        evidence.id === id ? { ...evidence, label } : evidence,
      ),
    );
  };

  const updateKind = (id: string, next: DraftEvidence['kind']): void => {
    setEvidences((current) =>
      current.map((evidence) =>
        evidence.id === id ? { ...evidence, kind: next } : evidence,
      ),
    );
  };

  const drop = (id: string): void => {
    setEvidences((current) => current.filter((evidence) => evidence.id !== id));
  };

  const submit = async () => {
    if (busy) return;
    onBusyChange(true);
    setError(null);

    try {
      const dialog = await window.evidenceAPI.projects.showCreateDialog({
        kind,
        suggestedName: `${name.trim().length > 0 ? name.trim() : 'ingested'}.evidence.json`,
      });

      if (!dialog.success) {
        if (dialog.canceled !== true) {
          setError(dialog.error);
        }

        return;
      }

      const reviewed: IngestionDraft = {
        ...draft,
        modelName: name,
        evidences: [...evidences],
      };
      const input: CompileDraftInput = {
        draft: reviewed,
        targetPath: dialog.targetPath,
        name: name.trim().length > 0 ? name.trim() : '文本导入的履约模型',
        kind: dialog.kind,
      };
      const compiled = await window.evidenceAPI.ingestion.compile(input);

      if (!compiled.success) {
        setError(compiled.error);
        return;
      }

      onCompiled(compiled.project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法生成模型。');
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="min-h-0 overflow-y-auto overscroll-contain p-1">
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3">
          <legend className="sr-only">草稿校对</legend>
          <section className="flex flex-col gap-1.5 rounded-md border border-workbench-border bg-workbench-background p-3 text-xs">
            <h3 ref={summaryHeading} tabIndex={-1} className="font-bold">
              {reader === 'text-model' ? 'AI 提取分析就绪' : '解读草稿就绪'}
            </h3>
            <p className="text-[11px] text-workbench-muted">
              {READER_LABELS[reader]}
            </p>
            <ul className="grid gap-1.5 text-[11px]">
              <SummaryEntry label="凭证主体" entries={evidences} />
              <SummaryEntry label="当事人" entries={draft.participants} />
              <SummaryEntry label="权责角色" entries={draft.roles} />
              <li
                className={
                  pairs.length ? 'text-emerald-700' : 'text-workbench-muted'
                }
              >
                {pairs.length} 组履约对
                {orphans > 0 ? ` · ${orphans} 组因删改断开` : ''}
              </li>
            </ul>
          </section>
          {issues.length > 0 ? (
            <section className="mb-4 rounded-md border border-[#f5e2b8] bg-[#fdf8ec] px-3 py-2">
              <p className="text-[11px] font-medium text-[#8a6100]">
                读法留下了这些缺口
              </p>
              <ul className="mt-1 space-y-1">
                {issues.map((issue) => (
                  <li
                    className="text-[11px] leading-5 text-[#8a6100]"
                    key={issue}
                  >
                    · {issue}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <details className="rounded-md border border-workbench-border p-3 text-xs">
            <summary className="cursor-pointer font-medium text-evidence-ink">
              展开校对凭证与原文
            </summary>
            <div className="mt-3">
              {annotations === undefined ? null : (
                <div className="mb-4">
                  <ClauseSplit annotations={annotations} />
                </div>
              )}

              <ul className="space-y-2">
                {evidences.map((evidence) => (
                  <li
                    className="rounded-lg border border-evidence-line px-3 py-2"
                    key={evidence.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-36 flex-1">
                        <label
                          className="sr-only"
                          htmlFor={`label-${evidence.id}`}
                        >
                          凭证名称
                        </label>
                        <input
                          className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-medium text-evidence-ink outline-none hover:border-evidence-line focus:border-evidence-accent"
                          id={`label-${evidence.id}`}
                          onChange={(event) => {
                            rename(evidence.id, event.target.value);
                          }}
                          value={evidence.label}
                        />
                        <p className="mt-0.5 text-[11px] break-words text-workbench-muted">
                          {evidence.id} ·{' '}
                          {isMoment(evidence.kind) ? '时刻' : '时段'} ·{' '}
                          {evidence.contextRef}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          className="sr-only"
                          htmlFor={`kind-${evidence.id}`}
                        >
                          凭证类型
                        </label>
                        <select
                          className="rounded-md border border-evidence-line px-2 py-1 text-[11px] text-evidence-ink"
                          id={`kind-${evidence.id}`}
                          onChange={(event) => {
                            updateKind(
                              evidence.id,
                              event.target.value as DraftEvidence['kind'],
                            );
                          }}
                          value={evidence.kind}
                        >
                          {KIND_CHOICES.map((choice) => (
                            <option key={choice.kind} value={choice.kind}>
                              {choice.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="rounded-md border border-evidence-line px-2 py-1 text-[11px] text-[#b42318] hover:border-[#b42318]"
                          onClick={() => {
                            drop(evidence.id);
                          }}
                          type="button"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                    {evidence.provenance === undefined ? null : (
                      <p
                        className="mt-1.5 line-clamp-2 text-[10px] text-evidence-muted"
                        title={evidence.provenance.text}
                      >
                        原文（{evidence.provenance.locator}）：
                        {evidence.provenance.text}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </details>
          <div className="grid gap-3 min-[480px]:grid-cols-[1fr_150px]">
            <label className="flex-1 text-[11px] font-medium text-evidence-ink">
              模型名称
              <input
                className="mt-1 w-full rounded-md border border-evidence-line px-3 py-1.5 text-[12px] font-normal outline-none focus:border-evidence-accent"
                onChange={(event) => {
                  setName(event.target.value);
                }}
                name="modelName"
                value={name}
              />
            </label>
            <label className=" text-[11px] font-medium text-evidence-ink">
              存放形式
              <select
                className="mt-1 w-full rounded-md border border-evidence-line px-2 py-1.5 text-[12px] font-normal"
                onChange={(event) => {
                  setKind(event.target.value as ProjectStorageKind);
                }}
                name="storageKind"
                value={kind}
              >
                <option value="directory">目录源树</option>
                <option value="file">单文件</option>
              </select>
            </label>
          </div>
        </fieldset>
      </div>
      {error ? (
        <p
          role="alert"
          className="text-xs whitespace-pre-wrap break-words text-red-700"
        >
          {error}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="text-xs text-workbench-muted">
          正在选择位置并生成模型…
        </p>
      ) : null}
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button
          className="mr-auto rounded-md text-xs"
          size="md"
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onBack}
        >
          返回编辑原文
        </Button>
        <DialogClose asChild>
          <Button
            className="rounded-md px-3.5 text-xs"
            size="md"
            type="button"
            disabled={busy}
          >
            放弃
          </Button>
        </DialogClose>
        <Button
          className="rounded-md px-4 text-xs font-medium"
          size="md"
          type="submit"
          variant="default"
          loading={busy}
        >
          选择位置并生成模型
        </Button>
      </div>
    </form>
  );
};

const SummaryEntry = ({
  label,
  entries,
}: {
  label: string;
  entries: readonly { label: string }[];
}) => (
  <li
    className={
      entries.length ? 'break-words text-emerald-700' : 'text-workbench-muted'
    }
  >
    {label}：
    {entries.length === 0
      ? '未识别'
      : entries
          .slice(0, 3)
          .map((entry) => entry.label)
          .join('、')}
    {entries.length > 3 ? ` 等 ${entries.length} 项` : ''}
  </li>
);

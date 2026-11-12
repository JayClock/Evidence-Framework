import { useMemo, useState } from 'react';

import type {
  ClauseAnnotation,
  DraftEvidence,
  IngestionDraft,
} from '@evidence-poc/evidence-schema';

import type {
  CompileDraftInput,
  IngestionReader,
} from '../../../shared/ingestion';

import { ClauseSplit } from './ClauseSplit';
import type {
  EvidenceProjectSummary,
  ProjectStorageKind,
} from '../../../shared/projects';

/** Evidence kinds the panel offers, with the name the method uses for each. */
const KIND_CHOICES: readonly { kind: DraftEvidence['kind']; label: string }[] = [
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
  onCancel: () => void;
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
  onCancel,
  onCompiled,
}: DraftReviewPanelProps) => {
  const [evidences, setEvidences] = useState<readonly DraftEvidence[]>(
    draft.evidences,
  );
  const [kind, setKind] = useState<ProjectStorageKind>('directory');
  const [name, setName] = useState(draft.modelName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const keptIds = useMemo(
    () => new Set(evidences.map((evidence) => evidence.id)),
    [evidences],
  );

  const pairs = draft.fulfillmentPairs.filter(
    (pair) => keptIds.has(pair.requestRef) && keptIds.has(pair.confirmationRef),
  );

  const orphans = pairs.length === 0 ? 0 : draft.fulfillmentPairs.length - pairs.length;

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
    setBusy(true);
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
      setBusy(false);
    }
  };

  return (
    <div
      aria-label="校对导入的草稿"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b1220]/40 px-6 py-8"
      role="dialog"
    >
      <div className="flex max-h-full w-full max-w-[860px] flex-col rounded-xl border border-evidence-line bg-white shadow-[0_24px_60px_#0f172a2e]">
        <header className="border-b border-evidence-line px-6 py-4">
          <h2 className="text-[15px] font-semibold text-evidence-ink">
            校对导入的草稿
          </h2>
          <p className="mt-1 text-[11px] text-evidence-muted">
            {READER_LABELS[reader]} · {evidences.length} 张凭证 · {pairs.length}{' '}
            组履约对 · {draft.participants.length} 位当事人
            {orphans > 0 ? ` · ${orphans} 组因删改断开` : ''}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {annotations === undefined ? null : (
            <div className="mb-4">
              <ClauseSplit annotations={annotations} />
            </div>
          )}

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

          <ul className="space-y-2">
            {evidences.map((evidence) => (
              <li
                className="rounded-lg border border-evidence-line px-3 py-2"
                key={evidence.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="sr-only" htmlFor={`label-${evidence.id}`}>
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
                    <p className="mt-0.5 text-[10px] text-evidence-muted">
                      {evidence.id} · {isMoment(evidence.kind) ? '时刻' : '时段'} ·{' '}
                      {evidence.contextRef}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="sr-only" htmlFor={`kind-${evidence.id}`}>
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
                    原文（{evidence.provenance.locator}）：{evidence.provenance.text}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {draft.participants.length === 0 && draft.roles.length === 0 ? (
            <p className="mt-4 text-[11px] text-evidence-muted">
              没有读到当事人，生成后模型会缺少履约责任人。
            </p>
          ) : null}
        </div>

        <footer className="border-t border-evidence-line px-6 py-4">
          <div className="flex items-end gap-3">
            <label className="flex-1 text-[11px] font-medium text-evidence-ink">
              模型名称
              <input
                className="mt-1 w-full rounded-md border border-evidence-line px-3 py-1.5 text-[12px] font-normal outline-none focus:border-evidence-accent"
                onChange={(event) => {
                  setName(event.target.value);
                }}
                value={name}
              />
            </label>
            <label className="w-[150px] text-[11px] font-medium text-evidence-ink">
              存放形式
              <select
                className="mt-1 w-full rounded-md border border-evidence-line px-2 py-1.5 text-[12px] font-normal"
                onChange={(event) => {
                  setKind(event.target.value as ProjectStorageKind);
                }}
                value={kind}
              >
                <option value="directory">目录源树</option>
                <option value="file">单文件</option>
              </select>
            </label>
          </div>

          {error === null ? null : (
            <p className="mt-3 rounded-md border border-[#f3c6c6] bg-[#fdf2f2] px-3 py-2 text-[11px] whitespace-pre-wrap text-[#b42318]">
              {error}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-md border border-evidence-line px-3 py-1.5 text-[12px] text-evidence-ink hover:border-evidence-accent"
              disabled={busy}
              onClick={onCancel}
              type="button"
            >
              取消
            </button>
            <button
              className="rounded-md bg-evidence-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#274c76] disabled:opacity-60"
              disabled={busy}
              onClick={() => void submit()}
              type="button"
            >
              {busy ? '正在生成…' : '选择位置并生成模型'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

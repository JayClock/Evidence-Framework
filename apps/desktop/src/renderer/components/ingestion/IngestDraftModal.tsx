import { useState } from 'react';

import type {
  ClauseAnnotation,
  IngestionDraft,
} from '@evidence-poc/evidence-schema';

import type {
  IngestDraftInput,
  IngestionInputKind,
  IngestionReader,
} from '../../../shared/ingestion';
import type { EvidenceProjectSummary } from '../../../shared/projects';

import { DraftReviewPanel } from './DraftReviewPanel';

/**
 * Two business texts the method's own lectures work through.
 *
 * They are offered as presets because the first question a new reader has is
 * "what does a business text look like written down", and a paragraph about a
 * purchase clause answers it better than a format description.
 */
const PRESETS: readonly { id: string; label: string; content: string }[] = [
  {
    id: 'contract',
    label: '合同条款：云服务采购',
    content:
      '甲乙双方签订《企业级云服务采购协议》。合同签订后 5 个工作日内，甲方应向乙方支付首期技术服务费，并上传银行转账凭证；乙方在确认款项到账后 2 个工作日内开通企业账号权限，并出具开通确认函。若乙方在约定期限内未能开通服务，甲方有权发起违约退款申请，乙方应在 3 个工作日内全额原路退还款项。',
  },
  {
    id: 'blueprint',
    label: '服务蓝图表格',
    content: `| 阶段 | 客户旅程 / 前台活动 | 业务凭证 | 凭证类型 | 当事人 | 标的物 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 合约前阶段 | 提交采购意向 | 商品询价单 | rfp | 甲方采购员 | 采购物资 |
| 合约前阶段 | 提供商品报价 | 商品报价单 | proposal | 乙方销售 | 采购物资 |
| 合约确立 | 签署采购协议 | 采购框架合同 | contract | 甲方代表, 乙方代表 | 采购物资 |
| 履约交付 | 提交付款申请 | 支付申请单 | request | 甲方财务 | 采购物资 |
| 履约交付 | 确认款项到账 | 支付确认单 | confirmation | 乙方财务 | 采购物资 |
| 履约交付 | 提供转账凭据 | 银行回单 | evidence | 甲方财务 | 采购物资 |`,
  },
];

interface DraftState {
  draft: IngestionDraft;
  reader: IngestionReader;
  issues: readonly string[];
  annotations?: readonly ClauseAnnotation[];
}

export interface IngestDraftModalProps {
  onClose: () => void;
  onCompiled: (project: EvidenceProjectSummary) => void;
}

const INPUT_KINDS: readonly {
  kind: IngestionInputKind;
  label: string;
  hint: string;
}[] = [
  {
    kind: 'contract',
    label: '合同或协议原文',
    hint: '先按业务 / 领域 / 法务分句，再落模型',
  },
  {
    kind: 'text',
    label: '业务自然语言',
    hint: '需求文档、访谈记录、流程说明',
  },
  {
    kind: 'blueprint',
    label: '服务蓝图表格',
    hint: '阶段 / 活动 / 凭证 / 当事人 的 Markdown 或 CSV',
  },
];

/**
 * Starts a model from what the business already wrote down.
 *
 * The lecture's entry point is a business walkthrough, not a diagram editor, so
 * this asks for text first and for a canvas never. Reading happens in the main
 * process; what comes back is a draft for review, not a saved model, because an
 * extraction is a reading and a reading can be wrong.
 */
export const IngestDraftModal = ({
  onClose,
  onCompiled,
}: IngestDraftModalProps) => {
  const [kind, setKind] = useState<IngestionInputKind>('contract');
  const [content, setContent] = useState('');
  const [modelName, setModelName] = useState('文本导入的履约模型');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async () => {
    const text = content.trim();

    if (text.length === 0) {
      setError('请先粘贴一段业务文本或蓝图表格。');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const input: IngestDraftInput = {
        kind,
        content: text,
        modelName,
        ...(kind === 'blueprint' ? { format: 'auto' as const } : {}),
      };
      const result = await window.evidenceAPI.ingestion.draft(input);

      if (!result.success) {
        setError(result.error);
        return;
      }

      setDraft({
        draft: result.draft,
        reader: result.reader,
        issues: result.issues,
        ...(result.annotations === undefined
          ? {}
          : { annotations: result.annotations }),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取业务文本。');
    } finally {
      setBusy(false);
    }
  };

  if (draft !== null) {
    return (
      <DraftReviewPanel
        draft={draft.draft}
        issues={draft.issues}
        onCancel={onClose}
        onCompiled={onCompiled}
        reader={draft.reader}
        {...(draft.annotations === undefined
          ? {}
          : { annotations: draft.annotations })}
      />
    );
  }

  return (
    <div
      aria-label="从业务文本生成模型"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b1220]/40 px-6 py-8"
      role="dialog"
    >
      <div className="flex max-h-full w-full max-w-[720px] flex-col rounded-xl border border-evidence-line bg-white shadow-[0_24px_60px_#0f172a2e]">
        <header className="border-b border-evidence-line px-6 py-4">
          <h2 className="text-[15px] font-semibold text-evidence-ink">
            从业务文本生成模型
          </h2>
          <p className="mt-1 text-[11px] text-evidence-muted">
            粘贴业务原文，工作台按履约建模法先找合约，再分成对的履约项，违约读成新的履约项；解读结果会先给你校对。
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex gap-2">
            {INPUT_KINDS.map((option) => (
              <button
                aria-pressed={kind === option.kind}
                className={`flex-1 rounded-lg border px-3 py-2 text-left transition ${
                  kind === option.kind
                    ? 'border-evidence-accent bg-[#f2f6fb]'
                    : 'border-evidence-line bg-white hover:border-evidence-accent'
                }`}
                key={option.kind}
                onClick={() => {
                  setKind(option.kind);
                }}
                type="button"
              >
                <span className="block text-[12px] font-medium text-evidence-ink">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-evidence-muted">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>

          <label
            className="mt-4 block text-[11px] font-medium text-evidence-ink"
            htmlFor="ingest-content"
          >
            业务原文
          </label>
          <textarea
            className="mt-1.5 h-[240px] w-full resize-none rounded-md border border-evidence-line px-3 py-2 font-mono text-[11px] leading-5 text-evidence-ink outline-none focus:border-evidence-accent"
            id="ingest-content"
            onChange={(event) => {
              setContent(event.target.value);
            }}
            placeholder="把合同条款、需求段落或服务蓝图表格粘贴在这里…"
            value={content}
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-evidence-muted">示例：</span>
            {PRESETS.map((preset) => (
              <button
                className="rounded-md border border-evidence-line px-2 py-1 text-[10px] text-evidence-ink hover:border-evidence-accent"
                key={preset.id}
                onClick={() => {
                  setKind(preset.id === 'blueprint' ? 'blueprint' : 'contract');
                  setContent(preset.content);
                }}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <label
            className="mt-4 block text-[11px] font-medium text-evidence-ink"
            htmlFor="ingest-name"
          >
            模型名称
          </label>
          <input
            className="mt-1.5 w-full rounded-md border border-evidence-line px-3 py-1.5 text-[12px] text-evidence-ink outline-none focus:border-evidence-accent"
            id="ingest-name"
            onChange={(event) => {
              setModelName(event.target.value);
            }}
            value={modelName}
          />
        </div>

        <footer className="border-t border-evidence-line px-6 py-4">
          {error === null ? null : (
            <p className="mb-3 rounded-md border border-[#f3c6c6] bg-[#fdf2f2] px-3 py-2 text-[11px] whitespace-pre-wrap text-[#b42318]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              className="rounded-md border border-evidence-line px-3 py-1.5 text-[12px] text-evidence-ink hover:border-evidence-accent"
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="rounded-md bg-evidence-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#274c76] disabled:opacity-60"
              disabled={busy}
              onClick={() => void read()}
              type="button"
            >
              {busy ? '正在阅读…' : '读成草稿'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

import { useAiConfiguration } from '../../state/AiConfiguration';
import { useEffect, useRef, useState } from 'react';

import type {
  ClauseAnnotation,
  IngestionDraft,
} from '@evidence-poc/evidence-schema';

import type {
  IngestDraftInput,
  IngestionInputKind,
  IngestionReader,
} from '@evidence-poc/desktop-contracts/ingestion';
import type { EvidenceProjectSummary } from '@evidence-poc/desktop-contracts/projects';

import { Button, DialogClose } from '@evidence-poc/desktop-ui-kit';
import { WorkbenchDialog } from '../layout/WorkbenchDialog';
import { DraftReviewPanel } from './DraftReviewPanel';
import { IngestionFilePicker } from './IngestionFilePicker';
import { readIngestionFile } from './readIngestionFile';

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
  const ai = useAiConfiguration();
  const [kind, setKind] = useState<IngestionInputKind>('contract');
  const [content, setContent] = useState('');
  const [modelName, setModelName] = useState('文本导入的履约模型');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputBusy = busy || readingFile;
  const sourceField = useRef<HTMLTextAreaElement>(null);
  const returningToSource = useRef(false);
  useEffect(() => {
    if (!draft && returningToSource.current) {
      returningToSource.current = false;
      sourceField.current?.focus();
    }
  }, [draft]);

  const loadFiles = async (files: readonly File[]) => {
    if (inputBusy) return;
    setReadingFile(true);
    setError(null);
    try {
      const file = await readIngestionFile(files);
      setContent(file.content);
      setFileName(file.name);
      if (file.kind) setKind(file.kind);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取文件。');
    } finally {
      setReadingFile(false);
    }
  };

  const read = async () => {
    if (inputBusy) return;
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

  return (
    <WorkbenchDialog
      size="ingestion"
      title={draft ? '校对导入的草稿' : '智能文档摄取 (Smart Ingestion)'}
      description={
        draft
          ? '核对提取结果，再选择位置生成新的履约模型。'
          : '将业务说明、合同原文或接口契约转换为可校对的履约模型草稿。'
      }
      busy={inputBusy}
      onClose={onClose}
    >
      {draft ? (
        <DraftReviewPanel
          {...draft}
          busy={busy}
          onBusyChange={setBusy}
          onBack={() => {
            returningToSource.current = true;
            setDraft(null);
          }}
          onCompiled={onCompiled}
        />
      ) : (
        <form
          className="flex min-h-0 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void read();
          }}
        >
          <div className="min-h-0 overflow-y-auto overscroll-contain p-1">
            <fieldset className="min-w-0" disabled={inputBusy}>
              <legend className="sr-only">业务资料</legend>
              <IngestionFilePicker
                disabled={inputBusy}
                onFiles={(files) => void loadFiles(files)}
              />
              {fileName ? (
                <p
                  role="status"
                  className="mb-2 text-xs break-words text-workbench-label"
                >
                  已载入原文：{fileName}
                </p>
              ) : null}
              <p className="mb-3 text-[11px] text-workbench-muted">
                文件仅载入下方供核对。OpenAPI 与 SQL 按业务文本解读，不执行
                SQL，也不做格式校验。选择业务自然语言并读取时，原文可能发送给已配置的模型服务。
              </p>
              {ai && !ai.aiConfigured ? (
                <aside className="mb-3 rounded border border-workbench-border p-3 text-xs">
                  未配置大模型：仍可使用离线合同、蓝图和规则解读。要启用 AI
                  文本解读，请先
                  <button
                    type="button"
                    className="text-evidence-accent underline"
                    onClick={ai.openSettings}
                  >
                    配置 API Key
                  </button>
                  。
                </aside>
              ) : null}
              <div
                role="group"
                aria-label="业务原文类型"
                className="grid gap-2 min-[480px]:grid-cols-3"
              >
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
                      setError(null);
                    }}
                    type="button"
                  >
                    <span className="block text-[12px] font-medium text-evidence-ink">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-workbench-muted">
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
                className="mt-1.5 min-h-36 w-full resize-y rounded-md border border-evidence-line px-3 py-2 font-mono text-[11px] leading-5 text-evidence-ink outline-none focus:border-evidence-accent"
                id="ingest-content"
                ref={sourceField}
                name="content"
                onChange={(event) => {
                  setContent(event.target.value);
                  setError(null);
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
                      setKind(
                        preset.id === 'blueprint' ? 'blueprint' : 'contract',
                      );
                      setContent(preset.content);
                      setFileName(null);
                      setError(null);
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
                name="modelName"
                onChange={(event) => {
                  setModelName(event.target.value);
                }}
                value={modelName}
              />
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
          {inputBusy ? (
            <p role="status" className="text-xs text-workbench-muted">
              {readingFile ? '正在载入本地文件…' : '正在解读业务原文…'}
            </p>
          ) : null}
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button
                className="rounded-md px-3.5 text-xs"
                size="md"
                type="button"
                disabled={inputBusy}
              >
                放弃
              </Button>
            </DialogClose>
            <Button
              className="rounded-md px-4 text-xs font-medium"
              size="md"
              type="submit"
              variant="default"
              disabled={inputBusy}
              loading={busy}
            >
              读成草稿
            </Button>
          </div>
        </form>
      )}
    </WorkbenchDialog>
  );
};

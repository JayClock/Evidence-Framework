import { useState } from 'react';

import type {
  CreateProjectInput,
  EvidenceProjectSummary,
  ProjectStorageKind,
  ProjectTemplateId,
  ProjectTemplateMeta,
} from '../../../shared/projects';

export interface CreateProjectModalProps {
  templates: readonly ProjectTemplateMeta[];
  /** Template the dashboard already had in mind, if any. */
  initialTemplateId?: ProjectTemplateId;
  onCreated: (project: EvidenceProjectSummary) => void;
  onClose: () => void;
}

const STORAGE_OPTIONS: { kind: ProjectStorageKind; label: string; hint: string }[] =
  [
    {
      kind: 'directory',
      label: '目录源树',
      hint: '.evidence/fm/，适合 Git 协同与外部 Agent 同改',
    },
    {
      kind: 'file',
      label: '单文件',
      hint: '*.evidence.json，适合发送与轻量备份',
    },
  ];

const DEFAULT_NAME = '新履约模型';

/**
 * Collects the three decisions a new project needs: a name, a starter and a
 * destination. The destination comes from the main process dialog, so the
 * renderer never resolves a path on its own.
 */
export const CreateProjectModal = ({
  templates,
  initialTemplateId = 'procurement',
  onCreated,
  onClose,
}: CreateProjectModalProps) => {
  const [name, setName] = useState(DEFAULT_NAME);
  const [templateId, setTemplateId] =
    useState<ProjectTemplateId>(initialTemplateId);
  const [kind, setKind] = useState<ProjectStorageKind>('directory');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    const projectName = trimmed.length > 0 ? trimmed : DEFAULT_NAME;

    setBusy(true);
    setError(null);

    try {
      const dialog = await window.evidenceAPI.projects.showCreateDialog({
        kind,
        suggestedName: `${projectName}.evidence.json`,
      });

      if (!dialog.success) {
        if (dialog.canceled !== true) {
          setError(dialog.error);
        }

        return;
      }

      const input: CreateProjectInput = {
        targetPath: dialog.targetPath,
        name: projectName,
        templateId,
        kind: dialog.kind,
      };
      const created = await window.evidenceAPI.projects.create(input);

      if (!created.success) {
        setError(created.error);
        return;
      }

      onCreated(created.project);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法新建模型。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      aria-label="新建模型"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b1220]/40 px-6"
      role="dialog"
    >
      <div className="w-full max-w-[560px] rounded-xl border border-evidence-line bg-white p-6 shadow-[0_24px_60px_#0f172a2e]">
        <h2 className="text-[15px] font-semibold text-evidence-ink">
          新建履约模型
        </h2>
        <p className="mt-1 text-[12px] text-evidence-muted">
          先选一个起点模板，模型会写入所选位置的{' '}
          <code className="text-[11px]">.evidence/fm/</code>
          ，随后在建模工作台打开。
        </p>

        <label
          className="mt-5 block text-[12px] font-medium text-evidence-ink"
          htmlFor="create-project-name"
        >
          模型名称
        </label>
        <input
          className="mt-1.5 w-full rounded-md border border-evidence-line px-3 py-1.5 text-[12px] text-evidence-ink outline-none focus:border-evidence-accent"
          id="create-project-name"
          onChange={(event) => {
            setName(event.target.value);
          }}
          value={name}
        />

        <p className="mt-4 text-[12px] font-medium text-evidence-ink">起点模板</p>
        <ul className="mt-1.5 grid grid-cols-1 gap-2">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                aria-pressed={templateId === template.id}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                  templateId === template.id
                    ? 'border-evidence-accent bg-[#f2f6fb]'
                    : 'border-evidence-line bg-white hover:border-evidence-accent'
                }`}
                onClick={() => {
                  setTemplateId(template.id);
                }}
                type="button"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-medium text-evidence-ink">
                    {template.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-evidence-muted">
                    {template.entityCount} 业务对象 · {template.ruleCount} 规则
                  </span>
                </span>
                <span className="mt-1 block text-[11px] text-evidence-muted">
                  {template.description}
                </span>
                <span className="mt-1 block text-[10px] text-evidence-muted">
                  {template.source}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[12px] font-medium text-evidence-ink">存放形式</p>
        <div className="mt-1.5 flex gap-2">
          {STORAGE_OPTIONS.map((option) => (
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

        {error === null ? null : (
          <p className="mt-4 rounded-md border border-[#f3c6c6] bg-[#fdf2f2] px-3 py-2 text-[11px] whitespace-pre-wrap text-[#b42318]">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
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
            onClick={() => void submit()}
            type="button"
          >
            {busy ? '正在创建…' : '选择位置并创建'}
          </button>
        </div>
      </div>
    </div>
  );
};

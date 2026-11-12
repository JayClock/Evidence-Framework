import { useEffect, useState } from 'react';

import type {
  EvidenceProjectSummary,
  ProjectTemplateId,
  ProjectTemplateMeta,
} from '../../shared/projects';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { IngestDraftModal } from '../components/ingestion/IngestDraftModal';

type Status =
  | { name: 'loading' }
  | { name: 'ready'; projects: readonly EvidenceProjectSummary[] }
  | { name: 'error'; message: string };

export const DashboardScreen = () => {
  const [status, setStatus] = useState<Status>({ name: 'loading' });
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [templates, setTemplates] = useState<
    readonly ProjectTemplateMeta[] | null
  >(null);
  const [createTemplate, setCreateTemplate] =
    useState<ProjectTemplateId | null>(null);
  const [isIngestOpen, setIsIngestOpen] = useState(false);

  useEffect(() => {
    let active = true;

    void window.evidenceAPI.projects.listRecent().then((result) => {
      if (!active) {
        return;
      }

      setStatus(
        result.success
          ? { name: 'ready', projects: result.projects }
          : { name: 'error', message: result.error },
      );
    });

    // The starter cards are part of the first screen, so read them with the
    // recents instead of waiting for the dialog to open.
    void window.evidenceAPI.projects.listTemplates().then((result) => {
      if (!active) {
        return;
      }

      setTemplates(result.success ? result.templates : []);
    });

    return () => {
      active = false;
    };
  }, []);

  const openProject = async (rootPath: string) => {
    setPendingPath(rootPath);

    const result = await window.evidenceAPI.projects.open(rootPath);

    setPendingPath(null);

    if (!result.success) {
      setStatus({ name: 'error', message: result.error });
      return;
    }

    await window.evidenceAPI.projects.openEditorWindow(result.project.rootPath);
    setStatus((current) =>
      current.name === 'ready'
        ? {
            name: 'ready',
            projects: [
              result.project,
              ...current.projects.filter(
                (item) => item.rootPath !== result.project.rootPath,
              ),
            ],
          }
        : current,
    );
  };

  const chooseProject = async () => {
    const dialog = await window.evidenceAPI.projects.showOpenDialog();

    if (dialog.success) {
      await openProject(dialog.rootPath);
    }
  };

  const startCreate = (templateId: ProjectTemplateId = 'procurement') => {
    setCreateTemplate(templateId);
  };

  const starterTemplates = (templates ?? []).filter(
    (template) => template.id !== 'blank',
  );

  const rememberCreated = (project: EvidenceProjectSummary) => {
    setStatus((current) =>
      current.name === 'ready'
        ? {
            name: 'ready',
            projects: [
              project,
              ...current.projects.filter(
                (item) => item.rootPath !== project.rootPath,
              ),
            ],
          }
        : current,
    );
    void window.evidenceAPI.projects.openEditorWindow(project.rootPath);
  };

  return (
    <div className="flex h-full flex-col bg-[#f7f8fa]">
      <header className="evidence-drag-region flex h-14 shrink-0 items-center justify-between border-b border-evidence-line bg-white/80 pr-6 pl-[var(--evidence-traffic-light-space)]">
        <div>
          <p className="text-[13px] font-semibold text-evidence-ink">
            Evidence 履约建模
          </p>
          <p className="text-[11px] text-evidence-muted">
            本地 .evidence/fm 源树 · 离线只读投影之外的交互式工作台
          </p>
        </div>
        <div className="evidence-no-drag flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsIngestOpen(true);
            }}
            className="rounded-md border border-evidence-accent px-3 py-1.5 text-[12px] font-medium text-evidence-accent hover:bg-[#f2f6fb]"
          >
            从业务文本生成
          </button>
          <button
            type="button"
            onClick={() => {
              startCreate();
            }}
            className="rounded-md bg-evidence-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#274c76]"
          >
            新建模型
          </button>
          <button
            type="button"
            onClick={() => void chooseProject()}
            className="rounded-md border border-evidence-line bg-white px-3 py-1.5 text-[12px] font-medium text-evidence-ink hover:border-evidence-accent"
          >
            打开本地项目…
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-10 py-8">
        <h1 className="text-[15px] font-semibold text-evidence-ink">
          最近打开的模型
        </h1>
        <p className="mt-1 text-[12px] text-evidence-muted">
          选择一个包含{' '}
          <code className="rounded bg-white px-1 py-0.5 text-[11px] text-evidence-ink">
            .evidence/fm/model.json
          </code>{' '}
          的目录开始建模，或新建一个起点模型。
        </p>

        {status.name === 'loading' ? (
          <p className="mt-6 text-[12px] text-evidence-muted">正在读取…</p>
        ) : null}

        {status.name === 'error' ? (
          <p className="mt-6 rounded-md border border-[#f3c6c6] bg-[#fdf2f2] px-3 py-2 text-[12px] whitespace-pre-wrap text-[#b42318]">
            {status.message}
          </p>
        ) : null}

        {status.name === 'ready' && status.projects.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-evidence-line bg-white/70 px-6 py-8 text-center">
            <p className="text-[13px] font-medium text-evidence-ink">
              还没有打开过模型
            </p>
            <p className="mt-2 text-[12px] text-evidence-muted">
              直接新建一个起点模型，或从下面的经典范例开始；也可以粘贴一段合同条款、需求段落或服务蓝图表格，让工作台先读成草稿再校对。建模产物写入{' '}
              <code className="text-[11px]">.evidence/fm/</code>
              ，桌面端只读写该源树。
            </p>
            <button
              className="mt-4 rounded-md border border-evidence-accent px-3 py-1.5 text-[12px] font-medium text-evidence-accent hover:bg-[#f2f6fb]"
              onClick={() => {
                setIsIngestOpen(true);
              }}
              type="button"
            >
              从业务文本生成
            </button>
            <ul className="mt-5 grid grid-cols-1 gap-2 text-left md:grid-cols-3">
              {starterTemplates.map((template) => (
                <li key={template.id}>
                  <button
                    className="h-full w-full rounded-lg border border-evidence-line bg-white px-3 py-2.5 transition hover:border-evidence-accent"
                    onClick={() => {
                      startCreate(template.id);
                    }}
                    type="button"
                  >
                    <span className="block text-[12px] font-medium text-evidence-ink">
                      {template.name}
                    </span>
                    <span className="mt-1 block text-[11px] text-evidence-muted">
                      {template.description}
                    </span>
                    <span className="mt-1.5 block text-[10px] text-evidence-muted">
                      {template.entityCount} 业务对象 · {template.ruleCount} 规则
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {status.name === 'ready' && status.projects.length > 0 ? (
          <ul className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {status.projects.map((project) => (
              <li key={project.rootPath}>
                <button
                  type="button"
                  onClick={() => void openProject(project.rootPath)}
                  disabled={pendingPath !== null}
                  className="w-full rounded-lg border border-evidence-line bg-white px-4 py-3 text-left transition hover:border-evidence-accent disabled:opacity-60"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="truncate text-[13px] font-medium text-evidence-ink">
                      {project.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-evidence-muted">
                      {project.modelVersion}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-evidence-muted">
                    {project.rootPath}
                  </p>
                  <p className="mt-2 flex gap-3 text-[11px] text-evidence-muted">
                    <span>业务对象 {project.entityCount}</span>
                    <span>关系 {project.relationshipCount}</span>
                    <span>规则 {project.ruleCount}</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </main>

      {isIngestOpen ? (
        <IngestDraftModal
          onClose={() => {
            setIsIngestOpen(false);
          }}
          onCompiled={rememberCreated}
        />
      ) : null}

      {createTemplate === null || templates === null ? null : (
        <CreateProjectModal
          initialTemplateId={createTemplate}
          onClose={() => {
            setCreateTemplate(null);
          }}
          onCreated={rememberCreated}
          templates={templates}
        />
      )}
    </div>
  );
};

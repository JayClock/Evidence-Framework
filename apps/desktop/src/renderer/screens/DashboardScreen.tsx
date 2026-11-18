import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  EvidenceProjectSummary,
  ProjectTemplateId,
  ProjectTemplateMeta,
} from '@evidence-poc/desktop-contracts/projects';
import { Card } from '@evidence-poc/desktop-ui-kit';

import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { DashboardNavbar } from '../components/dashboard/DashboardNavbar';
import { HeroIngestionCard } from '../components/dashboard/HeroIngestionCard';
import { RecentProjectCard } from '../components/dashboard/RecentProjectCard';
import { StarterTemplateCard } from '../components/dashboard/StarterTemplateCard';
import { IngestDraftModal } from '../components/ingestion/IngestDraftModal';

type RecentsState = {
  projects: readonly EvidenceProjectSummary[];
  loading: boolean;
  error?: string;
};

type TemplatesState =
  | { name: 'loading' }
  | { name: 'ready'; templates: readonly ProjectTemplateMeta[] }
  | { name: 'error'; message: string };

type OpenRequest = { name: 'choosing' } | { name: 'opening'; path: string };

const featuredTemplateIds = ['procurement', 'blank'] as const;

export const DashboardScreen = () => {
  const [recents, setRecents] = useState<RecentsState>({
    projects: [],
    loading: true,
  });
  const [openRequest, setOpenRequest] = useState<OpenRequest | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const isOpening = useRef(false);
  const [templatesState, setTemplatesState] = useState<TemplatesState>({
    name: 'loading',
  });
  const [createTemplate, setCreateTemplate] =
    useState<ProjectTemplateId | null>(null);
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const dashboardModalOpen = createTemplate !== null || isIngestOpen;

  useEffect(() => {
    let active = true;
    const api = window.evidenceAPI.projects;

    void api
      .listRecent()
      .then((result) => {
        if (!active) return;
        if (!result.success) {
          setRecents((current) => ({
            ...current,
            loading: false,
            error: result.error,
          }));
          return;
        }

        setRecents((current) => ({
          loading: false,
          // An open/create can finish before the initial history load.
          projects: [
            ...current.projects,
            ...result.projects.filter(
              (project) =>
                !current.projects.some(
                  (item) => item.rootPath === project.rootPath,
                ),
            ),
          ],
        }));
      })
      .catch(() => {
        if (active) {
          setRecents((current) => ({
            ...current,
            loading: false,
            error: '无法读取最近项目。',
          }));
        }
      });

    void api
      .listTemplates()
      .then((result) => {
        if (!active) return;
        setTemplatesState(
          result.success
            ? { name: 'ready', templates: result.templates }
            : { name: 'error', message: result.error },
        );
      })
      .catch(() => {
        if (active)
          setTemplatesState({ name: 'error', message: '无法读取起点模板。' });
      });

    return () => {
      active = false;
    };
  }, []);

  const rememberProject = useCallback((project: EvidenceProjectSummary) => {
    setRecents((current) => ({
      ...current,
      projects: [
        project,
        ...current.projects.filter(
          (item) => item.rootPath !== project.rootPath,
        ),
      ],
    }));
  }, []);

  const openProject = useCallback(
    async (rootPath?: string) => {
      if (isOpening.current) return;
      isOpening.current = true;
      setOpenError(null);
      const api = window.evidenceAPI.projects;

      try {
        if (rootPath === undefined) {
          setOpenRequest({ name: 'choosing' });
          const dialog = await api.showOpenDialog();
          if (!dialog.success) {
            if (dialog.canceled !== true) setOpenError(dialog.error);
            return;
          }
          rootPath = dialog.rootPath;
        }

        setOpenRequest({ name: 'opening', path: rootPath });
        const result = await api.open(rootPath);
        if (!result.success) {
          setOpenError(result.error);
          return;
        }

        await api.openEditorWindow(result.project.rootPath);
        rememberProject(result.project);
      } catch (error) {
        setOpenError(error instanceof Error ? error.message : '无法打开项目。');
      } finally {
        isOpening.current = false;
        setOpenRequest(null);
      }
    },
    [rememberProject],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.shiftKey ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'o' ||
        dashboardModalOpen ||
        document.querySelector('[role="dialog"]') !== null
      ) {
        return;
      }
      event.preventDefault();
      void openProject();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dashboardModalOpen, openProject]);

  const rememberCreated = (project: EvidenceProjectSummary) => {
    rememberProject(project);
    void window.evidenceAPI.projects
      .openEditorWindow(project.rootPath)
      .catch(() => {
        setOpenError('模型已创建，但无法打开工作台。请从最近项目重试。');
      });
  };

  const { projects } = recents;
  const templates =
    templatesState.name === 'ready' ? templatesState.templates : [];
  const suggestedTemplate =
    templates.find((template) => template.id === 'procurement') ?? templates[0];
  const featuredTemplates = featuredTemplateIds.flatMap((id) => {
    const template = templates.find((item) => item.id === id);
    return template ? [template] : [];
  });

  return (
    <>
      <div
        className="flex h-full flex-col bg-workbench-background"
        data-dashboard
        inert={dashboardModalOpen || undefined}
      >
        <DashboardNavbar
          openDisabled={openRequest !== null}
          createDisabled={!suggestedTemplate || openRequest !== null}
          onOpen={() => void openProject()}
          onCreate={() => {
            if (suggestedTemplate) setCreateTemplate(suggestedTemplate.id);
          }}
        />

        <main className="@container/dashboard min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-6 py-8 @min-[60rem]/dashboard:px-8 @min-[84rem]/dashboard:px-12">
            <div className="grid max-w-[1312px] items-start gap-8 @min-[58rem]/dashboard:grid-cols-[minmax(0,820fr)_minmax(0,460fr)]">
              <section
                aria-labelledby="recent-projects-title"
                className="flex min-w-0 flex-col gap-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h1
                    className="text-lg font-bold text-evidence-ink"
                    id="recent-projects-title"
                  >
                    最近打开的项目
                  </h1>
                  {!recents.loading && !recents.error ? (
                    <p className="text-xs text-workbench-muted">
                      共 {projects.length} 个项目 · 由本地 .evidence/fm 驱动
                    </p>
                  ) : null}
                </div>

                {recents.loading ? (
                  <p className="text-xs text-workbench-muted" role="status">
                    正在读取最近项目…
                  </p>
                ) : null}
                {recents.error ? (
                  <p className="text-xs break-words text-red-700" role="alert">
                    {recents.error}
                  </p>
                ) : null}
                {openError ? (
                  <p
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs whitespace-pre-wrap break-words text-red-700"
                    role="alert"
                  >
                    {openError}
                  </p>
                ) : null}
                {!recents.loading && !recents.error && projects.length === 0 ? (
                  <Card className="flex flex-col gap-2 border-dashed px-6 py-8 text-center">
                    <p className="text-sm font-semibold text-evidence-ink">
                      还没有打开过模型
                    </p>
                    <p className="text-xs text-workbench-muted">
                      打开包含 <code>.evidence/fm/</code> 的项目目录或 Evidence
                      单文件，也可以用起点模板或业务文档创建模型。
                    </p>
                  </Card>
                ) : null}
                {projects.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {projects.map((project, index) => (
                      <li key={project.rootPath}>
                        <RecentProjectCard
                          project={project}
                          isMostRecent={index === 0}
                          disabled={openRequest !== null}
                          opening={
                            openRequest?.name === 'opening' &&
                            openRequest.path === project.rootPath
                          }
                          onOpen={() => void openProject(project.rootPath)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section
                aria-labelledby="quick-start-title"
                className="flex min-w-0 flex-col gap-4"
              >
                <h2
                  className="text-lg font-bold text-evidence-ink"
                  id="quick-start-title"
                >
                  快速开始与智能摄取
                </h2>
                <HeroIngestionCard onOpen={() => setIsIngestOpen(true)} />
                {featuredTemplates.map((template) => (
                  <StarterTemplateCard
                    key={template.id}
                    template={template}
                    onSelect={() => setCreateTemplate(template.id)}
                  />
                ))}
                {templatesState.name === 'loading' ? (
                  <p className="text-xs text-workbench-muted" role="status">
                    正在读取起点模板…
                  </p>
                ) : null}
                {templatesState.name === 'error' ? (
                  <p className="text-xs break-words text-red-700" role="alert">
                    {templatesState.message}
                  </p>
                ) : null}
              </section>
            </div>
          </div>
        </main>
      </div>

      {isIngestOpen ? (
        <IngestDraftModal
          onClose={() => setIsIngestOpen(false)}
          onCompiled={rememberCreated}
        />
      ) : null}

      {createTemplate !== null ? (
        <CreateProjectModal
          initialTemplateId={createTemplate}
          onClose={() => setCreateTemplate(null)}
          onCreated={rememberCreated}
          templates={templates}
        />
      ) : null}
    </>
  );
};

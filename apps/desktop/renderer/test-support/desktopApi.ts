import type { EvidenceDesktopApi } from '../../shared/ipc';
import type {
  EvidenceProjectSummary,
  OpenProjectResult,
} from '../../shared/projects';

export const projectSummary = (
  overrides: Partial<EvidenceProjectSummary> = {},
): EvidenceProjectSummary => ({
  rootPath: '/models/procurement',
  modelRoot: '/models/procurement/.evidence/fm',
  name: '商品采购（Product Procurement）',
  modelId: 'product-procurement',
  modelVersion: '1.1.0',
  entityCount: 12,
  relationshipCount: 8,
  ruleCount: 3,
  lastOpenedAt: '2026-11-11T08:00:00.000Z',
  ...overrides,
});

export interface DesktopApiMock extends EvidenceDesktopApi {
  calls: {
    open: string[];
    save: string[];
    openEditorWindow: string[];
    showOpenDialog: number;
  };
}

/**
 * Installs a scripted `window.evidenceAPI` for renderer tests and returns the
 * call log, so component tests never touch Electron IPC.
 */
export const installDesktopApi = ({
  projects = [],
  openResult = {
    success: true,
    project: projectSummary(),
    document: { manifest: {} } as never,
    issues: [],
  },
  saveResult = {
    success: true,
    written: [],
    unchanged: [],
    removed: [],
    savedAt: '2026-11-11T08:00:00.000Z',
  },
  dialogResult = { success: false, canceled: true } as const,
}: {
  projects?: readonly EvidenceProjectSummary[];
  openResult?: OpenProjectResult;
  saveResult?: Awaited<ReturnType<EvidenceDesktopApi['projects']['save']>>;
  dialogResult?: Awaited<
    ReturnType<EvidenceDesktopApi['projects']['showOpenDialog']>
  >;
} = {}): DesktopApiMock => {
  const calls: DesktopApiMock['calls'] = {
    open: [],
    save: [],
    openEditorWindow: [],
    showOpenDialog: 0,
  };

  const api: DesktopApiMock = {
    calls,
    projects: {
      showOpenDialog: async () => {
        calls.showOpenDialog += 1;

        return dialogResult;
      },
      open: async (rootPath) => {
        calls.open.push(rootPath);

        return openResult;
      },
      save: async (input) => {
        calls.save.push(input.rootPath);

        return saveResult;
      },
      listRecent: async () => ({ success: true, projects }),
      openEditorWindow: async (rootPath) => {
        calls.openEditorWindow.push(rootPath);
      },
      onChanged: () => () => undefined,
    },
    system: { platform: 'darwin' },
  };

  Object.defineProperty(window, 'evidenceAPI', {
    value: api,
    configurable: true,
    writable: true,
  });

  return api;
};

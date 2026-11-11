import path from 'node:path';

import { BrowserWindow } from 'electron';

const isMac = process.platform === 'darwin';
const WINDOW_CASCADE_OFFSET = 24;
const DASHBOARD_SIZE = { width: 1024, height: 680 };
const EDITOR_SIZE = { width: 1440, height: 900 };

let editorWindowOpenCount = 0;
const editorWindows = new Map<string, BrowserWindow>();

const getPreloadPath = (): string => path.join(__dirname, 'preload.js');

const getRendererPath = (): string =>
  path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);

export const loadRendererRoute = (
  window: BrowserWindow,
  hash: string,
): void => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}#${hash}`);
    return;
  }

  void window.loadFile(getRendererPath(), { hash });
};

const baseWindowOptions = (): Electron.BrowserWindowConstructorOptions => ({
  frame: false,
  titleBarStyle: 'hidden',
  trafficLightPosition: isMac ? { x: 20, y: 16 } : undefined,
  autoHideMenuBar: true,
  backgroundColor: isMac ? '#00000000' : '#f6f7f9',
  ...(isMac
    ? {
        vibrancy: 'sidebar' as const,
        visualEffectState: 'active' as const,
        transparent: true,
      }
    : {}),
  webPreferences: {
    preload: getPreloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
  },
});

export const createDashboardWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    ...DASHBOARD_SIZE,
    minWidth: 900,
    minHeight: 600,
    ...baseWindowOptions(),
  });

  loadRendererRoute(window, '/dashboard');

  return window;
};

/**
 * Opens the model workspace for one project root, focusing the existing editor
 * window instead of stacking duplicates for the same tree.
 */
export const openEditorWindow = (rootPath: string): BrowserWindow => {
  const existing = editorWindows.get(rootPath);

  if (existing !== undefined && !existing.isDestroyed()) {
    existing.focus();

    return existing;
  }

  const offset = (editorWindowOpenCount % 8) * WINDOW_CASCADE_OFFSET;
  const window = new BrowserWindow({
    ...EDITOR_SIZE,
    minWidth: 1180,
    minHeight: 760,
    ...baseWindowOptions(),
    ...(offset === 0 ? {} : { x: undefined, y: undefined }),
  });

  editorWindowOpenCount += 1;
  editorWindows.set(rootPath, window);
  window.on('closed', () => {
    if (editorWindows.get(rootPath) === window) {
      editorWindows.delete(rootPath);
    }
  });
  loadRendererRoute(window, `/editor?rootPath=${encodeURIComponent(rootPath)}`);

  return window;
};

export const listEditorWindows = (): readonly BrowserWindow[] => [
  ...editorWindows.values(),
];

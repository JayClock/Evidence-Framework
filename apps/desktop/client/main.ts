import path from 'node:path';

import { app, BrowserWindow, nativeTheme } from 'electron';

import { registerAgentIpc } from './agentIpcHandlers';
import { registerProjectIpc } from './projectIpc';
import { createProjectStore, RECENT_PROJECTS_FILE } from './projectStore';
import { createDashboardWindow, openEditorWindow } from './windows';

const isMac = process.platform === 'darwin';

const startApplication = async (): Promise<void> => {
  const projectStore = createProjectStore({
    recentProjectsFile: path.join(
      app.getPath('userData'),
      RECENT_PROJECTS_FILE,
    ),
  });

  registerProjectIpc({ projectStore, openEditorWindow });
  registerAgentIpc();
  createDashboardWindow();
};

if (isMac) {
  nativeTheme.themeSource = 'light';
}

void app.whenReady().then(startApplication);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createDashboardWindow();
  }
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

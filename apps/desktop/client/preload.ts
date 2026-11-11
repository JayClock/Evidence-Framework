import { contextBridge, ipcRenderer } from 'electron';

import { EVIDENCE_IPC_CHANNELS, type EvidenceDesktopApi } from '../shared/ipc';

/**
 * Minimal, typed bridge: the renderer never sees `ipcRenderer`, `fs` or any
 * Node module, only these five project calls.
 */
const api: EvidenceDesktopApi = {
  projects: {
    showOpenDialog: () =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.showOpenDialog),
    open: (rootPath) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.open, rootPath),
    save: (input) => ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.save, input),
    listRecent: () => ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.recent),
    openEditorWindow: (rootPath) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.openEditorWindow, rootPath),
    onChanged: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: Parameters<typeof listener>[0],
      ) => listener(payload);

      ipcRenderer.on(EVIDENCE_IPC_CHANNELS.changed, handler);

      return () => {
        ipcRenderer.removeListener(EVIDENCE_IPC_CHANNELS.changed, handler);
      };
    },
  },
  system: {
    platform: process.platform,
  },
};

contextBridge.exposeInMainWorld('evidenceAPI', api);

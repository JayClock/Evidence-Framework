import { contextBridge, ipcRenderer } from 'electron';

import {
  EVIDENCE_AGENT_IPC_CHANNELS,
  type AgentActionResult,
  type AgentEventPayload,
  type AgentPromptInput,
  type AgentSteerInput,
  type AgentSteerOutcome,
  type ApplyPatchRequest,
  type ApplyPatchResponse,
  type CanvasContextRegistration,
  type SensorReportPayload,
  type SensorTriggerInput,
} from '../shared/agentIpc';
import { EVIDENCE_IPC_CHANNELS, type EvidenceDesktopApi } from '../shared/ipc';

/**
 * Minimal, typed bridge: the renderer never sees `ipcRenderer`, `fs` or any
 * Node module, only the project calls and the agent surface.
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
  agent: {
    prompt: (input: AgentPromptInput): Promise<AgentActionResult> =>
      ipcRenderer.invoke(EVIDENCE_AGENT_IPC_CHANNELS.prompt, input),
    steer: (input: AgentSteerInput): Promise<AgentSteerOutcome> =>
      ipcRenderer.invoke(EVIDENCE_AGENT_IPC_CHANNELS.steer, input),
    abort: (input) =>
      ipcRenderer.invoke(EVIDENCE_AGENT_IPC_CHANNELS.abort, input),
    triggerSensors: (input: SensorTriggerInput) =>
      ipcRenderer.invoke(EVIDENCE_AGENT_IPC_CHANNELS.triggerSensors, input),
    notifyModelChanged: (input) =>
      ipcRenderer.invoke(EVIDENCE_AGENT_IPC_CHANNELS.modelChanged, input),
    latestReport: (input) =>
      ipcRenderer.invoke(EVIDENCE_AGENT_IPC_CHANNELS.latestReport, input),
    publishCanvasContext: (input: CanvasContextRegistration) =>
      ipcRenderer.invoke(EVIDENCE_AGENT_IPC_CHANNELS.canvasContext, input),
    onEvent: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: AgentEventPayload,
      ) => listener(payload);

      ipcRenderer.on(EVIDENCE_AGENT_IPC_CHANNELS.events, handler);

      return () => {
        ipcRenderer.removeListener(EVIDENCE_AGENT_IPC_CHANNELS.events, handler);
      };
    },
    onReport: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: SensorReportPayload,
      ) => listener(payload);

      ipcRenderer.on(EVIDENCE_AGENT_IPC_CHANNELS.report, handler);

      return () => {
        ipcRenderer.removeListener(EVIDENCE_AGENT_IPC_CHANNELS.report, handler);
      };
    },
    onApplyPatch: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        request: ApplyPatchRequest,
      ) => listener(request);

      ipcRenderer.on(EVIDENCE_AGENT_IPC_CHANNELS.applyPatch, handler);

      return () => {
        ipcRenderer.removeListener(
          EVIDENCE_AGENT_IPC_CHANNELS.applyPatch,
          handler,
        );
      };
    },
    respondPatch: (response: ApplyPatchResponse) => {
      ipcRenderer.send(EVIDENCE_AGENT_IPC_CHANNELS.applyPatchResult, response);
    },
  },
  system: {
    platform: process.platform,
  },
};

contextBridge.exposeInMainWorld('evidenceAPI', api);

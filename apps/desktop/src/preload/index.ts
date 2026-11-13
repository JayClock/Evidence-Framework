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
import {
  EVIDENCE_INGESTION_IPC_CHANNELS,
  EVIDENCE_IPC_CHANNELS,
  type EvidenceDesktopApi,
} from '../shared/ipc';
import {
  EVIDENCE_SIMULATION_IPC_CHANNELS,
  type DriftRequest,
  type ReplayRequest,
} from '../shared/simulation';
import {
  EVIDENCE_MCP_IPC_CHANNELS,
  type McpRendererRequest,
  type McpRendererResponse,
  type McpStatus,
} from '../shared/mcpIpc';

/**
 * Minimal, typed bridge: the renderer never sees `ipcRenderer`, `fs` or any
 * Node module, only the project calls and the agent surface.
 */
const api: EvidenceDesktopApi = {
  projects: {
    showOpenDialog: () =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.showOpenDialog),
    showCreateDialog: (input) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.showCreateDialog, input),
    create: (input) => ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.create, input),
    listTemplates: () => ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.templates),
    open: (rootPath) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.open, rootPath),
    save: (input) => ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.save, input),
    listRecent: () => ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.recent),
    openEditorWindow: (rootPath) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.openEditorWindow, rootPath),
    previewReview: (input) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.previewReview, input),
    exportDiffReview: (rootPath: string) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.exportDiffReview, rootPath),
    exportReview: (rootPath: string) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.exportReview, rootPath),
    deliveryLivePreview: (input) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.deliveryLivePreview, input),
    exportLiveDelivery: (input) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.exportLiveDelivery, input),
    deliveryPreview: (rootPath: string) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.deliveryPreview, rootPath),
    exportDelivery: (rootPath: string) =>
      ipcRenderer.invoke(EVIDENCE_IPC_CHANNELS.exportDelivery, rootPath),
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
  mcp: {
    getStatus: () => ipcRenderer.invoke(EVIDENCE_MCP_IPC_CHANNELS.status),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: McpStatus) =>
        listener(status);

      ipcRenderer.on(EVIDENCE_MCP_IPC_CHANNELS.status, handler);

      return () => {
        ipcRenderer.removeListener(EVIDENCE_MCP_IPC_CHANNELS.status, handler);
      };
    },
    onRequest: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        request: McpRendererRequest,
      ) => listener(request);

      ipcRenderer.on(EVIDENCE_MCP_IPC_CHANNELS.request, handler);

      return () => {
        ipcRenderer.removeListener(EVIDENCE_MCP_IPC_CHANNELS.request, handler);
      };
    },
    respond: (response: McpRendererResponse) => {
      ipcRenderer.send(EVIDENCE_MCP_IPC_CHANNELS.response, response);
    },
    onCaptureMode: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, active: boolean) =>
        listener(active);

      ipcRenderer.on(EVIDENCE_MCP_IPC_CHANNELS.captureMode, handler);

      return () => {
        ipcRenderer.removeListener(
          EVIDENCE_MCP_IPC_CHANNELS.captureMode,
          handler,
        );
      };
    },
  },
  simulation: {
    replay: (input: ReplayRequest) =>
      ipcRenderer.invoke(EVIDENCE_SIMULATION_IPC_CHANNELS.replay, input),
    drift: (input: DriftRequest) =>
      ipcRenderer.invoke(EVIDENCE_SIMULATION_IPC_CHANNELS.drift, input),
    pickTrace: () =>
      ipcRenderer.invoke(EVIDENCE_SIMULATION_IPC_CHANNELS.traceDialog),
  },
  ingestion: {
    draft: (input) =>
      ipcRenderer.invoke(EVIDENCE_INGESTION_IPC_CHANNELS.draft, input),
    compile: (input) =>
      ipcRenderer.invoke(EVIDENCE_INGESTION_IPC_CHANNELS.compile, input),
  },
  system: {
    platform: process.platform,
  },
};

contextBridge.exposeInMainWorld('evidenceAPI', api);

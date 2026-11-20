import { EVIDENCE_AI_CONFIG_IPC_CHANNELS as AI } from '@evidence-poc/desktop-contracts/aiConfig';
import { contextBridge, ipcRenderer } from 'electron';

import {
  EVIDENCE_AGENT_IPC_CHANNELS,
  type AgentPromptInput,
  type AgentPromptResult,
  type AgentSteerInput,
  type AgentSteerOutcome,
  type AgentEventPayload,
  type PatchCommittedPayload,
  type CanvasContextRegistration,
  type SensorReportPayload,
  type SensorTriggerInput,
} from '@evidence-poc/desktop-contracts/agentIpc';
import {
  EVIDENCE_INGESTION_IPC_CHANNELS,
  EVIDENCE_IPC_CHANNELS,
  type EvidenceDesktopApi,
} from '@evidence-poc/desktop-contracts/ipc';
import { STORY_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/story';
import {
  EVIDENCE_MCP_IPC_CHANNELS,
  type McpRendererRequest,
  type McpRendererResponse,
  type McpStatus,
} from '@evidence-poc/desktop-contracts/mcpIpc';

/**
 * Minimal, typed bridge: the renderer never sees `ipcRenderer`, `fs` or any
 * Node module, only the project calls and the agent surface.
 */
const api: EvidenceDesktopApi = {
  aiConfig: {
    getStatus: () => ipcRenderer.invoke(AI.getStatus),
    reload: () => ipcRenderer.invoke(AI.reload),
    openConfigDirectory: () => ipcRenderer.invoke(AI.openConfigDirectory),
    selectModel: (request) => ipcRenderer.invoke(AI.selectModel, request),
    testConnection: (request) => ipcRenderer.invoke(AI.testConnection, request),
    onChanged: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        status: Parameters<typeof listener>[0],
      ) => listener(status);
      ipcRenderer.on(AI.changed, handler);
      return () => {
        ipcRenderer.removeListener(AI.changed, handler);
      };
    },
  },
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
  story: {
    listFlows: (input) =>
      ipcRenderer.invoke(STORY_IPC_CHANNELS.LIST_FLOWS, input),
    project: (input) => ipcRenderer.invoke(STORY_IPC_CHANNELS.PROJECT, input),
    whatIf: (input) => ipcRenderer.invoke(STORY_IPC_CHANNELS.WHAT_IF, input),
    onInvalidated: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: Parameters<typeof listener>[0],
      ) => listener(payload);
      ipcRenderer.on(STORY_IPC_CHANNELS.INVALIDATED, handler);
      return () =>
        ipcRenderer.removeListener(STORY_IPC_CHANNELS.INVALIDATED, handler);
    },
  },
  agent: {
    prompt: (input: AgentPromptInput): Promise<AgentPromptResult> =>
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
    onPatchCommitted: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: PatchCommittedPayload,
      ) => listener(payload);
      const channel = EVIDENCE_AGENT_IPC_CHANNELS.patchCommitted;
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
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

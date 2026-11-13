import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { dialog, ipcMain } from 'electron';

import type { McpDriftAudit, McpScenarioReplay } from '@evidence-poc/evidence-mcp';

import {
  EVIDENCE_SIMULATION_IPC_CHANNELS,
  type DriftRequest,
  type ReplayRequest,
  type TraceDialogResult,
} from '../shared/simulation';

import type { SimulationService } from './mcpSimulationService';

/**
 * The desktop half of the simulation sandbox and the drift radar.
 *
 * Both answer from the saved sources in the main process: the renderer has no
 * filesystem, and an audit of a trace belongs against what was deployed rather
 * than against unsaved canvas edits.
 */

export interface SimulationIpcOptions {
  service?: SimulationService;
  /** Injected by a test that must not open a dialog. */
  showOpenDialog?: () => Promise<{ canceled: boolean; filePath?: string }>;
  /** Injected by a test that must not read the filesystem. */
  readFile?: (filePath: string) => Promise<string>;
}

const parseTrace = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `不是 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const registerSimulationIpc = ({
  service,
  showOpenDialog,
  readFile: read,
}: SimulationIpcOptions = {}) => {
  const resolve = async (): Promise<SimulationService> => {
    if (service !== undefined) {
      return service;
    }

    const { createSimulationService } = await import('./mcpSimulationService');

    return createSimulationService();
  };

  const pickTrace = async (): Promise<TraceDialogResult> => {
    const result: { canceled: boolean; filePath?: string } =
      showOpenDialog === undefined
        ? await dialog.showOpenDialog({
            title: '选择导出的 trace',
            properties: ['openFile'],
            filters: [
              { name: 'OTLP JSON', extensions: ['json'] },
              { name: '所有文件', extensions: ['*'] },
            ],
          })
        : await showOpenDialog();

    const filePath = result.filePath;

    return result.canceled || filePath === undefined
      ? { canceled: true }
      : { canceled: false, path: path.resolve(filePath) };
  };

  ipcMain.handle(
    EVIDENCE_SIMULATION_IPC_CHANNELS.replay,
    async (_event, input: ReplayRequest): Promise<McpScenarioReplay> =>
      (await resolve()).replay({
        rootPath: input.rootPath,
        ...(input.scenarioId === undefined
          ? {}
          : { scenarioId: input.scenarioId }),
      }),
  );

  ipcMain.handle(
    EVIDENCE_SIMULATION_IPC_CHANNELS.drift,
    async (_event, input: DriftRequest): Promise<McpDriftAudit> => {
      const text =
        read === undefined
          ? await readFile(input.tracePath, 'utf8')
          : await read(input.tracePath);

      return (await resolve()).auditDrift({
        rootPath: input.rootPath,
        document: parseTrace(text),
      });
    },
  );

  ipcMain.handle(
    EVIDENCE_SIMULATION_IPC_CHANNELS.traceDialog,
    async (): Promise<TraceDialogResult> => pickTrace(),
  );

  return {
    dispose: (): void => {
      for (const channel of Object.values(EVIDENCE_SIMULATION_IPC_CHANNELS)) {
        ipcMain.removeHandler(channel);
      }
    },
    /** Exposed so a window test can drive the picker without a dialog. */
    pickTrace,
  };
};

export type SimulationIpc = ReturnType<typeof registerSimulationIpc>;

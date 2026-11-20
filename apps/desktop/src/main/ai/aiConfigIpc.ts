import { BrowserWindow, ipcMain } from 'electron';
import { EVIDENCE_AI_CONFIG_IPC_CHANNELS as AI } from '@evidence-poc/desktop-contracts/aiConfig';
import type { AiConfigService } from './aiConfigService';

export const registerAiConfigIpc = (
  service: AiConfigService,
  resetModels: () => Promise<void>,
) => {
  const publishSelection = async () => {
    try {
      await resetModels();
    } catch {
      process.stderr.write('无法刷新 AI 会话，请重新打开项目。\n');
    }
    const status = await service.getStatus();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(AI.changed, status);
    }
    return status;
  };

  ipcMain.handle(AI.getStatus, () => service.getStatus());
  ipcMain.handle(AI.selectModel, async (_event, request: unknown) => {
    try {
      await service.selectModel(request);
    } catch {
      throw new Error('无法保存 Pi 模型选择，请检查模型可用性和配置目录权限。');
    }
    await publishSelection();
  });
  ipcMain.handle(AI.testConnection, (_event, request: unknown) =>
    service.testConnection(request),
  );
  return {
    dispose: () => {
      for (const channel of [AI.getStatus, AI.selectModel, AI.testConnection])
        ipcMain.removeHandler(channel);
    },
  };
};

import { BrowserWindow, ipcMain } from 'electron';
import { EVIDENCE_AI_CONFIG_IPC_CHANNELS as AI } from '@evidence-poc/desktop-contracts/aiConfig';
import type { AiConfigService } from './aiConfigService';

export const registerAiConfigIpc = (
  service: AiConfigService,
  resetModels: () => Promise<void>,
) => {
  ipcMain.handle(AI.getStatus, () => service.getStatus());
  ipcMain.handle(AI.save, async (_event, request: unknown) => {
    try {
      return await service.save(request);
    } catch {
      throw new Error(
        '无法保存 AI 配置。请检查模型名称、端点、API Key 和桌面配置目录。',
      );
    }
  });
  ipcMain.handle(AI.testConnection, (_event, request: unknown) =>
    service.testConnection(request),
  );
  ipcMain.handle(AI.importCli, async () => {
    try {
      return await service.importFromLocalPiCli();
    } catch {
      throw new Error('无法导入 Pi CLI 配置，请检查凭证文件和桌面配置目录。');
    }
  });
  const unsubscribe = service.onChanged(() => {
    void (async () => {
      await resetModels();
      const status = await service.getStatus();
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(AI.changed, status);
      }
    })().catch(() => {
      process.stderr.write('AI 配置已保存，但会话刷新失败，请重新打开工程。\n');
    });
  });
  return {
    dispose: () => {
      unsubscribe();
      for (const channel of [
        AI.getStatus,
        AI.save,
        AI.testConnection,
        AI.importCli,
      ])
        ipcMain.removeHandler(channel);
    },
  };
};

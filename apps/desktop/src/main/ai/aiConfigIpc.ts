import { BrowserWindow, ipcMain } from 'electron';
import { EVIDENCE_AI_CONFIG_IPC_CHANNELS as AI } from '@evidence-poc/desktop-contracts/aiConfig';
import type { AiConfigService } from './aiConfigService';

export const registerAiConfigIpc = (
  service: AiConfigService,
  resetModels: () => Promise<void>,
) => {
  ipcMain.handle(AI.getStatus, () => service.getStatus());
  ipcMain.handle(AI.save, (_event, request: unknown) => service.save(request));
  ipcMain.handle(AI.testConnection, (_event, request: unknown) =>
    service.testConnection(request),
  );
  ipcMain.handle(AI.importCli, () => service.importFromLocalPiCli());
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

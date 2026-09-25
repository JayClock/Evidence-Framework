import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { DeliveryRunner, type RunResult } from './runner.js';

export default function evidenceDelivery(pi: ExtensionAPI): void {
  let active = false;
  const controllers = new Set<AbortController>();
  pi.on('session_shutdown', async () => {
    for (const controller of controllers) controller.abort();
  });

  async function delegate(
    signal: AbortSignal | undefined,
    action: (signal: AbortSignal) => Promise<RunResult>,
  ) {
    if (active) throw new Error('同一主会话只允许一个交付委派运行');
    active = true;
    const controller = new AbortController();
    const abort = () => controller.abort();
    controllers.add(controller);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      const result = await action(controller.signal);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ...result,
              report: result.report.slice(0, 12000),
              notice:
                '仅为待核验交接，不是完成或批准；完整报告和原始日志见 runDir。主 Agent 核验后唯一归档。',
            }),
          },
        ],
        details: result,
      };
    } finally {
      controllers.delete(controller);
      signal?.removeEventListener('abort', abort);
      active = false;
    }
  }

  pi.registerTool({
    name: 'evidence_worker',
    label: 'Evidence Independent Worker',
    description:
      '在新的 Pi 进程内执行一个已授权任务。传原始来源路径、具体授权/目标/非目标、精确可写文件；仅返回临时交付，不写计划。共享工作树且不是沙箱。',
    parameters: Type.Object({
      taskKey: Type.String({ minLength: 1 }),
      assignment: Type.String({ minLength: 1 }),
      sourceRefs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      allowedFiles: Type.Array(Type.String({ minLength: 1 })),
    }),
    async execute(_id, packet, signal, _update, ctx) {
      if (!ctx.model) throw new Error('委派需要主会话已选定模型');
      const runner = new DeliveryRunner(
        ctx.cwd,
        `${ctx.model.provider}/${ctx.model.id}`,
        pi.getThinkingLevel(),
      );
      return delegate(signal, (childSignal) =>
        runner.worker(packet, childSignal),
      );
    },
  });
  pi.registerTool({
    name: 'evidence_review',
    label: 'Evidence Independent Reviewer',
    description:
      '对当前仓库一个成功 worker 运行启动全新只读 reviewer；拒绝工作树已变化的交付。独立核对 Standards / Spec，不修代码、不归档。',
    parameters: Type.Object({ workerRun: Type.String({ minLength: 1 }) }),
    async execute(_id, { workerRun }, signal, _update, ctx) {
      if (!ctx.model) throw new Error('委派需要主会话已选定模型');
      const runner = new DeliveryRunner(
        ctx.cwd,
        `${ctx.model.provider}/${ctx.model.id}`,
        pi.getThinkingLevel(),
      );
      return delegate(signal, (childSignal) =>
        runner.review(workerRun, childSignal),
      );
    },
  });
}

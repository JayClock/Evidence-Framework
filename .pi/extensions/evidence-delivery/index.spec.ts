import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';

const worker = vi.fn();
const review = vi.fn();
vi.mock('./runner.js', () => ({
  DeliveryRunner: class {
    worker = worker;
    review = review;
  },
}));
import extension from './index.js';

type Tool = Parameters<ExtensionAPI['registerTool']>[0];
function harness() {
  const tools = new Map<string, Tool>();
  const events = new Map<string, () => Promise<void>>();
  extension({
    registerTool: (tool: Tool) => tools.set(tool.name, tool),
    on: (name: string, callback: () => Promise<void>) =>
      events.set(name, callback),
    getThinkingLevel: () => 'high',
  } as unknown as ExtensionAPI);
  const context = { cwd: '/project', model: { provider: 'test', id: 'model' } };
  const call = (name: string, params: unknown, signal?: AbortSignal) =>
    tools.get(name)!.execute('id', params, signal, undefined, context as never);
  return { tools, events, call };
}

describe('main-agent delegation tools', () => {
  it('registers only worker and reviewer; never an archive or auto-advance operation', () => {
    expect([...harness().tools.keys()]).toEqual([
      'evidence_worker',
      'evidence_review',
    ]);
  });
  it('bounds model-visible output and preserves the complete handoff in details', async () => {
    worker.mockResolvedValueOnce({
      runDir: '/temporary/run',
      report: 'x'.repeat(13000),
    });
    const result = await harness().call('evidence_worker', {});
    const text = result.content[0];
    expect(text.type).toBe('text');
    if (text.type !== 'text') return;
    expect(JSON.parse(text.text).report).toHaveLength(12000);
    expect(result.details).toHaveProperty('report', 'x'.repeat(13000));
    expect(text.text).toContain('不是完成或批准');
  });
  it('rejects parallel calls even though each uses a new runner, and aborts active work at shutdown', async () => {
    let finish!: () => void;
    let childSignal: AbortSignal | undefined;
    worker.mockImplementationOnce(async (_packet, signal) => {
      childSignal = signal;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { report: '交接' };
    });
    const main = harness();
    const first = main.call('evidence_worker', {});
    await expect(
      main.call('evidence_review', { workerRun: '/temporary/run' }),
    ).rejects.toThrow('只允许一个');
    await main.events.get('session_shutdown')!();
    expect(childSignal?.aborted).toBe(true);
    finish();
    await first;
    review.mockResolvedValueOnce({ report: '独立审查' });
    await expect(
      main.call('evidence_review', { workerRun: '/temporary/run' }),
    ).resolves.toHaveProperty('details');
  });
});

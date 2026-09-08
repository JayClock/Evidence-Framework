import { describe, expect, it, vi } from 'vitest';
import { memoryModeling } from '../tests/support/memory-modeling.ts';
import { createDraftChecker } from './draft.ts';

describe('headless model draft service', () => {
  it('records isolated validation without changing formal model or Gate state', async () => {
    const h = memoryModeling();
    await h.consolidate();
    const formal = structuredClone(h.state.modeling);
    const checkFiles = vi.fn().mockResolvedValue({
      passed: true,
      machineValidated: true,
      simulationPassed: null,
      items: [{ name: 'schema', status: 'pass', details: '合成校验结果' }],
    });
    const check = createDraftChecker({ discovery: h.repository, checkFiles });
    const options = {
      root: h.root,
      executor: { exec: vi.fn() },
      timeoutMs: 1000,
    };
    const draft = await check(
      h.state,
      [{ path: './model.yaml', content: 'synthetic source' }],
      options,
    );
    expect(checkFiles).toHaveBeenCalledWith({
      ...options,
      files: [{ path: 'model.yaml', content: 'synthetic source\n' }],
      draftOnly: true,
    });
    expect(h.entries.at(-1)?.event).toEqual({ kind: 'draft', result: draft });
    expect(h.state.modeling).toEqual(formal);
    expect(h.state.pendingGate).toBeNull();
    expect(h.state.phase).toBe('modeling');
    await h.service.finalizeDiscovery(h.root, h.state);
    await expect(
      check(h.state, [{ path: 'model.yaml', content: 'source' }], options),
    ).rejects.toThrow('重新打开草稿');
    expect(checkFiles).toHaveBeenCalledTimes(1);
  });
});

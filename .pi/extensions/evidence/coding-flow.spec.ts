import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { qualityHarness } from './quality-test-support.ts';
import {
  createInitialState,
  loadState,
  saveState,
  writeTextAtomic,
} from './storage.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('TDD remains mandatory without business interviews', () => {
  it('executes Red, the identical Green/refactor command and final quality checks before creating a gate', async () => {
    const { root, api, tool } = await qualityHarness(roots);
    const state = createInitialState('test', '逐故事执行测试');
    state.phase = 'coding';
    state.status = 'running';
    state.coding.storyIds = ['US-001'];
    state.coding.baseline = {
      gitAvailable: false,
      dirtyPaths: [],
      fileHashes: {},
      capturedAt: new Date().toISOString(),
    };
    await saveState(root, state);
    const completion = {
      storyId: 'US-001',
      summary:
        '实现当前故事并通过聚焦测试及独立质量检查，保持生产源码和测试文件均为真实文件，不以文本宣称替代执行结果。',
      changedFiles: ['src/feature.ts', 'src/feature.spec.ts'],
      refactorSummary:
        '整理函数名称和测试描述，保持聚焦测试覆盖的外部行为不变。',
    };
    await expect(tool('evidence_complete_story', completion)).rejects.toThrow(
      'Red and Green',
    );
    await expect(
      tool('evidence_tdd_green', {
        storyId: 'US-001',
        observation: '不得跳过 Red',
      }),
    ).rejects.toThrow('Red checkpoint');
    expect(api.exec).not.toHaveBeenCalled();
    await writeTextAtomic(
      root,
      'src/feature.spec.ts',
      'expect(feature()).toBe(true);',
    );
    const command = 'npm test -- feature.spec.ts';
    api.exec.mockResolvedValueOnce({
      code: 1,
      killed: false,
      stdout: 'expected false to be true',
      stderr: '',
    });
    await tool('evidence_tdd_red', {
      storyId: 'US-001',
      command,
      expectedFailure: '功能尚未实现，测试应因返回 false 而不是 true 失败。',
    });
    expect((await loadState(root))?.coding.tdd.stage).toBe('green');
    await writeTextAtomic(
      root,
      'src/feature.ts',
      'export function feature() { return true; }',
    );
    api.exec.mockResolvedValue({
      code: 0,
      killed: false,
      stdout: 'passed',
      stderr: '',
    });
    await tool('evidence_tdd_green', {
      storyId: 'US-001',
      observation: '最小实现使功能返回 true，聚焦测试通过。',
    });
    await tool('evidence_complete_story', completion);
    expect(api.exec.mock.calls.map((call) => call[1][1])).toEqual([
      command,
      command,
      command,
      'npm test',
      'npm run lint',
      'npm run build',
    ]);
    expect(await loadState(root)).toMatchObject({
      phase: 'coding',
      status: 'waiting_review',
      coding: { currentStoryIndex: 0, tdd: { stage: 'refactor' } },
    });
  });
});

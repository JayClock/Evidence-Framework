import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCodingChecks, runCommand, runReviewChecks } from './checks.ts';
import {
  DEFAULT_CONFIG,
  createInitialState,
  writeTextAtomic,
} from './storage.ts';

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-check-test-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('command checks', () => {
  it('captures the real exit code and combined output', async () => {
    const root = await temporaryRoot();
    const pi = {
      exec: vi.fn().mockResolvedValue({
        code: 7,
        stdout: 'assertion failed',
        stderr: 'details',
      }),
    };
    const result = await runCommand({
      pi,
      root,
      command: 'npm test -- focused',
      timeoutMs: 1000,
    });
    expect(result).toEqual({
      command: 'npm test -- focused',
      exitCode: 7,
      killed: false,
      output: 'assertion failed\ndetails',
    });
  });

  it('combines final review structure with fresh quality command evidence', async () => {
    const root = await temporaryRoot();
    const state = createInitialState('test', 'goal');
    state.phase = 'review';
    state.modeling.applicable = false;
    state.modeling.rationale = '当前测试范围不包含合同履约语义。';
    const review = `# 最终审查报告

## 审查结论

通过 US-001。${'证据完整。'.repeat(150)}

## 质量门

| 检查项 | 结果 | 证据 | 说明 |
| :--- | :---: | :--- | :--- |
| 需求 | 通过 | A | A |
| 架构 | 通过 | B | B |
| 测试 | 通过 | C | C |
| 构建 | 通过 | D | D |

## 问题清单

未发现。

## 后续行动

| 优先级 | 行动 | 负责人角色 | 完成条件 |
| :---: | :--- | :--- | :--- |
| P2 | 观察 | 团队 | 稳定 |
`;
    await Promise.all([
      writeTextAtomic(root, 'artifacts/06-review/final-review.md', review),
      writeTextAtomic(
        root,
        'artifacts/04-planning/sprint-1-backlog.md',
        '# Sprint 1 Backlog\n\n## 用户故事\n\nUS-001\n',
      ),
      writeTextAtomic(
        root,
        'artifacts/05-coding/US-001.md',
        '# US-001 TDD 执行记录\n',
      ),
    ]);
    const config = structuredClone(DEFAULT_CONFIG);
    config.qualityCommands = ['npm test'];
    const pi = {
      exec: vi.fn().mockResolvedValue({
        code: 0,
        killed: false,
        stdout: 'passed',
        stderr: '',
      }),
    };

    const result = await runReviewChecks({
      pi,
      root,
      state,
      config,
      timeoutMs: 1000,
    });
    expect(result.report.passed).toBe(true);
    expect(result.report.items.map((item) => item.name)).toEqual([
      'artifacts/06-review/final-review.md',
      'Sprint 1 story traceability',
      'FM applicability',
      'npm test',
    ]);
  });

  it('stops quality commands at the first failure', async () => {
    const root = await temporaryRoot();
    const pi = {
      exec: vi
        .fn()
        .mockResolvedValueOnce({ code: 0, stdout: 'ok', stderr: '' })
        .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'failed' }),
    };
    const state = createInitialState('test', 'goal');
    state.phase = 'coding';
    const config = structuredClone(DEFAULT_CONFIG);
    config.qualityCommands = ['first', 'second', 'third'];

    const result = await runCodingChecks({
      pi,
      root,
      state,
      config,
      storyId: 'US-001',
      timeoutMs: 1000,
    });
    expect(result.report.passed).toBe(false);
    expect(result.report.items.map((item) => item.name)).toEqual([
      'first',
      'second',
    ]);
    expect(pi.exec).toHaveBeenCalledTimes(2);
  });
});

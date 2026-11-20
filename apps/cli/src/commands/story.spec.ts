import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFlowStoryProjector } from '@evidence-poc/evidence-agent';
import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch } from '../router.js';

vi.mock('@evidence-poc/evidence-agent', () => ({
  createFlowStoryProjector: vi.fn(),
}));

const model = fileURLToPath(
  new URL(
    '../../../../libs/evidence-model-core/tests/fixtures/acceptance/procurement.evidence.json',
    import.meta.url,
  ),
);
let root: string;
let output: string[], errors: string[];
const project = vi.fn(async (flow: FlowScenarioTrace) => ({
  flowId: flow.flowId,
  storyTitle: flow.flowTitle,
  storySummary: '摘要',
  businessGoal: '目标',
  scenes: [],
}));
const context = () => ({
  cwd: root,
  stdout: (text: string) => output.push(text),
  stderr: (text: string) => errors.push(text),
  color: true,
});
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'evidence-story-'));
  output = [];
  errors = [];
  vi.clearAllMocks();
  vi.mocked(createFlowStoryProjector).mockReturnValue({ project });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('story command dispatch', () => {
  it.each([false, true])(
    'uses cac negation correctly for offline=%s',
    async (offline) => {
      expect(
        await dispatch(
          ['story', model, '--format', 'json', ...(offline ? ['--no-ai'] : [])],
          context(),
        ),
      ).toBe(0);
      expect(createFlowStoryProjector).toHaveBeenCalledWith({
        skipAi: offline,
      });
      expect(project).toHaveBeenCalledTimes(1);
      expect(project.mock.calls[0]![0]).toMatchObject({
        flowId: 'payment',
        steps: expect.any(Array),
      });
      expect(JSON.parse(output[0]!)).toMatchObject([{ flowId: 'payment' }]);
      expect(errors).toEqual([]);
    },
  );

  it('does not invoke the projector for invalid formats, missing flows or duplicate options', async () => {
    for (const flags of [
      ['--format', 'yaml'],
      ['--flow', 'non-existing'],
      ['--flow', 'payment', '--flow', 'payment'],
      ['--no-ai', '--no-ai'],
      ['--ai', '--no-ai'],
    ]) {
      expect(await dispatch(['story', model, ...flags], context())).toBe(1);
    }
    expect(createFlowStoryProjector).not.toHaveBeenCalled();
    expect(errors.join('\n')).toContain('未找到');
    expect(output).toEqual([]);
  });

  it('does not create or overwrite an export when AI generation fails', async () => {
    project.mockRejectedValueOnce(new Error('Story agent unavailable'));
    expect(
      await dispatch(
        ['story', model, '--export', 'nested/story.md'],
        context(),
      ),
    ).toBe(1);
    expect(errors.join('\n')).toContain('Story agent unavailable');
    expect(existsSync(path.join(root, 'nested'))).toBe(false);
    expect(output).toEqual([]);
    mkdirSync(path.join(root, 'nested'));
    const exported = path.join(root, 'nested/story.md');
    writeFileSync(exported, 'Previous story');
    project.mockRejectedValueOnce(new Error('Story agent unavailable'));
    expect(
      await dispatch(
        ['story', model, '--export', 'nested/story.md'],
        context(),
      ),
    ).toBe(1);
    expect(readFileSync(exported, 'utf8')).toBe('Previous story');
  });

  it('documents defaults and offline negation without projecting any stories', async () => {
    expect(await dispatch(['story', '--help'], context())).toBe(0);
    expect(output[0]).toContain('story [model]');
    expect(output[0]).toContain('.evidence/fm');
    expect(output[0]).toContain('default: markdown');
    expect(output[0]).toContain(
      '--no-ai  Offline fact cards without LLM expansion (default: false)',
    );
    expect(output[0]).toContain('--compact');
    expect(project).not.toHaveBeenCalled();
  });

  it('exports a requested format relative to cwd without ANSI color', async () => {
    expect(
      await dispatch(
        ['story', model, '--format', 'text', '--export', 'nested/story.txt'],
        context(),
      ),
    ).toBe(0);
    const content = readFileSync(path.join(root, 'nested/story.txt'), 'utf8');
    expect(content).toContain('payment');
    expect(content).not.toContain('\u001b');
    expect(output).toEqual([
      `业务故事已成功导出至: ${path.join(root, 'nested/story.txt')}`,
    ]);
  });
});

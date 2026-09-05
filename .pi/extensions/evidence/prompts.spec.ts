import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gateArtifactPaths } from './gates.ts';
import { getPhaseDefinition, PHASE_ORDER } from './phases.ts';
import { buildCurrentPrompt, buildPhaseGuard } from './prompts.ts';
import {
  createInitialState,
  DEFAULT_CONFIG,
  readText,
  REQUIREMENTS_PATH,
  writeTextAtomic,
} from './storage.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const tasks = PHASE_ORDER.flatMap((phase) => {
  const artifacts = getPhaseDefinition(phase).artifacts;
  return (artifacts.length ? artifacts.map((_, index) => index) : [0]).map(
    (index) => ({ phase, index }),
  );
});

describe('artifact prompt inputs', () => {
  it.each(tasks)(
    '$phase artifact $index uses actual methods and artifacts without interview dependencies',
    async ({ phase, index }) => {
      const root = await mkdtemp(join(tmpdir(), 'evidence-prompt-'));
      roots.push(root);
      // Prepare real method/template text and placeholder upstream files, never an interview snapshot.
      const inputs = new Set([REQUIREMENTS_PATH, 'README.md']);
      for (const item of PHASE_ORDER) {
        const definition = getPhaseDefinition(item);
        await writeTextAtomic(
          root,
          definition.skillFile,
          await readText(process.cwd(), definition.skillFile),
        );
        for (const artifact of definition.artifacts) {
          await writeTextAtomic(
            root,
            artifact.promptFile,
            await readText(process.cwd(), artifact.promptFile),
          );
          if (artifact.skillFile)
            await writeTextAtomic(
              root,
              artifact.skillFile,
              await readText(process.cwd(), artifact.skillFile),
            );
          for (const input of artifact.inputs) inputs.add(input);
        }
      }
      for (const input of inputs) {
        if (input.endsWith('.md') || input.endsWith('.json')) {
          await writeTextAtomic(root, input, '# 已有输入');
        } else {
          await mkdir(join(root, input), { recursive: true });
        }
      }
      const state = createInitialState('test', '从原始需求生成工件');
      state.phase = phase;
      state.status = 'running';
      state.currentArtifactIndex = index;
      state.coding.storyIds = ['US-001'];
      const prompt = await buildCurrentPrompt(root, state, DEFAULT_CONFIG);
      expect(prompt).toContain(REQUIREMENTS_PATH);
      expect(prompt).not.toMatch(
        /evidence_interview|evidence-answer|interview\.md|waiting_input/,
      );
      expect(buildPhaseGuard(state)).not.toMatch(/interview|confirmation/);
      expect(gateArtifactPaths(state)).not.toContain(
        'artifacts/00-input/interview.md',
      );
      const kind = getPhaseDefinition(phase).artifacts[index]?.kind;
      expect(prompt).toContain(
        phase === 'coding'
          ? 'evidence_complete_story'
          : kind === 'fm-model'
            ? 'evidence_submit_fm_model'
            : 'evidence_submit_artifact',
      );
      await rm(join(root, REQUIREMENTS_PATH));
      await expect(
        buildCurrentPrompt(root, state, DEFAULT_CONFIG),
      ).rejects.toThrow('当前任务缺少输入');
    },
  );
});

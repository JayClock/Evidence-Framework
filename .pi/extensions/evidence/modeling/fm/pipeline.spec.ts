import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateFmModel } from '../../state/fm/index.ts';
import { executeProcess } from '../../tests/support/modeling-test-support.ts';

describe('FM model pipeline', () => {
  it('validates, simulates, and deterministically compiles a real Schema v3 model', async () => {
    const root = process.cwd();
    await mkdir(join(root, 'node_modules/.cache'), { recursive: true });
    const worktree = await mkdtemp(
      join(root, 'node_modules/.cache/evidence-fm-model-test-'),
    );
    const modelDir = join(worktree, 'model');
    await cp(
      join(
        root,
        '.pi/skills/evidence-modeling/tests/fixtures/valid-traceable-subscription',
      ),
      modelDir,
      { recursive: true },
    );
    const pi = { exec: executeProcess };

    try {
      const first = await validateFmModel({
        root,
        executor: pi,
        modelDir,
        timeoutMs: 120_000,
      });
      expect(first.passed).toBe(true);
      expect(first.machineValidated).toBe(true);
      expect(first.simulationPassed).toBe(true);

      const generated = ['model.json', 'traceability.json', 'simulation.json'];
      const firstOutputs = await Promise.all(
        generated.map((name) =>
          readFile(join(modelDir, 'generated', name), 'utf8'),
        ),
      );
      await validateFmModel({
        root,
        executor: pi,
        modelDir,
        timeoutMs: 120_000,
      });
      const secondOutputs = await Promise.all(
        generated.map((name) =>
          readFile(join(modelDir, 'generated', name), 'utf8'),
        ),
      );
      expect(secondOutputs).toEqual(firstOutputs);

      const scenarioPath = join(
        modelDir,
        'validation/scenarios/scenario--successful-payment.yaml',
      );
      const scenario = await readFile(scenarioPath, 'utf8');
      const wrongExpectation = scenario.replace(
        'expectedResult: 19900',
        'expectedResult: 19901',
      );
      expect(wrongExpectation).not.toBe(scenario);
      await writeFile(scenarioPath, wrongExpectation, 'utf8');
      const failedScenario = await validateFmModel({
        root,
        executor: pi,
        modelDir,
        timeoutMs: 120_000,
      });
      expect(failedScenario.passed).toBe(false);
      expect(failedScenario.machineValidated).toBe(true);
      expect(failedScenario.simulationPassed).toBe(false);
      expect(failedScenario.items).toContainEqual(
        expect.objectContaining({
          name: 'FM scenario simulation',
          status: 'fail',
        }),
      );

      const runtimePython = join(
        root,
        'node_modules/.cache/evidence-fm-runtime',
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
      );
      const skillTests = await executeProcess(
        runtimePython,
        [
          '-B',
          '-m',
          'unittest',
          'discover',
          '-s',
          '.pi/skills/evidence-modeling/tests',
          '-v',
        ],
        { cwd: root, timeout: 120_000 },
      );
      expect(skillTests.code, skillTests.stderr).toBe(0);
    } finally {
      await rm(worktree, { recursive: true, force: true });
    }
  }, 180_000);
});

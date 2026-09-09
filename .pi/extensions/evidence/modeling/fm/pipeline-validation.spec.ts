import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateFmModel } from '../../state/fm/index.ts';
import { writeTextAtomic } from '../../storage.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function validatorHarness() {
  const root = await mkdtemp(join(tmpdir(), 'evidence-fm-validation-'));
  roots.push(root);
  await writeTextAtomic(
    root,
    '.agents/skills/evidence-fm/requirements.txt',
    '# test runtime\n',
  );
  const modelDir = join(root, 'model');
  const schema = vi.fn().mockResolvedValue({
    code: 0,
    stdout: JSON.stringify({
      valid: true,
      machineValidated: true,
      simulationPassed: true,
    }),
  });
  const lineage = vi.fn().mockResolvedValue({ code: 0 });
  const simulation = vi.fn().mockResolvedValue({ code: 0 });
  const exec = vi.fn(async (_command: string, args: string[]) => {
    if (args.includes('--version')) return { code: 0, stdout: 'Python 3.12.3' };
    if (args[1] === 'venv') await mkdir(args[2], { recursive: true });
    if (args.some((arg) => arg.endsWith('validate_fm_model.py')))
      return schema();
    if (args.some((arg) => arg.endsWith('build_fm_lineage.py')))
      return lineage();
    if (args.some((arg) => arg.endsWith('simulate_fm_model.py')))
      return simulation();
    return { code: 0 };
  });
  return {
    root,
    modelDir,
    schema,
    lineage,
    simulation,
    options: { root, modelDir, executor: { exec }, timeoutMs: 1000 },
  };
}

describe('FM validation failure boundaries', () => {
  it.each([
    'not json',
    '{}',
    'null',
    '{"valid":false,"machineValidated":true}',
  ])(
    'records a blocking check when exit zero has no valid machine result: %s',
    async (stdout) => {
      const { schema, options } = await validatorHarness();
      schema.mockResolvedValue({ code: 0, stdout });
      const result = await validateFmModel(options);
      expect(result.passed).toBe(false);
      expect(result.machineValidated).toBe(false);
      expect(result.items.some((item) => item.status === 'fail')).toBe(true);
    },
  );

  it('does not retain machine validation after lineage fails', async () => {
    const { lineage, options } = await validatorHarness();
    lineage.mockResolvedValue({ code: 1, stderr: 'attribute lineage failed' });
    const result = await validateFmModel(options);
    expect(result.passed).toBe(false);
    expect(result.machineValidated).toBe(false);
    expect(result.simulationPassed).toBeNull();
  });

  it('does not retain simulation success when the simulation command fails', async () => {
    const { root, simulation, options } = await validatorHarness();
    await writeTextAtomic(
      root,
      'model/validation/scenarios/scenario--success.yaml',
      '{}\n',
    );
    simulation.mockResolvedValue({
      code: 1,
      stderr: 'scenario assertion failed',
    });
    const result = await validateFmModel(options);
    expect(result.passed).toBe(false);
    expect(result.machineValidated).toBe(true);
    expect(result.simulationPassed).toBe(false);
  });

  it('reports an interrupted schema command as a blocking check', async () => {
    const { schema, options } = await validatorHarness();
    schema.mockRejectedValue(new Error('spawn failed'));
    const result = await validateFmModel(options);
    expect(result.passed).toBe(false);
    expect(
      result.items.some(
        (item) =>
          item.status === 'fail' && item.details.includes('spawn failed'),
      ),
    ).toBe(true);
  });
});

import { basename } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { FmRuntime, ValidationOptions } from './contracts.ts';
import { createFmValidator } from './pipeline.ts';

function harness(failedScript?: string) {
  const scripts: string[] = [];
  const runtime: FmRuntime = {
    ensurePython: vi.fn(async () => 'synthetic-python'),
    runProcess: vi.fn(async (_options, _command, args) => {
      const script = basename(args[1]);
      scripts.push(script);
      return script === failedScript
        ? { code: 1, stderr: 'synthetic failure' }
        : {
            code: 0,
            stdout: JSON.stringify({
              valid: true,
              machineValidated: true,
              counts: { fulfillments: 1 },
            }),
          };
    }),
    files: {
      ensureDirectory: vi.fn(async () => undefined),
      exists: vi.fn(async () => true),
      removeFile: vi.fn(async () => undefined),
      listNames: vi.fn(async () => ['scenario--test.yaml']),
    },
  };
  const options: ValidationOptions = {
    executor: { exec: vi.fn() },
    root: '/synthetic-modeling',
    modelDir: '/synthetic-modeling/model',
    timeoutMs: 1000,
  };
  return { runtime, scripts, options, validate: createFmValidator(runtime) };
}

describe('headless FM pipeline', () => {
  it('runs schema, lineage, applicable simulation, projection and compilation through injected ports', async () => {
    const h = harness();
    const result = await h.validate(h.options);
    expect(result).toMatchObject({
      passed: true,
      machineValidated: true,
      simulationPassed: true,
    });
    expect(h.scripts).toEqual([
      'validate_fm_model.py',
      'build_fm_lineage.py',
      'simulate_fm_model.py',
      'build_fm_business_patterns.py',
      'compile_fm_model.py',
    ]);
    expect(h.runtime.ensurePython).toHaveBeenCalledWith(h.options);
    expect(h.options.executor.exec).not.toHaveBeenCalled();
    expect(h.runtime.files.removeFile).not.toHaveBeenCalled();
  });

  it('halts after a failed lineage without promoting schema success to model validation', async () => {
    const h = harness('build_fm_lineage.py');
    const result = await h.validate(h.options);
    expect(result).toMatchObject({
      passed: false,
      machineValidated: false,
      simulationPassed: false,
    });
    expect(h.scripts).toEqual(['validate_fm_model.py', 'build_fm_lineage.py']);
  });
});

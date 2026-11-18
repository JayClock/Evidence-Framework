import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { writeOutput } from '@evidence-poc/evidence-api';
import { z } from 'zod';
import type { SuiteProjection } from '../delivery/scenarioProjector.js';
import { brunoFlowPath, renderBruno } from '../renderer/brunoRenderer.js';

const runFile = promisify(execFile);
const require = createRequire(import.meta.url);
const check = z.object({
  status: z.enum(['pass', 'fail']),
  lhsExpr: z.string().optional(),
  description: z.string().optional(),
  error: z.string().nullish(),
});
const reportSchema = z.tuple([
  z.object({
    results: z
      .array(
        z.object({
          status: z.enum(['pass', 'error', 'skipped']),
          error: z.string().nullish(),
          test: z.object({ filename: z.string() }),
          request: z.object({ url: z.string().nullish() }),
          response: z.object({
            status: z.union([z.number().int(), z.enum(['error', 'skipped'])]),
            data: z.unknown(),
            duration: z.number().nonnegative().optional(),
          }),
          assertionResults: z.array(check),
          testResults: z.array(check),
          preRequestTestResults: z.array(check).optional(),
          postResponseTestResults: z.array(check).optional(),
        }),
      )
      .nonempty(),
  }),
]);
export type BrunoResult = z.infer<typeof reportSchema>[0]['results'][number];

export async function runBruno(
  projection: SuiteProjection,
  options: { targetUrl: string; asOf?: string; timeoutMs: number },
): Promise<{ results: BrunoResult[]; passed: boolean }> {
  const root = await mkdtemp(path.join(tmpdir(), 'evidence-bruno-'));
  const directory = path.join(root, 'collection');
  try {
    // Stage only freshly generated files. Bruno's bail applies to an entire
    // invocation, so run one folder at a time: never skip independent flows.
    writeOutput(directory, renderBruno(projection, options));
    const results: BrunoResult[] = [];
    let passed = true;
    for (const [index, flow] of projection.flows.entries()) {
      const run = await runFlow(
        directory,
        brunoFlowPath(index),
        path.join(root, `report-${index}.json`),
        flow.steps.length,
        options,
      );
      results.push(...run.results);
      passed = passed && run.passed;
    }
    return { results, passed };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runFlow(
  directory: string,
  folder: string,
  reportPath: string,
  steps: number,
  options: { targetUrl: string; timeoutMs: number },
) {
  let stdout = '',
    stderr = '',
    exitCode = 0;
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;
  try {
    const bru = path.join(
      path.dirname(require.resolve('@usebruno/cli/package.json')),
      'bin',
      'bru.js',
    );
    try {
      ({ stdout, stderr } = await runFile(
        process.execPath,
        [
          bru,
          'run',
          folder,
          '-r',
          '--sandbox',
          'safe',
          '--bail',
          '--env',
          'test',
          '--env-var',
          `host=${options.targetUrl}`,
          '--reporter-json',
          reportPath,
          '--reporter-skip-request-body',
          '--reporter-skip-all-headers',
        ],
        {
          cwd: directory,
          timeout: Math.min(2147483647, 30000 + steps * options.timeoutMs),
          killSignal: 'SIGKILL',
          maxBuffer: 8 * 1024 * 1024,
          env,
        },
      ));
    } catch (error) {
      const failure = error as {
        code?: unknown;
        stdout?: string;
        stderr?: string;
      };
      stdout = failure.stdout ?? '';
      stderr = failure.stderr ?? '';
      // 1 is Bruno's failed-collection status. It still must produce a report.
      if (failure.code !== 1) throw error;
      exitCode = 1;
    }
    const [{ results }] = reportSchema.parse(
      JSON.parse(await readFile(reportPath, 'utf8')),
    );
    return { results, passed: exitCode === 0 };
  } catch (error) {
    throw new Error(
      `Bruno execution failed (${folder}): ${error instanceof Error ? error.message : String(error)}\n${stdout}${stderr}`.trimEnd(),
      { cause: error },
    );
  }
}

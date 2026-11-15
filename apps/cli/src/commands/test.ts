import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  runAcceptanceSuite,
  type AcceptanceGate,
  validateAsOf,
  validateTargetUrl,
} from '@evidence-poc/evidence-api/runner';
import { renderDeliverables } from '@evidence-poc/evidence-api';
import { loadModel } from '../model.js';
import { markdownReport, junitReport } from '../ui/markdownReporter.js';
import { argumentsFor, stringOption, type CommandContext } from '../context.js';
import {
  trafficLightReport,
  type AcceptanceReport,
} from '../ui/trafficLightReporter.js';

async function suiteFiles(source: string): Promise<string[]> {
  const info = await stat(source);
  if (info.isFile()) {
    if (!/\.(ya?ml)$/i.test(source))
      throw new Error(
        'evidence test runs Step CI YAML; use the Hurl CLI for .hurl files',
      );
    return [source];
  }
  if (!info.isDirectory())
    throw new Error(`Not a suite file or directory: ${source}`);
  const files: string[] = [];
  // Do not follow directory symlinks: recursive discovery must stay bounded.
  for (const entry of (await readdir(source, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const file = path.join(source, entry.name);
    if (entry.isDirectory()) files.push(...(await suiteFiles(file)));
    else if (entry.isFile() && /\.stepci\.ya?ml$/i.test(entry.name))
      files.push(file);
  }
  return files;
}

async function healthProbe(target: string, timeoutMs: number): Promise<void> {
  try {
    // Any HTTP response (including 404/405) proves reachability. Never require a
    // private health endpoint, follow redirects, or mutate state with a POST.
    const response = await fetch(target, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
  } catch (error) {
    throw new Error(
      `Target ${target} is unreachable. Ensure your backend service is running.\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function testCommand(
  argv: readonly string[],
  context: CommandContext,
): Promise<number> {
  const { values, positionals } = argumentsFor(argv, {
    target: { type: 'string' },
    scenarios: { type: 'string', default: 'dist' },
    'as-of': { type: 'string' },
    timeout: { type: 'string', default: '5000' },
    verbose: { type: 'boolean' },
    json: { type: 'boolean' },
    gate: { type: 'string' },
    'baseline-model': { type: 'string' },
    filter: { type: 'string' },
    tag: { type: 'string', multiple: true },
    'detect-drift': { type: 'boolean' },
    'strict-drift': { type: 'boolean' },
    'allow-pending': { type: 'boolean' },
    report: { type: 'string' },
    'report-dir': { type: 'string' },
  });
  if (positionals.length)
    throw new Error(
      'usage: evidence test --target URL [--scenarios file|dir] [--as-of UTC] [--timeout ms] [--verbose|--json]',
    );
  const gate = stringOption(values.gate);
  if (gate !== undefined && gate !== 'regression' && gate !== 'dod')
    throw new Error('--gate must be regression or dod');
  if (values['allow-pending'] && gate !== 'dod')
    throw new Error('--allow-pending is only valid for --gate dod');
  const baselinePath = stringOption(values['baseline-model']);
  if (baselinePath && !gate)
    throw new Error('--baseline-model requires --gate');
  const format = stringOption(values.report);
  if (format && !['markdown', 'junit'].includes(format))
    throw new Error('--report must be markdown or junit');
  if (format && values.json)
    throw new Error('--report and --json are mutually exclusive');
  const target = stringOption(values.target);
  if (target === undefined) throw new Error('--target is required');
  const targetUrl = validateTargetUrl(target);
  const clock = stringOption(values['as-of']);
  const asOf = clock === undefined ? undefined : validateAsOf(clock);
  const timeoutMs = Number(stringOption(values.timeout));
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2147483647
  )
    throw new Error(
      '--timeout must be a positive integer <= 2147483647 milliseconds',
    );
  const files = await suiteFiles(
    path.resolve(context.cwd, stringOption(values.scenarios)!),
  );
  if (files.length === 0)
    throw new Error(
      'No *.stepci.yml suites found. Run evidence export --tests first.',
    );
  if (baselinePath && files.length !== 1)
    throw new Error(
      '--baseline-model requires exactly one generated Step CI suite',
    );
  const baselineYaml = baselinePath
    ? (
        await renderDeliverables(
          await loadModel(path.resolve(context.cwd, baselinePath)),
          { openapi: false, tests: true, format: 'stepci' },
        )
      ).files['acceptance.stepci.yml']
    : undefined;
  await healthProbe(targetUrl, timeoutMs);
  const suites = [];
  for (const suitePath of files)
    suites.push(
      await runAcceptanceSuite({
        suitePath,
        targetUrl,
        ...(asOf === undefined ? {} : { asOf }),
        timeoutMs,
        ...(gate ? { gate: gate as AcceptanceGate } : {}),
        ...(baselineYaml === undefined ? {} : { baselineYaml }),
        ...(values.filter === undefined
          ? {}
          : { filter: stringOption(values.filter)! }),
        ...(values.tag === undefined ? {} : { tags: values.tag as string[] }),
        detectDrift:
          values['detect-drift'] === true || values['strict-drift'] === true,
        strictDrift: values['strict-drift'] === true,
      }),
    );
  const report: AcceptanceReport = {
    passed: suites.every((suite) => suite.passed),
    targetUrl,
    ...(asOf === undefined ? {} : { asOf }),
    totalDurationMs: suites.reduce(
      (total, suite) => total + suite.totalDurationMs,
      0,
    ),
    suites,
    ...(gate ? { gate: gate as AcceptanceGate } : {}),
    pending:
      values['allow-pending'] === true &&
      !suites.every((suite) => suite.passed) &&
      !suites.some((suite) =>
        suite.steps.some(
          (step) =>
            step.errored ||
            (values['strict-drift'] && step.driftIssues?.length),
        ),
      ),
  };
  const reportDir = stringOption(values['report-dir']);
  if (reportDir) {
    const directory = path.resolve(context.cwd, reportDir);
    await mkdir(directory, { recursive: true });
    const name = gate ?? 'acceptance';
    await Promise.all([
      writeFile(
        path.join(directory, `${name}.json`),
        JSON.stringify(report, null, 2) + '\n',
      ),
      writeFile(
        path.join(directory, `${name}.md`),
        markdownReport(report) + '\n',
      ),
      writeFile(
        path.join(directory, `${name}.xml`),
        junitReport(report) + '\n',
      ),
    ]);
  }
  context.stdout(
    values.json
      ? JSON.stringify(report, null, 2)
      : format === 'markdown'
        ? markdownReport(report)
        : format === 'junit'
          ? junitReport(report)
          : trafficLightReport(report, {
              color: context.color,
              verbose: values.verbose === true,
            }),
  );
  return report.passed || report.pending ? 0 : 1;
}

#!/usr/bin/env node
/**
 * Prove that the boundary rules still reject what they are for.
 *
 * A lint rule that passes is not evidence: it passes just as well when its
 * tag was renamed, its constraint dropped, or the project it guards moved.
 * Each case below writes one import that a rule must refuse, runs the
 * project's lint target uncached, and fails the drill if that lint succeeds.
 *
 * The files are temporary and removed in `finally`, so the tree is left
 * exactly as it was found.
 *
 *   node tools/workspace-rules/boundary-drill.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * `project` owns `file`; `imports` is the whole body of the probe; `expects`
 * is a fragment of the message that must appear in the failed lint output.
 */
const CASES = [
  {
    name: 'a domain library reaching a projection',
    project: 'evidence-canvas-interaction',
    file: 'libs/evidence-canvas-interaction/src/__boundary-drill.ts',
    body: "export { fieldFor } from '@evidence-poc/evidence-api/delivery';\n",
    expects: 'A project tagged with "layer:domain" can only depend on libs',
  },
  {
    name: 'a browser library reaching a Node-only projection',
    project: 'desktop-feature-canvas',
    file: 'libs/desktop/feature-canvas/src/__boundary-drill.ts',
    body: "export * from '@evidence-poc/evidence-visualization';\n",
    expects:
      'A project tagged with "platform:browser" can only depend on libs tagged',
  },
  {
    name: 'a browser library importing a Node builtin',
    project: 'desktop-ui-kit',
    file: 'libs/desktop/ui-kit/src/__boundary-drill.ts',
    body: "import fs from 'node:fs';\n\nexport const drill = fs;\n",
    expects: "'node:fs' import is restricted from being used by a pattern",
  },
  {
    name: 'one business context reading another',
    project: 'evidence-agent',
    file: 'libs/evidence-agent/src/__boundary-drill.ts',
    body: "export * from '@evidence-poc/evidence-mcp';\n",
    expects: 'A project tagged with "scope:agent" can not depend on libs',
  },
];

const log = (message) => process.stderr.write(`[boundary-drill] ${message}\n`);

const lint = (project) => {
  try {
    const output = execFileSync(
      'pnpm',
      ['nx', 'lint', project, '--skip-nx-cache'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
    );
    return { failed: false, output };
  } catch (error) {
    return {
      failed: true,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
};

let failures = 0;

for (const drillCase of CASES) {
  const absolute = path.join(ROOT, drillCase.file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, drillCase.body, 'utf8');

  let result;
  try {
    result = lint(drillCase.project);
  } finally {
    rmSync(absolute, { force: true });
  }

  if (!result.failed) {
    failures += 1;
    log(`FAIL  ${drillCase.name}: the import was accepted`);
    continue;
  }
  if (!result.output.includes(drillCase.expects)) {
    failures += 1;
    log(`FAIL  ${drillCase.name}: lint failed, but not for the reason given`);
    log(result.output.trim().split('\n').slice(-20).join('\n'));
    continue;
  }
  log(`ok    ${drillCase.name}`);
}

if (failures > 0) {
  log(`${failures} of ${CASES.length} cases no longer fail as documented`);
  process.exit(1);
}

log(`all ${CASES.length} boundary rules still refuse what they document`);

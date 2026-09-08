import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGate, hashArtifacts, recordGateDecision } from './gates.ts';
import {
  createInitialState,
  readText,
  writeJsonAtomic,
  writeTextAtomic,
} from './storage.ts';
import { seedDiscovery } from './tests/support/discovery-test-support.ts';
import type { CheckReport } from './types.ts';

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-gate-test-'));
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

describe('human gates', () => {
  it.each(['modeling', 'review'] as const)(
    'includes every FM input, status, and generated output in a %s gate digest',
    async (phase) => {
      const root = await temporaryRoot();
      const state = createInitialState('test', 'goal');
      state.phase = phase;
      state.modeling = {
        applicable: true,
        rationale: '合同双方通过支付请求和确认凭证完成履约。',
        machineValidated: true,
        simulationPassed: true,
        files: [
          'artifacts/02-modeling/fm-model/model.yaml',
          'artifacts/02-modeling/fm-model/entities/role--buyer.yaml',
          'artifacts/02-modeling/fm-model/generated/model.json',
          'artifacts/02-modeling/fm-model/generated/traceability.json',
          'artifacts/02-modeling/fm-model/generated/simulation.json',
        ],
      };
      const report: CheckReport = {
        phase,
        subject: '统一建模',
        round: 0,
        passed: true,
        warnings: 0,
        createdAt: new Date().toISOString(),
        items: [],
      };
      const reportPath = 'reports/modeling-round-0.md';
      await Promise.all([
        ...state.modeling.files.map((path) =>
          writeTextAtomic(root, path, `${path}\n`),
        ),
        writeTextAtomic(
          root,
          'artifacts/02-modeling/fm-model/status.md',
          '# FM status\n',
        ),
        writeTextAtomic(root, reportPath, '# Passed\n'),
        writeJsonAtomic(root, reportPath.replace(/\.md$/, '.json'), report),
      ]);

      await seedDiscovery(root, state);
      const gate = await createGate(root, state, report, reportPath);
      expect(gate.artifactPaths).toEqual(
        expect.arrayContaining([
          ...state.modeling.files,
          'artifacts/02-modeling/fm-model/status.md',
          reportPath,
          reportPath.replace(/\.md$/, '.json'),
        ]),
      );

      await writeTextAtomic(
        root,
        'artifacts/02-modeling/fm-model/generated/simulation.json',
        '{"changed":true}\n',
      );
      expect(await hashArtifacts(root, gate.artifactPaths)).not.toBe(
        gate.artifactDigest,
      );
    },
  );

  it('hashes both artifacts and quality reports and records a decision', async () => {
    const root = await temporaryRoot();
    const state = createInitialState('test', 'goal');
    const report: CheckReport = {
      phase: 'modeling',
      subject: '需求分析',
      round: 0,
      passed: true,
      warnings: 0,
      createdAt: new Date().toISOString(),
      items: [],
    };
    const reportPath = 'reports/requirements-round-0.md';
    await Promise.all([
      ...[
        'artifacts/01-requirements/personas.md',
        'artifacts/01-requirements/problem-statement.md',
        'artifacts/01-requirements/story-map.md',
      ].map((path) => writeTextAtomic(root, path, `# ${path}\n`)),
      writeTextAtomic(root, reportPath, '# Passed\n'),
      writeJsonAtomic(root, reportPath.replace(/\.md$/, '.json'), report),
    ]);

    await seedDiscovery(root, state);
    const gate = await createGate(root, state, report, reportPath);
    expect(gate.artifactPaths).toContain(reportPath);
    expect(gate.artifactPaths).toContain(reportPath.replace(/\.md$/, '.json'));
    expect(await hashArtifacts(root, gate.artifactPaths)).toBe(
      gate.artifactDigest,
    );

    await writeTextAtomic(root, reportPath, '# Tampered\n');
    expect(await hashArtifacts(root, gate.artifactPaths)).not.toBe(
      gate.artifactDigest,
    );

    await recordGateDecision(root, gate, 'changes_requested', '补充证据');
    const markdown = await readText(root, gate.path);
    expect(markdown).toContain('status: rejected');
    expect(markdown).toContain('decision: changes_requested');
    expect(markdown).toContain('补充证据');
  });
});

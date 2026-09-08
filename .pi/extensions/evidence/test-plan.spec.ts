import { describe, expect, it } from 'vitest';
import {
  acceptanceFromMarkdown,
  proceduresFromMarkdown,
  validateTestPlan,
} from './test-plan.ts';
import {
  acceptanceCatalog,
  manifest,
  procedureCatalog,
  testingPlan,
} from './tests/support/testing-fixtures.ts';

describe('machine test plan contracts', () => {
  it('accepts an explicitly justified Q1 N/A when Q2 still performs real TDD', () => {
    const plan = structuredClone(testingPlan);
    const [q1, q2] = plan.stories[0].tasks;
    q1.mode = 'not-applicable';
    q1.reason = '当前薄切片不包含可独立隔离的领域规则。';
    q1.checks = [];
    q2.mode = 'tdd';
    expect(() =>
      validateTestPlan(plan, acceptanceCatalog, procedureCatalog),
    ).not.toThrow();
  });

  it.each([
    'no-tdd',
    'empty-checks',
    'duplicate-task',
    'duplicate-check',
    'missing-reason',
    'na-with-checks',
    'cross-story-dependency',
    'outside-test-path',
    'skip-tests',
  ])('rejects %s', (problem) => {
    const plan = structuredClone(testingPlan);
    const story = plan.stories[0];
    const [q1, q2] = story.tasks;
    if (problem === 'no-tdd') {
      q1.mode = 'verify';
      q1.reason = '仅复用已有测试，不包含新行为。';
    }
    if (problem === 'empty-checks') q1.checks = [];
    if (problem === 'duplicate-task') story.tasks.push(structuredClone(q1));
    if (problem === 'duplicate-check') q2.checks[0].id = q1.checks[0].id;
    if (problem === 'missing-reason') q2.reason = ' '.repeat(10);
    if (problem === 'na-with-checks') {
      q1.mode = 'not-applicable';
      q1.reason = '故意无效的测试计划夹具。';
    }
    if (problem === 'cross-story-dependency') q1.dependsOn = ['TASK-002-01'];
    if (problem === 'outside-test-path')
      q1.checks[0].testFiles = ['../external.spec.ts'];
    if (problem === 'skip-tests')
      q1.checks[0].command = 'npx vitest run --passWithNoTests';
    expect(() =>
      validateTestPlan(plan, acceptanceCatalog, procedureCatalog),
    ).toThrow();
  });

  it('requires exactly one catalog and rejects duplicate stable IDs and malformed JSON', () => {
    const duplicate = structuredClone(acceptanceCatalog);
    duplicate.stories.push(duplicate.stories[0]);
    expect(() => acceptanceFromMarkdown(manifest(duplicate))).toThrow('重复');
    expect(() =>
      acceptanceFromMarkdown(manifest(acceptanceCatalog).repeat(2)),
    ).toThrow('只能有一个');
    expect(() => acceptanceFromMarkdown('```json\n{broken}\n```')).toThrow(
      '无效 JSON',
    );
    expect(() =>
      proceduresFromMarkdown(
        manifest({
          ...procedureCatalog,
          procedures: [
            ...procedureCatalog.procedures,
            procedureCatalog.procedures[0],
          ],
        }),
      ),
    ).toThrow('重复');
  });
});

import { describe, expect, it } from 'vitest';
import { emptyDiscovery } from '../discovery/replay.ts';
import { assessFormalization } from '../discovery/formalization.ts';
import { discoveryCoverage } from './coverage.ts';
import { contextCoverage } from '../../tests/support/context-coverage.ts';
import {
  domainAssessment,
  discoveryContent,
} from '../../tests/support/discovery-fixtures.ts';

function snapshot() {
  const snapshot = emptyDiscovery('synthetic');
  snapshot.revision = 5;
  snapshot.content = discoveryContent();
  snapshot.formalization = assessFormalization(snapshot, domainAssessment());
  return snapshot;
}
function files(
  factRefs = ['C-001.identity', 'C-001.structure', 'C-001.rule'],
  revision = 5,
) {
  return [
    {
      path: 'discovery/formalization.md',
      content:
        '# 模型更新覆盖\n```json\n' +
        JSON.stringify({
          version: 1,
          kind: 'discovery-coverage',
          revision,
          contexts: [
            {
              contextRef: 'C-001',
              status: 'ready',
              retainedFactRefs: [],
              remainingScope: domainAssessment().contexts[0].remainingScope,
              modelRefs: ['context.sample'],
            },
          ],
          facts: factRefs.map((factRef) => ({
            factRef,
            modelRefs: ['context.sample'],
          })),
        }) +
        '\n```\n',
    },
  ];
}
describe('Context and fact-level model coverage', () => {
  it('checks actual compiled IDs and context kind, not just asserted mappings', () => {
    const check = discoveryCoverage(snapshot(), files());
    expect(() =>
      check({
        entities: [
          { id: 'context.sample', category: 'context', kind: 'domain' },
        ],
      }),
    ).not.toThrow();
    expect(() => check({ entities: [{ id: 'context.other' }] })).toThrow(
      '模型 ID 不存在',
    );
    expect(() =>
      check({
        entities: [
          { id: 'context.sample', category: 'context', kind: 'contract' },
        ],
      }),
    ).toThrow('同类型');
  });
  it('rejects omitted facts, unknown facts, stale coverage and missing assessments', () => {
    expect(() => discoveryCoverage(snapshot(), files([]))).toThrow('全部纳入');
    expect(() =>
      discoveryCoverage(snapshot(), files(['C-002.unknown'])),
    ).toThrow('待完善事实');
    expect(() => discoveryCoverage(snapshot(), files(undefined, 4))).toThrow(
      '版本',
    );
    expect(() => discoveryCoverage(snapshot(), [])).toThrow('唯一');
    expect(() =>
      discoveryCoverage(emptyDiscovery('synthetic'), files()),
    ).toThrow('缺少 Context assessment');
  });
  it('requires retained facts and exact context status rather than claiming the entire candidate is complete', () => {
    const s = snapshot();
    const value = domainAssessment();
    value.contexts[0].facts.push({
      key: 'archiving',
      candidateRef: 'C-001',
      dimension: 'rule',
      statement: '归档规则尚未明确。',
      status: 'unknown',
      sourceRefs: [],
    });
    s.formalization = assessFormalization(s, value);
    expect(() => discoveryCoverage(s, files())).toThrow('未纳入事实和剩余职责');
    const good = contextCoverage(s, 'context.sample');
    expect(() => discoveryCoverage(s, [good])).not.toThrow();
    expect(() =>
      discoveryCoverage(s, [
        {
          ...good,
          content: good.content.replace(
            '"status":"ready"',
            '"status":"support"',
          ),
        },
      ]),
    ).toThrow('不能宣称整体完成');
    expect(() =>
      discoveryCoverage(s, [
        {
          ...good,
          content: good.content.replace(
            '"retainedFactRefs":["C-001.archiving"]',
            '"retainedFactRefs":[]',
          ),
        },
      ]),
    ).toThrow('未纳入事实和剩余职责');
  });
  it('rejects the candidate-level coverage protocol without conversion', () => {
    expect(() =>
      discoveryCoverage(snapshot(), [
        {
          path: 'discovery/formalization.md',
          content:
            '```json\n' +
            JSON.stringify({
              kind: 'discovery-coverage',
              revision: 5,
              candidates: [
                { candidateRef: 'C-001', modelRefs: ['context.sample'] },
              ],
            }) +
            '\n```',
        },
      ]),
    ).toThrow('Context 与事实级映射');
  });
});

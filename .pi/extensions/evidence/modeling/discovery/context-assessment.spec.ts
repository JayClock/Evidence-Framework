import { describe, expect, it } from 'vitest';
import {
  contextAssessment,
  contextSlice,
} from '../../tests/support/context-assessment.ts';
import { discoveryContent } from '../../tests/support/discovery-fixtures.ts';
import { assessFormalization } from './formalization.ts';
import { emptyDiscovery } from './replay.ts';
import type { FormalizationAssessment } from './schema.ts';

function scenario() {
  const contexts = [
    contextSlice('C-001', 'domain', ['identity', 'structure', 'rule']),
    contextSlice('C-002', 'channel', [
      'identity',
      'parties',
      'evidence',
      'validity',
    ]),
  ];
  contexts[1].facts.push({
    key: 'response',
    candidateRef: 'C-002',
    dimension: 'response',
    statement: '后续接受与签约的关系仍未明确。',
    status: 'unknown',
    sourceRefs: ['INPUT'],
  });
  contexts[1].requiredFactRefs.push('C-002.response');
  contexts[0].dependencies.push({
    consumerFactRef: 'C-001.rule',
    providerFactRef: 'C-002.evidence',
    kind: 'provenance',
    purpose: '只引用已经明确的方案信息，不要求整个渠道协商完成。',
    sourceRefs: ['INPUT'],
  });
  const snapshot = emptyDiscovery('synthetic');
  snapshot.content = discoveryContent();
  snapshot.content.candidates.push({
    ...snapshot.content.candidates[0],
    id: 'C-002',
    label: '订阅方案',
    confidence: 'unknown',
  });
  const assessment: FormalizationAssessment = {
    ...contextAssessment(),
    contexts,
  };
  return {
    snapshot,
    assessment,
    evaluate: () => assessFormalization(snapshot, assessment),
  };
}

describe('context-scoped incremental formalization', () => {
  it('uses sourced facts from an unfinished channel without requiring its whole context or candidate to be complete', () => {
    const h = scenario();
    const result = h.evaluate();
    expect(result.includedCandidateRefs).toEqual(['C-001', 'C-002']);
  });
  it('allows a channel-only proposal batch without inventing a contract or fulfillment', () => {
    const h = scenario();
    h.assessment.contexts = [h.assessment.contexts[1]];
    h.snapshot.content!.candidates = [h.snapshot.content!.candidates[1]];
    h.assessment.contexts[0].requiredFactRefs.pop();
    expect(h.evaluate().includedCandidateRefs).toEqual(['C-002']);
  });
  it('uses a domain identity without requiring unrelated lifecycle rules', () => {
    const h = scenario();
    const domain = contextSlice('C-002', 'domain', [
      'identity',
      'structure',
      'rule',
    ]);
    domain.facts[2].status = 'unknown';
    h.assessment.contexts[1] = domain;
    h.assessment.contexts[0].dependencies[0].providerFactRef = 'C-002.identity';
    const result = h.evaluate();
    expect(result.contexts[1]).toEqual({
      contextRef: 'C-002',
      status: 'support',
      includedFactRefs: ['C-002.identity'],
      missingFactRefs: ['C-002.rule'],
    });
  });
  it('rejects dangling facts, circular proof, missing minimum dimensions and unsourced known facts', () => {
    const missing = scenario();
    missing.assessment.contexts[0].dependencies[0].providerFactRef =
      'C-002.absent';
    expect(missing.evaluate).toThrow('具体事实');
    const cycle = scenario();
    cycle.assessment.contexts[1].dependencies.push({
      ...cycle.assessment.contexts[0].dependencies[0],
      consumerFactRef: 'C-002.evidence',
      providerFactRef: 'C-001.rule',
    });
    expect(cycle.evaluate).toThrow('依赖循环');
    const dimension = scenario();
    dimension.assessment.contexts[1].requiredFactRefs = ['C-002.identity'];
    expect(dimension.evaluate).toThrow('parties');
    const source = scenario();
    source.assessment.contexts[1].facts.find(
      (f) => f.key === 'evidence',
    )!.sourceRefs = [];
    expect(source.evaluate).toThrow('必须有来源');
  });
  it('rejects the old candidate-wide assessment protocol instead of falling back to full-scope checks', () => {
    const h = scenario();
    expect(() =>
      assessFormalization(h.snapshot, {
        candidates: [],
        questions: [],
      } as unknown as FormalizationAssessment),
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';

import type { SensorOutcome } from './sensorsEngine.js';
import { compareSensorOutcomes } from './sensorParity.js';

const outcome = (overrides: Partial<SensorOutcome> = {}): SensorOutcome => ({
  report: {
    timestamp: '2026-11-11T09:00:00.000Z',
    passed: true,
    blockCount: 0,
    warnCount: 0,
    infoCount: 0,
    issues: [],
    keyDataSummary: {
      totalItems: 0,
      resolvedCount: 0,
      decisionOwedCount: 0,
      unresolvedItems: [],
    },
    isStageGateReady: false,
    unavailableSensors: [],
  },
  fmCheck: {
    checkVersion: 5,
    valid: true,
    consistent: true,
    complete: true,
    inputChanged: false,
    errors: [],
    gaps: [],
    scopeRefs: ['context.a'],
    executedScenarioCount: 2,
  },
  keyData: {
    keyDataCount: 2,
    counts: { 'contract-term': 1, derived: 1 },
    needsDecision: [{ path: 'request.a#b' }],
  },
  ...overrides,
});

describe('compareSensorOutcomes', () => {
  it('reports nothing when both engines agree', () => {
    expect(compareSensorOutcomes(outcome(), outcome())).toEqual([]);
  });

  it('ignores build order, which is not a verdict difference', () => {
    const reordered = outcome({
      keyData: {
        keyDataCount: 2,
        counts: { derived: 1, 'contract-term': 1 },
        needsDecision: [{ path: 'request.a#b' }],
      },
    });

    expect(compareSensorOutcomes(outcome(), reordered)).toEqual([]);
  });

  it('names the field both values when a verdict differs', () => {
    const native = outcome({
      fmCheck: {
        checkVersion: 5,
        valid: false,
        consistent: false,
        complete: true,
        inputChanged: false,
        errors: ['native says no'],
        gaps: [],
        scopeRefs: ['context.a'],
        executedScenarioCount: 2,
      },
    });

    expect(compareSensorOutcomes(outcome(), native)).toEqual([
      'check_fm.valid: python=true native=false',
      'check_fm.consistent: python=true native=false',
      'check_fm.errors: python=[] native=["native says no"]',
    ]);
  });

  it('compares key data by item rather than by prose', () => {
    const native = outcome({
      keyData: {
        keyDataCount: 2,
        counts: { 'contract-term': 1, derived: 1 },
        needsDecision: [{ path: 'request.a#c' }],
      },
    });

    expect(compareSensorOutcomes(outcome(), native)).toEqual([
      'audit_key_data.needsDecision: python=["request.a#b"] native=["request.a#c"]',
    ]);
  });
});

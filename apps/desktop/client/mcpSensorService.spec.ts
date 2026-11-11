import { describe, expect, it } from 'vitest';

import { createMcpSensorService } from './mcpSensorService';

const engineThat = (outcome: {
  keyData?: unknown;
  error?: Error;
  gate?: unknown;
  gateError?: Error;
}) => ({
  runFullSensors: async () => {
    if (outcome.error !== undefined) {
      throw outcome.error;
    }

    return { report: {}, keyData: outcome.keyData };
  },
  checkStageGate: async () => {
    if (outcome.gateError !== undefined) {
      throw outcome.gateError;
    }

    return outcome.gate;
  },
});

describe('createMcpSensorService', () => {
  it('projects the audit report the pinned checker produced', async () => {
    const service = createMcpSensorService({
      createEngine: () =>
        engineThat({
          keyData: {
            keyDataCount: 5,
            counts: { 'contract-term': 2, 'needs-decision': 1 },
            needsDecision: [{ path: 'evidence.request#penalty_amount' }],
            note: '待决清单',
          },
        }) as never,
    });

    await expect(service.readKeyDataAudit('/repo')).resolves.toMatchObject({
      producedBy: 'pinned-python',
      keyDataCount: 5,
      counts: { 'contract-term': 2 },
      note: '待决清单',
    });
  });

  it('reports the audit as unavailable instead of empty when Python is missing', async () => {
    const service = createMcpSensorService({
      createEngine: () =>
        engineThat({ error: new Error('missing interpreter') }) as never,
    });

    const audit = await service.readKeyDataAudit('/repo');

    expect(audit.producedBy).toBe('unavailable');
    expect(audit.keyDataCount).toBe(0);
    expect(audit.note).toContain('./init.sh');
  });

  it('maps a gate verdict and closes it on failure', async () => {
    const passing = createMcpSensorService({
      createEngine: () =>
        engineThat({
          gate: { passed: true, target: 'api', errors: [], limitations: [] },
        }) as never,
    });
    const failing = createMcpSensorService({
      createEngine: () =>
        engineThat({ gateError: new Error('check_stage_gate.py crashed') }) as never,
    });

    await expect(
      passing.checkStageGate({ rootPath: '/repo', target: 'api' }),
    ).resolves.toEqual({
      passed: true,
      exitCode: 0,
      driftDetected: false,
      blockingReasons: [],
    });

    await expect(
      failing.checkStageGate({ rootPath: '/repo', target: 'visualization' }),
    ).resolves.toMatchObject({
      passed: false,
      exitCode: 1,
      blockingReasons: ['check_stage_gate.py crashed'],
    });
  });

  it('reuses one engine per project root', async () => {
    const created: string[] = [];
    const service = createMcpSensorService({
      createEngine: (rootPath) => {
        created.push(rootPath);

        return engineThat({ gate: { passed: true, errors: [] } }) as never;
      },
    });

    await service.checkStageGate({ rootPath: '/repo', target: 'api' });
    await service.checkStageGate({ rootPath: '/repo', target: 'api' });
    await service.checkStageGate({ rootPath: '/other', target: 'api' });

    expect(created).toEqual(['/repo', '/other']);
  });
});

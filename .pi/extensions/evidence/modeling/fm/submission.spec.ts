import { describe, expect, it, vi } from 'vitest';
import { createFmSubmission, type FmPublication } from './submission.ts';

function harness(passed = true) {
  const publication: FmPublication = {
    replaceFmModel: vi.fn().mockResolvedValue({
      passed,
      machineValidated: passed,
      simulationPassed: null,
      files: ['model.yaml'],
      items: passed
        ? []
        : [{ name: 'lineage', status: 'fail', details: 'synthetic failure' }],
    }),
    removeFmModel: vi.fn().mockResolvedValue(undefined),
    writeFmStatus: vi.fn().mockResolvedValue(undefined),
    listFmModelFiles: vi.fn().mockResolvedValue(['model.yaml', 'status.md']),
  };
  const options = {
    root: '/synthetic-modeling',
    executor: { exec: vi.fn() },
    timeoutMs: 1000,
  };
  const request = {
    applicable: true,
    rationale: ' 合成模型有独立领域语义；机器结果不能替代人工业务确认。 ',
    files: [{ path: 'model.yaml', content: 'synthetic source' }],
  };
  return {
    publication,
    options,
    request,
    submit: createFmSubmission(publication),
  };
}

describe('headless FM submission service', () => {
  it('returns machine evidence without promoting stakeholder approval', async () => {
    const h = harness();
    const result = await h.submit(h.request, h.options);
    expect(result).toEqual({
      applicable: true,
      rationale: h.request.rationale.trim(),
      files: ['model.yaml', 'status.md'],
      machineValidated: true,
      simulationPassed: null,
    });
    expect(h.publication.writeFmStatus).toHaveBeenCalledWith(
      h.options.root,
      expect.stringContaining('默认 draft / pending'),
    );
    expect(result).not.toHaveProperty('pendingGate');
    expect(h.publication.removeFmModel).not.toHaveBeenCalled();
  });

  it('does not write success status after a failed validation', async () => {
    const h = harness(false);
    await expect(h.submit(h.request, h.options)).rejects.toThrow(
      'lineage: synthetic failure',
    );
    expect(h.publication.writeFmStatus).not.toHaveBeenCalled();
    expect(h.publication.removeFmModel).not.toHaveBeenCalled();
    expect(h.publication.listFmModelFiles).not.toHaveBeenCalled();
  });

  it('enforces applicability before any persistence and clears models only for explicit non-applicability', async () => {
    const h = harness();
    await expect(
      h.submit({ ...h.request, applicable: false }, h.options),
    ).rejects.toThrow('不得提交模型文件');
    await expect(
      h.submit({ ...h.request, files: [] }, h.options),
    ).rejects.toThrow('必须提交模型文件');
    expect(h.publication.replaceFmModel).not.toHaveBeenCalled();
    expect(h.publication.removeFmModel).not.toHaveBeenCalled();
    const result = await h.submit(
      { ...h.request, applicable: false, files: [] },
      h.options,
    );
    expect(result).toMatchObject({
      applicable: false,
      machineValidated: false,
      simulationPassed: null,
    });
    expect(h.publication.removeFmModel).toHaveBeenCalledWith(h.options.root);
    expect(h.publication.writeFmStatus).toHaveBeenCalledWith(
      h.options.root,
      expect.stringContaining('不适用，未生成模型'),
    );
  });
});

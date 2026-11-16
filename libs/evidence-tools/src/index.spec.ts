import { describe, expect, it, vi } from 'vitest';
import { applyModelPatches } from '@evidence-poc/evidence-model-core';
import { createProcurementModel } from '@evidence-poc/evidence-model-core/testing';
import {
  createModelTools,
  MODEL_TOOL_NAMES,
  MODEL_WRITE_ANNOTATIONS,
  type ModelPatchRequest,
  type ModelPatchResult,
} from './index.js';

const intent = {
  contextRef: 'context.procurement',
  request: {
    id: 'request.refund',
    label: '退款申请',
    responsibleRoleRef: 'role.buyer',
  },
  confirmation: {
    id: 'confirmation.refund',
    label: '退款确认',
    responsibleRoleRef: 'role.seller',
  },
};
const setup = () => {
  const document = createProcurementModel();
  const loadDocument = vi.fn(async () => document);
  const applyModelPatch = vi.fn(
    async (patch: ModelPatchRequest): Promise<ModelPatchResult> => ({
      success: true,
      appliedCommands: patch.patches.map(({ op }) => op),
    }),
  );
  const tools = createModelTools({ loadDocument, applyModelPatch });
  const tool = (name: string) => {
    const found = tools.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Missing tool: ${name}`);
    return found;
  };
  return { document, tools, tool, loadDocument, applyModelPatch };
};

describe('shared model tool registry', () => {
  it('defines one guarded writer surface for both SDK adapters', () => {
    const { tools } = setup();
    expect(tools.map(({ name }) => name)).toEqual(
      Object.values(MODEL_TOOL_NAMES),
    );
    for (const tool of tools)
      expect(tool.annotations).toEqual(MODEL_WRITE_ANNOTATIONS);
    expect(MODEL_WRITE_ANNOTATIONS).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it('rejects invalid inputs before any host read or write', async () => {
    const { tools, loadDocument, applyModelPatch } = setup();
    for (const tool of tools)
      await expect(tool.run({ unexpected: true })).rejects.toThrow();
    expect(loadDocument).not.toHaveBeenCalled();
    expect(applyModelPatch).not.toHaveBeenCalled();
  });

  it('passes one validated patch batch through the host guard, not direct mutation', async () => {
    const { tool, document, loadDocument, applyModelPatch } = setup();
    const before = structuredClone(document);
    const input = {
      rationale: '改名',
      patches: [
        { op: 'test', path: '/entities/0/id', value: document.entities[0]?.id },
        { op: 'replace', path: '/entities/0/label', value: '新标签' },
      ],
    };
    const result = await tool(MODEL_TOOL_NAMES.applyModelPatch).run(input);
    expect(result.isError).toBeUndefined();
    expect(applyModelPatch).toHaveBeenCalledExactlyOnceWith(input);
    expect(loadDocument).not.toHaveBeenCalled();
    expect(document).toEqual(before);
  });

  it('builds operators on a draft and submits all generated patches once', async () => {
    const { tool, document, applyModelPatch } = setup();
    const before = structuredClone(document);
    const result = await tool(MODEL_TOOL_NAMES.introduceFulfillmentPair).run(
      intent,
    );
    expect(result.isError).toBeUndefined();
    expect(result.value).toMatchObject({
      createdIds: ['request.refund', 'confirmation.refund'],
    });
    expect(applyModelPatch).toHaveBeenCalledTimes(1);
    const request = applyModelPatch.mock.calls[0]?.[0];
    if (!request) throw new Error('Operator did not submit its transaction');
    expect(
      applyModelPatches(document, request.patches).entities.some(
        ({ id }) => id === 'request.refund',
      ),
    ).toBe(true);
    expect(document).toEqual(before);
  });

  it('does not write on operator refusal or report success when the host rejects', async () => {
    const { tool, applyModelPatch } = setup();
    const refused = await tool(MODEL_TOOL_NAMES.introduceFulfillmentPair).run({
      ...intent,
      contextRef: 'context.missing',
    });
    expect(refused.isError).toBe(true);
    expect(applyModelPatch).not.toHaveBeenCalled();
    applyModelPatch.mockResolvedValue({
      success: false,
      error: 'stale snapshot',
    });
    const rejected = await tool(MODEL_TOOL_NAMES.introduceFulfillmentPair).run(
      intent,
    );
    expect(rejected).toMatchObject({
      isError: true,
      text: '补丁被拒绝：stale snapshot',
      value: { success: false },
    });
  });
});

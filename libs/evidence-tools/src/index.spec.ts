import { describe, expect, it, vi } from 'vitest';
import {
  createDomainGraph,
  keyDataEntryOf,
  createModelSession,
} from '@evidence-poc/evidence-model-core';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import {
  createModelTools,
  MODEL_TOOL_NAMES as names,
  type ModelPatchRequest,
  type ModelPatchResult,
} from './index.js';

const payment = {
  id: 'evidence.payment',
  label: '付款确认',
  stage: 'fulfillment',
  keyData: [
    {
      name: 'amount',
      label: '金额',
      meaning: '申请所列金额',
      valueType: 'int',
    },
    { name: 'receipt_no', label: '回执编号', meaning: '支付成功时生成的编号' },
  ],
};
const setup = () => {
  const session = createModelSession({
    document: createEmptyDomainModel(),
    validateOnDispatch: true,
  });
  const loadDocument = vi.fn(async () => session.getDocument());
  const applyModelPatch = vi.fn(
    async (patch: ModelPatchRequest): Promise<ModelPatchResult> => {
      try {
        session.applyPatchBatch(patch.patches, patch.rationale);
        return {
          success: true,
          appliedCommands: patch.patches.map(({ op }) => op),
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );
  const tools = createModelTools({ loadDocument, applyModelPatch });
  const tool = (name: string) =>
    tools.find((candidate) => candidate.name === name)!;
  return { session, tools, tool, loadDocument, applyModelPatch };
};

describe('shared model tool registry', () => {
  it('exposes one tool list with a read-only What-If', () => {
    const { tools, tool } = setup();
    expect(tools.map(({ name }) => name)).toEqual(Object.values(names));
    expect(tool(names.simulateWhatIfChallenge).annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(
      tools.filter(({ annotations }) => annotations.readOnlyHint),
    ).toHaveLength(1);
  });

  it('rejects malformed inputs before any host operation', async () => {
    const { tools, loadDocument, applyModelPatch } = setup();
    for (const tool of tools)
      await expect(tool.run({ unexpected: true })).rejects.toThrow();
    expect(loadDocument).not.toHaveBeenCalled();
    expect(applyModelPatch).not.toHaveBeenCalled();
  });

  it('grows the same graph through storming, source decisions, pairing and confirmed compensation', async () => {
    const { tool, session, applyModelPatch } = setup();
    const run = async (name: string, input: unknown) =>
      expect((await tool(name).run(input)).isError).toBeUndefined();
    await run(names.batchAddEvidence, {
      evidences: [
        payment,
        { id: 'contract.sale', stage: 'contract', label: '买卖合同' },
      ],
    });
    const entry = (attribute: string) =>
      keyDataEntryOf(session.getDocument(), payment.id, attribute);
    expect(entry('receipt_no')?.decisionOwed).toBe(true);
    expect(entry('amount')?.decisionOwed).toBe(true);
    await run(names.bindKeyDataSource, {
      evidenceRef: payment.id,
      attribute: 'receipt_no',
      decision: { kind: 'direct', source: { kind: 'result-fact' } },
    });
    expect(entry('receipt_no')).toMatchObject({
      source: 'result-fact',
      decisionOwed: false,
    });
    await run(names.splitEvidenceToPair, {
      evidenceRef: payment.id,
      request: { mode: 'create', id: 'request.payment', label: '付款申请' },
      inputAttributes: [
        {
          confirmationAttribute: 'amount',
          requestAttribute: 'requested_amount',
        },
      ],
    });
    expect(entry('amount')).toMatchObject({
      source: 'preceding-evidence',
      decisionOwed: false,
      providers: [
        expect.objectContaining({
          ref: 'request.payment',
          attribute: 'requested_amount',
        }),
      ],
    });
    const beforeProbe = session.getDocument();
    const challenge = await tool(names.simulateWhatIfChallenge).run({
      requestRef: 'request.payment',
    });
    expect(challenge.value).toMatchObject({
      requestRef: 'request.payment',
      hypotheses: expect.arrayContaining([
        expect.objectContaining({ kind: 'timeout' }),
      ]),
    });
    expect(session.getDocument()).toBe(beforeProbe);
    expect(applyModelPatch).toHaveBeenCalledTimes(3);
    await run(names.growBreachCompensation, {
      requestRef: 'request.payment',
      condition: '超时后启动退款',
      request: { id: 'request.refund', label: '退款请求' },
      confirmation: { id: 'confirmation.refund', label: '退款确认' },
    });
    expect(
      createDomainGraph(session.getDocument()).fulfillmentPair('request.refund')
        ?.confirmations[0]?.id,
    ).toBe('confirmation.refund');
    expect(session.getDocument().relationships).toContainEqual(
      expect.objectContaining({
        flowKind: 'breach_compensation',
        targetRef: 'request.payment',
      }),
    );
    expect(session.undo()).toBe(true);
    expect(session.getDocument()).toEqual(beforeProbe);
  });

  it('does not write a partially invalid batch or overwrite a stale host snapshot', async () => {
    const { tool, session, applyModelPatch } = setup();
    const refused = await tool(names.batchAddEvidence).run({
      evidences: [payment, payment],
    });
    expect(refused.isError).toBe(true);
    expect(applyModelPatch).not.toHaveBeenCalled();
    const persist = applyModelPatch.getMockImplementation()!;
    applyModelPatch.mockImplementationOnce(async (patch) => {
      session.mutate((draft) => {
        draft.manifest.name = '手工修改';
      });
      return persist(patch);
    });
    const rejected = await tool(names.batchAddEvidence).run({
      evidences: [payment],
    });
    expect(rejected.isError).toBe(true);
    expect(session.getDocument().entities).toEqual([]);
    expect(session.getDocument().manifest.name).toBe('手工修改');
  });
});

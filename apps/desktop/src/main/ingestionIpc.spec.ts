import { describe, expect, it, vi } from 'vitest';

import { compileDraft, readDraft, type IngestionTextGenerator } from './ingestionIpc';

const BLUEPRINT = `| 阶段 | 业务凭证 | 凭证类型 | 当事人 |
| :--- | :--- | :--- | :--- |
| 签约 | 采购合同 | contract | 甲方代表, 乙方代表 |
| 履约 | 支付申请 | request | 甲方财务 |
| 履约 | 支付确认 | confirmation | 乙方财务 |`;

const REPLY = `\`\`\`json
{
  "modelName": "云服务采购",
  "contexts": [{ "id": "context.contract", "label": "合约上下文", "kind": "contract", "rootRefs": ["contract.cloud"] }],
  "participants": [{ "id": "party.buyer", "label": "买方", "kind": "party" }],
  "roles": [
    { "id": "role.buyer", "label": "买方", "kind": "party", "contextRef": "context.contract" },
    { "id": "role.seller", "label": "卖方", "kind": "party", "contextRef": "context.contract" }
  ],
  "things": [],
  "evidences": [
    { "id": "contract.cloud", "label": "云服务采购协议", "kind": "contract", "contextRef": "context.contract", "roleRefs": ["role.buyer", "role.seller"] }
  ],
  "fulfillmentPairs": [],
  "breachCompensations": [],
  "relationships": []
}
\`\`\``;

describe('reading a draft', () => {
  it('reads a blueprint table without asking a model', async () => {
    const generate = vi.fn<IngestionTextGenerator>();

    const result = await readDraft(
      { kind: 'blueprint', content: BLUEPRINT, modelName: '采购' },
      generate,
    );

    expect(result.success).toBe(true);
    expect(generate).not.toHaveBeenCalled();

    if (!result.success) {
      return;
    }

    expect(result.reader).toBe('blueprint');
    expect(result.draft.evidences.length).toBeGreaterThan(0);
  });

  it('prefers the model when one is configured', async () => {
    const result = await readDraft({ kind: 'text', content: '合同条款' }, async () => REPLY);

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.reader).toBe('text-model');
    expect(result.draft.modelName).toBe('云服务采购');
  });

  it('falls back to the built-in vocabulary when the model answers nonsense', async () => {
    const result = await readDraft(
      { kind: 'text', content: '甲乙双方签订《采购协议》后，甲方需在 5 个工作日内支付货款。' },
      async () => '抱歉，我读不出来。',
    );

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.reader).toBe('text-rules');
    expect(result.issues.join(' ')).toContain('已改用本地读法');
  });

  it('falls back when the model call itself throws', async () => {
    const result = await readDraft({ kind: 'text', content: '合同条款' }, async () => {
      throw new Error('没有配置模型');
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.reader).toBe('text-rules');
    expect(result.issues.join(' ')).toContain('没有配置模型');
  });

  it('fails loudly when a blueprint table has no usable row', async () => {
    const result = await readDraft({ kind: 'blueprint', content: '| foo |' });

    expect(result.success).toBe(false);
  });
});

describe('compiling a reviewed draft', () => {
  const store = () => ({
    createFromDocument: vi.fn(async () => ({
      success: true as const,
      project: {
        rootPath: '/models/ingested',
        modelRoot: '/models/ingested/.evidence/fm',
        name: '云服务采购',
        modelId: 'cloud',
        modelVersion: '0.1.0',
        entityCount: 1,
        relationshipCount: 0,
        ruleCount: 0,
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
      },
      document: { manifest: {}, entities: [], relationships: [], rules: [] } as never,
    })),
  });

  it('writes the compiled document and returns the canvas slots', async () => {
    const draft = await readDraft({ kind: 'blueprint', content: BLUEPRINT });

    if (!draft.success) {
      throw new Error(draft.error);
    }

    const target = store();
    const outcome = await compileDraft(
      {
        draft: draft.draft,
        targetPath: '/models/ingested',
        name: '采购蓝图',
        kind: 'directory',
      },
      target,
    );

    expect(outcome.success).toBe(true);
    expect(target.createFromDocument).toHaveBeenCalledTimes(1);

    if (!outcome.success) {
      return;
    }

    expect(outcome.project.rootPath).toBe('/models/ingested');
    expect(Object.keys(outcome.layout).length).toBeGreaterThan(0);
  });

  it('reuses the name the caller typed, not the reader’s guess', async () => {
    const draft = await readDraft({ kind: 'blueprint', content: BLUEPRINT });

    if (!draft.success) {
      throw new Error(draft.error);
    }

    const target = store();
    const outcome = await compileDraft(
      {
        draft: draft.draft,
        targetPath: '/models/x',
        name: '我起的名字',
        kind: 'directory',
      },
      target,
    );

    expect(outcome.success ? outcome.document.manifest.name : undefined).toBe(
      '我起的名字',
    );
  });

  it('refuses to write an empty model and says why', async () => {
    const target = store();
    const outcome = await compileDraft(
      {
        draft: {
          modelName: '空草稿',
          source: 'unknown',
          contexts: [],
          participants: [],
          roles: [],
          things: [],
          evidences: [],
          fulfillmentPairs: [],
          breachCompensations: [],
          relationships: [],
        },
        targetPath: '/models/empty',
        name: '空草稿',
        kind: 'directory',
      },
      target,
    );

    expect(outcome.success).toBe(false);
    expect(outcome.success ? '' : outcome.error).toContain('没有读到可以落地的业务对象');
    expect(target.createFromDocument).not.toHaveBeenCalled();
  });

  it('reports a refused write without pretending the model exists', async () => {
    const draft = await readDraft({ kind: 'blueprint', content: BLUEPRINT });

    if (!draft.success) {
      throw new Error(draft.error);
    }

    const outcome = await compileDraft(
      {
        draft: draft.draft,
        targetPath: '/models/ingested',
        name: '采购蓝图',
        kind: 'directory',
      },
      {
        createFromDocument: async () => ({
          success: false,
          error: '目标目录已有模型。',
        }),
      },
    );

    expect(outcome.success).toBe(false);
    expect(outcome.success ? '' : outcome.error).toBe('目标目录已有模型。');
  });
});

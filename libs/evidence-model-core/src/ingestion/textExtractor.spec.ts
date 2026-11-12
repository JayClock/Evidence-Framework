import { describe, expect, it } from 'vitest';

import { strictValidateDomainModel } from '@evidence-poc/evidence-schema';

import { compileIngestionDraft } from './compileDraft.js';
import { readIngestionDraftJson } from './readDraftJson.js';
import { draftFromBusinessText } from './textExtractor.js';

const CONTRACT_CLAUSE =
  '当甲乙双方签订《企业级云服务采购协议》后，甲方需在 5 个工作日内完成首期技术服务费支付，并提供银行转账凭证；乙方在确认到账后 2 个工作日内开通企业账号权限并出具开通确认函。若乙方未在期限内开通服务，甲方有权发起违约退款申请，乙方应在 3 个工作日内全额原路退还。';

const SUBSCRIPTION_RULE =
  '读者订阅极客时间专栏后，可在订阅期内访问付费内容。读者未在 15 分钟内完成支付，订单自动关闭。若专栏出现断更，极客时间须在 3 个工作日内下架专栏并全额退款。';

describe('reading prose without a model', () => {
  it('finds the contract before it finds the documents', () => {
    const { draft } = draftFromBusinessText(CONTRACT_CLAUSE, {
      modelName: '云服务采购',
    });

    const contract = draft.evidences.find(
      (evidence) => evidence.kind === 'contract',
    );

    expect(contract?.label).toBe('企业级云服务采购协议');
    expect(draft.contexts.some((context) => context.kind === 'contract')).toBe(
      true,
    );
  });

  it('reads a clause with a deadline as the obligation it states', () => {
    const { draft } = draftFromBusinessText(CONTRACT_CLAUSE);
    const requests = draft.evidences.filter(
      (evidence) => evidence.kind === 'fulfillment_request',
    );

    expect(requests.map((request) => request.label)).toContain('支付申请');
  });

  it('keeps a gap as a gap and says so', () => {
    const { draft, issues } = draftFromBusinessText(CONTRACT_CLAUSE);
    const unconfirmed = draft.evidences.filter(
      (evidence) =>
        evidence.kind === 'fulfillment_request' &&
        !draft.fulfillmentPairs.some(
          (pair) => pair.requestRef === evidence.id,
        ),
    );

    expect(unconfirmed.length).toBeGreaterThan(0);
    expect(issues.join(' ')).toContain('缺少履约确认');
  });

  it('compiles an offline reading into a model that validates', () => {
    const { draft } = draftFromBusinessText(CONTRACT_CLAUSE, {
      modelName: '云服务采购',
    });
    const { document, issues } = compileIngestionDraft(draft, {
      modelId: 'cloud-procurement',
    });

    expect(issues).toEqual([]);
    expect(strictValidateDomainModel(document).valid).toBe(true);
    expect(document.entities.length).toBeGreaterThan(0);
  });

  it('carries the clause each reading came from', () => {
    const { draft } = draftFromBusinessText(CONTRACT_CLAUSE);
    const payment = draft.evidences.find(
      (evidence) => evidence.label === '支付申请',
    );

    expect(payment?.provenance?.text).toContain('技术服务费支付');
    expect(payment?.provenance?.source).toBe('unknown');
  });

  it('says nothing at all when the input says nothing', () => {
    const { draft, issues } = draftFromBusinessText('   ');

    expect(draft.evidences).toEqual([]);
    expect(issues).toEqual(['没有读到任何业务句子。']);
  });

  it('reads the subscription rule as a subscription, not a purchase', () => {
    const { draft } = draftFromBusinessText(SUBSCRIPTION_RULE, {
      modelName: '专栏订阅',
    });

    expect(
      draft.evidences.some((evidence) => evidence.label.includes('支付')),
    ).toBe(true);
    expect(draft.participants.map((party) => party.label)).toContain('读者');
  });
});

describe('reading a large model’s reply', () => {
  const REPLY = `这里是我读到的结果：
\`\`\`json
{
  "modelName": "云服务采购",
  "source": "contract",
  "contexts": [{ "id": "context.contract", "label": "采购协议上下文", "kind": "contract", "rootRefs": ["contract.cloud"] }],
  "participants": [{ "id": "party.buyer", "label": "甲方采购方", "kind": "party" }],
  "roles": [{ "id": "role.buyer", "label": "买方", "kind": "party", "contextRef": "context.contract" }],
  "things": [],
  "evidences": [
    { "id": "contract.cloud", "label": "云服务采购协议", "kind": "contract", "contextRef": "context.contract", "roleRefs": ["role.buyer", "role.seller"] }
  ],
  "fulfillmentPairs": [],
  "breachCompensations": [],
  "relationships": []
}
\`\`\``;

  it('digs the object out of the prose and the fence', () => {
    const result = readIngestionDraftJson(REPLY);

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.draft.modelName).toBe('云服务采购');
    expect(result.draft.evidences[0]?.id).toBe('contract.cloud');
  });

  it('normalises the short kind names the prompt allows', () => {
    const result = readIngestionDraftJson(
      '{"modelName":"x","evidences":[{"id":"request.pay","label":"支付申请","kind":"request","contextRef":"context.c"}]}',
    );

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.draft.evidences[0]?.kind).toBe('fulfillment_request');
  });

  it('reports an unknown kind instead of promoting it silently', () => {
    const result = readIngestionDraftJson(
      '{"modelName":"x","evidences":[{"id":"evidence.x","label":"收据","kind":"收据","contextRef":"context.c"}]}',
    );

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.draft.evidences[0]?.kind).toBe('other_evidence');
    expect(result.issues.join(' ')).toContain('类型无法识别');
  });

  it('fails loudly when there is no JSON to read', () => {
    expect(readIngestionDraftJson('抱歉，我无法完成。').success).toBe(false);
    expect(readIngestionDraftJson('{"modelName": "x"').success).toBe(false);
  });

  it('ignores a collection of the wrong type but says it did', () => {
    const result = readIngestionDraftJson(
      '{"modelName":"x","contexts":"none","participants":[]}',
    );

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.draft.contexts).toEqual([]);
    expect(result.issues.join(' ')).toContain('contexts 不是数组');
  });

  it('rejects a draft whose elements are not objects with ids', () => {
    const result = readIngestionDraftJson(
      '{"modelName":"x","evidences":["支付申请"]}',
    );

    expect(result.success).toBe(false);
  });
});

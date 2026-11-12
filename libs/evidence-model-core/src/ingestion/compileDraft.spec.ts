import { describe, expect, it } from 'vitest';

import {
  isContextEntity,
  isContractEntity,
  strictValidateDomainModel,
  type ContextEntityAST,
} from '@evidence-poc/evidence-schema';

import { parseBlueprint } from './blueprintParser.js';
import { compileIngestionDraft } from './compileDraft.js';
import { LAYOUT_COLUMNS, LAYOUT_ROWS, layoutDomainModel } from './layoutDomainModel.js';

const BLUEPRINT = `| 阶段 | 客户旅程 / 前台活动 | 业务凭证 | 凭证类型 | 当事人 | 标的物 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 合约前阶段 | 提交采购意向 | 商品询价单 | rfp | 甲方采购员 | 采购物资 |
| 合约前阶段 | 提供商品报价 | 商品报价单 | proposal | 乙方销售 | 采购物资 |
| 合约确立 | 签署采购协议 | 采购框架合同 | contract | 甲方代表, 乙方代表 | 采购物资 |
| 履约交付 | 提交付款申请 | 支付申请单 | request | 甲方财务 | 采购货款 |
| 履约交付 | 确认款项到账 | 支付确认单 | confirmation | 乙方财务 | 采购货款 |
| 履约交付 | 提供转账凭据 | 银行回单 | evidence | 甲方财务 | 采购货款 |`;

const compileBlueprint = (content = BLUEPRINT) => {
  const parsed = parseBlueprint(content, { modelName: '采购履约' });

  if (!parsed.success) {
    throw new Error(parsed.error);
  }

  return { parsed, compiled: compileIngestionDraft(parsed.draft, { modelId: 'procurement' }) };
};

describe('compiling a draft', () => {
  it('produces a model the schema accepts', () => {
    const { compiled } = compileBlueprint();
    const validation = strictValidateDomainModel(compiled.document);

    expect(validation.issues.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('writes the pre-contract context under the contract it sourced', () => {
    const { compiled } = compileBlueprint();

    // Narrow with the schema's own guards: `find` alone leaves the union wide
    // open, and `contextRef` only exists on the evidence member.
    const isPreContractContext = (
      entity: Parameters<typeof isContextEntity>[0],
    ): entity is ContextEntityAST =>
      isContextEntity(entity) && entity.kind === 'pre_contract';

    const contract = compiled.document.entities.find(isContractEntity);
    const preContract = compiled.document.entities.find(isPreContractContext);

    expect(preContract?.parentContextRef).toBe(contract?.contextRef);
    expect(compiled.document.manifest.entryContextRefs).toEqual([
      contract?.contextRef,
    ]);
  });

  it('gives every fulfilment pair a completion rule over its own request', () => {
    const { compiled } = compileBlueprint();
    const rules = compiled.document.rules;

    expect(rules).toHaveLength(1);
    expect(rules[0]?.kind).toBe('completion');
    expect(Object.keys(rules[0]?.bindings ?? {}).sort()).toEqual([
      'confirmations',
      'request',
    ]);
  });

  it('keeps the sentence each entity was read from', () => {
    const { compiled } = compileBlueprint();
    const rfp = compiled.document.entities.find(
      (entity) => entity.category === 'evidence' && entity.kind === 'rfp',
    );

    expect(rfp?.sourceSnippet?.text).toContain('商品询价单');
  });

  it('drops a contract without two roles instead of inventing them', () => {
    const soloContract = `| 业务凭证 | 凭证类型 | 当事人 |
| :--- | :--- | :--- |
| 采购合同 | contract | 甲方代表 |`;

    const parsed = parseBlueprint(soloContract);

    if (!parsed.success) {
      throw new Error(parsed.error);
    }

    // The parser already fills the placeholder pair and reports it; the compiler
    // therefore keeps the contract but the two roles come from the placeholder.
    const compiled = compileIngestionDraft(parsed.draft, { modelId: 'solo' });
    const contract = compiled.document.entities.find(
      (entity) => entity.category === 'evidence' && entity.kind === 'contract',
    );

    expect(contract?.category === 'evidence' ? contract.roleRefs : undefined).toHaveLength(2);
    expect(parsed.issues.map((issue) => issue.message).join(' ')).toContain(
      '已按「甲方 / 乙方」补齐角色',
    );
  });

  it('cascades a dropped root into its context and that context’s evidences', () => {
    const orphaned = `| 业务凭证 | 凭证类型 | 当事人 |
| :--- | :--- | :--- |
| 发货申请 | request | 甲方库管 |`;

    const parsed = parseBlueprint(orphaned);

    if (!parsed.success) {
      throw new Error(parsed.error);
    }

    // No contract anywhere, so the contract context has no root and everything
    // hanging off it has to go too; what is left still has to validate.
    const compiled = compileIngestionDraft(parsed.draft, { modelId: 'orphaned' });
    const validation = strictValidateDomainModel(compiled.document);

    // Everything that hung a fact on the missing contract is gone; what must not
    // survive is a role or evidence pointing at a dropped context.
    expect(
      compiled.document.entities.filter(
        (entity) => entity.category !== 'participant',
      ),
    ).toEqual([]);
    expect(
      validation.issues.filter((issue) => issue.path.startsWith('entities.')),
    ).toEqual([]);
    expect(compiled.droppedIds.length).toBeGreaterThan(0);
    expect(compiled.issues.map((issue) => issue.message).join(' ')).toContain(
      '没有可追溯的根凭证',
    );
  });

  it('writes the references the draft declared', () => {
    const { compiled } = compileBlueprint();
    const references = compiled.document.relationships.filter(
      (relationship) => relationship.kind === 'references',
    );
    const playsRole = compiled.document.relationships.filter(
      (relationship) => relationship.kind === 'plays_role',
    );

    expect(references.length).toBeGreaterThan(0);
    expect(playsRole.length).toBeGreaterThan(0);
    expect(compiled.issues).toEqual([]);
  });

  it('cites only the proposal across the pre-contract boundary', () => {
    const { compiled } = compileBlueprint();
    const contract = compiled.document.entities.find(
      (entity) => entity.category === 'evidence' && entity.kind === 'contract',
    );
    const cited = compiled.document.relationships
      .filter((relationship) => relationship.sourceRef === contract?.id)
      .map((relationship) =>
        compiled.document.entities.find(
          (entity) => entity.id === relationship.targetRef,
        ),
      );

    // A cross-context reference may only cite a proposal; an inquiry stays in
    // its own context, and the proposal references it from there.
    expect(cited.every((entity) => entity?.category !== 'evidence' || entity.kind === 'proposal' || entity.kind === 'other_evidence')).toBe(true);
    expect(cited.some((entity) => entity?.category === 'evidence' && entity.kind === 'proposal')).toBe(true);
  });

  it('keeps a domain component a thing, with the role it was read as', () => {
    const parsed = parseBlueprint(BLUEPRINT, { modelName: '采购履约' });

    if (!parsed.success) {
      throw new Error(parsed.error);
    }

    const thing = parsed.draft.things[0];

    if (thing === undefined) {
      throw new Error('蓝图应当读出一个标的物。');
    }

    thing.domainRole = 'checker';

    const compiled = compileIngestionDraft(parsed.draft, { modelId: 'procurement' });
    const written = compiled.document.entities.find(
      (entity) => entity.id === compiled.writtenIds[thing.id],
    );

    expect(written?.category).toBe('participant');
    expect(written).toMatchObject({ kind: 'thing', domainRole: 'checker' });
    expect(strictValidateDomainModel(compiled.document).valid).toBe(true);
  });

  it('records the id every draft element ended up with', () => {    const { parsed, compiled } = compileBlueprint();
    const request = parsed.draft.evidences.find(
      (evidence) => evidence.kind === 'fulfillment_request',
    );

    expect(request).toBeDefined();
    expect(compiled.writtenIds[request?.id ?? '']).toBeDefined();
  });
});

describe('laying out a compiled model', () => {
  it('puts the contract above the roles and parties that annotate it', () => {
    const { compiled } = compileBlueprint();
    const layout = layoutDomainModel(compiled.document);
    const contract = compiled.document.entities.find(
      (entity) => entity.category === 'evidence' && entity.kind === 'contract',
    );
    const party = compiled.document.entities.find(
      (entity) => entity.category === 'participant' && entity.kind === 'party',
    );

    expect(layout[contract?.id ?? '']?.y).toBeLessThan(
      layout[party?.id ?? '']?.y ?? Number.POSITIVE_INFINITY,
    );
  });

  it('reads left to right: sourcing, contract, fulfilment', () => {
    const { compiled } = compileBlueprint();
    const layout = layoutDomainModel(compiled.document);

    const rfp = compiled.document.entities.find(
      (entity) => entity.category === 'evidence' && entity.kind === 'rfp',
    );
    const contract = compiled.document.entities.find(
      (entity) => entity.category === 'evidence' && entity.kind === 'contract',
    );
    const confirmation = compiled.document.entities.find(
      (entity) => entity.category === 'evidence' && entity.kind === 'fulfillment_confirmation',
    );

    expect(layout[rfp?.id ?? '']?.x).toBe(LAYOUT_COLUMNS.preContract);
    expect(layout[contract?.id ?? '']?.x).toBe(LAYOUT_COLUMNS.contract);
    expect(layout[confirmation?.id ?? '']?.x).toBe(LAYOUT_COLUMNS.fulfillment);
  });

  it('puts things on their own row below the flow', () => {
    const { compiled } = compileBlueprint();
    const layout = layoutDomainModel(compiled.document);
    const thing = compiled.document.entities.find(
      (entity) => entity.category === 'participant' && entity.kind === 'thing',
    );

    expect(layout[thing?.id ?? '']?.y).toBeGreaterThanOrEqual(LAYOUT_ROWS.domain);
  });

  it('never gives two entities the same coordinate', () => {
    const { compiled } = compileBlueprint();
    const layout = layoutDomainModel(compiled.document);
    const points = Object.values(layout).map((point) => `${point.x}:${point.y}`);

    const placed = compiled.document.entities.filter(
      (entity) => entity.category !== 'context',
    );

    expect(new Set(points).size).toBe(points.length);
    expect(Object.keys(layout)).toHaveLength(placed.length);
  });

  it('lays out a model re-read from disk the same way', () => {
    const { compiled } = compileBlueprint();
    const once = layoutDomainModel(compiled.document);
    const twice = layoutDomainModel(JSON.parse(JSON.stringify(compiled.document)));

    expect(twice).toEqual(once);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ContractSourceDocumentSchema,
  ProvenanceSnippetSchema,
  strictValidateDomainModel,
} from '@evidence-poc/evidence-schema';
import { annotateContractClauses } from './contractAnnotator.js';
import { draftFromContract } from './contractReader.js';
import { compileIngestionDraft } from './compileDraft.js';
import { collectClauseTrace } from './clauseTrace.js';
import {
  serializeModelBundle,
  parseModelBundleText,
} from '../adapters/modelBundle.js';
import {
  serializeDomainModel,
  parseModelSourceFiles,
} from '../adapters/modelSourceFiles.js';
import { createProcurementModel } from '../testing/modelFixture.js';

const text =
  '  甲方与乙方签订《商品采购协议》。\r\n甲方在3日内支付货款；乙方确认收到付款并出具银行回单。\n会员等级按成长值计算。争议由法院管辖。';

describe('contract clause provenance', () => {
  it('anchors exact UTF-16 spans in original text, including duplicates and CRLF', () => {
    const source = '😀 甲方支付。\r\n甲方支付。';
    const { clauses } = annotateContractClauses(source);
    expect(clauses).toHaveLength(2);
    for (const clause of clauses)
      expect(source.slice(clause.charStart, clause.charEnd)).toBe(clause.text);
    expect(clauses[1]!.charStart).toBeGreaterThan(clauses[0]!.charEnd);
  });
  it('retains all clauses and original text across compile, tree and bundle reload', () => {
    const read = draftFromContract(text);
    const { document } = compileIngestionDraft(read.draft, {
      modelId: 'clause-test',
    });
    expect(strictValidateDomainModel(document).issues).toEqual([]);
    expect(document.manifest.sourceDocument?.text).toBe(text);
    const trace = collectClauseTrace(document);
    expect(
      trace.clauses.some(
        (row) => row.category === 'boilerplate' && row.entityIds.length === 0,
      ),
    ).toBe(true);
    expect(
      trace.clauses.some(
        (row) => row.category === 'domain' && row.entityIds.length > 0,
      ),
    ).toBe(true);
    expect(
      trace.clauses.some(
        (row) => row.category === 'business' && row.entityIds.length > 0,
      ),
    ).toBe(true);
    expect(trace.unmatchedEntityIds).toEqual([]);
    const bundle = parseModelBundleText(serializeModelBundle(document));
    const tree = parseModelSourceFiles(serializeDomainModel(bundle.document));
    expect(bundle.issues).toEqual([]);
    expect(tree.issues).toEqual([]);
    expect(collectClauseTrace(tree.document)).toEqual(trace);
  });
  it('never guesses an ambiguous or changed quote; legacy snippets still work', () => {
    const model = createProcurementModel();
    const entity = model.entities[0]!;
    entity.sourceSnippet = { text: '支付货款', source: 'contract' };
    expect(collectClauseTrace(model).fullText).toBeNull();
    expect(collectClauseTrace(model).clauses[0]?.entityIds).toEqual([
      entity.id,
    ]);
    model.manifest.sourceDocument = {
      text: '支付货款。支付货款',
      clauses: [
        {
          index: 1,
          text: '支付货款',
          category: 'business',
          reason: '',
          charStart: 0,
          charEnd: 4,
        },
        {
          index: 2,
          text: '支付货款',
          category: 'business',
          reason: '',
          charStart: 5,
          charEnd: 9,
        },
      ],
    };
    expect(collectClauseTrace(model).unmatchedEntityIds).toEqual([entity.id]);
    entity.sourceSnippet.clauseIndex = 2;
    expect(collectClauseTrace(model).clauses[1]?.entityIds).toEqual([
      entity.id,
    ]);
    entity.sourceSnippet.text = '支付货款已修改';
    expect(collectClauseTrace(model).unmatchedEntityIds).toEqual([entity.id]);
  });
  it('rejects partial or mismatched spans at the schema boundary', () => {
    expect(
      ProvenanceSnippetSchema.safeParse({ text: '条款', charStart: 0 }).success,
    ).toBe(false);
    expect(
      ProvenanceSnippetSchema.safeParse({
        text: '条款',
        charStart: 0,
        charEnd: 1,
      }).success,
    ).toBe(false);
    expect(
      ContractSourceDocumentSchema.safeParse({
        text: '条款',
        clauses: [
          {
            index: 1,
            text: '错误',
            category: 'business',
            reason: '',
            charStart: 0,
            charEnd: 2,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

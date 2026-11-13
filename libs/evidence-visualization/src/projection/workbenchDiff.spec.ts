import { compiledDocument } from '@evidence-poc/evidence-model-core';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { projectWorkbenchDiff } from './workbenchDiff.js';
import {
  projectWorkbenchData,
  type CompiledModel,
} from './workbenchProjection.js';

const base = () => {
  const document = createEmptyDomainModel({ id: 'model.review' });
  document.entities.push({
    type: 'entity',
    id: 'party.old',
    category: 'participant',
    kind: 'party',
    label: '旧主体',
    notes: 'PRIVATE_SOURCE',
    attributes: [{ name: 'name', label: '姓名', valueType: 'string', meaning: '姓名' }],
  });
  return document;
};
const dataOf = (document: ReturnType<typeof base>) =>
  projectWorkbenchData({
    model: compiledDocument(document) as unknown as CompiledModel,
    check: {},
  });

describe('workbench diff', () => {
  it('retains removed objects and their old geometry without leaking source records', () => {
    const before = base();
    const after = createEmptyDomainModel({ id: 'model.review' });
    const diff = projectWorkbenchDiff(before, after, dataOf(after));
    expect(diff.counts).toEqual({ added: 0, modified: 0, removed: 1 });
    expect(diff.baseline.layout.nodes[0]?.nodeId).toBe('party.old');
    expect(diff.changes[0]?.attributeChanges[0]?.before?.id).toBe(
      'party.old#name',
    );
    expect(JSON.stringify(diff)).not.toContain('PRIVATE_SOURCE');
    expect(JSON.parse(JSON.stringify(diff))).toEqual(diff);
  });
  it('projects added and modified fields and leaves the current layout unchanged', () => {
    const before = base();
    const after = base();
    after.entities[0]!.label = '新主体';
    after.entities[0]!.attributes![0]!.label = '全名';
    after.entities.push({
      type: 'entity',
      id: 'party.new',
      category: 'participant',
      kind: 'party',
      label: '新增',
    });
    const data = dataOf(after);
    const original = JSON.stringify(data);
    const diff = projectWorkbenchDiff(before, after, data);
    expect(diff.counts).toEqual({ added: 1, modified: 1, removed: 0 });
    expect(
      diff.changes.find((item) => item.id === 'party.old')?.fields,
    ).toContainEqual({ name: 'label', before: '旧主体', after: '新主体' });
    expect(JSON.stringify(data)).toBe(original);
  });
  it('reports an empty comparison and refuses unrelated models', () => {
    expect(
      projectWorkbenchDiff(base(), base(), dataOf(base())).changes,
    ).toEqual([]);
    const other = base();
    other.manifest.id = 'model.other';
    expect(() => projectWorkbenchDiff(base(), other, dataOf(other))).toThrow(
      'ID 不一致',
    );
  });
});

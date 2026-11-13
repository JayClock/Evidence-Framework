import {
  EMPTY_MODEL_MANIFEST,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import { workbenchLayoutOf } from './workbenchLayout.js';

const documentOf = (entities: DomainModelDocument['entities']): DomainModelDocument => ({
  manifest: { ...EMPTY_MODEL_MANIFEST, name: '布局夹具' },
  entities,
  relationships: [],
  rules: [],
});

describe('workbenchLayoutOf', () => {
  it('places the objects of the document it was given', () => {
    const layout = workbenchLayoutOf(
      documentOf([
        {
          type: 'entity',
          id: 'context.a',
          category: 'context',
          kind: 'contract',
          label: '约定',
          rootRefs: ['evidence.a'],
        },
        {
          type: 'entity',
          id: 'evidence.a',
          category: 'evidence',
          kind: 'other_evidence',
          label: '凭证',
          contextRef: 'context.a',
          attributes: [],
        },
      ]),
    );

    expect(layout.nodes.map((node) => node.nodeId)).toEqual(['evidence.a']);
    expect(layout.contextGroups.map((group) => group.contextId)).toEqual([
      'context.a',
    ]);
    expect(layout.bounds.width).toBeGreaterThan(0);
  });

  it('survives JSON, because a page is read back from a file', () => {
    const layout = workbenchLayoutOf(
      documentOf([
        {
          type: 'entity',
          id: 'context.a',
          category: 'context',
          kind: 'contract',
          label: '约定',
          rootRefs: ['evidence.a'],
        },
        {
          type: 'entity',
          id: 'evidence.a',
          category: 'evidence',
          kind: 'other_evidence',
          label: '凭证',
          contextRef: 'context.a',
          attributes: [],
        },
      ]),
    );

    expect(JSON.parse(JSON.stringify(layout))).toEqual(layout);
  });

  it('describes a model with no entities as an empty drawing', () => {
    expect(workbenchLayoutOf(documentOf([])).nodes).toEqual([]);
  });
});

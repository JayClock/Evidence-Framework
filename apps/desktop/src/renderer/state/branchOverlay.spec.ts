import { describe, expect, it } from 'vitest';

import type { ModelDiff } from '@evidence-poc/evidence-model-core/browser';

import { createDesktopFixture } from '../test-support/modelFixture';
import { buildBranchOverlay } from './branchOverlay';

const diffOf = (overrides: Partial<ModelDiff> = {}): ModelDiff => ({
  baseModelId: 'desktop-fixture',
  targetModelId: 'desktop-fixture',
  summary: {
    addedCount: 0,
    removedCount: 0,
    modifiedCount: 0,
    keyDataChangedCount: 0,
    hasKeyDataDrift: false,
    decisionOwedBase: 0,
    decisionOwedTarget: 0,
  },
  contexts: [],
  entities: [],
  relationships: [],
  rules: [],
  keyData: [],
  ...overrides,
});

describe('buildBranchOverlay', () => {
  it('marks an object the compared branch removed', () => {
    const overlay = buildBranchOverlay({
      diff: diffOf({
        entities: [
          {
            id: 'evidence.contract',
            label: '采购协议（Procurement Contract）',
            category: 'evidence',
            kind: 'contract',
            changeType: 'removed',
          },
        ],
      }),
      targetDocument: createDesktopFixture(),
    });

    expect([...overlay.marks.entries()]).toEqual([
      ['evidence.contract', 'removed'],
    ]);
    expect(overlay.ghosts).toEqual([]);
  });

  it('marks an object the compared branch changed', () => {
    const overlay = buildBranchOverlay({
      diff: diffOf({
        entities: [
          {
            id: 'evidence.request',
            label: '交付请求（Delivery Request）',
            category: 'evidence',
            kind: 'fulfillment_request',
            changeType: 'modified',
            fields: ['attributes'],
          },
        ],
      }),
      targetDocument: createDesktopFixture(),
    });

    expect(overlay.marks.get('evidence.request')).toBe('modified');
  });

  it('places an added object where the compared branch draws it', () => {
    const target = createDesktopFixture();

    target.entities.push({
      type: 'entity',
      id: 'evidence.statement',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      label: '月度对账单（Statement）',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.buyer',
      attributes: [],
    });

    const overlay = buildBranchOverlay({
      diff: diffOf({
        entities: [
          {
            id: 'evidence.statement',
            label: '月度对账单（Statement）',
            category: 'evidence',
            kind: 'fulfillment_confirmation',
            changeType: 'added',
          },
        ],
      }),
      targetDocument: target,
    });

    expect(overlay.marks.size).toBe(0);
    expect(overlay.ghosts.map((node) => node.nodeId)).toEqual([
      'evidence.statement',
    ]);
    expect(overlay.ghosts[0]!.box.width).toBeGreaterThan(0);
  });

  it('keeps a subtree from being drawn as a ghost twice', () => {
    const target = createDesktopFixture();

    const overlay = buildBranchOverlay({
      diff: diffOf({
        entities: [
          {
            id: 'context.catalog',
            label: '商品目录（Catalog）',
            category: 'context',
            kind: 'domain',
            changeType: 'added',
          },
        ],
      }),
      targetDocument: target,
    });

    // A Context is a boundary, not a node, so it becomes a mark-only entry and
    // its children are not duplicated onto the canvas.
    expect(overlay.ghosts).toEqual([]);
  });

  it('produces nothing when no object changed', () => {
    const overlay = buildBranchOverlay({
      diff: diffOf(),
      targetDocument: createDesktopFixture(),
    });

    expect(overlay).toEqual({ marks: new Map(), ghosts: [] });
  });
});

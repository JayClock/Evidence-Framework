import {
  hitTestLayout,
  selectContextsInBox,
  selectNodesInBox,
} from '../index.js';
import { createFixtureModel } from '../../tests/support/fixtureModel.js';

describe('box selection and hit testing', () => {
  const { layout } = createFixtureModel();

  it('selects only nodes intersecting the marquee', () => {
    const target = layout.nodeById.get('evidence.delivery-request')!;
    const selected = selectNodesInBox(layout, {
      x: target.box.x + 4,
      y: target.box.y + 4,
      width: 8,
      height: 8,
    });

    expect(selected).toEqual(['evidence.delivery-request']);
  });

  it('selects every node inside a wide marquee', () => {
    const selected = selectNodesInBox(layout, layout.bounds);

    expect(selected).toHaveLength(layout.nodes.length);
  });

  it('drops marquees below the minimum size', () => {
    expect(
      selectNodesInBox(
        layout,
        { x: 0, y: 0, width: 2, height: 2 },
        {
          minimumSize: 4,
        },
      ),
    ).toEqual([]);
  });

  it('orders intersecting contexts outermost first', () => {
    const selected = selectContextsInBox(layout, layout.bounds);

    expect(selected[0]).toBe('context.product-sourcing');
    expect(selected).toEqual(
      expect.arrayContaining([
        'context.product-sourcing',
        'context.product-procurement',
        'context.product-catalog',
      ]),
    );
  });

  it('prefers objects over the context background', () => {
    const target = layout.nodeById.get('evidence.delivery-note')!;
    const hit = hitTestLayout(layout, {
      x: target.box.x + target.box.width / 2,
      y: target.box.y + target.box.height / 2,
    });

    expect(hit.nodeId).toBe('evidence.delivery-note');
    expect(hit.contextId).toBe('context.product-procurement');
  });

  it('returns the innermost context for empty canvas space', () => {
    const parent = layout.contextGroupById.get('context.product-sourcing')!;
    const hit = hitTestLayout(layout, {
      x: parent.box.x + 4,
      y: parent.box.y + parent.box.height - 4,
    });

    expect(hit.nodeId).toBeNull();
    expect(hit.contextId).toBe('context.product-sourcing');
  });

  it('returns nothing outside the model bounds', () => {
    expect(hitTestLayout(layout, { x: -1000, y: -1000 })).toEqual({
      nodeId: null,
      contextId: null,
    });
  });
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const assets = new URL('../../assets/', import.meta.url);
test('diff review draws removed objects at baseline coordinates and expands safe field details', async () => {
  const node = (id) => ({
    id,
    label: id,
    group: 'participant',
    kind: 'party',
    parent: '',
  });
  const layout = (id, x) => ({
    bounds: { x: 0, y: 0, width: 500, height: 300 },
    nodes: [{ nodeId: id, box: { x, y: 50, width: 180, height: 88 } }],
    edges: [],
    contextGroups: [],
    fulfillmentGroups: [],
    responsibilityLinks: [],
  });
  const data = {
    title: 'Diff',
    counts: {},
    validation: {},
    unresolved: [],
    edges: [],
    nodes: [node('new')],
    layout: layout('new', 60),
    diff: {
      baselineFingerprint: 'fingerprint',
      counts: { added: 1, removed: 1, modified: 0 },
      baseline: { nodes: [node('old')], layout: layout('old', 120) },
      changes: [
        {
          id: 'new',
          label: 'new',
          changeType: 'added',
          fields: [],
          attributeChanges: [],
        },
        {
          id: 'old',
          label: 'old',
          changeType: 'removed',
          fields: [{ name: 'label', before: '<script>unsafe</script>' }],
          attributeChanges: [],
        },
      ],
    },
  };
  const template = await readFile(new URL('workbench.html', assets), 'utf8');
  const dom = new JSDOM(
    template.replace(
      '@@DATA@@',
      JSON.stringify(data).replaceAll('<', '\\u003c'),
    ),
    { runScripts: 'outside-only' },
  );
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  window.HTMLElement.prototype.scrollTo = () => undefined;
  window.SVGElement.prototype.getBBox = () => ({
    x: 0,
    y: 0,
    width: 100,
    height: 20,
  });
  const context = dom.getInternalVMContext();
  try {
    for (const file of ['business-graph.js', 'workbench.js'])
      runInContext(await readFile(new URL(file, assets), 'utf8'), context);
    const current = window.document.querySelector(
      '#business-graph [data-diff="added"]',
    );
    const removed = window.document.querySelector(
      '#baseline-business-graph [data-diff="removed"]',
    );
    assert.equal(current.getAttribute('data-graph-node'), 'new');
    assert.equal(removed.querySelector('rect').getAttribute('x'), '120');
    assert.equal(
      window.document.querySelector('#business-graph [data-graph-node="old"]'),
      null,
    );
    removed.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.match(
      window.document.querySelector('#detail').textContent,
      /unsafe/,
    );
    assert.equal(window.document.querySelector('#detail script'), null);
  } finally {
    window.close();
  }
});

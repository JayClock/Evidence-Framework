// Run after: pnpm exec tsc -b libs/evidence-visualization/tsconfig.lib.json
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateWorkbench, readWorkbenchModel } from '../../dist/index.js';
import { serializeModelBundle } from '../../../evidence-model-core/dist/index.js';

const root = await mkdtemp(path.join(tmpdir(), 'evidence-diff-browser-'));
const profile = path.join(root, 'chrome');
let child, socket;
const pending = new Map();
let serial = 0;
const failures = [],
  network = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const response = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
  });
  assert.equal(response.exceptionDetails, undefined);
  return response.result.value;
};
try {
  const source = fileURLToPath(
    new URL(
      '../../../evidence-model-core/tests/fixtures/models/valid-traceable-subscription',
      import.meta.url,
    ),
  );
  const baseline = (await readWorkbenchModel(source)).bundle;
  baseline.entities.push({
    type: 'entity',
    id: 'party.removed',
    category: 'participant',
    kind: 'party',
    label: '删除主体',
    notes: 'PRIVATE_DO_NOT_EXPORT',
  });
  const current = structuredClone(baseline);
  current.entities = current.entities.filter(
    (item) => item.id !== 'party.removed',
  );
  current.entities[0].label += '（修订）';
  current.entities.push({
    type: 'entity',
    id: 'party.added',
    category: 'participant',
    kind: 'party',
    label: '新增主体',
  });
  const modelRoot = path.join(root, 'current.evidence.json');
  const output = path.join(root, 'diff-review.html');
  await writeFile(modelRoot, serializeModelBundle(current));
  const generated = await generateWorkbench({
    projectRoot: root,
    modelRoot,
    output,
    baselineDocument: baseline,
  });
  assert.deepEqual(generated.data.diff.counts, {
    added: 1,
    removed: 1,
    modified: 1,
  });
  assert.ok(
    !(await readFile(output, 'utf8')).includes('PRIVATE_DO_NOT_EXPORT'),
  );
  child = spawn(
    process.env.CHROME_BIN ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = Number(
        (
          await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
        ).split('\n')[0],
      );
      break;
    } catch {
      await sleep(100);
    }
  }
  assert.ok(port, 'Chrome did not start');
  const pages = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  socket = new WebSocket(
    pages.find((page) => page.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const waiter = pending.get(data.id);
    if (waiter) {
      pending.delete(data.id);
      clearTimeout(waiter.timer);
      if (data.error) waiter.reject(new Error(JSON.stringify(data.error)));
      else waiter.resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown') failures.push(data.params);
    if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error')
      failures.push(data.params.entry);
    if (
      data.method === 'Network.requestWillBeSent' &&
      /^https?:/.test(data.params.request.url)
    )
      network.push(data.params.request.url);
  };
  for (const method of [
    'Runtime.enable',
    'Page.enable',
    'Log.enable',
    'Network.enable',
  ])
    await call(method);
  await call('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  await call('Page.navigate', { url: pathToFileURL(output).href });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      await evaluate(
        '!!document.querySelector("#baseline-business-graph [data-graph-node]")',
      )
    )
      break;
    await sleep(50);
  }
  const snapshot = await evaluate(`(() => {
    const added = document.querySelector('#business-graph [data-graph-node="party.added"]');
    const removed = document.querySelector('#baseline-business-graph [data-graph-node="party.removed"]');
    return { added: added?.dataset.diff, removed: removed?.dataset.diff, addedStroke: getComputedStyle(added.querySelector('rect')).stroke, removedStroke: getComputedStyle(removed.querySelector('rect')).stroke, removedX: Number(removed.querySelector('rect').getAttribute('x')), wrongCurrent: !!document.querySelector('#business-graph [data-graph-node="party.removed"]') };
  })()`);
  assert.equal(snapshot.added, 'added');
  assert.equal(snapshot.removed, 'removed');
  assert.equal(snapshot.addedStroke, 'rgb(22, 128, 59)');
  assert.equal(snapshot.removedStroke, 'rgb(180, 35, 24)');
  assert.equal(
    snapshot.removedX,
    generated.data.diff.baseline.layout.nodes.find(
      (node) => node.nodeId === 'party.removed',
    ).box.x,
  );
  assert.equal(snapshot.wrongCurrent, false);
  await evaluate(
    `document.querySelector('#baseline-business-graph [data-graph-node="party.removed"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
  );
  assert.match(
    await evaluate('document.querySelector("#detail").textContent'),
    /删除主体/,
  );
  assert.deepEqual(failures, []);
  assert.deepEqual(network, []);
  console.log(
    'PASS: generated diff review, historical coordinates, computed colors, details, CSP and zero external requests',
  );
} finally {
  for (const waiter of pending.values()) clearTimeout(waiter.timer);
  socket?.close();
  if (child && child.exitCode === null) {
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await stopped;
  }
  await rm(root, { recursive: true, force: true });
}

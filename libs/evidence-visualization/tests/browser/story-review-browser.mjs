import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Run against an exported HTML, not a server: node .../story-review-browser.mjs dist/workbench.html
const html = path.resolve(process.argv[2] || 'dist/workbench.html');
const chrome =
  process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await access(chrome);
const original = await readFile(html);
const profile = await mkdtemp(path.join(tmpdir(), 'evidence-story-browser-'));
const captures = await mkdtemp(path.join(tmpdir(), 'evidence-story-captures-'));
const child = spawn(
  chrome,
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pending = new Map();
const errors = [];
const requests = [];
let socket;
let nextId = 0;
function call(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function key(key) {
  for (const type of ['keyDown', 'keyUp'])
    await call('Input.dispatchKeyEvent', {
      type,
      key,
      code: key,
      windowsVirtualKeyCode: key === 'ArrowRight' ? 39 : 37,
    });
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    path.join(captures, `${name}.png`),
    Buffer.from(result.data, 'base64'),
  );
}
try {
  let port;
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      port = (
        await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
      ).split('\n')[0];
      break;
    } catch {
      await sleep(100);
    }
  }
  assert.ok(port, 'Chrome debugging endpoint unavailable');
  const pages = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  socket = new WebSocket(
    pages.find((page) => page.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const waiter = pending.get(data.id);
      pending.delete(data.id);
      clearTimeout(waiter.timer);
      if (data.error) waiter.reject(new Error(JSON.stringify(data.error)));
      else waiter.resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown')
      errors.push(JSON.stringify(data.params));
    if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error')
      errors.push(data.params.entry.text);
    if (
      data.method === 'Network.requestWillBeSent' &&
      /^https?:/.test(data.params.request.url)
    )
      requests.push(data.params.request.url);
  });
  for (const domain of ['Runtime', 'Page', 'Log', 'Network'])
    await call(`${domain}.enable`);
  await call('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Page.navigate', { url: pathToFileURL(html).href });
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('document.body?.dataset.ready === "true"')) break;
    await sleep(100);
  }
  assert.equal(
    await evaluate('document.body.dataset.ready'),
    'true',
    errors.join('\n'),
  );
  assert.ok(
    await evaluate('DATA.stories.length > 0'),
    'Export a model with declared flow examples',
  );
  const dataBefore = await evaluate('JSON.stringify(DATA)');
  await evaluate('document.getElementById("view-stories").click()');
  assert.equal(await evaluate('document.body.dataset.panel'), 'stories');
  assert.equal(
    await evaluate(
      'document.querySelector(".layout > aside").checkVisibility()',
    ),
    false,
  );
  const flowIds = await evaluate('DATA.stories.map(story => story.flowId)');
  let sceneCount = 0;
  for (const flowId of flowIds) {
    await evaluate(
      `[...document.querySelectorAll('[data-story-flow]')].find(button => button.dataset.storyFlow === ${JSON.stringify(flowId)}).click()`,
    );
    const count = await evaluate(
      `DATA.stories.find(story => story.flowId === ${JSON.stringify(flowId)}).scenes.length`,
    );
    for (let index = 0; index < count; index++) {
      assert.equal(
        await evaluate('document.getElementById("story-step").textContent'),
        `Step ${index + 1}/${count}`,
      );
      assert.equal(
        await evaluate(`(() => {
        const scene = DATA.stories[selectedStoryIndex].scenes[${index}];
        const card = document.querySelector('.story-document');
        const text = card.textContent;
        if (card.querySelector('h3').textContent !== scene.documentCard.title) throw Error('Document title drift');
        if (!text.includes(scene.actingRoleLabel)) throw Error('Missing acting role');
        for (const field of scene.documentCard.fields)
          if (!text.includes(field.label) || !text.includes(field.value)) throw Error('Missing fact: ' + field.name);
        if (scene.documentCard.basisNotes && !text.includes(scene.documentCard.basisNotes)) throw Error('Missing declared basis');
        if (!document.getElementById('story-stage').textContent.includes(scene.narrative)) throw Error('Missing narration');
        if (document.querySelector('[data-story-step][aria-current="step"]').dataset.storyStep !== '${index}') throw Error('Timeline drift');
        return true;
      })()`),
        true,
      );
      sceneCount++;
      if (index < count - 1)
        await evaluate('document.getElementById("story-next").click()');
    }
    assert.equal(
      await evaluate('document.getElementById("story-next").disabled'),
      true,
    );
    await key('ArrowRight');
    if (count > 1) {
      await key('ArrowLeft');
      assert.equal(
        await evaluate('document.getElementById("story-step").textContent'),
        `Step ${count - 1}/${count}`,
      );
      await key('ArrowRight');
      assert.equal(
        await evaluate('document.getElementById("story-step").textContent'),
        `Step ${count}/${count}`,
      );
    }
    if (count)
      await evaluate('document.getElementById("story-scene-0").click()');
    assert.equal(
      await evaluate('document.getElementById("story-previous").disabled'),
      true,
    );
  }
  await screenshot('story-desktop');
  await evaluate('document.getElementById("view-delivery").click()');
  assert.equal(await evaluate('document.body.dataset.panel'), 'delivery');
  await evaluate('document.getElementById("view-structure").click()');
  assert.ok(
    await evaluate('Boolean(document.querySelector("#business-graph svg"))'),
  );
  await evaluate('document.getElementById("view-stories").click()');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
    true,
    'Story view must fit a narrow screen',
  );
  await screenshot('story-mobile');
  assert.equal(
    await evaluate('JSON.stringify(DATA)'),
    dataBefore,
    'Playback must not mutate the embedded snapshot',
  );
  assert.deepEqual(errors, [], 'No runtime or CSP errors');
  assert.deepEqual(
    requests,
    [],
    'No external resource requests, even with network offline',
  );
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    digest(await readFile(html)),
    digest(original),
    'Playback must not change exported bytes',
  );
  console.log(
    JSON.stringify(
      {
        html,
        flows: flowIds.length,
        scenes: sceneCount,
        offline: true,
        externalRequests: requests.length,
        errors: errors.length,
        captures,
      },
      null,
      2,
    ),
  );
} finally {
  for (const waiter of pending.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error('Browser closed'));
  }
  socket?.close();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}

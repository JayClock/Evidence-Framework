import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const html = path.resolve(process.argv[2] || '.evidence/views/index.html');
const chrome =
  process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await access(chrome);
await access(html);
const testedHtml = await readFile(html);
const profile = await mkdtemp(path.join(tmpdir(), 'evidence-review-browser-'));
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
let socket;
const errors = [],
  notApplicable = [],
  network = [],
  pending = new Map();
let nextId = 0;
async function portNumber() {
  for (let i = 0; i < 150; i++) {
    try {
      return (
        await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
      ).split('\n')[0];
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Chrome did not start its debugging endpoint');
}
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
function message(event) {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch (error) {
    errors.push(String(error));
    return;
  }
  if (data.id) {
    const promise = pending.get(data.id);
    if (!promise) return;
    clearTimeout(promise.timer);
    pending.delete(data.id);
    if (data.error) promise.reject(new Error(JSON.stringify(data.error)));
    else promise.resolve(data.result);
  }
  if (data.method === 'Runtime.exceptionThrown')
    errors.push(JSON.stringify(data.params));
  if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error')
    errors.push(data.params.entry.text);
  if (
    data.method === 'Network.requestWillBeSent' &&
    /^https?:/.test(data.params.request.url)
  )
    network.push(data.params.request.url);
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
async function waitReady() {
  for (let i = 0; i < 100; i++) {
    if (await evaluate('document.body?.dataset.ready === "true"')) return;
    await sleep(100);
  }
  const notice = await evaluate(
    'document.getElementById("notice")?.textContent',
  );
  throw new Error(
    `审核页未完成初始化：${notice || '无页面提示'}\n${errors.join('\n')}`,
  );
}
try {
  const port = await portNumber();
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const pages = await response.json();
  socket = new WebSocket(
    pages.find((p) => p.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', message);
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Network.enable');
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Page.navigate', { url: pathToFileURL(html).href });
  await waitReady();
  const captureDirectory = await mkdtemp(
    path.join(tmpdir(), 'evidence-review-capture-'),
  );
  assert.ok(await evaluate('graph.nodes().length > 0'));
  assert.equal(
    await evaluate('document.getElementById("graph-mode").value'),
    'simplified',
  );
  assert.ok(
    await evaluate(
      'document.getElementById("scope").value || DATA.model.entities.every(e=>e.kind!=="contract")',
    ),
  );
  assert.ok(
    await evaluate(
      'graph.nodes("[category=\\"evidence\\"]").length > 0 || DATA.model.entities.every(e=>e.category!=="evidence")',
    ),
  );
  assert.ok(
    await evaluate(
      'graph.nodes("[category=\\"participant\\"]").length > 0 || DATA.model.entities.every(e=>e.category!=="participant")',
    ),
    'Simplified view must retain related Party/Thing participants',
  );
  await evaluate('document.querySelector("#graph-list button").click()');
  assert.ok(
    await evaluate(
      'document.getElementById("detail-body").textContent.length > 50',
    ),
  );
  await evaluate(
    'document.getElementById("graph-mode").value="contexts"; document.getElementById("graph-mode").dispatchEvent(new Event("change"))',
  );
  assert.ok(
    await evaluate('graph.nodes().length <= DATA.model.entities.length'),
  );
  await evaluate(
    'document.getElementById("scope").value=""; document.getElementById("graph-mode").value="standard"; renderGraph()',
  );
  assert.ok(
    await evaluate('graph.nodes().length === DATA.model.entities.length'),
  );
  if (await evaluate('DATA.model.entities.some(e=>e.kind==="fulfillment")')) {
    await evaluate(
      'document.getElementById("scope").value=DATA.model.entities.find(e=>e.kind==="fulfillment").id; document.getElementById("graph-mode").value="simplified"; renderGraph()',
    );
    assert.ok(
      await evaluate(
        'graph.nodes().length > 0 && graph.nodes().length <= DATA.model.entities.length',
      ),
    );
  } else notApplicable.push('fulfillment scope: no fulfillments');
  await evaluate(
    'document.getElementById("scope").value=""; selectView("obligations")',
  );
  assert.ok(
    await evaluate(
      'document.querySelectorAll(".contract-card").length > 0 || DATA.model.entities.every(e=>e.kind!=="contract")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".fulfillment-card").length'),
    await evaluate(
      'DATA.model.entities.filter(e=>e.kind==="fulfillment").length',
    ),
  );
  if (
    await evaluate(
      'document.querySelector(".fulfillment-card .evidence-card") !== null',
    )
  ) {
    assert.match(
      await evaluate(
        'document.querySelector(".fulfillment-card .evidence-card").textContent',
      ),
      /<(request|confirmation)>/,
    );
  }
  const obligationScreenshotPath = path.join(
    captureDirectory,
    'obligations.png',
  );
  const obligationScreenshot = await call('Page.captureScreenshot', {
    format: 'png',
  });
  await writeFile(
    obligationScreenshotPath,
    Buffer.from(obligationScreenshot.data, 'base64'),
  );
  await evaluate('selectView("timeline")');
  const scenarioCount = await evaluate('DATA.scenarios.length');
  for (let i = 0; i < scenarioCount; i++) {
    await evaluate(
      `document.getElementById("scenario").selectedIndex=${i}; renderTimeline()`,
    );
    const issued = await evaluate(
      `DATA.simulation.scenarioResults.find(s=>s.scenarioId===DATA.scenarios[${i}].id)?.issuedInstanceRefs.length || 0`,
    );
    if (issued)
      assert.ok(
        await evaluate(
          'document.querySelectorAll("#timeline svg .time-row").length > 0',
        ),
      );
    else notApplicable.push(`timeline ${i}: no issued evidence`);
  }
  if (scenarioCount) {
    await evaluate(
      'document.getElementById("equal-time").checked=true; document.getElementById("dependencies").checked=true; renderTimeline()',
    );
    assert.match(
      await evaluate('document.getElementById("scenario-meta").textContent'),
      /非|等距/,
    );
  } else notApplicable.push('scenarios: none declared');
  await evaluate('selectView("rules")');
  if (await evaluate('DATA.model.rules.length > 0')) {
    await evaluate('document.querySelector("#rules button").click()');
    assert.ok(
      await evaluate(
        'document.getElementById("detail-body").textContent.includes("CEL")',
      ),
    );
  } else notApplicable.push('rules: none declared');
  if (await evaluate('DATA.lineage.nodes.length > 0')) {
    await evaluate('document.querySelector("#attributes button").click()');
    assert.ok(
      await evaluate(
        'document.getElementById("detail-body").textContent.includes("属性依赖")',
      ),
    );
  } else notApplicable.push('attributes: none declared');
  await evaluate('selectView("api")');
  const apiCount = await evaluate('capabilities.length');
  for (let i = 0; i < apiCount; i++)
    await evaluate(`showApi(capabilities[${i}])`);
  if (apiCount) {
    await evaluate(
      'document.getElementById("api-role").selectedIndex=1; renderApi()',
    );
    assert.ok(
      await evaluate(
        'document.querySelectorAll("#apis tbody tr").length === capabilities.filter(c=>c.actorRoleRef===document.getElementById("api-role").value).length',
      ),
    );
  } else notApplicable.push('API interfaces: none present');
  await evaluate('selectView("files")');
  const fileCount = await evaluate('DATA.files.length');
  assert.equal(
    await evaluate('document.querySelectorAll(".file-row").length'),
    fileCount,
  );
  await evaluate('document.querySelector(".file-row button").click()');
  assert.ok(
    await evaluate(
      'document.getElementById("yaml-source").textContent.length > 30',
    ),
  );
  await evaluate(
    'DATA.files[0].text="<img src=x onerror=alert(1)>"; showFile(DATA.files[0].path)',
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#detail-body img").length'),
    0,
  );
  await evaluate(
    'document.getElementById("reset").click(); document.getElementById("graph-mode").value="simplified"; selectView("graph"); showDetail(DATA.model.entities.find(e=>e.category==="context"&&!e.parentContextRef).id)',
  );
  await sleep(500);
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = path.join(captureDirectory, 'review.png');
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  assert.deepEqual(network, [], 'Offline document attempted network requests');
  assert.deepEqual(
    await readFile(html),
    testedHtml,
    'HTML changed during browser validation',
  );
  console.log(
    JSON.stringify({
      passed: true,
      htmlSha256: createHash('sha256').update(testedHtml).digest('hex'),
      scenarios: scenarioCount,
      interfaces: apiCount,
      yamlFiles: fileCount,
      externalRequests: network.length,
      notApplicable,
      screenshot: screenshotPath,
      obligationScreenshot: obligationScreenshotPath,
    }),
  );
} finally {
  socket?.close();
  for (const promise of pending.values()) clearTimeout(promise.timer);
  child.kill('SIGTERM');
  await sleep(500);
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}

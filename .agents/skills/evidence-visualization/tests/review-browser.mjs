import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const html = path.resolve(process.argv[2] || '.evidence/views/index.html');
const chrome =
  process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await access(chrome);
const original = await readFile(html);
const profile = await mkdtemp(
  path.join(tmpdir(), 'evidence-workbench-browser-'),
);
const capture = await mkdtemp(
  path.join(tmpdir(), 'evidence-workbench-capture-'),
);
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
const pending = new Map(),
  errors = [],
  network = [],
  notApplicable = [];
let socket,
  nextId = 0;
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
function onMessage(event) {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch (error) {
    errors.push(String(error));
    return;
  }
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
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png' });
  const file = path.join(capture, `${name}.png`);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  return file;
}
async function expectedBusinessHeadings() {
  const request = await evaluate(
    '(nodes.get(current)?.group === "attribute" ? nodes.get(nodes.get(current).parent) : nodes.get(current))?.kind === "fulfillment_request"',
  );
  return request
    ? ['所属上下文', '业务属性', '完成条件', '违约条件']
    : ['所属上下文', '业务属性'];
}
try {
  let port;
  for (let i = 0; i < 150; i++) {
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
    pages.find((p) => p.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', onMessage);
  for (const name of ['Runtime', 'Page', 'Log', 'Network'])
    await call(`${name}.enable`);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Page.navigate', { url: pathToFileURL(html).href });
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  for (let i = 0; i < 100; i++) {
    if (await evaluate('document.body.dataset.ready === "true"')) break;
    await sleep(100);
  }
  assert.equal(
    await evaluate('document.body.dataset.ready'),
    'true',
    errors.join('\n'),
  );
  const overview = await screenshot('overview');
  assert.ok(
    await evaluate('Boolean(document.querySelector("#business-graph svg"))'),
  );
  // Every concrete business object and real edge is visible on one canvas.
  const graphObjects = new Set(
    await evaluate(
      '[...document.querySelectorAll("[data-graph-node]")].map(n=>n.dataset.graphNode)',
    ),
  );
  const graphRelations = new Set();
  async function graphChoice(id, value) {
    await evaluate(
      `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event("change"))`,
    );
  }
  assert.equal(
    await evaluate(
      'document.querySelectorAll("#graph-scope,#graph-overview,#graph-players,#graph-filter,#graph-status,[data-graph-band],.graph-column,.graph-order-label,.graph-edge-label").length',
    ),
    0,
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#business-graph svg").length'),
    1,
  );
  {
    assert.equal(
      await evaluate('document.querySelectorAll(".graph-time-field").length'),
      0,
    );
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll("[data-graph-edge]")].every(n=>Boolean(n.querySelector(".graph-line").getAttribute("marker-end"))===["plays_role"].includes(nodes.get(n.dataset.graphEdge).kind))',
      ),
    );
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll("[data-responsibility]")].every(n=>DATA.edges.some(e=>e.from===n.dataset.responsibility&&e.to===n.dataset.roleRef&&e.label==="凭证责任方"))',
      ),
    );
  }
  async function checkLegend() {
    assert.equal(
      await evaluate(`(() => {
      const legend=document.querySelector('.graph-legend');
      if(!legend || legend.tagName!=='DETAILS') throw Error('Missing collapsible illustrated legend');
      const cards=[...legend.querySelectorAll('[data-legend-kind]')];
      const expected=new Set(DATA.nodes.filter(n=>['evidence','participant','role','context','fulfillment'].includes(n.group)).map(n=>n.group+'.'+n.kind));
      const kinds=new Set(cards.filter(n=>!n.dataset.legendKind.startsWith('line.')).map(n=>n.dataset.legendKind));
      if(JSON.stringify([...expected].sort())!==JSON.stringify([...kinds].sort()))throw Error('Legend must cover exactly the present types');
      for(const card of cards) {
        const example=nodes.get(card.dataset.legendExample);
        if(!example) throw Error('Legend fabricated an example');
        const symbol=card.querySelector('.legend-symbol');
        if(symbol) {
          if(symbol.querySelector('strong').textContent!==example.label)throw Error('Legend name drift');
          const rect=[...document.querySelectorAll('[data-graph-node]')].find(n=>n.dataset.graphNode===example.id).querySelector('rect');
          if(getComputedStyle(symbol).backgroundColor!==getComputedStyle(rect).fill)throw Error('Legend color must match the canvas');
          const badge=card.querySelector('[data-legend-role]');
          if(badge&&!DATA.edges.some(e=>e.from===example.id&&e.to===badge.dataset.legendRole&&e.label==='凭证责任方'))throw Error('Invented responsibility');
          if(example.group==='role'&&badge)throw Error('A role is not a concrete responsible voucher');
        }
        const line=card.querySelector('.legend-line');
        if(line) {
          const from=card.dataset.legendFrom,to=card.dataset.legendTo;
          if(!nodes.has(from)||!nodes.has(to))throw Error('Unresolved legend endpoints');
          if(example.group==='relationship'&&(example.sourceRef!==from||example.targetRef!==to))throw Error('Legend reversed a relation');
          if((line.dataset.arrow==='true')!==(example.kind==='plays_role'))throw Error('Only role-playing has an arrow');
          if(getComputedStyle(line).borderTopStyle!==(line.dataset.dashed==='true'?'dashed':'solid'))throw Error('Legend line style mismatch');
        }
      }
      if(legend.querySelector('[data-graph-node],[data-graph-edge],svg'))throw Error('Legend must not duplicate actual canvas nodes');
      return true;
    })()`),
      true,
    );
  }
  assert.equal(
    await evaluate('document.querySelector(".graph-legend").open'),
    false,
  );
  const beforeLegend = await evaluate('[current,history.length]');
  await evaluate('document.querySelector(".graph-legend > summary").focus()');
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    text: '\r',
    windowsVirtualKeyCode: 13,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  assert.equal(
    await evaluate('document.querySelector(".graph-legend").open'),
    true,
  );
  await checkLegend();
  await screenshot('legend-objects');
  await evaluate(
    'document.querySelectorAll(".legend-group")[1]?.scrollIntoView({block:"start"})',
  );
  await screenshot('legend-contexts-lines');
  await graphChoice('graph-mode', 'standard');
  assert.equal(
    await evaluate('document.querySelector(".graph-legend").open'),
    true,
  );
  await checkLegend();
  await graphChoice('graph-mode', 'simple');
  await evaluate('document.querySelector(".graph-legend").open=false');
  assert.deepEqual(await evaluate('[current,history.length]'), beforeLegend);
  async function checkCellAlignment(graph = false) {
    assert.equal(
      await evaluate(`(() => {
      for (const cell of document.querySelectorAll('th,td')) {
        const style=getComputedStyle(cell);
        if(style.textAlign!=='center'||style.verticalAlign!=='middle') throw Error('Table cell must be centered: '+cell.textContent);
        for(const link of cell.querySelectorAll('.object-link'))
          if(getComputedStyle(link).textAlign!=='center') throw Error('Cell link text must be centered');
      }
      if(${graph}) for (const node of document.querySelectorAll('[data-graph-node],[data-responsibility]')) {
        const frame=node.querySelector('rect').getBoundingClientRect();
        const content=node.querySelector('.graph-node-content') || (node.hasAttribute('data-responsibility') && node.querySelector('text'));
        if(!content) throw Error('Missing centered text block');
        const text=content.getBoundingClientRect();
        if(Math.abs(text.x+text.width/2-frame.x-frame.width/2)>.75||Math.abs(text.y+text.height/2-frame.y-frame.height/2)>.75) throw Error('Graph text block must be centered: '+node.getAttribute('aria-label'));
        if(text.x<frame.x-.75||text.y<frame.y-.75||text.right>frame.right+.75||text.bottom>frame.bottom+.75) throw Error('Graph text overflows its frame');
        for(const line of content.matches('text')?[content]:content.querySelectorAll('text,tspan')) {
          if(getComputedStyle(line).textAnchor!=='middle') throw Error('Each graph line must be centered');
        }
      }
      return true;
    })()`),
      true,
    );
  }
  await checkCellAlignment(true);
  // Cover two-line/truncated names, all five supported time fields, badge text,
  // and unequal-height table cells without changing the real model.
  await evaluate(`(() => {
    globalThis.cellFixture = {nodes:DATA.nodes,edges:DATA.edges,state:{...businessGraphState},host:el('div')};
    DATA.nodes = [
      {id:'cell-context',group:'context',kind:'domain',label:'居中测试'},
      {id:'cell-evidence',group:'evidence',kind:'other_evidence',parent:'cell-context',label:'这是一份需要分成两行且末尾截断的业务凭证名称用来验证内容居中'},
      {id:'cell-role',group:'role',kind:'party',parent:'cell-context',label:'业务责任方'},
      ...['started_at','expired_at','signed_at','confirmed_at','created_at'].map(name=>({id:'cell-evidence#'+name,group:'attribute',parent:'cell-evidence',name}))
    ];
    DATA.edges=[{from:'cell-evidence',to:'cell-role',label:'凭证责任方'}];
    DATA.nodes.forEach(n=>nodes.set(n.id,n));
    document.getElementById('detail').append(cellFixture.host);
    const tall=el('div');
    ['第一行','第二行','第三行'].forEach(text=>tall.append(el('div',text)));
    cellFixture.host.append(table(['名称','多行内容'],[['短文',tall],[link('cell-evidence'),'值']]));
  })()`);
  try {
    for (const mode of ['simple', 'standard']) {
      await evaluate(
        `businessGraphState.mode=${JSON.stringify(mode)};renderBusinessGraph(cellFixture.host)`,
      );
      await checkCellAlignment(true);
    }
    assert.ok(
      await evaluate(`(() => {
      const cell=cellFixture.host.querySelector('td'), text=cell.firstElementChild;
      const a=cell.getBoundingClientRect(), b=text.getBoundingClientRect();
      return Math.abs(a.x+a.width/2-b.x-b.width/2)<1 && Math.abs(a.y+a.height/2-b.y-b.height/2)<1;
    })()`),
      'Short content must remain centered beside a multiline cell',
    );
  } finally {
    await evaluate(
      `DATA.nodes.forEach(n=>nodes.delete(n.id));DATA.nodes=cellFixture.nodes;DATA.edges=cellFixture.edges;Object.assign(businessGraphState,cellFixture.state);cellFixture.host.remove();delete globalThis.cellFixture;`,
    );
  }
  async function checkContextBoundaries() {
    assert.deepEqual(
      await evaluate(
        '[...document.querySelectorAll("[data-graph-boundary]")].map(n=>n.dataset.graphBoundary).sort()',
      ),
      await evaluate(
        'DATA.nodes.filter(n=>["context","fulfillment"].includes(n.group)).map(n=>n.id).sort()',
      ),
    );
    assert.ok(
      await evaluate(`(() => {
      const frames = [...document.querySelectorAll('[data-graph-boundary]')];
      const boxes = [...document.querySelectorAll('[data-graph-node]')];
      const rect = n => n.querySelector('rect').getBBox();
      const contains = (a,b) => a.x<=b.x && a.y<=b.y && a.x+a.width>=b.x+b.width && a.y+a.height>=b.y+b.height;
      const ancestor = (id, parent) => {const seen=new Set(); let n=nodes.get(id); while(n && !seen.has(n.id)){seen.add(n.id); if(n.parent===parent)return true; n=nodes.get(n.parent);} return false;};
      return frames.every(frame => {
        const id=frame.dataset.graphBoundary;
        return boxes.every(box => contains(rect(frame),rect(box))===ancestor(box.dataset.graphNode,id)) && frames.every(child=>!ancestor(child.dataset.graphBoundary,id)||contains(rect(frame),rect(child)));
      });
    })()`),
      'Context frames must contain exactly their owned objects and child contexts',
    );
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll(".graph-boundary-label")].every(n=>n.getAttribute("tabindex")==="0" && n.getAttribute("role")==="button")',
      ),
    );
  }
  async function checkGraphHighlights() {
    assert.equal(
      await evaluate(`(() => {
      document.activeElement?.blur();
      const svg=document.querySelector('.graph-viewport svg');
      const objects=[...svg.querySelectorAll('[data-graph-node]')];
      const contexts=[...svg.querySelectorAll('[data-graph-boundary]')];
      const badges=[...svg.querySelectorAll('[data-responsibility]')];
      const edgeElements=[...svg.querySelectorAll('[data-highlight-edge]')];
      const ids=new Set(objects.map(n=>n.dataset.graphNode));
      const lines=[...DATA.nodes.filter(n=>n.group==='relationship'&&ids.has(n.sourceRef)&&ids.has(n.targetRef)).map(n=>({id:n.id,from:n.sourceRef,to:n.targetRef})),...DATA.edges.filter(e=>e.label==='合同责任角色'&&ids.has(e.from)&&ids.has(e.to)).map(e=>({...e,id:'responsibility:'+JSON.stringify([e.from,e.to])}))];
      const same=(actual,expected,label)=>{if(JSON.stringify([...actual].sort())!==JSON.stringify([...expected].sort()))throw Error(label+': '+JSON.stringify([...actual])+' != '+JSON.stringify([...expected]));};
      const enter=n=>n.dispatchEvent(new MouseEvent('mouseenter'));
      const leave=n=>n.dispatchEvent(new MouseEvent('mouseleave'));
      const semantic=()=>JSON.stringify(edgeElements.map(n=>n.querySelector('.graph-line').outerHTML));
      const state=()=>JSON.stringify([current,history,businessGraphState,[...document.querySelectorAll('#tree details')].map(n=>n.open),document.getElementById('detail').textContent]);
      const before=state(), lineStyles=semantic();
      function checkObjects(expectedNodes,expectedEdges) {
        same(objects.filter(n=>n.classList.contains('highlight')).map(n=>n.dataset.graphNode),expectedNodes,'highlighted objects');
        same(edgeElements.filter(n=>n.classList.contains('highlight')).map(n=>n.dataset.highlightEdge),expectedEdges,'highlighted lines');
        if(objects.some(n=>!expectedNodes.has(n.dataset.graphNode)&&!(Number(getComputedStyle(n).opacity)>0&&Number(getComputedStyle(n).opacity)<1)))throw Error('unrelated objects must remain visible but muted');
      }
      function checkNode(id) {
        const connected=lines.filter(e=>e.from===id||e.to===id);
        checkObjects(new Set([id,...connected.flatMap(e=>[e.from,e.to])]),new Set(connected.map(e=>e.id)));
        same(objects.filter(n=>n.classList.contains('graph-primary')).map(n=>n.dataset.graphNode),[id],'primary object');
      }
      const belongs=(id,parent)=>{let n=nodes.get(id);const seen=new Set();while(n&&!seen.has(n.id)){if(n.id===parent)return true;seen.add(n.id);n=nodes.get(n.parent);}return false;};
      for(const object of objects){enter(object);checkNode(object.dataset.graphNode);leave(object);}
      for(const context of contexts){
        enter(context);
        const members=new Set([...ids].filter(id=>belongs(id,context.dataset.graphBoundary)));
        checkObjects(members,new Set(lines.filter(e=>members.has(e.from)&&members.has(e.to)).map(e=>e.id)));
        same(contexts.filter(n=>n.classList.contains('highlight')).map(n=>n.dataset.graphBoundary),contexts.filter(n=>belongs(n.dataset.graphBoundary,context.dataset.graphBoundary)).map(n=>n.dataset.graphBoundary),'context descendants only');
        leave(context);
      }
      for(const badge of badges){enter(badge);checkNode(badge.dataset.roleRef);leave(badge);}
      for(const edge of edgeElements){enter(edge);const line=lines.find(e=>e.id===edge.dataset.highlightEdge);checkObjects(new Set([line.from,line.to]),new Set([line.id]));leave(edge);}
      const other=objects[1] || contexts[0];
      for(const focus of [objects[0],contexts[0]?.querySelector('.graph-boundary-label'),badges[0],edgeElements[0]].filter(Boolean)){
        focus.focus({preventScroll:true});focus.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));
        const pinned=JSON.stringify([svg.dataset.highlightType,svg.dataset.highlightId]);
        if(other){enter(other);if(JSON.stringify([svg.dataset.highlightType,svg.dataset.highlightId])!==pinned)throw Error('keyboard focus must win over hover');leave(other);}
        if(JSON.stringify([svg.dataset.highlightType,svg.dataset.highlightId])!==pinned)throw Error('mouseleave must preserve keyboard highlight');
        focus.blur();
        if(svg.querySelector('.highlight,.graph-dim,.graph-primary'))throw Error('blur did not clear highlight');
      }
      if(semantic()!==lineStyles)throw Error('highlight changed relation geometry or semantics');
      if(state()!==before)throw Error('highlight changed detail/history/collapse/viewport');
      return true;
    })()`),
      true,
    );
  }
  await checkContextBoundaries();
  await checkGraphHighlights();
  // Real pointer hit-testing must choose the innermost frame, then the object over it.
  const hoverNode = await evaluate(
    'nodes.has("role.payment-proof") ? "role.payment-proof" : document.querySelector("[data-graph-node]")?.dataset.graphNode',
  );
  async function moveOverGraph(selector, background = false) {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'center'})`,
    );
    const point = await evaluate(
      `(() => {const n=document.querySelector(${JSON.stringify(selector)}), r=n.querySelector('rect').getBBox();
        const positions=${background ? '[[12,12],[24,12],[48,12],[96,12],[12,32],[24,32],[48,32],[96,32]]' : '[[r.width/2,r.height/2]]'};
        for(const [x,y] of positions){
          const p=new DOMPoint(r.x+x,r.y+y).matrixTransform(n.getScreenCTM());
          const hit=document.elementFromPoint(p.x,p.y);
          if(${!background} || (hit?.closest('[data-graph-boundary]')===n && !hit.closest('[data-highlight-edge],[data-graph-node],[data-responsibility]')))return {x:p.x,y:p.y};
        }
        throw Error('No exposed hit-test position for '+${JSON.stringify(selector)});
      })()`,
    );
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  }
  if (hoverNode) {
    const owner = await evaluate(
      `nodes.get(${JSON.stringify(hoverNode)}).parent`,
    );
    if (
      owner &&
      (await evaluate(
        `Boolean(document.querySelector('[data-graph-boundary="'+${JSON.stringify(owner)}+'"]'))`,
      ))
    ) {
      await moveOverGraph(`[data-graph-boundary="${owner}"]`, true);
      assert.deepEqual(
        await evaluate(
          '(()=>{const n=document.querySelector(".graph-viewport svg");return [n.dataset.highlightType,n.dataset.highlightId]})()',
        ),
        ['boundary', owner],
      );
      await screenshot('graph-highlight-context');
    }
    await moveOverGraph(`[data-graph-node="${hoverNode}"]`);
    assert.equal(
      await evaluate(
        'document.querySelector(".graph-viewport svg").dataset.highlightId',
      ),
      hoverNode,
    );
    await screenshot('graph-highlight-object');
    await evaluate(
      'document.querySelector(".graph-viewport").focus({preventScroll:true})',
    );
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    assert.equal(
      await evaluate(
        'document.querySelector(".graph-viewport svg").dataset.highlightType',
      ),
      'boundary',
    );
    await moveOverGraph(`[data-graph-node="${hoverNode}"]`);
    assert.equal(
      await evaluate(
        'document.querySelector(".graph-viewport svg").dataset.highlightType',
      ),
      'boundary',
      'real keyboard focus wins over the pointer',
    );
    await evaluate('document.activeElement.blur()');
    assert.equal(
      await evaluate(
        'document.querySelector(".graph-viewport svg").dataset.highlightId',
      ),
      hoverNode,
      'blur restores the current pointer target',
    );
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    assert.equal(
      await evaluate(
        'document.querySelectorAll(".graph-viewport .highlight,.graph-viewport .graph-dim").length',
      ),
      0,
    );
  }
  const contextId = await evaluate(
    'document.querySelector("[data-graph-boundary]")?.dataset.graphBoundary',
  );
  if (contextId) {
    const beforeZoom = await evaluate('businessGraphState.zoom');
    const beforeContext = await evaluate(
      '[current,history.length,document.getElementById("detail").textContent]',
    );
    await evaluate(
      'document.querySelector(".graph-boundary-label").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))',
    );
    assert.deepEqual(
      await evaluate(
        '[current,history.length,document.getElementById("detail").textContent]',
      ),
      beforeContext,
    );
    assert.equal(
      await evaluate('document.activeElement.dataset.container'),
      contextId,
    );
    assert.equal(await evaluate('businessGraphState.zoom'), beforeZoom);
    await checkContextBoundaries();
  }
  // No edge is collapsed to a boundary representative.
  for (const id of await evaluate(
    '[...document.querySelectorAll("[data-graph-edge]")].map(n=>n.dataset.graphEdge)',
  ))
    graphRelations.add(id);
  assert.deepEqual(
    [...graphObjects].sort(),
    await evaluate(
      'DATA.nodes.filter(n=>["evidence","participant","role"].includes(n.group)).map(n=>n.id).sort()',
    ),
  );
  assert.deepEqual(
    [...graphRelations].sort(),
    await evaluate(
      'DATA.nodes.filter(n=>n.group==="relationship"&&nodes.has(n.sourceRef)&&nodes.has(n.targetRef)).map(n=>n.id).sort()',
    ),
  );
  {
    await evaluate(
      'document.getElementById("business-graph").scrollIntoView({block:"start"})',
    );
    await screenshot('graph-global-simple');
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll(".graph-evidence-role rect")].every(n=>n.getAttribute("rx")==="0")',
      ),
    );
    await graphChoice('graph-mode', 'standard');
    await checkContextBoundaries();
    await checkGraphHighlights();
    await checkCellAlignment(true);
    const expectedFields = await evaluate(
      '[...document.querySelectorAll("[data-graph-node]")].flatMap(b=>DATA.nodes.filter(n=>nodes.get(b.dataset.graphNode).group==="evidence"&&n.group==="attribute"&&n.parent===b.dataset.graphNode&&["started_at","expired_at","signed_at","confirmed_at","created_at"].includes(n.name))).length',
    );
    assert.equal(
      await evaluate('document.querySelectorAll(".graph-time-field").length'),
      expectedFields,
    );
    const expectedCardinalities = await evaluate(
      '[...document.querySelectorAll("[data-graph-edge]")].reduce((s,e)=>s+["sourceCardinality","targetCardinality"].filter(k=>nodes.get(e.dataset.graphEdge)[k]!==undefined).length,0)',
    );
    assert.equal(
      await evaluate('document.querySelectorAll(".graph-cardinality").length'),
      expectedCardinalities,
    );
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll(".graph-cardinality")].every(n=>/^(\\d+|N)(\\.\\.(\\d+|N))?$/.test(n.textContent))',
      ),
    );
    assert.ok(
      await evaluate(
        '!document.querySelector("#business-graph").textContent.includes("[object Object]")',
      ),
    );
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll("[data-cardinality-for]")].every(t=>{const n=[...document.querySelectorAll("[data-graph-node]")].find(n=>n.dataset.graphNode===t.dataset.cardinalityFor);const a=t.getBBox(),b=n.querySelector("rect").getBBox();return a.x+a.width<=b.x||a.x>=b.x+b.width||a.y+a.height<=b.y||a.y>=b.y+b.height;})',
      ),
      'Cardinality labels must not be hidden by their endpoint nodes',
    );
    await screenshot('graph-global-standard');
    const responsibility = await evaluate(
      'document.querySelector("[data-responsibility]")?.dataset.roleRef',
    );
    if (responsibility) {
      await evaluate(
        'document.querySelector("[data-responsibility]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))',
      );
      assert.equal(await evaluate('current'), responsibility);
      await evaluate('document.getElementById("back").click()');
      assert.equal(
        await evaluate('document.getElementById("graph-mode").value'),
        'standard',
      );
      assert.equal(
        await evaluate('document.querySelectorAll("[data-graph-node]").length'),
        graphObjects.size,
      );
    }
  }
  const zoom = await evaluate('businessGraphState.zoom');
  await evaluate('document.getElementById("graph-zoom-in").click()');
  assert.ok((await evaluate('businessGraphState.zoom')) > zoom);
  await evaluate('document.getElementById("graph-zoom-out").click()');
  const graphEdge = await evaluate(
    'document.querySelector("[data-graph-edge]")?.dataset.graphEdge',
  );
  if (graphEdge) {
    await evaluate('document.querySelector("[data-graph-edge]").focus()');
    assert.ok(
      await evaluate(
        'document.querySelector(".graph-selection").textContent.includes(nodes.get(document.querySelector("[data-graph-edge]").dataset.graphEdge).label)',
      ),
    );
    await evaluate(
      'document.querySelector("[data-graph-edge]").dispatchEvent(new MouseEvent("click",{bubbles:true}))',
    );
    assert.equal(await evaluate('current'), graphEdge);
    await evaluate('document.getElementById("back").click()');
  }
  await graphChoice('graph-mode', 'simple');
  assert.ok(
    await evaluate('document.querySelectorAll("#tree [data-node]").length > 0'),
  );
  assert.equal(
    await evaluate('DATA.counts.contracts'),
    await evaluate(
      'DATA.nodes.filter(n=>n.group==="context"&&n.kind==="contract").length',
    ),
  );
  const contextIds = await evaluate(
    'DATA.nodes.filter(n=>["context","fulfillment"].includes(n.group)).map(n=>n.id).sort()',
  );
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll("#tree [data-container]")].map(n=>n.dataset.container).sort()',
    ),
    contextIds,
  );
  for (const id of contextIds) {
    const before = await evaluate(
      '[current,history.length,document.getElementById("detail").textContent]',
    );
    await evaluate(
      `document.getElementById('search').value=${JSON.stringify(id)};buildTree()`,
    );
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll("#tree [data-node]")].every(n=>!["context","fulfillment"].includes(nodes.get(n.dataset.node).group))',
      ),
    );
    await evaluate(
      `[...document.querySelectorAll('[data-container-locator]')].find(n=>n.dataset.containerLocator===${JSON.stringify(id)}).click()`,
    );
    assert.deepEqual(
      await evaluate(
        '[current,history.length,document.getElementById("detail").textContent]',
      ),
      before,
    );
    assert.equal(
      await evaluate('document.activeElement.dataset.container'),
      id,
    );
    assert.ok(await evaluate('document.activeElement.parentElement.open'));
    await evaluate('document.activeElement.click()');
    assert.equal(
      await evaluate(
        `[...document.querySelectorAll('[data-container-group]')].find(n=>n.dataset.containerGroup===${JSON.stringify(id)}).open`,
      ),
      false,
    );
    assert.deepEqual(
      await evaluate(
        '[current,history.length,document.getElementById("detail").textContent]',
      ),
      before,
    );
  }
  if (contextIds.length) {
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      text: '\r',
      windowsVirtualKeyCode: 13,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    assert.equal(
      await evaluate('document.activeElement.parentElement.open'),
      true,
    );
  }
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll(".stats > div")].find(n=>n.querySelector("span").textContent==="业务对象").querySelector("strong").textContent',
    ),
    await evaluate(
      'String(DATA.nodes.filter(n=>["evidence","participant","role"].includes(n.group)).length)',
    ),
  );
  // Three navigation sections; auxiliary objects remain reachable through detail/search.
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll("#tree > [data-navigation]")].map(n=>n.dataset.navigation)',
    ),
    ['business', 'scenarios', 'api'],
  );
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll("#tree [data-node]")].map(n=>n.dataset.node).sort()',
    ),
    await evaluate(
      'DATA.nodes.filter(n=>["evidence","participant","role","rule","scenario","capability","resource","journey"].includes(n.group)&&!(n.group==="rule"&&n.kind==="derivation")&&!requestRuleTarget(n)).map(n=>n.id).sort()',
    ),
  );
  assert.ok(
    await evaluate(
      '[...document.querySelectorAll("#tree [data-node]")].every(button=>{const n=nodes.get(button.dataset.node);const group=button.closest("[data-navigation]")?.dataset.navigation;return n.group==="scenario"?group==="scenarios":["capability","resource","journey"].includes(n.group)?group==="api":group==="business";})',
    ),
  );
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll("[data-api-group]")].map(n=>n.dataset.apiGroup)',
    ),
    await evaluate(
      '["capability","resource","journey"].filter(group=>DATA.nodes.some(n=>n.group===group))',
    ),
  );
  // Completion/breach IDs remain traceable, but their reading routes lead into Request.
  const conditions =
    await evaluate(`DATA.nodes.filter(n=>n.group==='rule'&&['completion','breach'].includes(n.kind)).map(n=>({
    id:n.id, kind:n.kind, description:n.description, expression:n.expression,
    request:(n.bindings||[]).map(b=>nodes.get(b.ref)).find(r=>r?.kind==='fulfillment_request'&&r.fulfillmentRef===n.fulfillmentRef)?.id
  }))`);
  for (const condition of conditions.filter((n) => n.request)) {
    assert.equal(
      await evaluate(
        `document.querySelector('#tree [data-node="${condition.id}"]')`,
      ),
      null,
    );
    await evaluate(
      `document.getElementById('search').value=${JSON.stringify(condition.id)};buildTree()`,
    );
    assert.ok(
      await evaluate(
        `Boolean(document.querySelector('#tree [data-node="${condition.request}"]'))`,
      ),
    );
    assert.equal(
      await evaluate(
        `document.querySelector('#tree [data-node="${condition.id}"]')`,
      ),
      null,
    );
    await evaluate(
      `document.getElementById('reset').click();select('');select(${JSON.stringify(condition.id)})`,
    );
    assert.equal(await evaluate('current'), condition.request);
    assert.equal(
      await evaluate('document.activeElement.dataset.requestRule'),
      condition.id,
    );
    assert.deepEqual(
      await evaluate(
        '[...document.querySelectorAll("#detail h2")].map(n=>n.textContent)',
      ),
      ['所属上下文', '业务属性', '完成条件', '违约条件'],
    );
    assert.ok(
      await evaluate(
        `document.querySelector('[data-request-rule="${condition.id}"]').textContent.includes(${JSON.stringify(condition.description)})`,
      ),
    );
    assert.equal(
      await evaluate(
        `document.querySelector('[data-request-rule="${condition.id}"] details').open`,
      ),
      false,
    );
    assert.equal(
      await evaluate(
        `document.querySelector('[data-request-rule="${condition.id}"] pre').checkVisibility()`,
      ),
      false,
    );
    const before = await evaluate('[current,history.length]');
    await evaluate(
      `document.querySelector('[data-request-rule="${condition.id}"] summary').focus()`,
    );
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      text: '\r',
      windowsVirtualKeyCode: 13,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    assert.equal(
      await evaluate(
        `document.querySelector('[data-request-rule="${condition.id}"] details').open`,
      ),
      true,
    );
    assert.equal(
      await evaluate(
        `document.querySelector('[data-request-rule="${condition.id}"] pre').textContent`,
      ),
      condition.expression,
    );
    assert.deepEqual(await evaluate('[current,history.length]'), before);
    await evaluate(
      `document.querySelector('[data-request-rule="${condition.id}"] summary').click()`,
    );
    if (condition.kind === 'breach') {
      assert.ok(
        await evaluate(
          'document.querySelector("[data-request-outcome=breach]").textContent.includes("未声明")',
        ),
      );
      assert.equal(
        await evaluate(
          'document.querySelectorAll("[data-request-outcome=breach] [data-ref]").length',
        ),
        0,
      );
    }
    const outcome = await evaluate(
      'document.querySelector("[data-request-outcome=completion] [data-ref]")?.dataset.ref',
    );
    if (outcome) {
      await evaluate(
        'document.querySelector("[data-request-outcome=completion] [data-ref]").click()',
      );
      assert.equal(await evaluate('current'), outcome);
      await evaluate('document.getElementById("back").click()');
      assert.equal(await evaluate('current'), condition.request);
      assert.equal(
        await evaluate('document.activeElement.dataset.requestRule'),
        condition.id,
      );
    }
    const entries = await evaluate(
      `DATA.edges.filter(e=>e.to===${JSON.stringify(condition.id)}&&['scenario','capability'].includes(nodes.get(e.from)?.group)).map(e=>e.from)`,
    );
    for (const entry of entries) {
      await evaluate(
        `select(${JSON.stringify(entry)});[...document.querySelectorAll('#detail [data-ref]')].find(n=>n.dataset.ref===${JSON.stringify(condition.id)}).click()`,
      );
      assert.equal(await evaluate('current'), condition.request);
      assert.equal(
        await evaluate('document.activeElement.dataset.requestRule'),
        condition.id,
      );
      await evaluate('document.getElementById("back").click()');
      assert.equal(await evaluate('current'), entry);
    }
  }
  for (const id of ['request.refund', 'request.payment'].filter((id) =>
    graphObjects.has(id),
  )) {
    await evaluate(
      `select(${JSON.stringify(id)});document.querySelector('[data-request-outcome=completion]').scrollIntoView({block:'center'})`,
    );
    await screenshot(
      id === 'request.refund'
        ? 'request-confirmation'
        : 'request-external-proof',
    );
  }
  // Derivation IDs stay traceable, but all their reading routes lead to target fields.
  const derivations = await evaluate(
    'DATA.nodes.filter(n=>n.group==="rule"&&n.kind==="derivation").map(n=>({id:n.id,target:DATA.edges.find(e=>e.from===n.id&&e.label==="计算结果")?.to}))',
  );
  for (const derivation of derivations) {
    assert.ok(derivation.target, `Target field for ${derivation.id}`);
    await evaluate(
      `document.getElementById('search').value=${JSON.stringify(derivation.id)}; buildTree()`,
    );
    assert.equal(
      await evaluate(
        `document.querySelector('#tree [data-node="${derivation.id}"]')`,
      ),
      null,
    );
    assert.ok(
      await evaluate(
        `Boolean(document.querySelector('#tree [data-node="${derivation.target}"]'))`,
      ),
    );
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll("#tree [data-node]")].every(n=>!(nodes.get(n.dataset.node).group==="rule"&&nodes.get(n.dataset.node).kind==="derivation"))',
      ),
    );
    assert.equal(
      await evaluate(
        'new Set([...document.querySelectorAll("#tree [data-node]")].map(n=>n.dataset.node)).size',
      ),
      await evaluate('document.querySelectorAll("#tree [data-node]").length'),
    );
    await evaluate(
      `document.querySelector('#tree [data-node="${derivation.target}"]').click()`,
    );
    assert.equal(await evaluate('current'), derivation.target);
    assert.equal(
      await evaluate('document.activeElement.dataset.attribute'),
      derivation.target,
    );
    await evaluate('document.getElementById("reset").click(); select("")');
    await evaluate(`select(${JSON.stringify(derivation.id)})`);
    assert.equal(await evaluate('current'), derivation.target);
    assert.deepEqual(
      await evaluate(
        '[...document.querySelectorAll("#detail h2")].map(n=>n.textContent)',
      ),
      await expectedBusinessHeadings(),
    );
    assert.equal(
      await evaluate(
        'document.getElementById("detail").textContent.includes("查看完整规则")',
      ),
      false,
    );
    await evaluate('document.getElementById("back").click()');
    assert.equal(await evaluate('current'), '');
    const entries = await evaluate(
      `DATA.edges.filter(e=>e.to===${JSON.stringify(derivation.id)}&&["scenario","capability"].includes(nodes.get(e.from)?.group)).map(e=>e.from)`,
    );
    for (const entry of entries) {
      await evaluate(
        `select(${JSON.stringify(entry)}); [...document.querySelectorAll('#detail [data-ref]')].find(n=>n.dataset.ref===${JSON.stringify(derivation.id)}).click()`,
      );
      assert.equal(await evaluate('current'), derivation.target);
      assert.equal(
        await evaluate('document.activeElement.dataset.attribute'),
        derivation.target,
      );
      await evaluate('document.getElementById("back").click()');
      assert.equal(await evaluate('current'), entry);
    }
    assert.ok(
      await evaluate(
        'history.every(id=>!(nodes.get(id)?.group==="rule"&&nodes.get(id)?.kind==="derivation"))',
      ),
    );
  }
  // Every auxiliary object can be searched and opened, not just representative samples.
  for (const item of await evaluate(
    'DATA.nodes.filter(n=>["relationship","instance","binding","representation"].includes(n.group)).map(n=>({id:n.id,group:n.group}))',
  )) {
    await evaluate(
      `document.getElementById('search').value=${JSON.stringify(item.id)}; buildTree()`,
    );
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('#tree [data-node]')].some(n=>n.dataset.node===${JSON.stringify(item.id)})`,
      ),
    );
    await evaluate(
      `[...document.querySelectorAll('#tree [data-node]')].find(n=>n.dataset.node===${JSON.stringify(item.id)}).click()`,
    );
    assert.equal(await evaluate('current'), item.id);
    await evaluate('document.getElementById("reset").click()');
    assert.equal(
      await evaluate(
        `document.querySelector('#tree [data-node="${item.id}"]')`,
      ),
      null,
    );
    const entry = await evaluate(`(() => {
      const id=${JSON.stringify(item.id)}, group=${JSON.stringify(item.group)};
      if(group==='relationship') return undefined;
      return DATA.edges.find(e=>e.to===id && nodes.get(e.from)?.group===(group==='instance'?'scenario':'capability'))?.from;
    })()`);
    if (item.group === 'relationship') {
      await evaluate('select("")');
      await evaluate(
        `[...document.querySelectorAll('[data-graph-edge]')].find(n=>n.dataset.graphEdge===${JSON.stringify(item.id)}).dispatchEvent(new MouseEvent('click',{bubbles:true}))`,
      );
      assert.equal(await evaluate('current'), item.id);
      await evaluate('document.getElementById("back").click()');
      assert.equal(await evaluate('current'), '');
    }
    if (entry) {
      await evaluate(`select(${JSON.stringify(entry)})`);
      assert.ok(
        await evaluate(
          `[...document.querySelectorAll('#detail [data-ref]')].some(n=>n.dataset.ref===${JSON.stringify(item.id)})`,
        ),
        `Detail entry for ${item.id}`,
      );
      await evaluate(
        `[...document.querySelectorAll('#detail [data-ref]')].find(n=>n.dataset.ref===${JSON.stringify(item.id)}).click()`,
      );
      assert.equal(await evaluate('current'), item.id);
      await evaluate('document.getElementById("back").click()');
      assert.equal(await evaluate('current'), entry);
    }
  }
  const navigationFixtures = await evaluate(`(() => {
    const originalNodes = DATA.nodes;
    const fixtures = [[], [{id:'independent',group:'participant',label:'独立参与者'}], [
      {id:'a',group:'context',parent:'b',label:'边界 A'},
      {id:'b',group:'context',parent:'a',label:'边界 B'},
      {id:'orphan',group:'rule',parent:'missing',label:'未解析归属'},
      {id:'hidden',group:'binding',label:'绑定'},
      {id:'empty-context',group:'context',label:'空上下文'}
    ]];
    try {
      return fixtures.map(fixture => {
        DATA.nodes=fixture; nodes.clear(); fixture.forEach(n=>nodes.set(n.id,n)); buildTree();
        return {contexts:[...document.querySelectorAll('#tree [data-container]')].map(n=>n.dataset.container).sort(), ids:[...document.querySelectorAll('#tree [data-node]')].map(n=>n.dataset.node).sort(), sections:[...document.querySelectorAll('#tree > [data-navigation]')].map(n=>n.dataset.navigation), emptyApi:document.querySelector('[data-navigation="api"]').textContent.includes('尚无 API 设计')};
      });
    } finally {
      DATA.nodes=originalNodes; nodes.clear(); originalNodes.forEach(n=>nodes.set(n.id,n)); buildTree();
    }
  })()`);
  assert.deepEqual(
    navigationFixtures.map((f) => f.ids),
    [[], ['independent'], ['orphan']],
  );
  assert.deepEqual(
    navigationFixtures.map((f) => f.contexts),
    [[], [], ['a', 'b', 'empty-context']],
  );
  assert.ok(navigationFixtures.every((f) => f.emptyApi));
  for (const fixture of navigationFixtures)
    assert.deepEqual(fixture.sections, ['business', 'scenarios', 'api']);
  await evaluate('select("")');
  await evaluate(
    'document.querySelectorAll("#tree details").forEach(d=>d.open=["business","api"].includes(d.dataset.navigation)); document.getElementById("tree").scrollTo(0,0)',
  );
  await screenshot('navigation');
  await evaluate('document.getElementById("collapse").click()');
  assert.equal(
    await evaluate('document.querySelectorAll("#tree details[open]").length'),
    0,
  );
  await evaluate('document.getElementById("expand").click()');
  assert.ok(
    await evaluate(
      '[...document.querySelectorAll("#tree details")].every(n=>n.open)',
    ),
  );
  await evaluate('document.querySelector("[data-node]").click()');
  assert.equal(
    await evaluate('document.querySelectorAll("[aria-current=true]").length'),
    1,
  );
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll("#detail h2")].map(n=>n.textContent)',
    ),
    await expectedBusinessHeadings(),
  );
  // Search returns actual objects, and selecting a result updates the detail.
  await evaluate(
    'document.getElementById("search").value=DATA.nodes[0].id; document.getElementById("search").dispatchEvent(new Event("input"))',
  );
  assert.ok(
    await evaluate('document.querySelectorAll("#tree [data-node]").length > 0'),
  );
  await evaluate(
    'document.querySelector("#tree [data-node]").click(); document.getElementById("reset").click()',
  );
  await evaluate(
    'document.dispatchEvent(new KeyboardEvent("keydown", {key:"k", ctrlKey:true, bubbles:true}))',
  );
  assert.equal(await evaluate('document.activeElement.id'), 'search');
  const attribute = await evaluate(
    'DATA.nodes.find(n=>n.group==="attribute")?.id',
  );
  if (attribute) {
    // Search exposes owner identity; selecting a field focuses its owner's row.
    await evaluate(
      `document.getElementById("search").value=${JSON.stringify(attribute)}; buildTree()`,
    );
    assert.ok(
      await evaluate(
        `document.querySelector('[data-node="${attribute}"]').textContent.includes(title(nodes.get(${JSON.stringify(attribute)}).parent))`,
      ),
    );
    await evaluate(
      `document.querySelector('[data-node="${attribute}"]').click()`,
    );
    assert.equal(
      await evaluate('document.querySelector("#detail h1").textContent'),
      await evaluate('title(nodes.get(current).parent)'),
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected")?.dataset.attribute',
      ),
      attribute,
    );
    assert.equal(
      await evaluate('document.activeElement.dataset.attribute'),
      attribute,
    );
    await evaluate('document.getElementById("reset").click()');
    assert.equal(
      await evaluate(
        'document.querySelector("#tree [aria-current=true]")?.dataset.node',
      ),
      await evaluate('nodes.get(current).parent'),
    );
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll("#tree [data-node]")].filter(n=>nodes.get(n.dataset.node).group==="attribute").length',
      ),
      0,
    );
    await screenshot('attribute-in-owner');

    // Same-name fields remain distinguishable and navigate to different owners.
    const twins = await evaluate(
      'DATA.nodes.filter(n=>n.group==="attribute").find(a=>DATA.nodes.some(b=>b.group==="attribute"&&b.id!==a.id&&b.label===a.label))?.label',
    );
    if (twins) {
      await evaluate(
        `document.getElementById("search").value=${JSON.stringify(twins)}; buildTree()`,
      );
      assert.ok(
        await evaluate(
          '[...document.querySelectorAll("#tree [data-node]")].filter(n=>nodes.get(n.dataset.node).group==="attribute").every(n=>n.textContent.includes(nodes.get(nodes.get(n.dataset.node).parent).id))',
        ),
      );
      await evaluate('document.getElementById("reset").click()');
    }
    // Follow actual rule/API attribute references, then restore the anchor via Back.
    for (const group of ['rule', 'capability', 'representation']) {
      const edge = await evaluate(
        `DATA.edges.find(e=>nodes.get(e.from)?.group===${JSON.stringify(group)}&&!(nodes.get(e.from)?.group==="rule"&&nodes.get(e.from)?.kind==="derivation")&&!requestRuleTarget(nodes.get(e.from))&&nodes.get(e.to)?.group==="attribute")`,
      );
      if (!edge) {
        notApplicable.push(`${group} attribute reference`);
        continue;
      }
      await evaluate(
        `select(${JSON.stringify(edge.from)}); [...document.querySelectorAll("#detail [data-ref]")].find(n=>n.dataset.ref===${JSON.stringify(edge.to)}).click()`,
      );
      assert.equal(
        await evaluate(
          'document.querySelector(".attribute-selected")?.dataset.attribute',
        ),
        edge.to,
      );
      assert.equal(
        await evaluate('document.querySelector("#detail h1").textContent'),
        await evaluate('title(nodes.get(current).parent)'),
      );
      await evaluate(`select(''); document.getElementById("back").click()`);
      assert.equal(await evaluate('current'), edge.to);
      assert.equal(
        await evaluate('document.activeElement.dataset.attribute'),
        edge.to,
      );
      await evaluate('document.getElementById("back").click()');
      assert.equal(await evaluate('current'), edge.from);
    }
  } else notApplicable.push('attributes');
  // A derived field exposes the existing rule without leaving its owner's table.
  const fieldRules = await evaluate(
    'DATA.edges.filter(e=>e.label==="由规则计算"&&nodes.get(e.from)?.group==="attribute")',
  );
  for (const edge of fieldRules) {
    await evaluate(`select(${JSON.stringify(edge.from)})`);
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected [data-field-rule]")?.dataset.fieldRule',
      ),
      edge.to,
      `Inline derivation missing for ${edge.from}`,
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected .field-rule-description")?.textContent',
      ),
      await evaluate(`nodes.get(${JSON.stringify(edge.to)}).description`),
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected .field-rule-details")?.open',
      ),
      false,
      'Technical details must be collapsed by default',
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected .field-rule-details > summary")?.textContent',
      ),
      '表达式与变量说明',
    );
    assert.ok(
      await evaluate(
        'document.querySelector(".attribute-selected .field-rule-description").getClientRects().length > 0',
      ),
    );
    assert.ok(
      await evaluate(
        '!document.querySelector(".attribute-selected [data-field-rule] pre").checkVisibility()',
      ),
    );
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll(".attribute-selected [data-binding]")].every(n=>!n.checkVisibility())',
      ),
    );
    const beforeDisclosure = await evaluate('[current,history.length]');
    await evaluate(
      'document.querySelector(".attribute-selected .field-rule-details > summary").click()',
    );
    assert.ok(
      await evaluate(
        'document.querySelector(".attribute-selected [data-field-rule] pre").checkVisibility()',
      ),
    );
    assert.deepEqual(
      await evaluate('[current,history.length]'),
      beforeDisclosure,
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected [data-field-rule] pre")?.textContent',
      ),
      await evaluate(`nodes.get(${JSON.stringify(edge.to)}).expression`),
    );
    assert.deepEqual(
      await evaluate(
        '[...document.querySelectorAll(".attribute-selected [data-binding]")].map(n=>n.dataset.binding)',
      ),
      await evaluate(
        `nodes.get(${JSON.stringify(edge.to)}).bindings.map(b=>b.alias)`,
      ),
    );
    assert.deepEqual(
      await evaluate(
        '[...document.querySelectorAll(".attribute-selected [data-binding] [data-ref]")].map(n=>n.dataset.ref)',
      ),
      await evaluate(
        `nodes.get(${JSON.stringify(edge.to)}).bindings.filter(b=>b.ref).map(b=>b.ref)`,
      ),
    );
    await checkCellAlignment();
    await evaluate(
      'document.querySelector(".attribute-selected .field-rule-details > summary").click()',
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected .field-rule-details").open',
      ),
      false,
    );
    assert.deepEqual(
      await evaluate('[current,history.length]'),
      beforeDisclosure,
    );
  }
  const derivedAttribute = fieldRules[0]?.from;
  if (derivedAttribute) {
    await evaluate(`select(${JSON.stringify(derivedAttribute)})`);
    await screenshot('field-derivation');
    assert.equal(
      await evaluate(
        'document.getElementById("detail").textContent.includes("查看完整规则")',
      ),
      false,
    );
    assert.equal(
      await evaluate(
        'document.querySelectorAll(".attribute-selected [data-field-rule] > .object-link").length',
      ),
      0,
    );
    assert.equal(
      await evaluate('document.activeElement.dataset.attribute'),
      derivedAttribute,
    );
    const beforeKeyboardDisclosure = await evaluate('[current,history.length]');
    await evaluate(
      'document.querySelector(".attribute-selected .field-rule-details > summary").focus()',
    );
    for (const type of ['keyDown', 'keyUp'])
      await call('Input.dispatchKeyEvent', {
        type,
        key: 'Enter',
        code: 'Enter',
        ...(type === 'keyDown' ? { text: '\r' } : {}),
        windowsVirtualKeyCode: 13,
      });
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected .field-rule-details").open',
      ),
      true,
    );
    assert.deepEqual(
      await evaluate('[current,history.length]'),
      beforeKeyboardDisclosure,
    );
    await screenshot('field-derivation-expanded');
    const input = await evaluate(
      'document.querySelector(".attribute-selected [data-binding] [data-ref]")?.dataset.ref',
    );
    if (input) {
      await evaluate(
        'document.querySelector(".attribute-selected [data-binding] [data-ref]").click()',
      );
      assert.equal(await evaluate('current'), input);
      await evaluate('document.getElementById("back").click()');
      assert.equal(await evaluate('current'), derivedAttribute);
    }
    // Rule text is displayed as text, never evaluated or parsed as HTML.
    await evaluate(
      `globalThis.savedFieldRuleText=nodes.get(${JSON.stringify(fieldRules[0].to)}).expression; nodes.get(${JSON.stringify(fieldRules[0].to)}).expression="<img src=x onerror=alert(1)>"; select(${JSON.stringify(derivedAttribute)})`,
    );
    assert.equal(
      await evaluate('document.querySelectorAll("#detail img").length'),
      0,
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected [data-field-rule] pre").textContent',
      ),
      '<img src=x onerror=alert(1)>',
    );
    await evaluate(
      `nodes.get(${JSON.stringify(fieldRules[0].to)}).expression=globalThis.savedFieldRuleText; delete globalThis.savedFieldRuleText`,
    );
  } else notApplicable.push('inline field derivations');
  // Test every navigation target, including owner-relative attributes.
  const ids = await evaluate(
    'DATA.nodes.filter(n=>!["context","fulfillment"].includes(n.group)).map(n=>n.id)',
  );
  for (const id of ids) {
    await evaluate(`select(${JSON.stringify(id)})`);
    const expectedId = await evaluate(
      `(() => { const n=nodes.get(${JSON.stringify(id)}); return n.group==='rule'&&n.kind==='derivation' ? DATA.edges.find(e=>e.from===n.id&&e.label==='计算结果').to : requestRuleTarget(n)?.id || n.id; })()`,
    );
    assert.equal(await evaluate('current'), expectedId);
    if (
      await evaluate(
        '["evidence","participant","role","attribute"].includes(nodes.get(current).group)',
      )
    ) {
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll("#detail h2")].map(n=>n.textContent)',
        ),
        await expectedBusinessHeadings(),
        `Business sections for ${id}`,
      );
      assert.equal(
        await evaluate(
          'document.querySelectorAll("#detail .intro,#detail .badge,#detail .reference-grid,#detail .obligation").length',
        ),
        0,
      );
      assert.equal(
        await evaluate(
          'document.querySelectorAll("#detail [data-attribute]").length',
        ),
        await evaluate(
          'DATA.nodes.filter(n=>n.group==="attribute"&&n.parent===(nodes.get(current).group==="attribute"?nodes.get(current).parent:current)).length',
        ),
      );
      assert.ok(
        await evaluate(`(() => {
        for (const row of document.querySelectorAll('#detail [data-attribute]')) {
          const refs=(outgoing.get(row.dataset.attribute)||[]).filter(e=>e.label==='由规则计算').map(e=>e.to);
          const displayed=[...row.querySelectorAll('[data-field-rule]')].map(n=>n.dataset.fieldRule);
          if(JSON.stringify(displayed)!==JSON.stringify(refs)) throw Error('Unrelated rule attached to field '+row.dataset.attribute);
          for(const id of displayed) if(nodes.get(id)?.kind!=='derivation') throw Error('A judgment is not a field computation');
          if(!refs.length&&!row.textContent.includes('未声明派生规则')) throw Error('Missing field derivation empty state');
        }
        return true;
      })()`),
      );
    }
    if (await evaluate('nodes.get(current).group === "attribute"')) {
      assert.equal(
        await evaluate(
          'document.querySelector(".attribute-selected")?.dataset.attribute',
        ),
        expectedId,
      );
      assert.equal(
        await evaluate('document.querySelector("#detail h1").textContent'),
        await evaluate('title(nodes.get(current).parent)'),
      );
    }
    assert.ok(
      await evaluate(
        'document.querySelector("#detail h1").textContent.length > 0',
      ),
    );
    await checkCellAlignment();
  }
  const businessObject = await evaluate(
    'DATA.nodes.find(n=>n.group==="evidence"&&DATA.nodes.some(a=>a.parent===n.id&&a.group==="attribute"))?.id',
  );
  if (businessObject) {
    await evaluate(`select(${JSON.stringify(businessObject)})`);
    const parent = await evaluate('nodes.get(current).contextRef');
    assert.equal(
      await evaluate(
        'document.querySelector("#detail .card [data-ref]")?.dataset.ref',
      ),
      parent,
    );
    const beforeContext = await evaluate(
      '[current,history.length,document.getElementById("detail").textContent]',
    );
    await evaluate(
      'document.querySelector("#detail .card [data-ref]").click()',
    );
    assert.deepEqual(
      await evaluate(
        '[current,history.length,document.getElementById("detail").textContent]',
      ),
      beforeContext,
    );
    assert.equal(
      await evaluate('document.activeElement.dataset.container'),
      parent,
    );
    assert.equal(await evaluate('current'), businessObject);
    await screenshot('business-object');
  }
  for (const id of await evaluate(
    'DATA.nodes.filter(n=>n.group==="participant"&&!n.parent).map(n=>n.id)',
  )) {
    await evaluate(`select(${JSON.stringify(id)})`);
    assert.ok(
      await evaluate(
        'document.querySelector("#detail .card").textContent.includes("未声明所属上下文")',
      ),
    );
  }
  const rule = await evaluate(
    'DATA.nodes.find(n=>n.group==="rule"&&n.kind!=="derivation"&&!requestRuleTarget(n)&&n.description)?.id',
  );
  if (rule) {
    await evaluate(`select(${JSON.stringify(rule)})`);
    assert.equal(
      await evaluate('document.querySelector("#detail .intro").textContent'),
      await evaluate('nodes.get(current).description'),
    );
    const destination = await evaluate(
      '[...document.querySelectorAll("#detail [data-ref]")].find(n=>!["context","fulfillment"].includes(nodes.get(n.dataset.ref)?.group))?.dataset.ref',
    );
    if (destination) {
      await evaluate(
        `[...document.querySelectorAll('#detail [data-ref]')].find(n=>n.dataset.ref===${JSON.stringify(destination)}).click()`,
      );
      assert.equal(await evaluate('current'), destination);
      await evaluate('document.getElementById("back").click()');
      assert.equal(await evaluate('current'), rule);
    }
  } else notApplicable.push('business rule description');
  const scenario = await evaluate(
    'DATA.nodes.find(n=>n.group==="scenario"&&n.evaluations.some(e=>e.expected===false&&e.passed===true))?.id',
  );
  if (scenario) {
    await evaluate(`select(${JSON.stringify(scenario)})`);
    assert.ok(
      await evaluate(
        'document.getElementById("detail").textContent.includes("预期匹配")',
      ),
    );
    assert.ok(
      await evaluate(
        'document.getElementById("detail").textContent.includes("false")',
      ),
    );
    await screenshot('scenario');
  } else notApplicable.push('false counterexample');
  // Text is never parsed as markup, even when malicious labels reach the renderer.
  await evaluate(
    'globalThis.savedLabel=DATA.nodes[0].label; DATA.nodes[0].label="<img src=x onerror=alert(1)>"; select(DATA.nodes[0].id)',
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#detail img").length'),
    0,
  );
  await evaluate('select("")');
  assert.equal(
    await evaluate(
      'document.querySelectorAll("#business-graph image, #business-graph img").length',
    ),
    0,
  );
  assert.ok(
    await evaluate(
      'document.querySelector("#business-graph").textContent.includes("<img src=x onerror=alert(1)>")',
    ),
  );
  await evaluate('DATA.nodes[0].label=globalThis.savedLabel');
  // No provenance payload or superseded UI is carried in the output.
  for (const token of [
    'sourceRefs',
    'sourceFiles',
    'inputFiles',
    'modelDigest',
    'sourceManifest',
    'executions',
    'cytoscape',
    'review-data',
    '来源原文',
  ])
    assert.ok(!original.toString().includes(token), token);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate(
    'select("");document.querySelector(".graph-legend").open=true;document.querySelector(".graph-legend").scrollIntoView({block:"start"})',
  );
  await checkLegend();
  assert.ok(
    await evaluate('document.documentElement.scrollWidth<=innerWidth'),
    'Expanded legend must fit narrow screens',
  );
  await screenshot('legend-mobile');
  await evaluate('document.querySelector(".graph-legend").open=false');
  for (const id of [
    '',
    rule,
    businessObject,
    scenario,
    derivedAttribute,
    attribute,
    conditions[0]?.request,
  ].filter((id) => id !== undefined)) {
    await evaluate(`select(${JSON.stringify(id)})`);
    await checkCellAlignment(id === '');
    assert.ok(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      `Mobile overflow: ${id}`,
    );
  }
  if (conditions[0]?.request) {
    await evaluate(
      `select(${JSON.stringify(conditions[0].id)});document.querySelector('[data-request-rule] summary').click()`,
    );
    assert.ok(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
    );
    await screenshot('request-condition-mobile');
  }
  if (derivedAttribute) {
    await evaluate(`select(${JSON.stringify(derivedAttribute)})`);
    await evaluate(
      'document.querySelector(".attribute-selected [data-field-rule]").scrollIntoView({block:"center",inline:"center"})',
    );
    assert.ok(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".attribute-selected .field-rule-details").open',
      ),
      false,
    );
    await screenshot('field-derivation-mobile');
    await evaluate(
      'document.querySelector(".attribute-selected .field-rule-details > summary").click(); document.querySelector(".attribute-selected [data-field-rule]").scrollIntoView({block:"center",inline:"center"})',
    );
    assert.ok(
      await evaluate(
        '(() => { const r=document.querySelector(".attribute-selected [data-field-rule] pre").getBoundingClientRect(); return r.left>=0&&r.right<=innerWidth; })()',
      ),
      'Horizontal table scrolling must expose the full inline expression on mobile',
    );
    assert.ok(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
    );
    await checkCellAlignment();
    await screenshot('field-derivation-expanded-mobile');
  }
  if (attribute) {
    await evaluate(`select(${JSON.stringify(attribute)})`);
    assert.equal(
      await evaluate('document.activeElement.dataset.attribute'),
      attribute,
    );
    assert.ok(
      await evaluate(
        'document.querySelector(".attribute-selected").getBoundingClientRect().top < innerHeight && document.querySelector(".attribute-selected").getBoundingClientRect().bottom > 0',
      ),
    );
  }
  const mobile = await screenshot('mobile');
  await evaluate(
    'select(""); document.getElementById("graph-zoom-in").click(); document.getElementById("business-graph").scrollIntoView({block:"start"})',
  );
  assert.ok(
    await evaluate('document.documentElement.scrollWidth <= innerWidth'),
  );
  await screenshot('graph-mobile');
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  assert.deepEqual(await readFile(html), original);
  console.log(
    JSON.stringify({
      passed: true,
      htmlSha256: createHash('sha256').update(original).digest('hex'),
      objects: ids.length,
      businessContainers: contextIds.length,
      contextContainers: await evaluate(
        'DATA.nodes.filter(n=>n.group==="context").length',
      ),
      fulfillments: await evaluate(
        'DATA.nodes.filter(n=>n.group==="fulfillment").length',
      ),
      externalRequests: network.length,
      notApplicable,
      overview,
      mobile,
      screenshots: capture,
    }),
  );
} finally {
  socket?.close();
  for (const waiter of pending.values()) clearTimeout(waiter.timer);
  child.kill('SIGTERM');
  await sleep(500);
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}

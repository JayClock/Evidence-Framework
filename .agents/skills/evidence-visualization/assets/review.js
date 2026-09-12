/* Offline review: business content is always rendered as text, never executable HTML. */
'use strict';
function readData() {
  try {
    return JSON.parse(document.getElementById('review-data').textContent);
  } catch (error) {
    document.getElementById('notice').textContent =
      `快照数据无法解析：${error.message}`;
    throw error;
  }
}
const DATA = readData();
const entities = new Map(DATA.model.entities.map((x) => [x.id, x]));
const rules = new Map(DATA.model.rules.map((x) => [x.id, x]));
const instances = new Map(DATA.instances.map((x) => [x.id, x]));
const capabilities = DATA.api?.capabilities || [];
const objects = new Map(Object.entries(DATA.objects));
for (const item of [
  ...DATA.model.entities,
  ...DATA.model.relationships,
  ...DATA.model.rules,
  ...capabilities,
])
  objects.set(item.id, item);
let activeView = 'graph';
let graph = null;
const $ = (id) => document.getElementById(id);
const text = (tag, value = '', cls = '') => {
  const el = document.createElement(tag);
  el.textContent = String(value);
  if (cls) el.className = cls;
  return el;
};
const clear = (el) => el.replaceChildren();
const pretty = (value) => JSON.stringify(value, null, 2);
const label = (id) =>
  entities.get(id)?.label ||
  rules.get(id)?.label ||
  objects.get(id)?.businessCapability ||
  objects.get(id)?.label ||
  id;
const button = (name, action, cls = 'text-button') => {
  const el = text('button', name, cls);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
};
const badge = (value, cls = '') => text('span', value, `tag ${cls}`);
const query = () => $('search').value.trim().toLowerCase();
const matches = (item) =>
  !query() || pretty(item).toLowerCase().includes(query());
const rootContext = (id) => {
  const seen = new Set();
  let item = entities.get(id);
  while (item && !seen.has(item.id)) {
    seen.add(item.id);
    const next = item.parentContextRef || item.contextRef;
    if (!next) return item.category === 'context' ? item.id : '';
    item = entities.get(next);
  }
  return '';
};
function within(id, scope) {
  const seen = new Set();
  while (id && !seen.has(id)) {
    if (id === scope) return true;
    seen.add(id);
    const item = entities.get(id);
    id = item?.parentContextRef || item?.contextRef;
  }
  return false;
}
const inScope = (item) =>
  !$('scope').value ||
  within(
    item.contextRef || item.effect?.targetRef || item.id,
    $('scope').value,
  );
function sourceButton(id) {
  const path = DATA.locations[id.split('#')[0]];
  return path
    ? button('打开对应 YAML', () => showFile(path, id), '')
    : text('small', '此项为生成结果，无独立 YAML 文件。', 'muted');
}
function table(headers, rows) {
  const el = text('table'),
    head = text('thead'),
    tr = text('tr'),
    body = text('tbody');
  for (const h of headers) tr.append(text('th', h));
  head.append(tr);
  el.append(head, body);
  for (const cells of rows) {
    const row = text('tr');
    for (const value of cells) {
      const td = text('td');
      td.append(value instanceof Node ? value : text('span', value ?? '—'));
      row.append(td);
    }
    body.append(row);
  }
  return el;
}
function detailStart(title, id = '') {
  $('detail-title').textContent = title;
  clear($('detail-body'));
  if (id) $('detail-body').append(text('div', id, 'detail-id'));
  return $('detail-body');
}
function rawSection(parent, title, value) {
  const wrap = text('details'),
    summary = text('summary', title);
  wrap.append(
    summary,
    text('pre', typeof value === 'string' ? value : pretty(value)),
  );
  parent.append(wrap);
}
function showFile(path, id = '') {
  const file = DATA.files.find((f) => f.path === path);
  if (!file) return;
  const box = detailStart('YAML 原文', path);
  box.append(
    badge(file.generated ? '历史派生快照 · 仅对照' : '当前输入'),
    text('p', `SHA-256 ${file.sha256}`),
  );
  if (id) box.append(text('p', `定位：${id}`));
  const pre = text('pre', file.text, 'raw');
  pre.id = 'yaml-source';
  box.append(pre);
  if (id) {
    const lines = file.text.split('\n'),
      index = lines.findIndex((line) => line.includes(id));
    if (index >= 0)
      requestAnimationFrame(() => {
        pre.scrollTop = Math.max(0, (index - 3) * 18.7);
      });
  }
  box.append(
    button(
      '下载此 YAML',
      () => download(file.path.split('/').pop(), file.text),
      '',
    ),
  );
}
function download(name, value) {
  const url = URL.createObjectURL(
    new Blob([value], { type: 'text/plain;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function showDetail(id) {
  if (id.includes('#')) {
    showAttribute(id);
    return;
  }
  const object = objects.get(id) || instances.get(id);
  if (!object) return;
  if (object.method) {
    showApi(object);
    return;
  }
  const box = detailStart(label(id), id);
  box.append(sourceButton(id));
  if (object.notes) box.append(text('p', object.notes));
  if (object.category === 'context') {
    box.append(
      button(
        '展开此边界',
        () => {
          $('scope').value = id;
          $('graph-mode').value = 'spine';
          selectView('graph');
        },
        '',
      ),
    );
    const children = DATA.model.entities.filter(
      (e) => e.contextRef === id || e.parentContextRef === id,
    );
    box.append(
      text('h3', '边界内对象'),
      ...children.map((e) => button(e.label, () => showDetail(e.id))),
    );
  }
  if (object.expression)
    box.append(text('h3', 'CEL'), text('pre', object.expression));
  if (object.attributes)
    box.append(
      table(
        ['属性', '含义'],
        object.attributes.map((a) => [
          button(a.name, () => showAttribute(`${id}#${a.name}`)),
          a.meaning,
        ]),
      ),
    );
  if (object.values)
    box.append(text('h3', '原始实例值'), text('pre', pretty(object.values)));
  if (object.responsibleRoleRef)
    box.append(
      text('h3', '凭证责任方'),
      button(label(object.responsibleRoleRef), () =>
        showDetail(object.responsibleRoleRef),
      ),
    );
  if (object.roleRefs)
    box.append(
      text('h3', '合同双方'),
      ...object.roleRefs.map((ref) =>
        button(label(ref), () => showDetail(ref)),
      ),
    );
  const relations = DATA.model.relationships.filter(
    (r) => r.sourceRef === id || r.targetRef === id,
  );
  if (relations.length) {
    box.append(text('h3', '关联关系'));
    const links = text('div', '', 'relations');
    for (const r of relations)
      links.append(
        button(
          `${label(r.sourceRef)} → ${label(r.targetRef)} · ${r.kind}`,
          () => showDetail(r.id),
        ),
      );
    box.append(links);
  }
  if (object.sourceRef)
    box.append(
      button(label(object.sourceRef), () => showDetail(object.sourceRef)),
      text('span', ' → '),
      button(label(object.targetRef), () => showDetail(object.targetRef)),
    );
  const rs = DATA.model.rules.filter(
    (r) =>
      r.contextRef === id ||
      Object.values(r.bindings).some((b) => b.ref === id),
  );
  if (rs.length)
    box.append(
      text('h3', '相关规则'),
      ...rs.map((r) => button(r.label, () => showDetail(r.id))),
    );
  const caps = capabilities.filter((c) => c.effect.targetRef === id);
  if (caps.length)
    box.append(
      text('h3', '业务接口'),
      ...caps.map((c) =>
        button(
          `${c.method} ${c.businessCapability} · ${label(c.actorRoleRef)}`,
          () => showApi(c),
        ),
      ),
    );
  rawSection(box, '完整定义', object);
}
function showAttribute(path) {
  const [id, name] = path.split('#'),
    attr = entities.get(id)?.attributes?.find((a) => a.name === name);
  const box = detailStart(attr?.label || name, path);
  box.append(sourceButton(id));
  if (attr)
    box.append(
      text('p', attr.meaning),
      badge(attr.valueType),
      text(
        'p',
        attr.derivedByRuleRef
          ? '规则计算'
          : '非派生记录／引用值；不代表缺少业务依据',
      ),
    );
  const edges = DATA.lineage.edges.filter(
    (e) => e.source === path || e.target === path,
  );
  box.append(text('h3', '属性依赖'));
  if (!edges.length) box.append(text('p', '没有 AST 提取到的属性派生边。'));
  for (const edge of edges) {
    const flow = text('div', '', 'rule-card');
    flow.append(
      button(edge.source, () => showAttribute(edge.source)),
      text('div', `↓ ${label(edge.ruleRef)}`, 'flow-arrow'),
      button(edge.target, () => showAttribute(edge.target)),
      button('查看规则', () => showDetail(edge.ruleRef)),
    );
    box.append(flow);
  }
  if (attr) rawSection(box, '属性定义', attr);
}
const evidenceTypes = {
  rfp: ['rfp', 'started_at · expired_at'],
  proposal: ['proposal', 'started_at · expired_at'],
  contract: ['contract', 'signed_at'],
  fulfillment_request: ['request', 'started_at · expired_at'],
  fulfillment_confirmation: ['confirmation', 'confirmed_at'],
  other_evidence: ['evidence', 'created_at'],
};
function evidenceGraphLabel(entity, detailed = false) {
  if (entity.category !== 'evidence') return entity.label;
  const [type, time] = evidenceTypes[entity.kind] || ['evidence', ''];
  return detailed
    ? `${entity.label}\n<${type}>\n${time}`
    : `${entity.label}\n<${type}>`;
}
function rangeLabel(cardinality) {
  if (!cardinality) return '';
  const max = cardinality.max === 'many' ? '*' : cardinality.max;
  return cardinality.min === max ? String(max) : `${cardinality.min}..${max}`;
}
function cardinalityLabel(relation) {
  const source = rangeLabel(relation.sourceCardinality);
  const target = rangeLabel(relation.targetCardinality);
  return source || target ? `${source || '?'} → ${target || '?'}` : '';
}
function graphElements() {
  const mode = $('graph-mode').value,
    scope = $('scope').value;
  if (mode === 'contexts') return contextElements(scope);
  let chosen = [...DATA.model.entities];
  if (scope) {
    const ids = new Set(
      chosen.filter((e) => within(e.id, scope)).map((e) => e.id),
    );
    const members = new Set(ids);
    for (const r of DATA.model.relationships)
      if (members.has(r.sourceRef) || members.has(r.targetRef)) {
        ids.add(r.sourceRef);
        ids.add(r.targetRef);
      }
    const responsibilityRoles = new Set(
      [...members]
        .map((id) => entities.get(id)?.responsibleRoleRef)
        .filter(Boolean),
    );
    responsibilityRoles.forEach((id) => ids.add(id));
    for (const relation of DATA.model.relationships)
      if (
        responsibilityRoles.has(relation.sourceRef) ||
        responsibilityRoles.has(relation.targetRef)
      ) {
        ids.add(relation.sourceRef);
        ids.add(relation.targetRef);
      }
    chosen = chosen.filter((e) => ids.has(e.id));
  }
  const ids = new Set(chosen.map((e) => e.id));
  for (const item of [...chosen]) {
    if (mode === 'simplified' && scope && !within(item.id, scope)) continue;
    let parent = item.contextRef || item.parentContextRef;
    while (parent && !ids.has(parent)) {
      const p = entities.get(parent);
      if (!p) break;
      ids.add(parent);
      chosen.push(p);
      parent = p.parentContextRef;
    }
  }
  const elements = chosen.map((e) => ({
    data: {
      id: e.id,
      label: evidenceGraphLabel(e, mode === 'standard' || mode === 'all'),
      category: e.category,
      kind: e.kind,
      parent: ids.has(e.contextRef || e.parentContextRef)
        ? e.contextRef || e.parentContextRef
        : undefined,
    },
  }));
  for (const r of DATA.model.relationships)
    if (ids.has(r.sourceRef) && ids.has(r.targetRef))
      elements.push({
        data: {
          id: r.id,
          source: r.sourceRef,
          target: r.targetRef,
          label:
            mode === 'standard' || mode === 'all'
              ? `${r.label || r.kind}${cardinalityLabel(r) ? ` · ${cardinalityLabel(r)}` : ''}`
              : r.label || r.kind,
          kind: r.kind,
        },
      });
  if (mode === 'all')
    for (const e of chosen) {
      for (const role of e.roleRefs ||
        (e.responsibleRoleRef ? [e.responsibleRoleRef] : []))
        if (ids.has(role))
          elements.push({
            data: {
              id: `responsibility:${e.id}:${role}`,
              source: role,
              target: e.id,
              label: '责任',
              ref: e.id,
            },
            classes: 'responsibility',
          });
    }
  return elements;
}
const contextRelationLabels = {
  plays_role: '角色扮演',
  uses_role: '证明依赖',
  references: '业务对象引用',
  precedes: '凭证先后',
};
function contextElements(scope) {
  scope = rootContext(scope) || scope;
  const contexts = DATA.model.entities.filter(
    (e) => e.category === 'context' && !e.parentContextRef,
  );
  const links = new Map();
  for (const r of DATA.model.relationships) {
    const source = rootContext(r.sourceRef),
      target = rootContext(r.targetRef);
    if (
      !source ||
      !target ||
      source === target ||
      (scope && source !== scope && target !== scope)
    )
      continue;
    const key = `${source}:${target}:${r.kind}`,
      prior = links.get(key);
    if (prior) {
      prior.data.count += 1;
      prior.data.refs.push(r.id);
    } else
      links.set(key, {
        data: { id: r.id, source, target, ref: r.id, refs: [r.id], count: 1 },
      });
  }
  const connected = new Set([
    scope,
    ...[...links.values()].flatMap((e) => [e.data.source, e.data.target]),
  ]);
  return [
    ...contexts
      .filter((e) => !scope || connected.has(e.id))
      .map((e) => ({
        data: { id: e.id, label: e.label, category: 'context', kind: e.kind },
      })),
    ...[...links.values()].map((e) => ({
      data: {
        ...e.data,
        label: `${contextRelationLabels[objects.get(e.data.ref)?.kind] || '跨边界关系'} ×${e.data.count}`,
      },
    })),
  ];
}
function positioned(elements) {
  const nodes = elements.filter((e) => !e.data.source);
  const children = new Map();
  for (const n of nodes) {
    const p = n.data.parent || 'root';
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(n);
  }
  function box(node) {
    const kids = children.get(node.data.id) || [];
    if (!kids.length)
      return { w: 185, h: 105, places: [{ node, x: 90, y: 50 }] };
    const boxes = kids.map(box),
      cols = Math.min(2, boxes.length);
    const w = Math.max(...boxes.map((b) => b.w)) + 35,
      h = Math.max(...boxes.map((b) => b.h)) + 35;
    const places = boxes.flatMap((b, i) =>
      b.places.map((p) => ({
        ...p,
        x: p.x + (i % cols) * w + 25,
        y: p.y + Math.floor(i / cols) * h + 45,
      })),
    );
    return {
      w: cols * w + 50,
      h: Math.ceil(boxes.length / cols) * h + 55,
      places,
    };
  }
  const tops = children.get('root') || [];
  const boxes = tops.map(box);
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  boxes.forEach((current, index) => {
    current.places.forEach((place) => {
      place.node.position = {
        x: place.x + cursorX,
        y: place.y + cursorY,
      };
    });
    cursorX += current.w + 55;
    rowHeight = Math.max(rowHeight, current.h);
    if ((index + 1) % 4 === 0) {
      cursorX = 0;
      cursorY += rowHeight + 55;
      rowHeight = 0;
    }
  });
  return elements;
}
function renderGraph() {
  if (graph) graph.destroy();
  graph = cytoscape({
    container: $('graph'),
    elements: positioned(graphElements()),
    wheelSensitivity: 0.22,
    minZoom: 0.08,
    maxZoom: 2.5,
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'background-color': '#ef5b78',
          color: '#522334',
          'font-size': 12,
          'text-wrap': 'wrap',
          'text-max-width': 130,
          'text-valign': 'center',
          'text-margin-y': 0,
          width: 130,
          height: 50,
          shape: 'round-rectangle',
        },
      },
      {
        selector: 'node[category="context"]',
        style: {
          'background-color': '#fbfcff',
          'background-opacity': 0.3,
          'border-width': 2,
          'border-style': 'dashed',
          'border-color': '#8c9bb2',
          label: 'data(label)',
          'font-size': 14,
          'font-weight': 650,
          'text-valign': 'top',
          'text-halign': 'center',
          padding: 30,
          'text-margin-y': -8,
        },
      },
      {
        selector: 'node[category="context"]:childless',
        style: {
          width: 190,
          height: 72,
          'font-size': 16,
          'text-valign': 'center',
          'text-margin-y': 0,
        },
      },
      {
        selector: 'node[category="role"]',
        style: {
          'background-color': '#d58a00',
          color: '#4c3100',
          shape: 'round-rectangle',
        },
      },
      {
        selector: 'node[category="participant"]',
        style: {
          'background-color': '#70a17b',
          color: '#173c24',
          shape: 'round-rectangle',
        },
      },
      {
        selector: 'edge',
        style: {
          label: 'data(label)',
          width: 1.5,
          'line-color': '#a7b5ce',
          'target-arrow-color': '#8f9fbb',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'font-size': 9,
          color: '#8292ae',
          'text-background-color': '#fff',
          'text-background-opacity': 0.85,
          'text-background-padding': 2,
        },
      },
      {
        selector: 'edge[kind="plays_role"]',
        style: {
          'line-style': 'dashed',
          'line-color': '#d58a00',
          'target-arrow-color': '#d58a00',
        },
      },
      {
        selector: 'edge[kind="uses_role"]',
        style: {
          'line-style': 'dotted',
          'line-color': '#d58a00',
          'target-arrow-color': '#d58a00',
        },
      },
      {
        selector: '.responsibility',
        style: { 'line-style': 'dashed', width: 1 },
      },
      { selector: '.dim', style: { opacity: 0.13 } },
      {
        selector: '.focus',
        style: {
          'border-color': '#1945cb',
          'border-width': 3,
          'line-color': '#4267d3',
          'target-arrow-color': '#4267d3',
        },
      },
    ],
    layout: { name: 'preset', fit: true, padding: 40 },
  });
  graph.on('tap', 'node,edge', (event) => {
    const el = event.target;
    graph.elements().removeClass('focus dim');
    const neighborhood = el.closedNeighborhood().union(el.ancestors());
    graph.elements().difference(neighborhood).addClass('dim');
    el.addClass('focus');
    showDetail(el.data('ref') || el.id());
    if (el.data('refs')?.length > 1) {
      const box = $('detail-body');
      box.prepend(
        text('h3', `本聚合边包含 ${el.data('refs').length} 条实际关系`),
        ...el
          .data('refs')
          .map((id) => button(objects.get(id).label, () => showDetail(id))),
      );
    }
  });
  graph.on('tap', (event) => {
    if (event.target === graph) graph.elements().removeClass('focus dim');
  });
  $('graph-count').textContent =
    `${graph.nodes().length} 个可见对象 · ${graph.edges().length} 条关系`;
  clear($('graph-list'));
  for (const n of graph.nodes())
    $('graph-list').append(
      button(
        n.data('label'),
        () => {
          n.emit('tap');
          graph.animate({ center: { eles: n }, duration: 180 });
        },
        '',
      ),
    );
  filterGraph();
}
function filterGraph() {
  if (!graph) return;
  graph.elements().removeClass('dim focus');
  if (!query()) return;
  const found = graph
    .nodes()
    .filter(
      (n) =>
        matches(objects.get(n.id()) || n.data()) ||
        ($('graph-mode').value === 'contexts' &&
          [...DATA.model.entities, ...DATA.model.rules].some(
            (e) => rootContext(e.contextRef || e.id) === n.id() && matches(e),
          )),
    );
  graph
    .elements()
    .difference(found.closedNeighborhood().union(found.ancestors()))
    .addClass('dim');
  found.addClass('focus');
}
function svgNode(tag, attributes = {}, content = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes))
    el.setAttribute(key, String(value));
  if (content) el.textContent = content;
  return el;
}
function timeValues(item) {
  const value = item.values,
    kind = entities.get(item.entityRef)?.kind;
  if (['rfp', 'proposal', 'fulfillment_request'].includes(kind))
    return [value.started_at, value.expired_at];
  const moment = value.signed_at || value.confirmed_at || value.created_at;
  return [moment, moment];
}
function drawTimeline(result) {
  const rows = result.instanceValues
    .filter(
      (i) =>
        inScope({ contextRef: entities.get(i.entityRef)?.contextRef }) &&
        matches(i),
    )
    .map((i) => ({ ...i, times: timeValues(i) }))
    .filter((i) => i.times.every((t) => t && Number.isFinite(Date.parse(t))));
  rows.sort(
    (a, b) =>
      entities
        .get(a.entityRef)
        .contextRef.localeCompare(entities.get(b.entityRef).contextRef) ||
      Date.parse(a.times[0]) - Date.parse(b.times[0]),
  );
  if (!rows.length) {
    $('timeline').append(text('p', '当前筛选下没有凭证。', 'empty'));
    return;
  }
  const ticks = [
    ...new Set([
      ...rows.flatMap((i) => i.times.map(Date.parse)),
      Date.parse(result.asOf),
    ]),
  ].sort((a, b) => a - b);
  const equal = $('equal-time').checked,
    min = ticks[0],
    max = ticks.at(-1);
  const x = (stamp) =>
    265 +
    770 *
      (equal
        ? ticks.indexOf(Date.parse(stamp)) / Math.max(1, ticks.length - 1)
        : (Date.parse(stamp) - min) / Math.max(1, max - min));
  const height = rows.length * 47 + 90,
    svg = svgNode('svg', {
      viewBox: `0 0 1080 ${height}`,
      role: 'img',
      'aria-label': '场景凭证时间线',
    });
  svg.append(
    svgNode('text', { x: 265, y: 20 }, new Date(min).toISOString()),
    svgNode(
      'text',
      { x: 1035, y: 20, 'text-anchor': 'end' },
      new Date(max).toISOString(),
    ),
  );
  const ys = new Map();
  rows.forEach((item, index) => {
    const y = 54 + index * 47,
      a = x(item.times[0]),
      b = x(item.times[1]);
    ys.set(item.instanceRef, { y, x: a });
    const group = svgNode('g', {
      class: 'time-row',
      tabindex: 0,
      role: 'button',
      'aria-label': `${label(item.entityRef)} ${item.instanceRef}`,
    });
    group.append(
      svgNode('rect', {
        x: 0,
        y: y - 20,
        width: 1065,
        height: 45,
        fill: index % 2 ? '#f6f8fc' : '#fff',
      }),
      svgNode('text', { x: 8, y: y - 4 }, label(item.entityRef)),
      svgNode(
        'text',
        { x: 8, y: y + 12, fill: '#8491a6', 'font-size': 9 },
        label(entities.get(item.entityRef).contextRef),
      ),
    );
    group.append(
      svgNode('line', { x1: 260, y1: y, x2: 1040, y2: y, stroke: '#e9edf5' }),
    );
    if (item.times[0] !== item.times[1])
      group.append(
        svgNode('rect', {
          x: a,
          y: y - 7,
          width: Math.max(3, b - a),
          height: 14,
          rx: 4,
          fill: '#6285e5',
          opacity: 0.82,
        }),
      );
    else
      group.append(
        svgNode('path', {
          d: `M ${a} ${y - 7} l 7 7 l -7 7 l -7 -7 z`,
          fill: '#43ad94',
        }),
      );
    group.append(
      svgNode('title', {}, `${item.instanceRef}\n${item.times.join(' → ')}`),
    );
    const open = () => {
      showDetail(item.instanceRef);
      $('detail-body').prepend(
        text('h3', '本场景计算后的值'),
        text('pre', pretty(item.values)),
      );
    };
    group.addEventListener('click', open);
    group.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') open();
    });
    svg.append(group);
  });
  if ($('dependencies').checked)
    for (const item of rows)
      for (const ref of instances.get(item.instanceRef)?.basedOn || []) {
        const a = ys.get(ref),
          b = ys.get(item.instanceRef);
        if (!a || !b) continue;
        const path = svgNode('path', {
          d: `M ${a.x} ${a.y} C ${a.x + 35} ${a.y}, ${b.x - 35} ${b.y}, ${b.x} ${b.y}`,
          stroke: '#a2aec5',
          fill: 'none',
          'stroke-dasharray': '3 3',
          'pointer-events': 'none',
          opacity: 0.7,
        });
        path.append(svgNode('title', {}, `${ref} → ${item.instanceRef}`));
        svg.append(path);
      }
  const asOf = x(result.asOf);
  svg.append(
    svgNode('line', {
      x1: asOf,
      y1: 29,
      x2: asOf,
      y2: height - 25,
      stroke: '#d8853d',
      'stroke-dasharray': '5 4',
    }),
    svgNode('text', { x: Math.min(asOf, 960), y: height - 8 }, 'asOf 判断时刻'),
  );
  $('timeline').append(svg);
}
function evidenceCard(entity) {
  const card = text('article', '', `evidence-card ${entity.kind}`);
  const [type, time] = evidenceTypes[entity.kind] || ['evidence', ''];
  card.append(
    button(entity.label, () => showDetail(entity.id)),
    text('code', `<${type}>`),
    text('small', time),
  );
  const role = entity.responsibleRoleRef;
  if (role) card.append(text('span', `责任：${label(role)}`, 'responsible'));
  return card;
}
function fulfillmentCard(context) {
  const card = text('article', '', 'fulfillment-card');
  const head = text('div', '', 'fulfillment-head');
  const evidences = DATA.model.entities.filter(
    (e) => e.category === 'evidence' && e.contextRef === context.id,
  );
  const requests = evidences.filter((e) => e.kind === 'fulfillment_request');
  const confirmations = evidences.filter(
    (e) => e.kind === 'fulfillment_confirmation',
  );
  const rulesForContext = DATA.model.rules.filter(
    (rule) => rule.contextRef === context.id,
  );
  head.append(
    button(context.label, () => showDetail(context.id)),
    badge('Fulfillment'),
    text('small', `${rulesForContext.length} 条规则`),
  );
  const flow = text('div', '', 'fulfillment-flow');
  const requestColumn = text('div', '', 'evidence-column');
  requestColumn.append(text('h4', '履约请求（时段）'));
  if (requests.length) requestColumn.append(...requests.map(evidenceCard));
  else requestColumn.append(text('p', '未声明请求凭证', 'empty'));
  const arrow = text('div', '履约 →', 'fulfillment-arrow');
  const confirmationColumn = text('div', '', 'evidence-column');
  confirmationColumn.append(text('h4', '履约确认（时刻）'));
  if (confirmations.length)
    confirmationColumn.append(...confirmations.map(evidenceCard));
  else confirmationColumn.append(text('p', '尚未声明确认凭证', 'empty'));
  flow.append(requestColumn, arrow, confirmationColumn);
  card.append(head, flow);
  if (rulesForContext.length) {
    const rulesBox = text('div', '', 'fulfillment-rules');
    rulesBox.append(
      ...rulesForContext.map((rule) =>
        button(`${rule.kind} · ${rule.label}`, () => showDetail(rule.id)),
      ),
    );
    card.append(rulesBox);
  }
  return card;
}
function renderObligations() {
  clear($('obligations'));
  clear($('patterns'));
  const contracts = DATA.model.entities
    .filter(
      (e) =>
        e.category === 'context' &&
        e.kind === 'contract' &&
        inScope(e) &&
        matches(e),
    )
    .sort(
      (a, b) =>
        DATA.model.entities.filter((e) => e.parentContextRef === b.id).length -
        DATA.model.entities.filter((e) => e.parentContextRef === a.id).length,
    );
  for (const contract of contracts) {
    const card = text('section', '', 'contract-card');
    const head = text('div', '', 'contract-head');
    const contractEvidence = (contract.rootRefs || [])
      .map((id) => entities.get(id))
      .filter(Boolean);
    const roles = DATA.model.entities.filter(
      (e) =>
        e.category === 'role' &&
        e.kind === 'party' &&
        e.contextRef === contract.id,
    );
    head.append(
      button(contract.label, () => showDetail(contract.id)),
      badge('Contract'),
      text(
        'span',
        roles.length
          ? `责任角色：${roles.map((r) => r.label).join(' ↔ ')}`
          : '未声明合同责任角色',
      ),
    );
    if (contractEvidence.length)
      head.append(...contractEvidence.map(evidenceCard));
    card.append(head);
    const fulfillments = DATA.model.entities.filter(
      (e) =>
        e.category === 'context' &&
        e.kind === 'fulfillment' &&
        e.parentContextRef === contract.id,
    );
    const children = text('div', '', 'fulfillment-grid');
    if (fulfillments.length)
      children.append(...fulfillments.map(fulfillmentCard));
    else children.append(text('p', '当前合同未展开履约责任。', 'empty'));
    card.append(children);
    $('obligations').append(card);
  }
  const domains = DATA.model.entities.filter(
    (e) =>
      e.category === 'context' &&
      e.kind === 'domain' &&
      inScope(e) &&
      matches(e),
  );
  if (!contracts.length && domains.length) {
    $('obligations').append(
      text('p', '当前为领域范围，不补造合同或履约。', 'empty'),
    );
    for (const domain of domains) {
      const card = text('section', '', 'contract-card domain-card');
      card.append(
        button(domain.label, () => showDetail(domain.id)),
        badge('Domain'),
      );
      const roots = (domain.rootRefs || [])
        .map((id) => entities.get(id))
        .filter(Boolean);
      if (roots.length)
        card.append(
          ...roots.map((item) => button(item.label, () => showDetail(item.id))),
        );
      $('obligations').append(card);
    }
  }
  if (!contracts.length && !domains.length)
    $('obligations').append(text('p', '没有匹配的合同或领域边界。', 'empty'));
  const patterns = DATA.model.businessPatterns || [];
  if (!patterns.length)
    $('patterns').append(
      text('p', '当前模型尚未提取核心业务模式；本视图不自动推导。', 'empty'),
    );
  else
    $('patterns').append(
      ...patterns.map((pattern) => {
        const card = text('article', '', 'pattern-card');
        card.append(
          button(pattern.label || pattern.id, () => showDetail(pattern.id)),
          text('pre', pretty(pattern)),
        );
        return card;
      }),
    );
}
function renderTimeline() {
  clear($('timeline'));
  clear($('scenario-tables'));
  const result = DATA.simulation.scenarioResults.find(
    (s) => s.scenarioId === $('scenario').value,
  );
  if (!result) {
    $('timeline').append(
      text('p', '未执行单据场景，不宣称模拟通过。', 'empty'),
    );
    return;
  }
  const scenario = DATA.scenarios.find((s) => s.id === result.scenarioId);
  $('scenario-meta').textContent =
    `固定 asOf：${result.asOf} · ${result.simulationPassed ? '回放通过' : '回放失败'} · ${$('equal-time').checked ? '等距事件轴，长度不表示持续时间' : '真实时间比例'}`;
  drawTimeline(result);
  const box = $('scenario-tables');
  box.append(
    text('h2', '履约预期与实际'),
    table(
      ['履约', '预期', '实际', '校验'],
      result.fulfillmentStatuses.map((s) => [
        button(label(s.fulfillmentRef), () => showDetail(s.fulfillmentRef)),
        s.expectedStatus,
        s.status,
        badge(s.passed ? '匹配' : '不匹配', s.passed ? 'good' : 'bad'),
      ]),
    ),
  );
  box.append(
    text('h2', '规则求值'),
    table(
      ['规则', '预期结果', '实际结果', '校验'],
      result.evaluations.map((e, index) => [
        button(label(e.ruleRef), () => showDetail(e.ruleRef)),
        pretty(scenario?.evaluations?.[index]?.expectedResult),
        pretty(e.result),
        badge(e.passed ? '匹配' : '不匹配', e.passed ? 'good' : 'bad'),
      ]),
    ),
  );
  box.append(
    text('h2', '按步骤可见的证据'),
    table(
      ['步骤', '角色', '本步单据', '可见凭证数'],
      (scenario?.steps || []).map((s) => [
        s.sequence,
        label(s.actingRoleRef),
        button(s.issueInstanceRef, () => showDetail(s.issueInstanceRef)),
        button(String(s.availableInstanceRefs?.length ?? 0), () => {
          const d = detailStart(`步骤 ${s.sequence} · 可见凭证`);
          d.append(sourceButton(scenario.id), text('pre', pretty(s)));
        }),
      ]),
    ),
  );
}
function renderRules() {
  clear($('rules'));
  clear($('attributes'));
  const selected = DATA.model.rules.filter(
    (r) =>
      inScope(r) &&
      matches(r) &&
      (!$('rule-kind').value || r.kind === $('rule-kind').value),
  );
  for (const r of selected) {
    const card = text('article', '', 'rule-card'),
      top = text('div', '', 'rule-top');
    top.append(
      button(r.label, () => showDetail(r.id)),
      badge(r.kind),
    );
    card.append(
      top,
      text('small', `${label(r.contextRef)} · ${r.id}`),
      text('pre', r.expression),
    );
    if (r.target)
      card.append(
        button(`${r.target.entityRef}#${r.target.attribute}`, () =>
          showAttribute(`${r.target.entityRef}#${r.target.attribute}`),
        ),
      );
    $('rules').append(card);
  }
  if (!selected.length)
    $('rules').append(text('p', '没有匹配的规则。', 'empty'));
  for (const a of DATA.lineage.nodes.filter(
    (a) => matches(a) && inScope(entities.get(a.entityRef) || {}),
  ))
    $('attributes').append(button(a.path, () => showAttribute(a.path), ''));
}
function showApi(cap) {
  const box = detailStart(cap.businessCapability, cap.id);
  box.append(
    badge(cap.method),
    text('pre', cap.uri),
    sourceButton(cap.id),
    text('p', `调用角色：${label(cap.actorRoleRef)}`),
  );
  const operation = DATA.api.http.operations.find(
    (o) => o.capabilityRef === cap.id,
  );
  rawSection(box, '实例绑定与业务规则', {
    bindings: cap.bindingRefs,
    rules: cap.ruleBindings || [],
  });
  if (operation) {
    box.append(
      text('h3', '请求字段'),
      table(
        ['字段', '类型', '必填／取值口径'],
        (operation.request.fields || []).map((f) => [
          f.name,
          f.schema.type,
          `${f.required ? '必填' : '可选'} · ${f.origin}`,
        ]),
      ),
      text('pre', pretty(operation.request.example)),
    );
    for (const response of operation.responses) {
      box.append(text('h3', `${response.status} · ${response.description}`));
      if (response.headers) box.append(text('pre', pretty(response.headers)));
      const repr = DATA.api.http.representations.find(
        (r) => r.id === response.representationRef,
      );
      if (repr) rawSection(box, '响应字段与表示', repr);
    }
    rawSection(box, '幂等与并发', {
      idempotency: operation.idempotency,
      concurrency: operation.concurrency,
    });
    rawSection(
      box,
      '相关 HTTP 消费流程（未运行服务）',
      DATA.api.http.journeys.filter((j) =>
        j.steps?.some((s) => s.capabilityRef === cap.id),
      ),
    );
  }
  rawSection(box, '完整能力定义', cap);
}
function renderApi() {
  clear($('apis'));
  const selected = capabilities.filter(
    (c) =>
      matches(c) &&
      inScope(c) &&
      (!$('api-role').value || c.actorRoleRef === $('api-role').value),
  );
  $('api-summary').textContent = DATA.api
    ? `${selected.length} / ${capabilities.length} 个角色接口 · ${DATA.api.operations.length} 个合并操作 · runtimeValidated: false`
    : '当前项目没有 API 设计文件，本页不补造接口。';
  $('apis').append(
    table(
      ['角色', '方法', 'URI', '业务能力'],
      selected.map((c) => [
        label(c.actorRoleRef),
        text('span', c.method, `method ${c.method.toLowerCase()}`),
        text('code', c.uri),
        button(c.businessCapability, () => showApi(c)),
      ]),
    ),
  );
  $('openapi').disabled = !DATA.openapi;
}
function renderFiles() {
  clear($('files'));
  const selected = DATA.files.filter(
    (f) => matches(f) && f.path.includes($('file-kind').value),
  );
  $('files').append(
    text(
      'p',
      `${selected.length} / ${DATA.files.length} 份 YAML。文件索引不受“边界”筛选限制。`,
    ),
  );
  for (const f of selected) {
    const row = text('div', '', 'file-row');
    row.append(
      button(f.path.replace('.evidence/', ''), () => showFile(f.path)),
      badge(f.generated ? '历史派生' : '输入', f.generated ? 'warn' : ''),
      text('small', f.sha256.slice(0, 10)),
    );
    $('files').append(row);
  }
}
function refresh() {
  if (activeView === 'graph') renderGraph();
  if (activeView === 'obligations') renderObligations();
  if (activeView === 'timeline') renderTimeline();
  if (activeView === 'rules') renderRules();
  if (activeView === 'api') renderApi();
  if (activeView === 'files') renderFiles();
}
function selectView(view) {
  activeView = view;
  for (const name of [
    'graph',
    'obligations',
    'timeline',
    'rules',
    'api',
    'files',
  ])
    $(name + '-panel').hidden = name !== view;
  document
    .querySelectorAll('nav button')
    .forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  refresh();
}
function initialize() {
  $('model-title').textContent = DATA.model.model.name;
  $('notice').title = `模型摘要 ${DATA.meta.modelDigest}`;
  $('notice').textContent =
    `生成时校验：FM ${DATA.check.valid ? '通过' : '未通过'} · 模拟 ${DATA.check.simulationPassed === null ? '未执行' : DATA.check.simulationPassed ? '通过' : '失败'} · 业务审核 ${DATA.check.stakeholderReview?.status || '未声明'}。快照生成于 ${DATA.meta.generatedAt.slice(0, 19)} UTC；离线页面不会自动检测后续文件变化，请重新生成。`;
  for (const [number, name] of [
    [DATA.files.length, '份 YAML · 可回到原文'],
    [DATA.model.entities.length, '个业务对象'],
    [DATA.simulation.scenarioResults.length, '个场景回放'],
    [capabilities.length, '个角色接口'],
  ]) {
    const card = text('div', '', 'stat');
    card.append(text('strong', number), text('small', name));
    $('stats').append(card);
  }
  const contextEntities = DATA.model.entities.filter(
    (e) => e.category === 'context',
  );
  for (const e of contextEntities) {
    const o = text('option', (e.parentContextRef ? '↳ ' : '') + e.label);
    o.value = e.id;
    $('scope').append(o);
  }
  const primaryContract = contextEntities
    .filter((e) => e.kind === 'contract')
    .map((contract) => ({
      contract,
      fulfillmentCount: contextEntities.filter(
        (e) => e.parentContextRef === contract.id,
      ).length,
    }))
    .sort((a, b) => b.fulfillmentCount - a.fulfillmentCount)[0]?.contract;
  const primaryFulfillment = contextEntities
    .filter(
      (e) =>
        e.kind === 'fulfillment' && e.parentContextRef === primaryContract?.id,
    )
    .map((fulfillment) => ({
      fulfillment,
      relationCount: DATA.model.relationships.filter(
        (relation) =>
          entities.get(relation.sourceRef)?.contextRef === fulfillment.id ||
          entities.get(relation.targetRef)?.contextRef === fulfillment.id,
      ).length,
    }))
    .sort((a, b) => b.relationCount - a.relationCount)[0]?.fulfillment;
  if (primaryFulfillment || primaryContract) {
    $('scope').value = (primaryFulfillment || primaryContract).id;
    $('scope').dataset.defaultFocus = $('scope').value;
  }
  for (const s of DATA.scenarios) {
    const o = text('option', s.label);
    o.value = s.id;
    $('scenario').append(o);
  }
  for (const role of [...new Set(capabilities.map((c) => c.actorRoleRef))]) {
    const o = text('option', label(role));
    o.value = role;
    $('api-role').append(o);
  }
  document
    .querySelectorAll('nav button')
    .forEach((b) =>
      b.addEventListener('click', () => selectView(b.dataset.view)),
    );
  for (const id of [
    'scope',
    'graph-mode',
    'scenario',
    'equal-time',
    'dependencies',
    'rule-kind',
    'api-role',
    'file-kind',
  ])
    $(id).addEventListener('change', refresh);
  $('search').addEventListener('input', () =>
    activeView === 'graph' ? filterGraph() : refresh(),
  );
  $('fit').addEventListener('click', () => graph?.fit(undefined, 30));
  $('reset').addEventListener('click', () => {
    $('search').value = '';
    $('scope').value = $('scope').dataset.defaultFocus || '';
    $('rule-kind').value = '';
    $('api-role').value = '';
    $('file-kind').value = '';
    refresh();
  });
  $('clear-detail').addEventListener('click', () => detailStart('对象详情'));
  $('openapi').addEventListener('click', () => {
    const box = detailStart('当前 OpenAPI 3.1');
    box.append(
      text('p', '本次由当前完整 API 重新投影，不使用历史快照。'),
      button('下载 OpenAPI', () => download('openapi.yaml', DATA.openapi), ''),
      text('pre', DATA.openapi, 'raw'),
    );
  });
  renderGraph();
  document.body.dataset.ready = 'true';
}
try {
  initialize();
} catch (error) {
  $('notice').textContent = `页面初始化失败：${error.message}`;
  $('notice').classList.add('bad');
  console.error(error);
}

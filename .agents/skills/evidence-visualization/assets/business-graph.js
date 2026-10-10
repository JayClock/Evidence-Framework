'use strict';

const businessGraphKinds = {
  references: '业务引用',
  plays_role: '角色扮演',
  uses_role: '使用角色',
  evidences: '证明依赖',
  precedes: '先于',
};

function graphCardinality(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return String(value);
  const lower = value.min;
  const upper = value.max === 'many' ? 'N' : value.max;
  if (lower === undefined || upper === undefined) return JSON.stringify(value);
  return lower === upper ? String(lower) : `${lower}..${upper}`;
}

// Layout is a projection, not another model. Only explicit facts become links.
function buildBusinessGraph(data, options = {}) {
  const entities = data.nodes.filter((n) =>
    ['context', 'fulfillment', 'evidence', 'participant', 'role'].includes(n.group),
  );
  const index = new Map(entities.map((n) => [n.id, n]));
  const warnings = [];
  for (const node of entities) {
    const seen = new Set();
    let current = node;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      current = index.get(current.parent);
    }
    if (current) warnings.push(`${node.label}：归属环`);
    if (node.parent && !index.has(node.parent))
      warnings.push(`${node.label}：所属边界未解析`);
  }
  function owner(id) {
    let node = index.get(id),
      last = id;
    const seen = new Set();
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      last = node.id;
      if (node.group === 'context')
        return node.id;
      node = index.get(node.parent);
    }
    return last;
  }
  const scopes = entities.filter(
    (n) => n.group === 'context' && owner(n.id) === n.id,
  );
  const relations = data.nodes.filter((n) => n.group === 'relationship');
  const unresolved = relations
    .filter((e) => !index.has(e.sourceRef) || !index.has(e.targetRef))
    .map((e) => e.id);
  const boxMap = new Map(),
    boundaryMap = new Map();
  let originX = 0,
    originY = 0;
  const standard = options.mode === 'standard';
  const height = standard ? 142 : 88,
    step = height + 42;
  const facts = data.edges || [];
  function put(node, x, y) {
    if (!node || boxMap.has(node.id)) return;
    const responsibleRef =
      node.group === 'evidence'
        ? facts.find((e) => e.from === node.id && e.label === '凭证责任方')?.to
        : undefined;
    const timeFields =
      node.group === 'evidence'
        ? data.nodes
            .filter(
              (n) =>
                n.group === 'attribute' &&
                n.parent === node.id &&
                [
                  'started_at',
                  'expired_at',
                  'signed_at',
                  'confirmed_at',
                  'created_at',
                ].includes(n.name),
            )
            .map((n) => n.name)
        : [];
    boxMap.set(node.id, {
      ...node,
      x: x + originX,
      y: y + originY,
      width: 200,
      height,
      owner: owner(node.id),
      responsibleRef,
      timeFields,
    });
  }
  function enclose(context, contents, fallback) {
    const items = contents.length ? contents : [fallback];
    const x = Math.min(...items.map((b) => b.x)) - 24;
    const y = Math.min(...items.map((b) => b.y)) - 50;
    const boundary = {
      id: context.id,
      parent: context.parent,
      kind: context.kind,
      group: context.group,
      label: context.label,
      x,
      y,
      width: Math.max(
        360,
        Math.max(...items.map((b) => b.x + b.width)) + 24 - x,
      ),
      height: Math.max(
        140,
        Math.max(...items.map((b) => b.y + b.height)) + 24 - y,
      ),
    };
    boundaryMap.set(context.id, boundary);
    return boundary;
  }
  // Pack complete contract spines into one canvas. Each object is placed only
  // in its actual owner; cross-contract links use those same visible nodes.
  const roots = [...new Set(entities.map((n) => owner(n.id)))];
  const columns = [0, 0];
  roots.sort(
    (a, b) =>
      entities.filter((n) => owner(n.id) === b).length -
      entities.filter((n) => owner(n.id) === a).length,
  );
  for (const scope of roots) {
    const column = columns[0] <= columns[1] ? 0 : 1;
    originX = 40 + column * 1480;
    originY = 60 + columns[column];
    const owned = entities.filter((n) => owner(n.id) === scope);
    const ownIds = new Set(owned.map((n) => n.id));
    const fulfillments = owned.filter(
      (n) => n.group === 'fulfillment',
    );
    let y = 90;
    for (const fulfillment of fulfillments) {
      const requests = (
        fulfillment.requests ||
        owned
          .filter(
            (n) =>
              n.parent === fulfillment.id && n.kind === 'fulfillment_request',
          )
          .map((n) => n.id)
      ).filter(
        (id) => ownIds.has(id) && index.get(id).parent === fulfillment.id,
      );
      const confirmations = (
        fulfillment.confirmations ||
        owned
          .filter(
            (n) =>
              n.parent === fulfillment.id &&
              n.kind === 'fulfillment_confirmation',
          )
          .map((n) => n.id)
      ).filter(
        (id) => ownIds.has(id) && index.get(id).parent === fulfillment.id,
      );
      const proofRoles = (fulfillment.proofRoles || []).filter(
        (id) => ownIds.has(id) && index.get(id).parent === fulfillment.id,
      );
      const results = confirmations.length ? confirmations : proofRoles;
      const dependencies = owned.filter(
        (n) =>
          n.parent === fulfillment.id &&
          !['context', 'fulfillment'].includes(n.group) &&
          !requests.includes(n.id) &&
          !results.includes(n.id),
      );
      requests.forEach((id, i) => put(index.get(id), 540, y + i * step));
      results.forEach((id, i) => put(index.get(id), 820, y + i * step));
      dependencies.forEach((n, i) => put(n, 1100, y + i * step));
      const rowHeight =
        Math.max(1, requests.length, results.length, dependencies.length) *
        step;
      enclose(
        fulfillment,
        [...boxMap.values()].filter((b) => b.parent === fulfillment.id),
        { x: originX + 540, y: originY + y, width: 200, height },
      );
      y += rowHeight + 64;
    }
    const contracts = owned.filter(
      (n) => n.group === 'evidence' && n.kind === 'contract',
    );
    const parties = owned.filter(
      (n) => n.group === 'role' && n.kind === 'party' && !boxMap.has(n.id),
    );
    const middle = Math.max(90, (y - height) / 2);
    contracts.forEach((n, i) => put(n, 280, middle + i * step));
    parties.forEach((n, i) =>
      put(
        n,
        20,
        Math.max(90, middle - ((parties.length - 1) * step) / 2) + i * step,
      ),
    );
    const rest = Math.max(
      fulfillments.length ? y + 20 : 90,
      ...[...boxMap.values()]
        .filter((b) => ownIds.has(b.id) && b.x === originX + 280)
        .map((b) => b.y - originY + b.height + 42),
    );
    owned
      .filter((n) => !['context', 'fulfillment'].includes(n.group) && !boxMap.has(n.id))
      .forEach((n, i) =>
        put(n, 280 + (i % 3) * 280, rest + Math.floor(i / 3) * step),
      );
    const scopeNode = index.get(scope);
    const contents = [...boxMap.values(), ...boundaryMap.values()].filter((b) =>
      ownIds.has(b.id),
    );
    if (scopeNode?.group === 'context' && !boundaryMap.has(scope)) {
      enclose(scopeNode, contents, {
        x: originX + 280,
        y: originY + 90,
        width: 320,
        height: 88,
      });
    }
    columns[column] =
      Math.max(
        originY,
        ...contents.map((b) => b.y + b.height),
        boundaryMap.get(scope)?.y + boundaryMap.get(scope)?.height || 0,
      ) + 100;
  }
  const edges = [];
  for (const e of relations) {
    const from = e.sourceRef,
      to = e.targetRef;
    if (!boxMap.has(from) || !boxMap.has(to)) continue;
    const crossBoundary = owner(e.sourceRef) !== owner(e.targetRef);
    edges.push({
      ...e,
      from,
      to,
      crossBoundary,
      dashed: crossBoundary || e.kind === 'plays_role',
      arrow: e.kind === 'plays_role',
    });
  }
  const roleLinks = facts
    .filter(
      (e) =>
        e.label === '合同责任角色' && boxMap.has(e.from) && boxMap.has(e.to),
    )
    .map((e) => ({ ...e, detailRef: e.to }));
  const boxes = [...boxMap.values()];
  // Paint parents before children without making contexts relationship endpoints.
  const boundaries = [...boundaryMap.values()].sort(
    (a, b) => (a.kind === 'fulfillment') - (b.kind === 'fulfillment'),
  );
  return {
    boxes,
    boundaries,
    scopes,
    edges,
    roleLinks,
    relations,
    unresolved,
    warnings,

    width: Math.max(
      600,
      ...[...boxes, ...boundaries].map((b) => b.x + b.width + 90),
    ),
    height: Math.max(
      240,
      ...[...boxes, ...boundaries].map((b) => b.y + b.height + 60),
    ),
  };
}

function buildBusinessLegend(layout) {
  const items = [];
  const names = {
    'evidence.contract': ['合同凭证', '约定双方权责的凭证。'],
    'evidence.fulfillment_request': ['履约请求', '提出本次履约要求的凭证。'],
    'evidence.fulfillment_confirmation': [
      '履约确认',
      '记录实际履约结果的凭证。',
    ],
    'evidence.other_evidence': ['其他凭证', '记录业务事实的补充凭证。'],
    'participant.party': ['主体参与者', '在不同上下文中保持自身身份。'],
    'participant.thing': ['标的参与者', '业务涉及的对象或标的。'],
    'role.party': ['当事人角色', '参与者在当前上下文中承担的角色。'],
    'role.evidence': ['凭证角色', '由具体凭证扮演，不是另一份确认凭证。'],
  };
  for (const example of layout.boxes) {
    const key = `${example.group}.${example.kind}`;
    if (items.some((item) => item.key === key)) continue;
    const [label, description] = names[key] || [
      example.kind,
      '当前模型中已有的对象类型。',
    ];
    items.push({ key, section: 'objects', label, description, example });
  }
  const contexts = {
    domain: ['领域上下文', '划分领域对象的归属。'],
    contract: ['合同上下文', '划分合同权责范围，不是合同凭证节点。'],
    fulfillment: ['权责履约', '合约内的请求、完成证明及规则，不构成上下文边界。'],
  };
  for (const example of layout.boundaries) {
    const key = `${example.group}.${example.kind}`;
    if (items.some((item) => item.key === key)) continue;
    const [label, description] = contexts[example.kind] || [
      '上下文',
      '对象的归属边界。',
    ];
    items.push({ key, section: example.group === 'fulfillment' ? 'fulfillments' : 'contexts', label, description, example });
  }
  const lines = [...layout.edges, ...layout.roleLinks];
  for (const [key, label, description, predicate] of [
    [
      'local',
      '同边界关联',
      '实线，无箭头；不表示执行顺序。',
      (e) => !e.arrow && !e.crossBoundary,
    ],
    [
      'cross',
      '跨边界关联',
      '虚线，无箭头；跨合同或领域边界。',
      (e) => !e.arrow && e.crossBoundary,
    ],
    [
      'plays_role',
      '角色扮演',
      '虚线箭头由具体玩家指向被扮演的角色。',
      (e) => e.arrow,
    ],
  ]) {
    const example = lines.find(predicate);
    if (example)
      items.push({
        key: `line.${key}`,
        section: 'lines',
        label,
        description,
        example,
      });
  }
  return items;
}

function graphTypeLabel(box) {
  return box.group === 'role' && box.kind === 'evidence'
    ? 'evidence role'
    : {
        fulfillment_request: 'request',
        fulfillment_confirmation: 'confirmation',
        other_evidence: 'evidence',
      }[box.kind] || box.kind;
}

function businessGraphEdgeKey(edge) {
  return edge.id || `responsibility:${JSON.stringify([edge.from, edge.to])}`;
}

// Highlight only relationships drawn on this canvas; never infer extra links.
function businessGraphHighlight(layout, target) {
  const result = {
    active: false,
    nodes: new Set(),
    edges: new Set(),
    boundaries: new Set(),
    primaryNode: '',
    primaryBoundary: '',
  };
  if (!target) return result;
  const index = new Map(
    [...layout.boxes, ...layout.boundaries].map((n) => [n.id, n]),
  );
  const boundaryIds = new Set(layout.boundaries.map((n) => n.id));
  const lines = [...layout.edges, ...layout.roleLinks];
  function belongs(id, context) {
    const seen = new Set();
    let node = index.get(id);
    while (node && !seen.has(node.id)) {
      if (node.id === context) return true;
      seen.add(node.id);
      node = index.get(node.parent);
    }
    return false;
  }
  function owners(id) {
    const seen = new Set([id]);
    let parent = index.get(id)?.parent;
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      if (boundaryIds.has(parent)) result.boundaries.add(parent);
      parent = index.get(parent)?.parent;
    }
  }
  if (target.type === 'boundary' && boundaryIds.has(target.id)) {
    result.active = true;
    result.primaryBoundary = target.id;
    layout.boxes
      .filter((n) => belongs(n.id, target.id))
      .forEach((n) => result.nodes.add(n.id));
    layout.boundaries
      .filter((n) => belongs(n.id, target.id))
      .forEach((n) => result.boundaries.add(n.id));
    lines
      .filter((e) => result.nodes.has(e.from) && result.nodes.has(e.to))
      .forEach((e) => result.edges.add(businessGraphEdgeKey(e)));
  } else if (
    target.type === 'node' &&
    layout.boxes.some((n) => n.id === target.id)
  ) {
    result.active = true;
    result.primaryNode = target.id;
    result.nodes.add(target.id);
    owners(target.id);
    for (const edge of lines)
      if (edge.from === target.id || edge.to === target.id) {
        result.edges.add(businessGraphEdgeKey(edge));
        result.nodes.add(edge.from);
        result.nodes.add(edge.to);
      }
  } else if (target.type === 'edge') {
    const edge = lines.find((e) => businessGraphEdgeKey(e) === target.id);
    if (edge) {
      result.active = true;
      result.edges.add(target.id);
      for (const id of [edge.from, edge.to]) {
        result.nodes.add(id);
        owners(id);
      }
    }
  }
  return result;
}

const businessGraphState = {
  mode: 'simple',
  zoom: null,
  left: 0,
  top: 0,
};

function renderBusinessGraph(target) {
  const section = card('业务模型图', target);
  section.id = 'business-graph';

  const toolbar = el('div', '', 'graph-toolbar'),
    viewport = el('div', '', 'graph-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', '业务模型画布，可滚动查看');
  const selection = el('p', '', 'graph-selection');
  selection.setAttribute('aria-live', 'polite');
  const relationDetails = el('details', '', 'graph-relation-list');
  let layout, svg;
  const zoomLabel = el('span', '', 'graph-zoom');
  function choice(id, label, values, value, onChange) {
    const wrap = el('label', `${label} `),
      input = el('select');
    input.id = id;
    input.setAttribute('aria-label', label);
    values.forEach(([key, text]) => {
      const option = el('option', text);
      option.value = key;
      input.append(option);
    });
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    wrap.append(input);
    toolbar.append(wrap);
    return input;
  }
  function control(id, label, run) {
    const button = action(label, run);
    button.id = id;
    toolbar.append(button);
    return button;
  }

  choice(
    'graph-mode',
    '显示模式',
    [
      ['simple', '简化图'],
      ['standard', '标准图'],
    ],
    businessGraphState.mode,
    (value) => {
      businessGraphState.mode = value;
      draw();
    },
  );

  function setZoom(value) {
    businessGraphState.zoom = Math.max(0.2, Math.min(2, value));
    svg.setAttribute('width', layout.width * businessGraphState.zoom);
    svg.setAttribute('height', layout.height * businessGraphState.zoom);
    zoomLabel.textContent = `${Math.round(businessGraphState.zoom * 100)}%`;
  }
  control('graph-zoom-out', '− 缩小', () =>
    setZoom(businessGraphState.zoom / 1.25),
  );
  control('graph-zoom-in', '+ 放大', () =>
    setZoom(businessGraphState.zoom * 1.25),
  );
  toolbar.append(zoomLabel);
  control('graph-fit', '适合宽度', () => {
    setZoom(Math.min(1, (viewport.clientWidth - 4) / layout.width));
    viewport.scrollTo(0, 0);
  });
  control('graph-actual', '原始大小', () => setZoom(1));
  const legend = el('details', '', 'graph-legend');
  const legendBody = el('div', '', 'legend-body');
  legend.append(el('summary', '图例 · 对象、上下文与连线'), legendBody);
  relationDetails.append(el('summary', '查看关系详情'), selection);
  section.append(toolbar, legend, viewport, relationDetails);
  viewport.addEventListener('scroll', () => {
    businessGraphState.left = viewport.scrollLeft;
    businessGraphState.top = viewport.scrollTop;
  });
  function element(tag, attributes = {}, text = '') {
    const item = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) =>
      item.setAttribute(key, value),
    );
    if (text) item.textContent = text;
    return item;
  }
  function interactive(item, label, run) {
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', label);
    item.addEventListener('click', run);
    item.addEventListener('keydown', (event) => {
      if (['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        run();
      }
    });
  }
  function textLines(parent, value, x, y, cls, limit = 13) {
    const chars = Array.from(value);
    const text = element('text', { x, y, class: cls, 'text-anchor': 'middle' });
    for (let i = 0; i < Math.min(chars.length, limit * 2); i += limit)
      text.append(
        element(
          'tspan',
          { x, dy: i ? 19 : 0 },
          chars.slice(i, i + limit).join('') +
            (i === limit && chars.length > limit * 2 ? '…' : ''),
        ),
      );
    parent.append(text);
    return text.childElementCount;
  }
  function drawLegend() {
    legendBody.replaceChildren();
    const items = buildBusinessLegend(layout);
    if (!items.length) {
      legendBody.append(el('p', '当前没有可展示的图形。', 'muted'));
      return;
    }
    for (const [sectionKey, heading] of [
      ['objects', '业务对象'],
      ['contexts', '上下文边界'],
      ['fulfillments', '权责履约'],
      ['lines', '关系连线'],
    ]) {
      const selected = items.filter((item) => item.section === sectionKey);
      if (!selected.length) continue;
      const group = el('section', '', 'legend-group'),
        grid = el('div', '', 'legend-grid');
      group.append(el('h3', heading), grid);
      for (const item of selected) {
        const card = el('div', '', 'legend-card'),
          sample = el('div', '', 'legend-sample');
        const example = item.example;
        card.dataset.legendKind = item.key;
        card.dataset.legendExample = example.id || example.from;
        if (sectionKey === 'objects') {
          const square =
            example.group === 'evidence' ||
            (example.group === 'role' && example.kind === 'evidence');
          const symbol = el(
            'div',
            '',
            `legend-symbol graph-${example.group}${square ? ' legend-square' : ''}`,
          );
          symbol.append(
            el('small', `<${graphTypeLabel(example)}>`),
            el('strong', example.label),
          );
          example.timeFields.forEach((name) =>
            symbol.append(el('small', name)),
          );
          if (example.responsibleRef) {
            const badge = el(
              'span',
              title(example.responsibleRef),
              'legend-responsibility',
            );
            badge.dataset.legendRole = example.responsibleRef;
            symbol.append(badge);
          }
          sample.append(symbol);
        } else if (sectionKey === 'contexts' || sectionKey === 'fulfillments') {
          const frame = el(
            'div',
            example.label,
            `legend-context legend-context-${example.kind}`,
          );
          if (
            example.kind === 'fulfillment' &&
            nodes.get(example.parent)?.group === 'context'
          ) {
            const parent = el(
              'div',
              '',
              `legend-context legend-context-${nodes.get(example.parent).kind}`,
            );
            parent.append(el('small', title(example.parent)), frame);
            sample.append(parent);
          } else sample.append(frame);
        } else {
          const connection = el('div', '', 'legend-connection'),
            line = el('span', '', 'legend-line');
          line.dataset.dashed = String(Boolean(example.dashed));
          line.dataset.arrow = String(Boolean(example.arrow));
          line.setAttribute('aria-hidden', 'true');
          card.dataset.legendFrom = example.from;
          card.dataset.legendTo = example.to;
          connection.append(
            el('span', title(example.from), 'legend-endpoint'),
            line,
            el('span', title(example.to), 'legend-endpoint'),
          );
          sample.append(connection);
        }
        card.append(sample, el('h4', item.label), el('p', item.description));
        grid.append(card);
      }
      legendBody.append(group);
    }
    if (layout.boxes.some((box) => box.responsibleRef))
      legendBody.append(
        el(
          'p',
          '右上角角标表示凭证责任方，只取模型已声明的角色；凭证角色不加责任角标。',
          'legend-note',
        ),
      );
    legendBody.append(
      el(
        'p',
        '示例取自当前模型。标准图补充已有类型、业务时间与关系基数；未声明的内容不补画。',
        'legend-note',
      ),
    );
  }
  function draw() {
    layout = buildBusinessGraph(DATA, businessGraphState);
    drawLegend();
    viewport.replaceChildren();
    svg = element('svg', {
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      role: 'group',
      'aria-label': '业务模型图',
    });
    const entries = [];
    let hovered = null,
      focused = null;
    function paintHighlight() {
      const active = focused || hovered;
      const state = businessGraphHighlight(layout, active?.target);
      for (const entry of entries) {
        const { item, target: ref } = entry;
        let related = false,
          primary = false;
        if (ref.type === 'boundary') {
          related = state.boundaries.has(ref.id);
          primary = state.primaryBoundary === ref.id;
        } else if (ref.type === 'edge') related = state.edges.has(ref.id);
        else if (entry.badgeOwner) {
          related =
            state.nodes.has(entry.badgeOwner) || state.primaryNode === ref.id;
          primary = state.primaryNode === ref.id;
        } else {
          related = state.nodes.has(ref.id);
          primary = state.primaryNode === ref.id;
        }
        item.classList.toggle('highlight', state.active && related);
        item.classList.toggle('graph-primary', state.active && primary);
        item.classList.toggle('graph-dim', state.active && !related);
      }
      if (state.active) {
        svg.dataset.highlightType = active.target.type;
        svg.dataset.highlightId = active.target.id;
      } else {
        delete svg.dataset.highlightType;
        delete svg.dataset.highlightId;
      }
      selection.textContent = state.active
        ? active.description
        : layout.warnings.join('；');
    }
    function bindHighlight(
      item,
      target,
      description,
      focusItem = item,
      badgeOwner = '',
    ) {
      const entry = { item, target, description, badgeOwner };
      entries.push(entry);
      item.addEventListener('mouseenter', () => {
        hovered = entry;
        paintHighlight();
      });
      item.addEventListener('mouseleave', () => {
        if (hovered === entry) hovered = null;
        paintHighlight();
      });
      item.addEventListener('pointerdown', () => {
        focused = null;
        paintHighlight();
      });
      focusItem.addEventListener('focus', () => {
        if (focusItem.matches(':focus-visible')) focused = entry;
        paintHighlight();
      });
      focusItem.addEventListener('keydown', () => {
        if (document.activeElement !== focusItem) return;
        focused = entry;
        paintHighlight();
      });
      focusItem.addEventListener('blur', () => {
        if (focused === entry) focused = null;
        paintHighlight();
      });
    }
    const defs = element('defs');
    svg.append(defs);
    const marker = element('marker', {
      id: 'graph-arrow',
      viewBox: '0 0 10 10',
      refX: 9,
      refY: 5,
      markerWidth: 7,
      markerHeight: 7,
      orient: 'auto',
    });
    marker.append(
      element('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#4b5e75' }),
    );
    defs.append(marker);
    for (const boundary of layout.boundaries) {
      const group = element('g', {
        'data-graph-boundary': boundary.id,
        'data-boundary-kind': boundary.kind,
        'data-boundary-parent': boundary.parent || '',
        [boundary.group === 'context' ? 'data-graph-context' : 'data-graph-fulfillment']: boundary.id,
        class: `graph-boundary graph-boundary-${boundary.kind}`,
      });
      group.append(
        element('rect', {
          x: boundary.x,
          y: boundary.y,
          width: boundary.width,
          height: boundary.height,
          rx: 10,
          class: 'graph-boundary-frame',
        }),
      );
      const kind =
        {
          domain: '领域上下文',
          contract: '合同上下文',
          fulfillment: '权责履约',
        }[boundary.kind] || '上下文';
      const label = element(
        'text',
        {
          x: boundary.x + 16,
          y: boundary.y + 25,
          class: 'graph-boundary-label',
        },
        `${kind} · ${boundary.label}`,
      );
      label.append(element('title', {}, `${boundary.label} · ${boundary.id}`));
      interactive(label, `定位${kind}：${boundary.label}`, () =>
        select(boundary.id),
      );
      group.append(label);
      bindHighlight(
        group,
        { type: 'boundary', id: boundary.id },
        `${kind} · ${boundary.label}`,
        label,
      );
      svg.append(group);
    }
    const boxes = new Map(layout.boxes.map((b) => [b.id, b]));
    const edgeLayer = element('g', { class: 'graph-edges' });
    svg.append(edgeLayer);
    const visibleEdges = layout.edges;
    function drawEdge(edge, i, roleLink = false) {
      const a = boxes.get(edge.from),
        b = boxes.get(edge.to);
      const right = b.x > a.x;
      const sourceRight = b.x >= a.x;
      const x1 = sourceRight ? a.x + a.width : a.x,
        x2 = right ? b.x : b.x + b.width;
      const y1 = a.y + a.height / 2,
        y2 = b.y + b.height / 2;
      let d;
      if (a.id === b.id)
        d = `M ${a.x + a.width} ${y1 - 12} C ${a.x + a.width + 65} ${y1 - 60}, ${a.x + a.width + 65} ${y1 + 60}, ${a.x + a.width} ${y1 + 12}`;
      else if (a.x === b.x) {
        const end = a.x + a.width,
          lane = end + 24 + (i % 5) * 8;
        d = `M ${end} ${y1} C ${lane} ${y1}, ${lane} ${y2}, ${end} ${y2}`;
      } else
        d = `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
      const group = element('g', {
        class: 'graph-edge',
        'data-highlight-edge': businessGraphEdgeKey(edge),
        ...(roleLink
          ? { 'data-role-link': edge.to }
          : {
              'data-graph-edge': edge.id,
              'data-kind': edge.kind,
              'data-cross-boundary': String(edge.crossBoundary),
            }),
      });
      const label = roleLink
        ? '合同责任角色'
        : businessGraphKinds[edge.kind] || edge.kind;
      const full = `${title(edge.sourceRef || edge.from)} — ${title(edge.targetRef || edge.to)}：${edge.label}（${label}）`;
      const attrs = { d, stroke: '#4b5e75', class: 'graph-line' };
      if (edge.dashed) attrs['stroke-dasharray'] = '5 4';
      if (edge.arrow) attrs['marker-end'] = 'url(#graph-arrow)';
      group.append(
        element('title', {}, full),
        element('path', attrs),
        element('path', { d, class: 'graph-hit' }),
      );
      if (businessGraphState.mode === 'standard' && !roleLink) {
        if (edge.sourceCardinality !== undefined)
          group.append(
            element(
              'text',
              {
                x: x1 + (sourceRight ? 8 : -8),
                'text-anchor': sourceRight ? 'start' : 'end',
                'data-cardinality-for': edge.sourceRef,
                y: y1 - 9,
                class: 'graph-cardinality',
              },
              graphCardinality(edge.sourceCardinality),
            ),
          );
        if (edge.targetCardinality !== undefined)
          group.append(
            element(
              'text',
              {
                x: x2 + (right ? -8 : 8),
                'text-anchor': right ? 'end' : 'start',
                'data-cardinality-for': edge.targetRef,
                y: y2 - 9,
                class: 'graph-cardinality',
              },
              graphCardinality(edge.targetCardinality),
            ),
          );
      }
      interactive(group, full, () =>
        select(roleLink ? edge.detailRef : edge.id),
      );
      bindHighlight(
        group,
        { type: 'edge', id: businessGraphEdgeKey(edge) },
        full,
      );
      edgeLayer.append(group);
    }
    visibleEdges.forEach((e, i) => drawEdge(e, i));
    layout.roleLinks.forEach((e, i) => drawEdge(e, i, true));
    for (const box of layout.boxes) {
      const evidenceRole = box.group === 'role' && box.kind === 'evidence';
      const group = element('g', {
        'data-graph-node': box.id,
        class: `graph-node graph-${box.group}${evidenceRole ? ' graph-evidence-role' : ''}`,
      });
      group.append(
        element('rect', {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          rx: box.group === 'evidence' || evidenceRole ? 0 : 12,
        }),
      );
      const content = element('g', { class: 'graph-node-content' });
      const standard = businessGraphState.mode === 'standard';
      if (standard)
        content.append(
          element(
            'text',
            { x: 0, y: 0, class: 'graph-type', 'text-anchor': 'middle' },
            `<${graphTypeLabel(box)}>`,
          ),
        );
      const labelY = standard ? 20 : 0;
      const labelLines = textLines(
        content,
        box.label,
        0,
        labelY,
        'graph-node-label',
      );
      if (standard)
        box.timeFields.forEach((name, i) =>
          content.append(
            element(
              'text',
              {
                x: 0,
                y: labelY + Math.max(0, labelLines - 1) * 19 + 18 + i * 16,
                class: 'graph-time-field',
                'text-anchor': 'middle',
              },
              name,
            ),
          ),
        );
      group.append(content);
      group.append(
        element('title', {}, `${box.label} · ${box.id} · ${title(box.owner)}`),
      );
      interactive(group, `查看${box.label}`, () => select(box.id));
      bindHighlight(group, { type: 'node', id: box.id }, box.label);
      svg.append(group);
      if (box.responsibleRef) {
        const badge = element('g', {
          'data-responsibility': box.id,
          'data-role-ref': box.responsibleRef,
          class: 'graph-responsibility',
        });
        badge.append(
          element('rect', {
            x: box.x + 100,
            y: box.y - 14,
            width: 112,
            height: 27,
            rx: 5,
          }),
        );
        badge.append(
          element(
            'text',
            { x: 0, y: 0, 'text-anchor': 'middle' },
            title(box.responsibleRef),
          ),
        );
        interactive(badge, `凭证责任方：${title(box.responsibleRef)}`, () =>
          select(box.responsibleRef),
        );
        bindHighlight(
          badge,
          { type: 'node', id: box.responsibleRef },
          `凭证责任方：${title(box.responsibleRef)}`,
          badge,
          box.id,
        );
        svg.append(badge);
      }
    }
    viewport.append(svg);
    // Center the whole text block using rendered bounds, including wrapped
    // names, type/time rows and responsibility badges, rather than baselines.
    for (const node of svg.querySelectorAll(
      '[data-graph-node],[data-responsibility]',
    )) {
      const frame = node.querySelector('rect').getBBox();
      const content =
        node.querySelector('.graph-node-content') || node.querySelector('text');
      const bounds = content.getBBox();
      content.setAttribute(
        'transform',
        `translate(${frame.x + frame.width / 2 - bounds.x - bounds.width / 2} ${frame.y + frame.height / 2 - bounds.y - bounds.height / 2})`,
      );
    }
    setZoom(
      businessGraphState.zoom ??
        Math.min(1, (viewport.clientWidth - 4) / layout.width),
    );
    viewport.scrollTo(businessGraphState.left, businessGraphState.top);
    selection.textContent = layout.warnings.join('；');
    relationDetails.replaceChildren(el('summary', '查看关系详情'), selection);
    relationDetails.append(
      table(
        ['起点', '关系', '终点'],
        layout.relations.map((e) => [
          link(e.sourceRef),
          link(e.id, `${businessGraphKinds[e.kind] || e.kind} · ${e.label}`),
          link(e.targetRef),
        ]),
      ),
    );
  }
  draw();
}

globalThis.renderBusinessGraph = renderBusinessGraph;

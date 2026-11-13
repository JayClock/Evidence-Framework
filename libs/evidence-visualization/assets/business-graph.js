'use strict';

const businessGraphKinds = {
  references: '业务引用',
  plays_role: '角色扮演',
};

/** Attribute names the canvas draws as a business-time window. */
const businessGraphTimeFields = [
  'started_at',
  'expired_at',
  'signed_at',
  'confirmed_at',
  'created_at',
];

function graphCardinality(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return String(value);
  const lower = value.min;
  const upper = value.max === 'many' ? 'N' : value.max;
  if (lower === undefined || upper === undefined) return JSON.stringify(value);
  return lower === upper ? String(lower) : `${lower}..${upper}`;
}

/**
 * Reads the page canvas out of the placement the generator persisted.
 *
 * Coordinates come from `DATA.layout` and from nowhere else: the generator drew
 * them with the same layout the desktop canvas uses, so a page that recomputed
 * its own placement would show a second opinion about the model it describes.
 * What is joined here is content only — labels, kinds, business time, the
 * responsible role — read from the objects the page already carries.
 *
 * The maps below index the placement once, so highlighting and the legend walk
 * the drawn picture instead of re-deriving it.
 */
function businessGraphOf(data) {
  const layout = data.layout;
  const objects = new Map((data.nodes || []).map((node) => [node.id, node]));
  const relationships = (data.nodes || []).filter(
    (node) => node.group === 'relationship',
  );

  if (!layout || !Array.isArray(layout.nodes)) {
    return {
      boxes: [],
      boundaries: [],
      edges: [],
      relations: relationships,
      warnings: ['本页没有画布坐标，无法绘制业务模型图；请重新生成。'],
      width: 0,
      height: 0,
      contextOfNode: new Map(),
      groupOfNode: new Map(),
      parentOfContext: new Map(),
      parentOfGroup: new Map(),
      membersOf: new Map(),
    };
  }

  const fieldsByParent = new Map();
  for (const node of data.nodes || []) {
    if (node.group !== 'attribute' || !businessGraphTimeFields.includes(node.name))
      continue;
    const bucket = fieldsByParent.get(node.parent);
    if (bucket) bucket.push(node.name);
    else fieldsByParent.set(node.parent, [node.name]);
  }

  const parentOfContext = new Map(
    layout.contextGroups.map((group) => [
      group.contextId,
      group.parentContextId || '',
    ]),
  );
  const parentOfGroup = new Map();
  const membersOf = new Map();
  const groupOfNode = new Map();
  for (const group of layout.fulfillmentGroups) {
    const context =
      layout.contextGroups.find((candidate) =>
        candidate.fulfillmentGroupIds.includes(group.groupId),
      )?.contextId || '';
    parentOfGroup.set(group.groupId, context);
    const members = new Set([
      group.requestId,
      ...group.confirmationIds,
      ...group.proofIds,
    ]);
    membersOf.set(group.groupId, members);
    for (const id of members) groupOfNode.set(id, group.groupId);
  }

  const responsibleRef = new Map();
  for (const link of layout.responsibilityLinks || []) {
    if (link.kind === 'responsibility')
      responsibleRef.set(link.sourceRef, link.roleId);
  }

  const contextOfNode = new Map();
  const boxes = layout.nodes.map((placed) => {
    const node = objects.get(placed.nodeId) || {
      id: placed.nodeId,
      label: placed.nodeId,
      group: 'entity',
      kind: 'entity',
    };
    const contextId = placed.contextId || '';
    contextOfNode.set(placed.nodeId, contextId);

    return {
      ...node,
      x: placed.box.x,
      y: placed.box.y,
      width: placed.box.width,
      height: placed.box.height,
      owner: contextId,
      parent: contextId,
      responsibleRef: responsibleRef.get(placed.nodeId),
      timeFields: fieldsByParent.get(placed.nodeId) || [],
      fulfillmentParent: groupOfNode.get(placed.nodeId) || '',
    };
  });

  const boundaries = [];
  for (const group of layout.contextGroups) {
    const context = objects.get(group.contextId);
    boundaries.push({
      id: group.contextId,
      parent: group.parentContextId || '',
      kind: context ? context.kind : 'context',
      group: 'context',
      label: context ? context.label : group.contextId,
      x: group.box.x,
      y: group.box.y,
      width: group.box.width,
      height: group.box.height,
      depth: group.depth,
    });
  }
  for (const group of layout.fulfillmentGroups) {
    const request = objects.get(group.requestId);
    boundaries.push({
      id: group.groupId,
      parent: parentOfGroup.get(group.groupId) || '',
      kind: 'fulfillment',
      group: 'fulfillment',
      label: request ? request.label : group.requestId,
      x: group.box.x,
      y: group.box.y,
      width: group.box.width,
      height: group.box.height,
      members: [...membersOf.get(group.groupId)],
    });
  }

  const edges = layout.edges.map((edge) => {
    const relationship = objects.get(edge.relationshipId) || {};
    return {
      ...relationship,
      id: edge.relationshipId,
      kind: edge.kind,
      label: edge.label,
      from: edge.sourceRef,
      to: edge.targetRef,
      sourceRef: edge.sourceRef,
      targetRef: edge.targetRef,
      points: edge.points,
      crossBoundary: edge.crossContext,
      dashed: edge.dashed,
      arrow: edge.arrow,
      sourceCardinality: relationship.sourceCardinality,
      targetCardinality: relationship.targetCardinality,
    };
  });

  const warnings = [];
  for (const placed of layout.nodes)
    if (!objects.has(placed.nodeId))
      warnings.push(`${placed.nodeId}：画布上的对象未在页面数据中声明`);

  return {
    boxes,
    boundaries,
    edges,
    relations: relationships,
    warnings,
    width: Math.max(1, layout.bounds.width),
    height: Math.max(1, layout.bounds.height),
    contextOfNode,
    groupOfNode,
    parentOfContext,
    parentOfGroup,
    membersOf,
  };
}

function buildBusinessLegend(graph) {
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
  for (const example of graph.boxes) {
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
    fulfillment: [
      '权责履约',
      '合约内的请求、完成证明及规则，不构成上下文边界。',
    ],
  };
  for (const example of graph.boundaries) {
    const key = `${example.group}.${example.kind}`;
    if (items.some((item) => item.key === key)) continue;
    const [label, description] = contexts[example.kind] || [
      '上下文',
      '对象的归属边界。',
    ];
    items.push({
      key,
      section: example.group === 'fulfillment' ? 'fulfillments' : 'contexts',
      label,
      description,
      example,
    });
  }
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
    const example = graph.edges.find(predicate);
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
  return edge.id;
}

/** Every Context this frame sits in, innermost first. */
function businessGraphContexts(graph, contextId) {
  const chain = [];
  const seen = new Set();
  let current = contextId;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = graph.parentOfContext.get(current) || '';
  }
  return chain;
}

// Highlight only relationships drawn on this canvas; never infer extra links.
function businessGraphHighlight(graph, target) {
  const result = {
    active: false,
    nodes: new Set(),
    edges: new Set(),
    boundaries: new Set(),
    primaryNode: '',
    primaryBoundary: '',
  };
  if (!target) return result;
  const boundaryIds = new Set(graph.boundaries.map((boundary) => boundary.id));

  /** The frames an object is drawn inside: its band and every owner Context. */
  function owners(id) {
    const group = graph.groupOfNode.get(id);
    if (group && boundaryIds.has(group)) result.boundaries.add(group);
    for (const context of businessGraphContexts(
      graph,
      graph.contextOfNode.get(id) || '',
    ))
      if (boundaryIds.has(context)) result.boundaries.add(context);
  }

  /** Whether an object or frame is drawn inside the given frame. */
  function belongs(id, boundary) {
    if (id === boundary) return true;
    if (graph.membersOf.get(boundary)?.has(id)) return true;
    const start = graph.contextOfNode.has(id)
      ? graph.contextOfNode.get(id) || ''
      : graph.parentOfGroup.get(id) || id;
    return businessGraphContexts(graph, start).includes(boundary);
  }

  if (target.type === 'boundary' && boundaryIds.has(target.id)) {
    result.active = true;
    result.primaryBoundary = target.id;
    graph.boxes
      .filter((box) => belongs(box.id, target.id))
      .forEach((box) => result.nodes.add(box.id));
    graph.boundaries
      .filter((boundary) => belongs(boundary.id, target.id))
      .forEach((boundary) => result.boundaries.add(boundary.id));
    graph.edges
      .filter(
        (edge) => result.nodes.has(edge.from) && result.nodes.has(edge.to),
      )
      .forEach((edge) => result.edges.add(businessGraphEdgeKey(edge)));
  } else if (
    target.type === 'node' &&
    graph.boxes.some((box) => box.id === target.id)
  ) {
    result.active = true;
    result.primaryNode = target.id;
    result.nodes.add(target.id);
    owners(target.id);
    for (const edge of graph.edges)
      if (edge.from === target.id || edge.to === target.id) {
        result.edges.add(businessGraphEdgeKey(edge));
        result.nodes.add(edge.from);
        result.nodes.add(edge.to);
      }
  } else if (target.type === 'edge') {
    const edge = graph.edges.find(
      (candidate) => businessGraphEdgeKey(candidate) === target.id,
    );
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
  let graph, svg;
  const zoomLabel = el('span', '', 'graph-zoom');

  function control(id, label, run) {
    const button = action(label, run);
    button.id = id;
    toolbar.append(button);
    return button;
  }

  function setZoom(value) {
    businessGraphState.zoom = Math.max(0.2, Math.min(2, value));
    svg.setAttribute('width', graph.width * businessGraphState.zoom);
    svg.setAttribute('height', graph.height * businessGraphState.zoom);
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
    setZoom(Math.min(1, (viewport.clientWidth - 4) / graph.width));
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
    const items = buildBusinessLegend(graph);
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
        const legendCard = el('div', '', 'legend-card'),
          sample = el('div', '', 'legend-sample');
        const example = item.example;
        legendCard.dataset.legendKind = item.key;
        legendCard.dataset.legendExample = example.id || example.from;
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
          legendCard.dataset.legendFrom = example.from;
          legendCard.dataset.legendTo = example.to;
          connection.append(
            el('span', title(example.from), 'legend-endpoint'),
            line,
            el('span', title(example.to), 'legend-endpoint'),
          );
          sample.append(connection);
        }
        legendCard.append(
          sample,
          el('h4', item.label),
          el('p', item.description),
        );
        grid.append(legendCard);
      }
      legendBody.append(group);
    }
    if (graph.boxes.some((box) => box.responsibleRef))
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
        '示例取自当前模型；业务时间与关系基数只在模型已声明时绘制，未声明的内容不补画。',
        'legend-note',
      ),
    );
  }
  function pathOf(points) {
    return points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`,
      )
      .join(' ');
  }
  function round(value) {
    return Math.round(value * 100) / 100;
  }
  function draw() {
    graph = businessGraphOf(DATA);
    drawLegend();
    viewport.replaceChildren();
    if (graph.boxes.length === 0 && graph.boundaries.length === 0) {
      viewport.append(el('p', graph.warnings.join('；') || '当前没有可绘制的业务对象。', 'muted'));
      relationDetails.replaceChildren(el('summary', '查看关系详情'), selection);
      selection.textContent = graph.warnings.join('；');
      return;
    }
    svg = element('svg', {
      viewBox: `0 0 ${graph.width} ${graph.height}`,
      role: 'group',
      'aria-label': '业务模型图',
    });
    const entries = [];
    let hovered = null,
      focused = null;
    function paintHighlight() {
      const active = focused || hovered;
      const state = businessGraphHighlight(graph, active?.target);
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
        : graph.warnings.join('；');
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
    // Frames first, then the lines, then the objects: the placement already
    // nests them, so the drawing order is all the layering that is left.
    for (const boundary of graph.boundaries) {
      const group = element('g', {
        'data-graph-boundary': boundary.id,
        'data-boundary-kind': boundary.kind,
        'data-boundary-parent': boundary.parent || '',
        [boundary.group === 'context'
          ? 'data-graph-context'
          : 'data-graph-fulfillment']: boundary.id,
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
      // A band is drawn tight around its objects, so its title sits above the
      // frame and names only the boundary kind: the request inside already
      // carries the name, and a second copy would run over the Context title.
      const band = boundary.group === 'fulfillment';
      const label = element(
        'text',
        {
          x: band ? boundary.x + boundary.width - 4 : boundary.x + 16,
          y: band ? boundary.y - 8 : boundary.y + 25,
          'text-anchor': band ? 'end' : 'start',
          class: `graph-boundary-label${band ? ' graph-band-label' : ''}`,
        },
        band ? kind : `${kind} · ${boundary.label}`,
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
    const edgeLayer = element('g', { class: 'graph-edges' });
    svg.append(edgeLayer);
    function cardinalityLabel(chart, value, point, next) {
      const horizontal = Math.abs(next.x - point.x) >= Math.abs(next.y - point.y);
      const forward = horizontal ? next.x > point.x : next.y > point.y;
      const text = element(
        'text',
        {
          x: horizontal ? point.x + (forward ? 6 : -6) : point.x + 8,
          y: horizontal ? point.y - 8 : point.y + (forward ? 14 : -8),
          'text-anchor': horizontal ? (forward ? 'start' : 'end') : 'start',
          'data-cardinality-for': chart,
          class: 'graph-cardinality',
        },
        graphCardinality(value),
      );
      return text;
    }
    function drawEdge(edge) {
      const points = edge.points || [];
      if (points.length < 2) return;
      const group = element('g', {
        class: 'graph-edge',
        'data-highlight-edge': businessGraphEdgeKey(edge),
        'data-graph-edge': edge.id,
        'data-kind': edge.kind,
        'data-cross-boundary': String(edge.crossBoundary),
      });
      const label = businessGraphKinds[edge.kind] || edge.kind;
      const full = `${title(edge.from)} — ${title(edge.to)}：${edge.label}（${label}）`;
      const d = pathOf(points);
      const attrs = { d, stroke: '#4b5e75', class: 'graph-line' };
      if (edge.dashed) attrs['stroke-dasharray'] = '5 4';
      if (edge.arrow) attrs['marker-end'] = 'url(#graph-arrow)';
      group.append(
        element('title', {}, full),
        element('path', attrs),
        element('path', { d, class: 'graph-hit' }),
      );
      if (edge.sourceCardinality !== undefined)
        group.append(
          cardinalityLabel(
            edge.sourceRef,
            edge.sourceCardinality,
            points[0],
            points[1],
          ),
        );
      if (edge.targetCardinality !== undefined)
        group.append(
          cardinalityLabel(
            edge.targetRef,
            edge.targetCardinality,
            points[points.length - 1],
            points[points.length - 2],
          ),
        );
      interactive(group, full, () => select(edge.id));
      bindHighlight(group, { type: 'edge', id: businessGraphEdgeKey(edge) }, full);
      edgeLayer.append(group);
    }
    graph.edges.forEach(drawEdge);
    for (const box of graph.boxes) {
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
      content.append(
        element(
          'text',
          { x: 0, y: 0, class: 'graph-type', 'text-anchor': 'middle' },
          `<${graphTypeLabel(box)}>`,
        ),
      );
      const labelLines = textLines(
        content,
        box.label,
        0,
        20,
        'graph-node-label',
      );
      box.timeFields.forEach((name, i) =>
        content.append(
          element(
            'text',
            {
              x: 0,
              y: 20 + Math.max(0, labelLines - 1) * 19 + 18 + i * 16,
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
            x: box.x + box.width / 2 - 56,
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
    const centreContent = () => {
      for (const node of svg.querySelectorAll(
        '[data-graph-node],[data-responsibility]',
      )) {
        const frame = node.querySelector('rect').getBBox();
        const content =
          node.querySelector('.graph-node-content') ||
          node.querySelector('text');
        if (!content) continue;
        const bounds = content.getBBox();
        content.setAttribute(
          'transform',
          `translate(${frame.x + frame.width / 2 - bounds.x - bounds.width / 2} ${frame.y + frame.height / 2 - bounds.y - bounds.height / 2})`,
        );
      }
    };
    centreContent();
    // A bbox read in the task that inserted the subtree can still report the
    // metrics of a wrapped line before its last line was laid out, which leaves a
    // two-line label a pixel or two low. Re-centring on the next task measures
    // the settled text; the first pass keeps the initial paint already close.
    setTimeout(() => {
      if (svg.isConnected) centreContent();
    }, 0);
    setZoom(
      businessGraphState.zoom ??
        Math.min(1, (viewport.clientWidth - 4) / graph.width),
    );
    viewport.scrollTo(businessGraphState.left, businessGraphState.top);
    selection.textContent = graph.warnings.join('；');
    relationDetails.replaceChildren(el('summary', '查看关系详情'), selection);
    relationDetails.append(
      table(
        ['起点', '关系', '终点'],
        graph.relations.map((e) => [
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

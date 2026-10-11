'use strict';

function readData() {
  try {
    return JSON.parse(document.getElementById('workbench-data').textContent);
  } catch (error) {
    document.getElementById('notice').textContent =
      '工作台数据无法读取，请重新生成。';
    throw error;
  }
}
const DATA = readData();
const nodes = new Map(DATA.nodes.map((node) => [node.id, node]));
const $ = (id) => document.getElementById(id);
const groups = {
  context: '业务边界',
  fulfillment: '权责履约',
  evidence: '业务凭证',
  participant: '参与者与标的',
  role: '业务角色',
  rule: '业务规则',
  attribute: '业务属性',
  relationship: '业务关系',
  scenario: '验证场景',
  instance: '场景凭证',
  capability: '接口能力',
  resource: '接口资源',
  representation: '响应表示',
  binding: '实例绑定',
  journey: '调用流程',
  pattern: '业务模式',
};
const kinds = {
  contract: '合同',
  fulfillment: '权责履约',
  domain: '领域',
  pre_contract: '合同前',
  fulfillment_request: '请求',
  fulfillment_confirmation: '确认',
  other_evidence: '补充凭证',
  party: '主体',
  thing: '标的',
  evidence: '证明角色',
  completion: '完成条件',
  breach: '违约条件',
  derivation: '派生计算',
  precondition: '前置条件',
  invariant: '不变量',
};
let current = '';
let focusedRequestRule = '';
const history = [];
const outgoing = new Map(),
  incoming = new Map();
for (const edge of DATA.edges) {
  if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
  if (!incoming.has(edge.to)) incoming.set(edge.to, []);
  outgoing.get(edge.from).push(edge);
  incoming.get(edge.to).push(edge);
}
function el(tag, value = '', cls = '') {
  const item = document.createElement(tag);
  item.textContent = value == null ? '—' : String(value);
  if (cls) item.className = cls;
  return item;
}
function action(label, callback, cls = '') {
  const item = el('button', label, cls);
  item.type = 'button';
  item.addEventListener('click', callback);
  return item;
}
function title(id) {
  const source = nodes.get(id);
  const node = isDerivation(source) ? derivationTarget(source) : source;
  if (node?.group === 'attribute')
    return `${nodes.get(node.parent)?.label || node.parent} · ${node.label}`;
  return node?.label || id;
}
function typeLabel(node) {
  if (node.group === 'role' && node.kind === 'party') return '责任角色';
  if (node.group === 'context' && node.kind === 'contract') return '合同边界';
  if (node.group === 'evidence' && node.kind === 'contract') return '合同凭证';
  return kinds[node.kind] || groups[node.group] || node.kind;
}
function link(id, label = title(id)) {
  if (!nodes.has(id)) return el('span', `${label} · 未解析`, 'missing');
  const item = action(label, () => select(id), 'object-link');
  item.dataset.ref = id;
  item.title = id;
  return item;
}
function card(heading, target = $('detail')) {
  const section = el('section', '', 'card');
  section.append(el('h2', heading));
  target.append(section);
  return section;
}
function table(headers, rows) {
  const wrapper = el('div', '', 'table-wrap'),
    result = el('table');
  const head = el('thead'),
    row = el('tr');
  headers.forEach((value) => row.append(el('th', value)));
  head.append(row);
  result.append(head);
  const body = el('tbody');
  for (const values of rows) {
    const tr = el('tr');
    for (const value of values) {
      const td = el('td');
      td.append(value instanceof Node ? value : el('span', format(value)));
      tr.append(td);
    }
    body.append(tr);
  }
  result.append(body);
  wrapper.append(result);
  return wrapper;
}
function verdict(value, yes, no, unknown) {
  if (value === true) return yes;
  if (value === false) return no;
  return unknown;
}
function format(value) {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function list(ids, empty = '未声明', target = $('detail')) {
  const box = el('div', '', 'link-list');
  if (!ids.length) box.append(el('p', empty, 'muted'));
  ids.forEach((id) => box.append(link(id)));
  target.append(box);
}
function isContainer(node) {
  return ['context', 'fulfillment'].includes(node?.group);
}
function isDerivation(node) {
  return node?.group === 'rule' && node.kind === 'derivation';
}
function derivationTarget(node) {
  const result = (outgoing.get(node.id) || []).find(
    (edge) =>
      edge.label === '计算结果' && nodes.get(edge.to)?.group === 'attribute',
  );
  return nodes.get(result?.to);
}
function requestRuleTarget(node) {
  if (node?.group !== 'rule' || !['completion', 'breach'].includes(node.kind))
    return undefined;
  const requests = [...new Set((node.bindings || []).map((b) => b.ref))]
    .map((id) => nodes.get(id))
    .filter(
      (n) =>
        n?.group === 'evidence' &&
        n.kind === 'fulfillment_request' &&
        n.fulfillmentRef &&
        n.fulfillmentRef === node.fulfillmentRef,
    );
  return requests.length === 1 ? requests[0] : undefined;
}
function buildTree() {
  const query = $('search').value.trim().toLocaleLowerCase();
  $('tree').replaceChildren();
  if (query) {
    const matches = DATA.nodes
      .filter((node) =>
        `${JSON.stringify(node)} ${node.group === 'attribute' ? nodes.get(node.parent)?.label || '' : ''}`
          .toLocaleLowerCase()
          .includes(query),
      )
      .map((node) =>
        isDerivation(node)
          ? derivationTarget(node)
          : requestRuleTarget(node) || node,
      )
      .filter(Boolean);
    const hits = [...new Map(matches.map((node) => [node.id, node])).values()];
    $('tree').append(el('p', `${hits.length} 个搜索结果`, 'tree-count'));
    hits.forEach((node) => $('tree').append(treeButton(node)));
    markSelected();
    return;
  }
  function section(key, label, count) {
    const details = el('details', '', 'tree-group');
    details.dataset.navigation = key;
    details.open = key === 'business';
    details.append(el('summary', `${label} · ${count}`));
    $('tree').append(details);
    return details;
  }
  const businessGroups = new Set([
    'context',
    'fulfillment',
    'evidence',
    'participant',
    'role',
    'rule',
    'pattern',
  ]);
  const business = DATA.nodes.filter(
    (n) =>
      businessGroups.has(n.group) && !isDerivation(n) && !requestRuleTarget(n),
  );
  const visited = new Set();
  function branch(node) {
    visited.add(node.id);
    const children = business.filter(
      (n) => n.parent === node.id && !visited.has(n.id),
    );
    if (!children.length && !isContainer(node)) return treeButton(node);
    const details = el('details');
    const summary = el('summary', node.label);
    details.append(summary);
    if (isContainer(node)) {
      details.dataset.containerGroup = node.id;
      details.dataset[
        node.group === 'context' ? 'contextGroup' : 'fulfillmentGroup'
      ] = node.id;
      summary.dataset.container = node.id;
      summary.title = `${typeLabel(node)} · ${node.id}`;
      if (!children.length)
        details.append(
          el(
            'p',
            `此${node.group === 'fulfillment' ? '履约' : '上下文'}暂无对象`,
            'muted',
          ),
        );
    } else details.append(treeButton(node));
    children.forEach((child) => {
      if (!visited.has(child.id)) details.append(branch(child));
    });
    return details;
  }
  const structure = section(
    'business',
    '业务结构',
    business.filter((n) => !isContainer(n)).length,
  );
  business
    .filter((n) => !businessGroups.has(nodes.get(n.parent)?.group))
    .forEach((n) => structure.append(branch(n)));
  // Keep independent objects and malformed cyclic components accessible once.
  business.forEach((n) => {
    if (!visited.has(n.id)) structure.append(branch(n));
  });
  if (!business.length) structure.append(el('p', '尚无业务对象', 'muted'));

  const scenarios = DATA.nodes.filter((n) => n.group === 'scenario');
  const scenarioSection = section('scenarios', '验证场景', scenarios.length);
  scenarios.forEach((n) => scenarioSection.append(treeButton(n)));
  if (!scenarios.length)
    scenarioSection.append(el('p', '尚无验证场景', 'muted'));

  const apiGroups = ['capability', 'resource', 'journey'];
  const api = DATA.nodes.filter((n) => apiGroups.includes(n.group));
  const apiSection = section('api', 'API', api.length);
  for (const group of apiGroups) {
    const values = api.filter((n) => n.group === group);
    if (!values.length) continue;
    const details = el('details');
    details.dataset.apiGroup = group;
    details.append(el('summary', `${groups[group]} · ${values.length}`));
    values.forEach((n) => details.append(treeButton(n)));
    apiSection.append(details);
  }
  if (!api.length) apiSection.append(el('p', '尚无 API 设计', 'muted'));
  markSelected();
}
function treeButton(node) {
  if (isContainer(node)) {
    const locator = action(
      `${node.label} · 定位${node.group === 'fulfillment' ? '履约' : '上下文'}`,
      () => revealContainer(node.id),
      'tree-item',
    );
    locator.dataset.containerLocator = node.id;
    return locator;
  }
  const button = action('', () => select(node.id), 'tree-item');
  button.dataset.node = node.id;
  if (node.group === 'attribute') {
    button.classList.add('attribute-result');
    button.append(
      el('span', node.label),
      el(
        'small',
        `${nodes.get(node.parent)?.label || '所属对象未解析'} · ${node.parent}`,
      ),
    );
  } else button.append(el('span', node.label), el('small', typeLabel(node)));
  return button;
}
function revealContainer(id) {
  if (!isContainer(nodes.get(id))) return;
  if ($('search').value) {
    $('search').value = '';
    buildTree();
  }
  const summary = [...document.querySelectorAll('#tree [data-container]')].find(
    (n) => n.dataset.container === id,
  );
  if (!summary) return;
  let parent = summary.parentElement;
  while (parent && parent !== $('tree')) {
    if (parent.tagName === 'DETAILS') parent.open = true;
    parent = parent.parentElement;
  }
  summary.focus({ preventScroll: true });
  summary.scrollIntoView({ block: 'nearest' });
}
function markSelected() {
  const buttons = [...document.querySelectorAll('[data-node]')];
  const selectedId =
    nodes.get(current)?.group === 'attribute' &&
    !buttons.some((button) => button.dataset.node === current)
      ? nodes.get(current).parent
      : current;
  buttons.forEach((button) => {
    const selected = button.dataset.node === selectedId;
    button.classList.toggle('selected', selected);
    if (selected) {
      button.setAttribute('aria-current', 'true');
      let parent = button.parentElement;
      while (parent && parent !== $('tree')) {
        if (parent.tagName === 'DETAILS') parent.open = true;
        parent = parent.parentElement;
      }
    } else button.removeAttribute('aria-current');
  });
}
function overview() {
  const detail = $('detail');
  detail.replaceChildren();
  detail.append(
    el('p', 'BUSINESS MODEL / EXPLORE', 'eyebrow'),
    el('h1', DATA.title),
    el(
      'p',
      '从一项责任、一份凭证或一个操作开始，理解它依赖什么，以及被谁使用。',
      'intro',
    ),
  );
  const stats = el('div', '', 'stats');
  for (const [key, label] of [
    ['contracts', '合同边界'],
    ['entities', '业务对象'],
    ['rules', '业务规则'],
    ['scenarios', '验证场景'],
    ['capabilities', '接口能力'],
  ]) {
    const item = el('div');
    const count =
      key === 'entities'
        ? DATA.nodes.filter((n) =>
            ['evidence', 'participant', 'role'].includes(n.group),
          ).length
        : DATA.counts[key];
    item.append(el('strong', count), el('span', label));
    stats.append(item);
  }
  detail.append(stats);
  globalThis.renderBusinessGraph(detail);
  const validation = DATA.validation || {};
  const checks = card('检查边界');
  checks.append(
    table(
      ['检查', '结果'],
      [
        ['FM 静态检查', validation.fm === true ? '通过' : '未执行'],
        [
          '场景模拟',
          verdict(validation.simulation, '通过', '未通过', '未执行 / 不适用'),
        ],
        ['API 静态设计', verdict(validation.api, '完整', '不完整', '不适用')],
        ['服务运行验证', '未执行'],
        ['未确定的业务时间顺序', validation.unresolvedOrderCount || 0],
        ['未解析的展示引用', DATA.unresolved.length],
      ],
    ),
  );
  checks.append(
    el(
      'p',
      '通过仅表示本次机器检查结果，不代表业务批准、权限生效或服务已经运行。',
      'muted',
    ),
  );
  if (DATA.unresolved.length) list(DATA.unresolved, '', checks);
}
function bindingFact(binding) {
  return binding.ref
    ? link(binding.ref)
    : el('span', `运行时输入 · ${binding.type || '未声明类型'}`);
}
function renderRuleDetails(rule, cls = 'field-rule-details') {
  const details = el('details', '', cls);
  details.append(
    el('summary', '表达式与变量说明'),
    el('pre', rule.expression || '未声明表达式'),
  );
  const inputs = el('div', '', 'field-rule-inputs');
  for (const binding of rule.bindings || []) {
    const fact = el('div');
    fact.dataset.binding = binding.alias;
    fact.append(el('code', `${binding.alias} = `), bindingFact(binding));
    if (binding.ref)
      fact.append(
        el('small', binding.cardinality === 'many' ? ' · 集合' : ' · 单个'),
      );
    inputs.append(fact);
  }
  if (!inputs.childElementCount)
    inputs.append(el('p', '未声明输入绑定', 'muted'));
  details.append(inputs);
  return details;
}
function renderRequestConditions(request) {
  for (const kind of ['completion', 'breach']) {
    const rules = DATA.nodes.filter(
      (n) => n.kind === kind && requestRuleTarget(n)?.id === request.id,
    );
    const section = card(kinds[kind]);
    if (!rules.length) section.append(el('p', `未声明${kinds[kind]}`, 'muted'));
    for (const rule of rules) {
      const box = el('div', '', 'request-rule');
      box.dataset.requestRule = rule.id;
      box.tabIndex = -1;
      if (rule.id === focusedRequestRule)
        box.classList.add('request-rule-selected');
      box.append(
        el('h3', rule.label),
        el('small', rule.id, 'identity'),
        el('p', rule.description || '未声明业务解释'),
        renderRuleDetails(rule, 'request-rule-details'),
      );
      section.append(box);
    }
    const outcome = el('div', '', 'request-outcome');
    outcome.dataset.requestOutcome = kind;
    section.append(outcome);
    if (kind === 'breach') {
      outcome.append(
        el('h3', '违约后的凭证'),
        el(
          'p',
          '未声明。当前模型未声明违约条件到后续凭证的流转；规则读取的事实不代表后续流转，也不表示没有后续责任。',
          'muted',
        ),
      );
      continue;
    }
    outcome.append(el('h3', '对应完成凭证'));
    const relations = DATA.nodes.filter((n) => n.group === 'relationship');
    const confirmations = [
      ...new Set(
        relations
          .filter(
            (r) =>
              r.kind === 'references' &&
              r.targetRef === request.id &&
              nodes.get(r.sourceRef)?.contextRef === request.contextRef &&
              nodes.get(r.sourceRef)?.kind === 'fulfillment_confirmation',
          )
          .map((r) => r.sourceRef),
      ),
    ];
    if (confirmations.length) list(confirmations, '', outcome);
    else {
      const bound = new Set(
        rules.flatMap((r) => (r.bindings || []).map((b) => b.ref)),
      );
      const roles = [
        ...new Set(
          relations
            .filter(
              (r) =>
                r.kind === 'references' &&
                r.sourceRef === request.id &&
                bound.has(r.targetRef) &&
                nodes.get(r.targetRef)?.group === 'role' &&
                nodes.get(r.targetRef)?.kind === 'evidence',
            )
            .map((r) => r.targetRef),
        ),
      ];
      if (!roles.length)
        outcome.append(el('p', '未声明对应确认凭证或采信证明角色', 'muted'));
      for (const role of roles) {
        outcome.append(link(role));
        outcome.append(el('p', '可提供该证明的实际凭证', 'muted'));
        const players = [
          ...new Set(
            relations
              .filter(
                (r) =>
                  r.kind === 'plays_role' &&
                  r.targetRef === role &&
                  nodes.get(r.sourceRef)?.group === 'evidence',
              )
              .map((r) => r.sourceRef),
          ),
        ];
        list(players, '未声明实际凭证玩家', outcome);
      }
    }
    outcome.append(
      el(
        'p',
        '上述凭证是完成判断的依据，不表示条件成立后自动生成凭证或进入下一流程。',
        'muted',
      ),
    );
  }
}
function renderFieldDerivation(attribute) {
  const rules = (outgoing.get(attribute.id) || []).filter(
    (edge) => edge.label === '由规则计算',
  );
  if (!rules.length) return el('span', '未声明派生规则', 'muted');
  const box = el('div', '', 'field-computation');
  for (const edge of rules) {
    const rule = nodes.get(edge.to);
    const calculation = el('div', '', 'field-rule');
    calculation.dataset.fieldRule = edge.to;
    if (rule?.group !== 'rule' || rule.kind !== 'derivation') {
      calculation.append(el('p', `派生规则未解析：${edge.to}`, 'missing'));
    } else {
      calculation.append(
        el('p', rule.description || '未声明业务解释', 'field-rule-description'),
      );
      calculation.append(renderRuleDetails(rule));
    }
    box.append(calculation);
  }
  return box;
}
function renderBusinessObject(node) {
  $('detail').append(el('h1', node.label), el('p', node.id, 'identity'));
  const context = card('所属上下文');
  let parent = nodes.get(node.parent);
  const seen = new Set([node.id]);
  while (parent && !seen.has(parent.id) && parent.group !== 'context') {
    seen.add(parent.id);
    parent = nodes.get(parent.parent);
  }
  if (parent?.group === 'context' && !seen.has(parent.id))
    context.append(link(parent.id));
  else
    context.append(
      el('p', node.parent ? '所属上下文未解析' : '未声明所属上下文', 'muted'),
    );

  const section = card('业务属性');
  const attributes = DATA.nodes.filter(
    (n) => n.parent === node.id && n.group === 'attribute',
  );
  if (!attributes.length) {
    section.append(el('p', '尚未声明业务属性', 'muted'));
    return;
  }
  const grid = table(
    ['属性', '类型', '必填', '含义', '关键数据', '派生计算'],
    attributes.map((a) => {
      const name = el('div');
      name.append(link(a.id, a.label), el('small', a.name, 'attribute-name'));
      return [
        name,
        a.valueType,
        a.required ? '是' : '否',
        a.meaning,
        a.keyData,
        renderFieldDerivation(a),
      ];
    }),
  );
  grid.querySelectorAll('tbody tr').forEach((row, index) => {
    row.dataset.attribute = attributes[index].id;
    row.tabIndex = -1;
    if (attributes[index].id === current) {
      row.classList.add('attribute-selected');
      row.setAttribute('aria-label', `已定位属性：${attributes[index].label}`);
    }
  });
  section.append(grid);
}
function renderNode(node) {
  const detail = $('detail');
  detail.replaceChildren();
  if (['evidence', 'participant', 'role'].includes(node.group)) {
    renderBusinessObject(node);
    if (node.kind === 'fulfillment_request') renderRequestConditions(node);
    return;
  }
  detail.append(
    el('p', groups[node.group], 'eyebrow'),
    el('h1', node.label),
    el('p', node.id, 'identity'),
    el('span', typeLabel(node), `badge ${node.group}`),
  );
  if (node.description || node.meaning)
    detail.append(el('p', node.description || node.meaning, 'intro'));
  if (node.group === 'rule' && ['completion', 'breach'].includes(node.kind))
    detail.append(
      el(
        'p',
        '未能从绑定和履约归属唯一定位请求，保留规则供核对，不猜测所属 Request。',
        'missing',
      ),
    );
  if (node.parent) {
    const owner = card('所属对象');
    owner.append(link(node.parent));
  }
  if (node.bindings)
    card('规则读取的事实').append(
      table(
        ['绑定', '业务对象', '数量'],
        node.bindings.map((b) => [
          b.alias,
          bindingFact(b),
          b.cardinality || '单个',
        ]),
      ),
    );
  if (node.expression) {
    const section = card('判断表达式 · CEL');
    section.append(el('pre', node.expression));
    section.append(
      el('p', '只展示正式表达式，浏览器不执行第二套业务规则。', 'muted'),
    );
  }
  if (node.group === 'relationship')
    card('关系语义').append(
      table(
        ['起点', '关系', '终点', '起点基数', '终点基数'],
        [
          [
            link(node.sourceRef),
            node.label,
            link(node.targetRef),
            node.sourceCardinality,
            node.targetCardinality,
          ],
        ],
      ),
    );
  if (node.values)
    card('凭证实例值').append(
      table(['字段', '值'], Object.entries(node.values)),
    );
  if (node.group === 'scenario') renderScenario(node);
  if (node.group === 'journey') {
    const steps = card('HTTP 调用顺序 · 静态设计');
    steps.append(
      table(
        ['步骤', '接口能力', '预期状态'],
        node.steps.map((s, i) => [
          i + 1,
          s.capabilityRef ? link(s.capabilityRef) : s.status,
          s.expectStatus,
        ]),
      ),
    );
  }
  if (node.method)
    card('HTTP 契约').append(
      el('pre', `${node.method} ${node.uri}`),
      el(
        'p',
        `幂等：${node.idempotency || '未声明'} · 并发：${node.concurrency || '未声明'}`,
      ),
    );
  if (node.fields?.length)
    card('字段映射').append(
      table(
        ['字段', '类型', '必填', '业务属性'],
        node.fields.map((f) => [
          f.name,
          f.valueType,
          f.required ? '是' : '否',
          f.fmAttributeRef ? link(f.fmAttributeRef) : '协议字段',
        ]),
      ),
    );
  if (node.responses?.length)
    card('响应').append(
      table(
        ['状态码', '含义', '响应表示'],
        node.responses.map((r) => [
          r.status,
          r.description,
          r.representationRef ? link(r.representationRef) : '—',
        ]),
      ),
    );
  renderReferences(node);
}
function renderScenario(node) {
  const summary = card('场景判断');
  summary.append(
    el(
      'p',
      `固定观察时刻：${node.asOf} · ${verdict(node.passed, '预期匹配', '预期不匹配', '未执行')}`,
    ),
  );
  summary.append(
    el(
      'p',
      '场景数据用于模拟；false 可以是正确的反例结果，不等于检查失败。',
      'muted',
    ),
  );
  card('单据推演顺序 · 不代表实际时长').append(
    table(
      ['步骤', '参与角色', '形成凭证', '当时可用凭证'],
      node.steps.map((s) => {
        const available = el('div');
        list(s.availableInstanceRefs || [], '无', available);
        return [
          s.sequence,
          link(s.actingRoleRef),
          link(s.issueInstanceRef),
          available,
        ];
      }),
    ),
  );
  card('规则预期与实际').append(
    table(
      ['规则', '预期', '实际', '匹配'],
      node.evaluations.map((e) => [
        link(e.ruleRef),
        e.expected,
        e.actual,
        verdict(e.passed, '通过', '失败', '未执行'),
      ]),
    ),
  );
  if (node.statuses.length)
    card('履约结果').append(
      table(
        ['履约', '请求', '预期', '实际'],
        node.statuses.map((s) => [
          link(s.fulfillmentRef),
          link(s.requestInstanceRef),
          s.expectedStatus,
          s.status,
        ]),
      ),
    );
  if (node.events.length)
    card('业务时间 · 保留区间与时刻').append(
      table(
        ['凭证', '开始', '截止', '实际时刻'],
        node.events.map((e) => [
          link(e.instanceRef),
          e.values.started_at,
          e.values.expired_at,
          e.values.confirmed_at || e.values.signed_at || e.values.created_at,
        ]),
      ),
    );
}
function renderReferences(
  node,
  target = $('detail'),
  heading = '局部引用关系',
) {
  const section = card(heading, target);
  section.append(
    el('p', '连线表示已声明的引用；不是统一的执行顺序。', 'muted'),
  );
  const columns = el('div', '', 'reference-grid');
  for (const [heading, values, key] of [
    ['依赖与关联', outgoing.get(node.id) || [], 'to'],
    ['被谁使用', incoming.get(node.id) || [], 'from'],
  ]) {
    const side = el('section');
    side.append(el('h3', heading));
    if (!values.length) side.append(el('p', '没有声明的引用', 'muted'));
    for (const edge of values) {
      const row = el('div', '', 'reference-row');
      row.append(el('small', edge.label), link(edge[key]));
      side.append(row);
    }
    columns.append(side);
  }
  section.append(columns);
}
function select(id, remember = true) {
  if (id && !nodes.has(id)) return;
  const requestTarget = requestRuleTarget(nodes.get(id));
  const requestRuleId = requestTarget ? id : '';
  if (requestTarget) id = requestTarget.id;
  if (isDerivation(nodes.get(id))) {
    const target = derivationTarget(nodes.get(id));
    if (!target) {
      $('notice').textContent = `派生规则目标字段未解析：${id}`;
      return;
    }
    id = target.id;
  }
  if (isContainer(nodes.get(id))) {
    revealContainer(id);
    return;
  }
  if (remember && (id !== current || requestRuleId !== focusedRequestRule))
    history.push(focusedRequestRule || current);
  current = id;
  focusedRequestRule = requestRuleId;
  $('back').disabled = history.length === 0;
  $('copy').hidden = !id;
  $('breadcrumbs').replaceChildren(action('模型', () => select('')));
  if (id) {
    const node = nodes.get(id),
      ancestors = [],
      visited = new Set([id]);
    let parent = nodes.get(node.parent);
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      ancestors.unshift(parent);
      parent = nodes.get(parent.parent);
    }
    ancestors.forEach((n) =>
      $('breadcrumbs').append(el('span', '/'), link(n.id)),
    );
    $('breadcrumbs').append(el('span', '/'), el('span', node.label));
    if (focusedRequestRule)
      $('breadcrumbs').append(
        el('span', '/'),
        el('span', title(focusedRequestRule)),
      );
    renderNode(node.group === 'attribute' ? nodes.get(node.parent) : node);
  } else overview();
  markSelected();
  document
    .querySelector('#tree [aria-current="true"]')
    ?.scrollIntoView({ block: 'nearest' });
  $('main').scrollTop = 0;
  const attribute = document.querySelector('.attribute-selected');
  if (attribute) {
    attribute.focus({ preventScroll: true });
    attribute.scrollIntoView({ block: 'center', inline: 'nearest' });
  } else if (focusedRequestRule) {
    const rule = [...document.querySelectorAll('[data-request-rule]')].find(
      (n) => n.dataset.requestRule === focusedRequestRule,
    );
    rule?.focus({ preventScroll: true });
    rule?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
}
$('search').addEventListener('input', buildTree);
$('reset').addEventListener('click', () => {
  $('search').value = '';
  buildTree();
});
$('expand').addEventListener('click', () =>
  document.querySelectorAll('#tree details').forEach((d) => {
    d.open = true;
  }),
);
$('collapse').addEventListener('click', () =>
  document.querySelectorAll('#tree details').forEach((d) => {
    d.open = false;
  }),
);
$('home').addEventListener('click', () => select(''));
$('back').addEventListener('click', () => {
  if (history.length) select(history.pop(), false);
});
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(current);
    $('notice').textContent = '已复制对象 ID';
  } catch {
    $('notice').textContent = `对象 ID：${current}`;
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('search').focus();
  }
  if (event.key === 'Escape') {
    $('search').value = '';
    buildTree();
  }
});
try {
  buildTree();
  select('', false);
  $('notice').textContent =
    `只读快照 · ${DATA.generatedAt || '生成时间未提供'} · 服务运行未验证`;
  document.body.dataset.ready = 'true';
} catch (error) {
  $('notice').textContent = `工作台加载失败：${error.message}`;
  throw error;
}

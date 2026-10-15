import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const template = await readFile(
  new URL('../assets/workbench.html', import.meta.url),
  'utf8',
);
const script = await readFile(
  new URL('../assets/workbench.js', import.meta.url),
  'utf8',
);

function fixture() {
  return {
    title: '请求条件测试',
    counts: {},
    validation: {},
    unresolved: [],
    nodes: [
      { id: 'context.a', group: 'context', kind: 'contract', label: '约定' },
      {
        id: 'fulfillment.a',
        group: 'fulfillment',
        parent: 'context.a',
        label: '退款',
      },
      {
        id: 'request.a',
        group: 'evidence',
        kind: 'fulfillment_request',
        parent: 'fulfillment.a',
        fulfillmentRef: 'fulfillment.a',
        contextRef: 'context.a',
        label: '退款请求',
      },
      {
        id: 'request.b',
        group: 'evidence',
        kind: 'fulfillment_request',
        parent: 'fulfillment.a',
        fulfillmentRef: 'fulfillment.a',
        label: '另一请求',
      },
      {
        id: 'confirmation.a',
        contextRef: 'context.a',
        group: 'evidence',
        kind: 'fulfillment_confirmation',
        label: '退款到账凭证',
      },
      {
        id: 'confirmation.old',
        group: 'evidence',
        kind: 'fulfillment_confirmation',
        label: '先前付款凭证',
      },
      {
        id: 'rule.completed',
        group: 'rule',
        kind: 'completion',
        parent: 'fulfillment.a',
        fulfillmentRef: 'fulfillment.a',
        label: '退款完成',
        description: '本次退款在期限内全额到账。',
        expression: 'confirmations.exists(c, c.settled)',
        bindings: [
          { alias: 'claim', ref: 'request.a' },
          {
            alias: 'confirmations',
            ref: 'confirmation.a',
            cardinality: 'many',
          },
        ],
      },
      {
        id: 'rule.breached',
        group: 'rule',
        kind: 'breach',
        parent: 'fulfillment.a',
        fulfillmentRef: 'fulfillment.a',
        label: '退款逾期',
        description: '超过期限仍未按约到账。',
        expression: 'now > claim.expired_at',
        bindings: [
          { alias: 'claim', ref: 'request.a' },
          { alias: 'now', type: 'timestamp' },
          { alias: 'old', ref: 'confirmation.old' },
        ],
      },
      {
        id: 'relation.result',
        group: 'relationship',
        kind: 'references',
        sourceRef: 'confirmation.a',
        targetRef: 'request.a',
      },
      { id: 'capability.a', group: 'capability', label: '登记退款' },
    ],
    edges: [{ from: 'capability.a', to: 'rule.completed', label: '应用规则' }],
  };
}

function open(data = fixture()) {
  const dom = new JSDOM(template.replace('@@DATA@@', JSON.stringify(data)), {
    runScripts: 'outside-only',
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;
  dom.window.renderBusinessGraph = () => undefined;
  const context = dom.getInternalVMContext();
  runInContext(script, context);
  return {
    document: dom.window.document,
    run: (source) => runInContext(source, context),
    close: () => dom.window.close(),
  };
}

test('Unwrapped endpoints remain under their contract without a fabricated fulfillment', () => {
  const data = fixture();
  data.nodes = data.nodes.filter((n) =>
    ['context.a', 'request.a', 'confirmation.a', 'relation.result'].includes(
      n.id,
    ),
  );
  for (const node of data.nodes.filter((n) => n.group === 'evidence')) {
    delete node.fulfillmentRef;
    node.parent = 'context.a';
  }
  const page = open(data);
  try {
    assert.equal(
      page.document.querySelectorAll('[data-fulfillment-group]').length,
      0,
    );
    assert.ok(page.document.querySelector('#tree [data-node="request.a"]'));
    page.run('select("request.a")');
    assert.ok(
      page.document.querySelector(
        '[data-request-outcome="completion"] [data-ref="confirmation.a"]',
      ),
    );
    assert.ok(
      page.document
        .getElementById('detail')
        .textContent.includes('未声明完成条件'),
    );
  } finally {
    page.close();
  }
});

test('Wrapped result endpoints are visible before completion rules or support references exist', () => {
  for (const group of ['evidence', 'role']) {
    const data = fixture();
    data.nodes = data.nodes.filter(
      (n) => !['rule', 'relationship'].includes(n.group),
    );
    data.nodes.push({
      id: 'result.owned',
      group,
      kind: group === 'role' ? 'evidence' : 'fulfillment_confirmation',
      label: '交付结果',
      fulfillmentRef: 'fulfillment.a',
      contextRef: 'context.a',
      parent: 'fulfillment.a',
    });
    const page = open(data);
    try {
      page.run('select("request.a")');
      assert.ok(
        page.document.querySelector(
          '[data-request-outcome="completion"] [data-ref="result.owned"]',
        ),
      );
    } finally {
      page.close();
    }
  }
});

test('Overview separates consistency, scope completeness, gaps and unexecuted simulation', () => {
  for (const [complete, expected] of [
    [null, '未检查'],
    [false, '不完整'],
  ]) {
    const data = {
      ...fixture(),
      validation: {
        consistent: true,
        complete,
        scopeRefs: complete === null ? [] : ['context.a'],
        simulation: null,
        gaps: ['合成责任尚未完整'],
        simulationLimitations: ['领域行为未执行'],
      },
    };
    const page = open(data);
    try {
      const rows = new Map(
        [...page.document.querySelectorAll('#detail tr')]
          .map((row) =>
            [...row.querySelectorAll('td')].map((cell) => cell.textContent),
          )
          .filter((cells) => cells.length === 2),
      );
      assert.equal(rows.get('当前 FM 表达一致性'), '通过');
      assert.equal(rows.get('指定范围完整性'), expected);
      assert.equal(rows.get('检查范围内的适用场景模拟'), '未执行 / 不适用');
      const detail = page.document.querySelector('#detail').textContent;
      assert.ok(detail.includes('合成责任尚未完整'));
      assert.ok(detail.includes('领域行为未执行'));
      assert.ok(detail.includes('当前整个 FM，含未完成内容'));
      assert.doesNotMatch(
        detail,
        /合成责任尚未完整.*未解析|领域行为未执行.*未解析/,
      );
    } finally {
      page.close();
    }
  }
});

test('Request owns its conditions, expression disclosure and explicit completion evidence', () => {
  const page = open();
  try {
    page.run('select("request.a")');
    assert.deepEqual(
      [...page.document.querySelectorAll('#detail h2')].map(
        (n) => n.textContent,
      ),
      ['所属上下文', '业务属性', '完成条件', '违约条件'],
    );
    assert.deepEqual(
      [...page.document.querySelectorAll('[data-request-rule]')].map(
        (n) => n.dataset.requestRule,
      ),
      ['rule.completed', 'rule.breached'],
    );
    const rule = page.document.querySelector(
      '[data-request-rule="rule.completed"]',
    );
    assert.ok(rule.textContent.includes('本次退款在期限内全额到账。'));
    assert.equal(rule.querySelector('details').open, false);
    assert.equal(
      rule.querySelector('pre').textContent,
      'confirmations.exists(c, c.settled)',
    );
    assert.ok(
      page.document.querySelector(
        '[data-request-outcome="completion"] [data-ref="confirmation.a"]',
      ),
    );
    const breach = page.document.querySelector(
      '[data-request-outcome="breach"]',
    );
    assert.ok(breach.textContent.includes('未声明'));
    assert.equal(
      breach.querySelector('[data-ref="confirmation.old"]'),
      null,
      'A read binding is not a breach transition',
    );
    page.run('select("request.b")');
    assert.equal(
      page.document.querySelectorAll('[data-request-rule]').length,
      0,
    );
    assert.ok(
      page.document
        .getElementById('detail')
        .textContent.includes('未声明完成条件'),
    );
    assert.ok(
      page.document
        .getElementById('detail')
        .textContent.includes('未声明违约条件'),
    );
  } finally {
    page.close();
  }
});

test('Conditions have no separate tree/detail; search and API links locate Request and Back restores the condition', () => {
  const page = open();
  try {
    assert.equal(
      page.document.querySelector('#tree [data-node="rule.completed"]'),
      null,
    );
    page.run(
      'document.getElementById("search").value="rule.completed"; buildTree()',
    );
    assert.deepEqual(
      [...page.document.querySelectorAll('#tree [data-node]')].map(
        (n) => n.dataset.node,
      ),
      ['request.a'],
    );
    page.run(
      'document.getElementById("reset").click(); select("capability.a")',
    );
    page.document.querySelector('#detail [data-ref="rule.completed"]').click();
    assert.equal(page.run('current'), 'request.a');
    assert.equal(
      page.document.activeElement.dataset.requestRule,
      'rule.completed',
    );
    assert.equal(
      page.document.querySelector('#detail h1').textContent,
      '退款请求',
    );
    page.document
      .querySelector(
        '[data-request-outcome="completion"] [data-ref="confirmation.a"]',
      )
      .click();
    assert.equal(page.run('current'), 'confirmation.a');
    page.document.getElementById('back').click();
    assert.equal(page.run('current'), 'request.a');
    assert.equal(
      page.document.activeElement.dataset.requestRule,
      'rule.completed',
    );
    page.document.getElementById('back').click();
    assert.equal(page.run('current'), 'capability.a');
  } finally {
    page.close();
  }
});

test('External proof keeps its role and real players; ordinary evidence keeps two sections', () => {
  const data = fixture();
  data.nodes = data.nodes.filter((n) => n.id !== 'relation.result');
  data.nodes.push(
    {
      id: 'role.proof',
      group: 'role',
      kind: 'evidence',
      contextRef: 'context.a',
      fulfillmentRef: 'fulfillment.a',
      label: '合格付款证明',
    },
    {
      id: 'relation.use',
      group: 'relationship',
      kind: 'references',
      sourceRef: 'request.a',
      targetRef: 'role.proof',
    },
    {
      id: 'relation.play',
      group: 'relationship',
      kind: 'plays_role',
      sourceRef: 'confirmation.a',
      targetRef: 'role.proof',
    },
  );
  data.nodes
    .find((n) => n.id === 'rule.completed')
    .bindings.push({ alias: 'proofs', ref: 'role.proof', cardinality: 'many' });
  const before = JSON.stringify(data);
  const page = open(data);
  try {
    page.run('select("request.a")');
    const proof = page.document.querySelector(
      '[data-request-outcome="completion"]',
    );
    assert.ok(proof.querySelector('[data-ref="role.proof"]'));
    assert.ok(proof.querySelector('[data-ref="confirmation.a"]'));
    page.run('select("confirmation.a")');
    assert.deepEqual(
      [...page.document.querySelectorAll('#detail h2')].map(
        (n) => n.textContent,
      ),
      ['所属上下文', '业务属性'],
    );
    assert.equal(JSON.stringify(data), before);
  } finally {
    page.close();
  }
});

test('References do not turn historical evidence, unbound roles or other requests into completion proofs', () => {
  const data = fixture();
  data.nodes = data.nodes.filter((n) => n.id !== 'relation.result');
  data.nodes.push(
    {
      id: 'role.unbound',
      group: 'role',
      kind: 'evidence',
      label: '未绑定证明',
    },
    {
      id: 'role.other',
      group: 'role',
      kind: 'evidence',
      label: '其他请求证明',
    },
    { id: 'role.domain', group: 'role', kind: 'domain', label: '领域能力' },
    ...[
      ['old', 'request.a', 'confirmation.old'],
      ['unbound', 'request.a', 'role.unbound'],
      ['other', 'request.b', 'role.other'],
      ['domain', 'request.a', 'role.domain'],
    ].map(([id, sourceRef, targetRef]) => ({
      id: `relation.${id}`,
      group: 'relationship',
      kind: 'references',
      sourceRef,
      targetRef,
    })),
  );
  data.nodes
    .find((n) => n.id === 'rule.completed')
    .bindings.push(
      { alias: 'history', ref: 'confirmation.old' },
      { alias: 'support', ref: 'role.unbound' },
      { alias: 'other', ref: 'role.other' },
      { alias: 'domain', ref: 'role.domain' },
    );
  const page = open(data);
  try {
    page.run('select("request.a")');
    const outcome = page.document.querySelector(
      '[data-request-outcome="completion"]',
    );
    assert.equal(outcome.querySelectorAll('[data-ref]').length, 0);
    assert.ok(outcome.textContent.includes('未声明对应确认凭证或采信证明角色'));
  } finally {
    page.close();
  }
});

test('Unbound or ambiguous rules are not assigned by fulfillment alone; condition text is safe', () => {
  const data = fixture();
  data.nodes.find((n) => n.id === 'rule.completed').description =
    '<img src=x onerror=alert(1)>';
  data.nodes.push({
    id: 'rule.unbound',
    group: 'rule',
    kind: 'completion',
    fulfillmentRef: 'fulfillment.a',
    label: '无明确请求',
    bindings: [],
  });
  data.nodes.push({
    id: 'rule.ambiguous',
    group: 'rule',
    kind: 'breach',
    fulfillmentRef: 'fulfillment.a',
    label: '多个请求',
    bindings: [{ ref: 'request.a' }, { ref: 'request.b' }],
  });
  const page = open(data);
  try {
    page.run('select("request.a")');
    assert.equal(page.document.querySelectorAll('#detail img').length, 0);
    assert.ok(
      page.document
        .querySelector('[data-request-rule="rule.completed"]')
        .textContent.includes('<img src=x onerror=alert(1)>'),
    );
    assert.equal(
      page.document.querySelector('[data-request-rule="rule.unbound"]'),
      null,
    );
    assert.equal(
      page.document.querySelector('[data-request-rule="rule.ambiguous"]'),
      null,
    );
    assert.ok(page.document.querySelector('#tree [data-node="rule.unbound"]'));
    assert.ok(
      page.document.querySelector('#tree [data-node="rule.ambiguous"]'),
    );
  } finally {
    page.close();
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const template = await readFile(
  new URL('../../assets/workbench.html', import.meta.url),
  'utf8',
);
const script = await readFile(
  new URL('../../assets/workbench.js', import.meta.url),
  'utf8',
);
const scene = (index) => ({
  stepIndex: index,
  phaseTitle: `业务环节 ${index}`,
  narrative: `财务人员核对第 ${index} 份单据。`,
  actingRoleLabel: '财务经办人',
  targetEntityLabel: '付款申请',
  documentCard: {
    title: `付款单 ${index}`,
    fields: [
      { name: 'amount', label: '付款金额', value: `${index}00`, keyData: true },
      { name: 'ref', label: '单号', value: `PAY-${index}`, keyData: false },
    ],
    basisNotes: '声明依据：采购合同#签约',
  },
  ruleEvaluations: [],
  ...(index === 2 ? { pendingSuspense: '请问由谁确认到账？' } : {}),
});
function fixture() {
  return {
    title: '采购评审',
    counts: {},
    validation: {},
    unresolved: [],
    generatedAt: '2026-11-15T00:00:00Z',
    nodes: [
      {
        id: 'request.payment',
        label: '付款申请',
        group: 'evidence',
        kind: 'fulfillment_request',
      },
    ],
    edges: [],
    stories: [
      {
        flowId: 'payment',
        storyTitle: '标准采购付款',
        storySummary: '申请到付款',
        businessGoal: '核对付款闭环',
        scenes: [scene(1), scene(2), scene(3)],
      },
      {
        flowId: 'deposit',
        storyTitle: '定金预售',
        storySummary: '预付定金',
        businessGoal: '核对定金',
        scenes: [scene(1)],
      },
    ],
    delivery: { services: [], links: [], limitations: ['尚无跨边界调用'] },
  };
}
function open(data = fixture()) {
  const dom = new JSDOM(
    template.replace(
      '@@DATA@@',
      JSON.stringify(data).replaceAll('<', '\\u003c'),
    ),
    { runScripts: 'outside-only' },
  );
  dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;
  dom.window.renderBusinessGraph = () => undefined;
  const context = dom.getInternalVMContext();
  runInContext(script, context);
  const document = dom.window.document;
  return {
    document,
    run: (source) => runInContext(source, context),
    click: (id) => document.getElementById(id).click(),
    key: (key, target = document.body, modifiers = {}) => {
      const event = new dom.window.KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      target.dispatchEvent(event);
      return event;
    },
    text: (id) => document.getElementById(id).textContent,
    close: () => dom.window.close(),
  };
}

test('story catalog, document facts, basis, narration and closure are available offline', () => {
  const page = open();
  try {
    page.click('view-stories');
    assert.equal(page.document.body.dataset.panel, 'stories');
    assert.equal(page.document.querySelector('.layout > aside').hidden, true);
    assert.equal(
      page.document.getElementById('view-stories').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      page.document
        .getElementById('view-structure')
        .getAttribute('aria-pressed'),
      'false',
    );
    assert.equal(
      page.document.querySelector('[data-story-flow][aria-current]').dataset
        .storyFlow,
      'payment',
    );
    assert.equal(page.text('story-step'), 'Step 1/3');
    assert.equal(page.document.getElementById('story-previous').disabled, true);
    assert.equal(page.document.getElementById('story-next').disabled, false);
    const card = page.document.querySelector('.story-document');
    for (const value of [
      '付款单 1',
      '财务经办人',
      '付款申请',
      '付款金额',
      '100',
      'PAY-1',
      '采购合同#签约',
    ])
      assert.ok(card.textContent.includes(value), value);
    assert.equal(card.querySelectorAll('[data-key-data="true"]').length, 1);
    assert.match(page.text('story-stage'), /财务人员核对第 1 份单据/);
    assert.match(page.text('story-stage'), /未执行验收或规则判定/);
    assert.equal(
      page.document.querySelector('[data-story-step][aria-current]').dataset
        .storyStep,
      '0',
    );
    page.click('story-next');
    assert.equal(page.text('story-step'), 'Step 2/3');
    assert.match(
      page.document.querySelector('.story-suspense').textContent,
      /由谁确认到账/,
    );
    page.click('story-next');
    assert.equal(page.text('story-step'), 'Step 3/3');
    assert.equal(page.document.getElementById('story-next').disabled, true);
    page.click('story-previous');
    assert.equal(page.text('story-step'), 'Step 2/3');
    page.click('story-scene-0');
    assert.equal(page.text('story-step'), 'Step 1/3');
  } finally {
    page.close();
  }
});

test('each flow remembers its step, and switching views preserves model history and story data', () => {
  const page = open();
  try {
    const original = page.run('JSON.stringify(DATA)');
    page.run('select("request.payment")');
    const history = page.run('JSON.stringify(history)');
    page.click('view-stories');
    page.click('story-next');
    page.document.querySelector('[data-story-flow="deposit"]').click();
    assert.equal(page.text('story-step'), 'Step 1/1');
    assert.equal(page.document.getElementById('story-next').disabled, true);
    page.document.querySelector('[data-story-flow="payment"]').click();
    assert.equal(page.text('story-step'), 'Step 2/3');
    page.click('view-delivery');
    assert.match(page.text('detail'), /交付路由/);
    assert.match(page.text('detail'), /交付边界/);
    assert.match(page.text('detail'), /尚无跨边界调用/);
    page.key('ArrowRight');
    page.click('view-structure');
    assert.equal(page.run('current'), 'request.payment');
    assert.equal(page.document.querySelector('.layout > aside').hidden, false);
    assert.equal(page.run('JSON.stringify(history)'), history);
    assert.equal(page.document.getElementById('copy').hidden, false);
    page.click('view-stories');
    assert.equal(page.text('story-step'), 'Step 2/3');
    assert.equal(page.run('JSON.stringify(DATA)'), original);
    page.click('home');
    assert.equal(page.document.body.dataset.panel, 'structure');
    assert.equal(page.run('current'), '');
  } finally {
    page.close();
  }
});

test('arrow keys step only in the story view, clamp at both ends, and retain keyboard focus', () => {
  const page = open();
  try {
    page.click('view-stories');
    page.key('ArrowLeft');
    assert.equal(page.text('story-step'), 'Step 1/3');
    const next = page.document.getElementById('story-next');
    next.focus();
    assert.equal(page.key('ArrowRight', next).defaultPrevented, true);
    assert.equal(page.text('story-step'), 'Step 2/3');
    assert.equal(page.document.activeElement.id, 'story-next');
    page.key('ArrowRight', page.document.activeElement);
    assert.equal(page.text('story-step'), 'Step 3/3');
    assert.equal(page.document.activeElement.id, 'story-step');
    page.key('ArrowRight');
    assert.equal(page.text('story-step'), 'Step 3/3');
    page.key('ArrowLeft');
    assert.equal(page.text('story-step'), 'Step 2/3');
    page.key('ArrowLeft', page.document.body, { ctrlKey: true });
    page.key('ArrowLeft', page.document.body, { metaKey: true });
    assert.equal(page.text('story-step'), 'Step 2/3');
    const input = page.document.createElement('input');
    page.document.getElementById('story-stage').append(input);
    assert.equal(page.key('ArrowLeft', input).defaultPrevented, false);
    const editable = page.document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    page.document.getElementById('story-stage').append(editable);
    assert.equal(page.key('ArrowRight', editable).defaultPrevented, false);
    assert.equal(page.text('story-step'), 'Step 2/3');
    page.key('k', page.document.body, { ctrlKey: true });
    assert.equal(page.document.body.dataset.panel, 'structure');
    assert.equal(page.document.activeElement.id, 'search');
    assert.equal(page.key('ArrowRight').defaultPrevented, false);
    page.click('view-stories');
    assert.equal(page.text('story-step'), 'Step 2/3');
  } finally {
    page.close();
  }
});

test('empty and older snapshots and zero-scene flows have explicit, safe empty states', () => {
  for (const stories of [
    undefined,
    [],
    [
      {
        flowId: 'empty',
        storyTitle: '待补业务流',
        businessGoal: '待补',
        storySummary: '尚无步骤',
        scenes: [],
      },
    ],
  ]) {
    const data = { ...fixture(), stories, delivery: null };
    const page = open(data);
    try {
      page.click('view-stories');
      if (!stories?.length) {
        assert.match(page.text('detail'), /尚无业务故事/);
        assert.equal(page.document.getElementById('story-next'), null);
      } else {
        assert.equal(page.text('story-step'), 'Step 0/0');
        assert.equal(page.document.getElementById('story-next').disabled, true);
        assert.equal(
          page.document.getElementById('story-previous').disabled,
          true,
        );
        assert.match(page.text('story-stage'), /尚无已声明的业务步骤/);
      }
      page.key('ArrowRight');
      page.key('ArrowLeft');
      page.click('view-delivery');
      assert.match(page.text('detail'), /尚无交付投影/);
      page.click('view-structure');
      assert.equal(page.document.body.dataset.ready, 'true');
    } finally {
      page.close();
    }
  }
});

test('all business prose and field values render as text, never executable markup', () => {
  const data = fixture();
  const hostile = '<img src="https://private.invalid/leak" onerror="alert(1)">';
  const first = data.stories[0];
  first.storyTitle = hostile;
  first.businessGoal = hostile;
  first.storySummary = hostile;
  Object.assign(first.scenes[0], {
    narrative: hostile,
    actingRoleLabel: hostile,
    phaseTitle: hostile,
    targetEntityLabel: hostile,
    pendingSuspense: hostile,
    stateTransitionNotice: hostile,
    documentCard: {
      title: hostile,
      fields: [{ name: 'evil', label: hostile, value: hostile, keyData: true }],
      basisNotes: hostile,
    },
    ruleEvaluations: [
      { ruleName: hostile, explanation: hostile, satisfied: true },
    ],
  });
  const page = open(data);
  try {
    page.click('view-stories');
    assert.equal(
      page.document.querySelectorAll(
        '#detail img,#detail script,#detail iframe',
      ).length,
      0,
    );
    assert.ok(page.text('story-stage').includes(hostile));
    assert.ok(
      page.document
        .querySelector('[data-story-flow]')
        .textContent.includes(hostile),
    );
    assert.ok(
      page.document
        .querySelector('.story-document td')
        .textContent.includes(hostile),
    );
  } finally {
    page.close();
  }
});

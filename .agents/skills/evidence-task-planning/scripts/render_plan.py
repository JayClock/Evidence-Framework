#!/usr/bin/env python3
"""Generate an offline read-only review projection from plan.yaml."""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import yaml

MARKER = "<!-- evidence-task-plan-review:v1 -->"


def embedded_json(value: Any) -> str:
  text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
  for char in ("<", ">", "&", "\u2028", "\u2029"):
    text = text.replace(char, f"\\u{ord(char):04x}")
  return text


def load_plan(path: Path) -> tuple[dict[str, Any], str]:
  if path.suffix.lower() not in {".yaml", ".yml"}:
    raise ValueError("plan must be a YAML file")
  raw = path.read_text(encoding="utf-8")
  value = yaml.safe_load(raw)
  if not isinstance(value, dict):
    raise ValueError("plan must contain a mapping")
  if (
    str(value.get("schemaVersion")) != "3.0" or value.get("kind") != "smart-domain-plan"
  ):
    raise ValueError("plan must be schemaVersion 3.0 kind smart-domain-plan")
  if not isinstance(value.get("compiled"), dict):
    raise ValueError("plan.compiled must contain the compiler projection")
  if not isinstance(value.get("tasks"), dict):
    raise ValueError("plan.tasks must be a taskKey mapping")
  return value, raw


def verify(plan: Path, state_tool: Path | None) -> dict[str, Any]:
  if state_tool is None:
    return {"valid": None, "diagnostics": ["state validation not requested"]}
  result = subprocess.run(
    [sys.executable, "-B", str(state_tool), "verify", "--plan", str(plan)],
    capture_output=True,
    text=True,
    timeout=60,
    check=False,
  )
  try:
    report = json.loads(result.stdout)
  except json.JSONDecodeError as error:
    raise ValueError(f"state tool returned invalid JSON: {error}") from error
  if not isinstance(report, dict):
    raise ValueError("state tool result must be an object")
  return report


def render(plan: dict[str, Any], raw: str, validation: dict[str, Any]) -> str:
  compiled = plan["compiled"]
  nodes = {
    item.get("taskKey"): item
    for item in compiled.get("tasks", [])
    if isinstance(item, dict) and isinstance(item.get("taskKey"), str)
  }
  tasks = plan["tasks"]
  projection = {
    "metadata": plan.get("metadata", {}),
    "strategy": plan.get("strategy", {}),
    "sourceManifest": plan.get("sourceManifest", []),
    "compiled": compiled,
    "tasks": tasks,
    "gaps": plan.get("gaps", []),
    "validation": validation,
    "raw": raw,
    "nodes": nodes,
  }
  data = embedded_json(projection)
  title = html.escape(str((plan.get("metadata") or {}).get("project") or "Task plan"))
  style = """
:root{color-scheme:light;--ink:#1c232b;--muted:#65717d;--line:#d8dee4;--paper:#fff;--wash:#f4f6f7;--red:#b13a42;--green:#357a54;--amber:#9b6817;--blue:#316b91}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--wash);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}header{background:#20272d;color:white;padding:18px 28px;display:flex;align-items:end;justify-content:space-between;gap:24px}h1{font-size:24px;margin:0}header p{margin:3px 0 0;color:#cdd5dc}.layout{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:calc(100vh - 82px)}nav{border-right:1px solid var(--line);background:#eef1f2;padding:18px;position:sticky;top:0;height:calc(100vh - 82px)}button{font:inherit}nav button{display:flex;width:100%;border:0;background:transparent;padding:9px 10px;text-align:left;color:var(--ink);cursor:pointer;border-radius:4px}nav button.active{background:#fff;font-weight:650;box-shadow:inset 3px 0 var(--blue)}main{padding:24px 28px;min-width:0}.view{display:none}.view.active{display:block}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px}.metric,.task,.gap,.panel{background:var(--paper);border:1px solid var(--line);border-radius:6px;min-width:0}.metric{padding:14px}.metric strong{font-size:24px;display:block}.muted{color:var(--muted)}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.toolbar button{border:1px solid var(--line);background:white;border-radius:4px;padding:6px 10px;cursor:pointer}.toolbar button.active{border-color:var(--blue);color:var(--blue)}.task-list{display:grid;gap:10px}.task{padding:14px 16px}.task-head{display:flex;gap:12px;justify-content:space-between;align-items:start}.task h3{font-size:16px;margin:0}.key{font:12px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted);overflow-wrap:anywhere}.badge{display:inline-block;padding:2px 7px;border-radius:3px;background:#e8ecef;font-size:12px}.status-done{border-left:4px solid var(--green)}.status-blocked{border-left:4px solid var(--red)}.status-in-progress{border-left:4px solid var(--blue)}.status-planned{border-left:4px solid var(--amber)}.task.focused{outline:3px solid rgba(49,107,145,.28);outline-offset:2px}details{margin-top:9px}summary{cursor:pointer;color:var(--blue)}dl{display:grid;grid-template-columns:150px 1fr;gap:7px 14px}dt{font-weight:650}dd{margin:0;overflow-wrap:anywhere}.deps{display:flex;gap:6px;flex-wrap:wrap}.gap{padding:12px 14px;margin-bottom:10px}.gap h3{font-size:15px;margin:0 0 5px}.panel{padding:16px;margin-bottom:14px}pre{max-width:100%;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;background:#161b20;color:#e6edf3;border-radius:5px;padding:16px;overflow:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}.dag-legend{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px}.dag-legend span{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:12px}.dag-swatch{width:10px;height:10px;border-radius:2px}.dag-scroll{overflow:auto;background:var(--paper);border:1px solid var(--line);border-radius:6px}.dag-scroll svg{display:block}.dag-edge{fill:none;stroke:#9ca8b2;stroke-width:1.5}.dag-node{cursor:pointer}.dag-node rect{stroke-width:2}.dag-node text{fill:var(--ink);font-size:13px;font-weight:650;pointer-events:none}.dag-node .dag-status{font-size:11px;font-weight:500;fill:var(--muted)}.dag-node:focus{outline:none}.dag-node:focus rect,.dag-node:hover rect{stroke:#20272d;filter:brightness(.98)}.dag-node-planned rect{fill:#fff8e8;stroke:var(--amber)}.dag-node-in-progress rect{fill:#edf6fb;stroke:var(--blue)}.dag-node-blocked rect{fill:#fbeff0;stroke:var(--red)}.dag-node-done rect{fill:#edf7f1;stroke:var(--green)}.diag{color:var(--red)}@media(max-width:760px){header{align-items:start;flex-direction:column}.layout{display:block}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line);display:flex;overflow:auto;gap:4px;padding:10px}nav button{width:auto;white-space:nowrap}main{padding:18px 14px;overflow:hidden}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}dl{grid-template-columns:1fr}.task-head{display:block}.badge{margin-top:6px}.dag-scroll{max-width:100%}}
""".strip()
  app = """
let data;
try {
  data = JSON.parse(document.getElementById('plan-data').textContent);
} catch (error) {
  document.body.textContent = `Invalid embedded plan data: ${error.message}`;
  throw error;
}
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
const formatted = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const pre = value => element('pre', formatted(value));
function navigate(name) {
  $$('nav button').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  $$('.view').forEach(view => view.classList.toggle('active', view.id === name));
}
$$('nav button').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
const order = data.compiled.executionOrder || [];
const counts = {planned: 0, blocked: 0, 'in-progress': 0, done: 0};
Object.values(data.tasks).forEach(task => {
  if (task && counts[task.status] !== undefined) counts[task.status] += 1;
});
const metrics = $('#metrics');
[
  ['Tasks', Object.keys(data.tasks).length],
  ['Done', counts.done],
  ['In progress', counts['in-progress']],
  ['Blocked', counts.blocked],
  ['Gaps', (data.gaps || []).length],
].forEach(([label, value]) => {
  const metric = element('div', undefined, 'metric');
  metric.append(element('span', label, 'muted'), element('strong', value));
  metrics.append(metric);
});
const validation = data.validation || {};
const validationRoot = $('#validation');
if (validation.valid === true) {
  validationRoot.append(element('strong', 'Structure valid'));
} else {
  validationRoot.append(element('strong', 'Structure not validated', 'diag'));
  (validation.diagnostics || []).forEach(diagnostic => validationRoot.append(element('div', diagnostic)));
}
function addField(list, label, value, asPre = false) {
  list.append(element('dt', label));
  const detail = element('dd');
  detail.append(asPre ? pre(value) : document.createTextNode(formatted(value)));
  list.append(detail);
}
function taskCard(key) {
  const task = data.tasks[key] || {};
  const node = data.nodes[key] || {};
  const article = element('article', undefined, `task status-${task.status || 'planned'}`);
  article.dataset.status = task.status || '';
  article.dataset.taskKey = key;
  const head = element('div', undefined, 'task-head');
  const identity = element('div');
  identity.append(element('h3', task.title || key), element('div', key, 'key'));
  const badges = element('div');
  badges.append(element('span', task.mode || '', 'badge'), document.createTextNode(' '), element('span', task.status || '', 'badge'));
  head.append(identity, badges);
  article.append(head, element('p', task.outcome || ''));
  const dependencies = element('div', undefined, 'deps');
  (node.dependsOn || []).forEach(dependency => {
    dependencies.append(element('span', `depends on: ${data.tasks[dependency]?.title || dependency}`, 'badge'));
  });
  article.append(dependencies);
  const details = element('details');
  details.append(element('summary', 'Review task record'));
  const list = element('dl');
  addField(list, 'Owner / operation', `${node.ownerRef || ''} / ${node.operationRef || ''}`);
  addField(list, 'Sources', task.sourceRefs || [], true);
  addField(list, 'Guides', task.guides || {}, true);
  addField(list, 'Design', task.design || {}, true);
  addField(list, 'Steps', task.steps || [], true);
  addField(list, 'Checks', task.checks || [], true);
  addField(list, 'Completion', task.completionCriteria || [], true);
  addField(list, 'Observed evidence', task.observedEvidence || [], true);
  details.append(list);
  article.append(details);
  return article;
}
const taskList = $('#task-list');
order.forEach(key => taskList.append(taskCard(key)));
function openTask(key) {
  navigate('tasks');
  $$('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
  $$('.task').forEach(card => {
    card.hidden = false;
    card.classList.toggle('focused', card.dataset.taskKey === key);
  });
  const card = $(`.task[data-task-key="${CSS.escape(key)}"]`);
  if (card) card.scrollIntoView({behavior: 'smooth', block: 'center'});
}
const svgNamespace = 'http://www.w3.org/2000/svg';
const svgElement = (tag, attributes = {}) => {
  const node = document.createElementNS(svgNamespace, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  return node;
};
function renderDag() {
  const nodeWidth = 220;
  const nodeHeight = 84;
  const columnGap = 86;
  const rowGap = 28;
  const padding = 30;
  const levels = new Map();
  order.forEach(key => {
    const dependencies = data.nodes[key]?.dependsOn || [];
    levels.set(key, dependencies.reduce((level, dependency) => Math.max(level, (levels.get(dependency) ?? -1) + 1), 0));
  });
  const maxLevel = Math.max(0, ...levels.values());
  const columns = Array.from({length: maxLevel + 1}, () => []);
  order.forEach(key => columns[levels.get(key) || 0].push(key));
  const maxRows = Math.max(1, ...columns.map(column => column.length));
  const width = padding * 2 + (maxLevel + 1) * nodeWidth + maxLevel * columnGap;
  const height = padding * 2 + maxRows * nodeHeight + (maxRows - 1) * rowGap;
  const positions = new Map();
  columns.forEach((column, level) => {
    const contentHeight = column.length * nodeHeight + Math.max(0, column.length - 1) * rowGap;
    const offset = padding + (height - padding * 2 - contentHeight) / 2;
    column.forEach((key, row) => positions.set(key, {
      x: padding + level * (nodeWidth + columnGap),
      y: offset + row * (nodeHeight + rowGap),
    }));
  });
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'img',
    'aria-label': 'Task dependency DAG',
  });
  const definitions = svgElement('defs');
  const marker = svgElement('marker', {id: 'dag-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse'});
  marker.append(svgElement('path', {d: 'M 0 0 L 10 5 L 0 10 z', fill: '#9ca8b2'}));
  definitions.append(marker);
  svg.append(definitions);
  order.forEach(key => {
    const target = positions.get(key);
    (data.nodes[key]?.dependsOn || []).forEach(dependency => {
      const source = positions.get(dependency);
      if (!source || !target) return;
      const startX = source.x + nodeWidth;
      const startY = source.y + nodeHeight / 2;
      const endX = target.x;
      const endY = target.y + nodeHeight / 2;
      const bend = Math.max(32, (endX - startX) / 2);
      svg.append(svgElement('path', {
        d: `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`,
        class: 'dag-edge',
        'marker-end': 'url(#dag-arrow)',
      }));
    });
  });
  order.forEach((key, index) => {
    const position = positions.get(key);
    const task = data.tasks[key] || {};
    const status = task.status || 'planned';
    const group = svgElement('g', {
      class: `dag-node dag-node-${status}`,
      tabindex: 0,
      role: 'button',
      'aria-label': `${task.title || key}, ${status}`,
      transform: `translate(${position.x} ${position.y})`,
    });
    group.append(svgElement('rect', {width: nodeWidth, height: nodeHeight, rx: 5}));
    const title = Array.from(task.title || key);
    const firstLine = title.slice(0, 17).join('');
    const remaining = title.slice(17);
    const secondLine = remaining.length > 17 ? `${remaining.slice(0, 16).join('')}…` : remaining.join('');
    const label = svgElement('text', {x: 14, y: secondLine ? 24 : 32});
    const first = svgElement('tspan', {x: 14, dy: 0});
    first.textContent = firstLine;
    label.append(first);
    if (secondLine) {
      const second = svgElement('tspan', {x: 14, dy: 19});
      second.textContent = secondLine;
      label.append(second);
    }
    const statusLabel = svgElement('text', {x: 14, y: 69, class: 'dag-status'});
    statusLabel.textContent = `${index + 1}. ${status}`;
    group.append(label, statusLabel);
    group.addEventListener('click', () => openTask(key));
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openTask(key);
      }
    });
    svg.append(group);
  });
  const legend = $('#dag-legend');
  const colors = {planned: '#9b6817', 'in-progress': '#316b91', blocked: '#b13a42', done: '#357a54'};
  Object.entries(colors).forEach(([status, color]) => {
    const item = element('span');
    const swatch = element('i', undefined, 'dag-swatch');
    swatch.style.backgroundColor = color;
    item.append(swatch, document.createTextNode(status));
    legend.append(item);
  });
  $('#dag-canvas').append(svg);
}
renderDag();
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {
  $$('[data-filter]').forEach(candidate => candidate.classList.toggle('active', candidate === button));
  const filter = button.dataset.filter;
  $$('.task').forEach(card => { card.hidden = filter !== 'all' && card.dataset.status !== filter; });
}));
const gaps = $('#gaps-list');
if ((data.gaps || []).length === 0) {
  gaps.append(element('p', 'No recorded gaps.', 'muted'));
} else {
  data.gaps.forEach(gap => {
    const article = element('article', undefined, 'gap');
    article.append(
      element('h3', gap.id || ''),
      element('div', gap.statement || ''),
      element('p', `Impact: ${gap.impact || ''}\nNext: ${gap.nextAction || ''}`, 'muted'),
      element('div', (gap.affectedTaskRefs || []).join(', '), 'key'),
    );
    gaps.append(article);
  });
}
$('#sources').append(pre(data.sourceManifest || []));
$('#strategy').append(pre(data.strategy || {}));
$('#raw').textContent = data.raw;
const requestedView = location.hash.slice(1);
if (['overview', 'dag', 'tasks', 'gaps', 'sources-view', 'raw-view'].includes(requestedView)) {
  navigate(requestedView);
  requestAnimationFrame(() => window.scrollTo(0, 0));
}
""".strip()
  template = f"""<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="@@CSP@@"><title>{title} task plan review</title><style>{style}</style></head><body><header><div><h1>{title}</h1><p>Smart-domain task plan review projection</p></div><div id="validation"></div></header><div class="layout"><nav aria-label="Review views"><button class="active" data-view="overview">Overview</button><button data-view="dag">DAG</button><button data-view="tasks">Tasks</button><button data-view="gaps">Gaps</button><button data-view="sources-view">Sources</button><button data-view="raw-view">Raw YAML</button></nav><main><section class="view active" id="overview"><div class="metrics" id="metrics"></div><div class="panel"><h2>Strategy</h2><div id="strategy"></div></div></section><section class="view" id="dag"><div class="dag-legend" id="dag-legend"></div><div class="dag-scroll" id="dag-canvas"></div></section><section class="view" id="tasks"><div class="toolbar"><button class="active" data-filter="all">All</button><button data-filter="planned">Planned</button><button data-filter="in-progress">In progress</button><button data-filter="blocked">Blocked</button><button data-filter="done">Done</button></div><div class="task-list" id="task-list"></div></section><section class="view" id="gaps"><div id="gaps-list"></div></section><section class="view" id="sources-view"><div class="panel" id="sources"></div></section><section class="view" id="raw-view"><pre id="raw"></pre></section></main></div><script type="application/json" id="plan-data">{data}</script><script>{app}</script></body></html>"""
  script_hash = base64.b64encode(hashlib.sha256(app.encode()).digest()).decode()
  csp = (
    "default-src 'none'; script-src 'sha256-"
    + script_hash
    + "'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; "
    "object-src 'none'; base-uri 'none'; form-action 'none'"
  )
  return (
    MARKER
    + "\n<!doctype html>\n<!-- prettier-ignore -->\n"
    + template.replace("@@CSP@@", csp)
  )


def publish(output: Path, content: str) -> None:
  output.parent.mkdir(parents=True, exist_ok=True)
  if output.is_symlink():
    raise ValueError("refusing to overwrite a symlink")
  if output.exists() and not output.read_text(encoding="utf-8").startswith(MARKER):
    raise ValueError("refusing to overwrite a file not created by this generator")
  fd, name = tempfile.mkstemp(prefix=".review-", suffix=".html", dir=output.parent)
  try:
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
      stream.write(content)
    os.replace(name, output)
  finally:
    Path(name).unlink(missing_ok=True)


def main() -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--plan", required=True, type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--state-tool", type=Path)
  args = parser.parse_args()
  plan_path = args.plan.resolve()
  output = (args.output or plan_path.with_name("review.html")).resolve()
  try:
    plan, raw = load_plan(plan_path)
    validation = verify(
      plan_path, args.state_tool.resolve() if args.state_tool else None
    )
    content = render(plan, raw, validation)
    publish(output, content)
    print(
      json.dumps(
        {"output": str(output), "valid": validation.get("valid")},
        ensure_ascii=False,
      )
    )
    return 0
  except (OSError, ValueError, subprocess.TimeoutExpired, yaml.YAMLError) as error:
    print(str(error), file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())

import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { REQUIREMENTS_PATH } from './storage.ts';
import { FM_STATUS_PATH } from './modeling.ts';
import { getPhaseDefinition, phaseNumber } from './phases.ts';
import { readText, writeTextAtomic } from './storage.ts';
import { currentCodingStory } from './workflow.ts';
import type { CheckReport, EvidenceState, PendingGate } from './types.ts';

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function gateSubject(state: EvidenceState): string {
  if (state.phase === 'complete') return 'complete';
  if (state.phase === 'coding') return currentCodingStory(state) ?? 'coding';
  return getPhaseDefinition(state.phase).label;
}

export function gateArtifactPaths(state: EvidenceState): string[] {
  if (state.phase === 'complete') return [];
  if (state.phase === 'coding') {
    const story = currentCodingStory(state);
    return [
      REQUIREMENTS_PATH,
      ...state.coding.changedFiles,
      ...(story ? [`artifacts/05-coding/${story}.md`] : []),
    ];
  }
  const artifactPaths = [
    REQUIREMENTS_PATH,
    ...getPhaseDefinition(state.phase).artifacts.map(
      (artifact) => artifact.output,
    ),
  ];
  return state.phase === 'domain' || state.phase === 'review'
    ? [...new Set([...artifactPaths, FM_STATUS_PATH, ...state.modeling.files])]
    : artifactPaths;
}

function gateEvidencePaths(state: EvidenceState, reportPath: string): string[] {
  return [
    ...new Set([
      ...gateArtifactPaths(state),
      reportPath,
      reportPath.replace(/\.md$/, '.json'),
    ]),
  ];
}

export async function hashArtifacts(
  root: string,
  paths: string[],
): Promise<string> {
  const hash = createHash('sha256');
  for (const path of [...paths].sort((left, right) =>
    left.localeCompare(right),
  )) {
    hash.update(path);
    hash.update('\0');
    hash.update(await readText(root, path, '<missing>'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function checkStatusIcon(
  status: CheckReport['items'][number]['status'],
): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'fail':
      return '❌';
    default:
      return '?';
  }
}

function gateMarkdown(
  gate: PendingGate,
  state: EvidenceState,
  report: CheckReport,
): string {
  const items = report.items.map((item) => {
    return `| ${item.name.replaceAll('|', '\\|')} | ${checkStatusIcon(item.status)} | ${item.details.replaceAll('|', '\\|')} |`;
  });

  return `---
id: ${gate.id}
phase: ${gate.phase}
subject: ${JSON.stringify(gate.subject)}
status: pending
decision: pending
round: ${state.round}
createdAt: ${gate.createdAt}
artifactDigest: ${gate.artifactDigest}
report: ${gate.reportPath}
---

# Gate：${gate.subject}

## 当前工件

${gate.artifactPaths.map((path) => `- [${basename(path)}](../../${path})`).join('\n')}

## 质量检查

| 检查项 | 结果 | 说明 |
|:---|:---:|:---|
${items.join('\n')}

## 人工决策

请在 Pi 中运行 \`/evidence-review\`。决策会由扩展写回本文件，不需要手工编辑。
`;
}

export async function createGate(
  root: string,
  state: EvidenceState,
  report: CheckReport,
  reportPath: string,
): Promise<PendingGate> {
  if (state.phase === 'complete')
    throw new Error('Cannot create a gate for a completed workflow');
  const subject = gateSubject(state);
  const artifactPaths = gateEvidencePaths(state, reportPath);
  const artifactDigest = await hashArtifacts(root, artifactPaths);
  const createdAt = new Date().toISOString();
  const safeSubject = safeId(subject) || state.phase;
  const id = `GATE-${phaseNumber(state.phase)}-${safeSubject}-r${state.round}-${safeId(createdAt)}`;
  const gate: PendingGate = {
    id,
    path: `artifacts/gates/${id}.md`,
    phase: state.phase,
    subject,
    reportPath,
    artifactPaths,
    artifactDigest,
    createdAt,
  };
  await writeTextAtomic(root, gate.path, gateMarkdown(gate, state, report));
  return gate;
}

export async function refreshGate(
  root: string,
  state: EvidenceState,
  report: CheckReport,
  reportPath: string,
): Promise<PendingGate> {
  if (!state.pendingGate) throw new Error('No pending gate to refresh');
  const artifactPaths = gateEvidencePaths(state, reportPath);
  const gate: PendingGate = {
    ...state.pendingGate,
    reportPath,
    artifactPaths,
    artifactDigest: await hashArtifacts(root, artifactPaths),
  };
  await writeTextAtomic(root, gate.path, gateMarkdown(gate, state, report));
  return gate;
}

export async function recordGateDecision(
  root: string,
  gate: PendingGate,
  decision: 'approved' | 'changes_requested' | 'cancelled',
  feedback?: string,
): Promise<void> {
  const original = await readText(root, gate.path);
  if (!original) return;
  const decidedAt = new Date().toISOString();
  let status: 'approved' | 'cancelled' | 'rejected';
  switch (decision) {
    case 'approved':
      status = 'approved';
      break;
    case 'changes_requested':
      status = 'rejected';
      break;
    case 'cancelled':
      status = 'cancelled';
      break;
    default: {
      const exhaustiveDecision: never = decision;
      status = exhaustiveDecision;
    }
  }
  const updated = original
    .replace(/^status:\s*pending$/m, `status: ${status}`)
    .replace(/^decision:\s*pending$/m, `decision: ${decision}`)
    .concat(
      `\n## 决策记录\n\n- 决策：\`${decision}\`\n- 时间：${decidedAt}\n${feedback ? `- 反馈：${feedback.trim()}\n` : ''}`,
    );
  await writeTextAtomic(root, gate.path, updated);
}

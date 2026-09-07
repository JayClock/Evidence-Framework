import { randomUUID } from 'node:crypto';
import {
  initialDiscovery,
  type DiscoveryProgress,
} from './discovery-schema.ts';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { withFileMutationQueue } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import {
  CommandEvidenceSchema,
  CycleBindingSchema,
  StoryRecordReferenceSchema,
} from './testing-schema.ts';
import {
  decodeCompletedCycles,
  decodeVerifications,
  isPassingEvidence,
  isRedEvidence,
} from './testing-integrity.ts';
import {
  ACTIVE_PHASES,
  type ActivePhase,
  type CodingBaseline,
  type HistoryEntry,
  type EvidenceConfig,
  type ModelingProgress,
  type EvidenceState,
  type PendingGate,
  type TddCommandEvidence,
  type TddCycle,
  type ThinkingLevel,
} from './types.ts';

export const CONFIG_PATH = '.pi/evidence.json';
export const STATE_PATH = '.evidence/state.json';
export const REQUIREMENTS_PATH = 'artifacts/00-input/requirements.md';

const DEFAULT_THINKING: ThinkingLevel = 'high';

export const DEFAULT_CONFIG: EvidenceConfig = {
  version: 1,
  maxRounds: 3,
  autoContinueArtifacts: true,
  newSessionPerPhase: true,
  gitCheckpointOnApproval: false,
  qualityCommands: ['npm test', 'npm run lint', 'npm run build'],
  commandTimeoutMs: 600_000,
  models: {
    modeling: { model: null, thinkingLevel: DEFAULT_THINKING },
    architecture: { model: null, thinkingLevel: DEFAULT_THINKING },
    planning: { model: null, thinkingLevel: 'medium' },
    coding: { model: null, thinkingLevel: DEFAULT_THINKING },
    review: { model: null, thinkingLevel: DEFAULT_THINKING },
  },
  gates: {
    modeling: 'review',
    architecture: 'review',
    planning: 'review',
    coding: 'review',
    review: 'review',
  },
};

export function projectPath(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const normalizedPath = path.replace(/^@\/?/, '');
  const absolute = resolve(absoluteRoot, normalizedPath);
  if (
    absolute !== absoluteRoot &&
    !absolute.startsWith(`${absoluteRoot}${sep}`)
  ) {
    throw new Error(`Path escapes project root: ${path}`);
  }
  return absolute;
}

export function relativeProjectPath(root: string, path: string): string {
  return relative(resolve(root), projectPath(root, path)).split(sep).join('/');
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function projectEntryExists(
  root: string,
  path: string,
): Promise<boolean> {
  try {
    await stat(projectPath(root, path));
    return true;
  } catch {
    return false;
  }
}

export async function readText(
  root: string,
  path: string,
  fallback = '',
): Promise<string> {
  try {
    return await readFile(projectPath(root, path), 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeTextAtomic(
  root: string,
  path: string,
  content: string,
): Promise<void> {
  const target = projectPath(root, path);
  await withFileMutationQueue(target, async () => {
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content, 'utf8');
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  });
}

export async function writeJsonAtomic(
  root: string,
  path: string,
  value: unknown,
): Promise<void> {
  await writeTextAtomic(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson<T>(
  root: string,
  path: string,
): Promise<T | null> {
  const content = await readText(root, path);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
}

const THINKING_LEVELS = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;
const GATE_MODES = ['auto', 'review', 'review_if'] as const;
const WORKFLOW_PHASES = [...ACTIVE_PHASES, 'complete'] as const;
const WORKFLOW_STATUSES = [
  'ready',
  'running',
  'waiting_answer',
  'waiting_review',
  'blocked',
  'complete',
] as const;
const TDD_STAGES = ['red', 'green', 'refactor'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function configuredBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isCommandEvidence(value: unknown): value is TddCommandEvidence {
  if (!isRecord(value)) return false;
  return (
    typeof value.command === 'string' &&
    typeof value.observation === 'string' &&
    typeof value.exitCode === 'number' &&
    typeof value.killed === 'boolean' &&
    typeof value.output === 'string' &&
    typeof value.recordedAt === 'string'
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function invalidState(message: string): never {
  throw new Error(
    `Invalid ${STATE_PATH}: ${message}. Use /evidence-reset if the file cannot be recovered.`,
  );
}

function decodeNullableString(value: unknown, name: string): string | null {
  if (value === null || typeof value === 'string') return value;
  return invalidState(`${name} must be a string or null`);
}

function decodeTddCycle(value: unknown): TddCycle {
  if (!isRecord(value)) return invalidState('missing TDD cycle');
  const stage = value.stage;
  if (!isOneOf(stage, TDD_STAGES)) return invalidState('unknown TDD stage');
  const red = value.red;
  const green = value.green;
  if (red !== null && !isCommandEvidence(red))
    return invalidState('invalid Red evidence');
  if (green !== null && !isCommandEvidence(green))
    return invalidState('invalid Green evidence');
  if ((stage === 'green' || stage === 'refactor') && !isCommandEvidence(red)) {
    return invalidState('Green/Refactor stage requires Red evidence');
  }
  if (stage === 'refactor' && !isCommandEvidence(green)) {
    return invalidState('Refactor stage requires Green evidence');
  }
  const binding = value.binding;
  if (stage === 'red') {
    if (red !== null || green !== null || binding !== null)
      return invalidState('Red stage must be empty');
  } else {
    if (
      !Value.Check(CycleBindingSchema, binding) ||
      Object.keys(binding.testFileHashes).length === 0
    )
      return invalidState('invalid TDD binding');
    if (!Value.Check(CommandEvidenceSchema, red) || !isRedEvidence(red))
      return invalidState('invalid Red result');
    if (stage === 'green' && green !== null)
      return invalidState('unexpected Green evidence');
    if (
      stage === 'refactor' &&
      (!Value.Check(CommandEvidenceSchema, green) ||
        !isPassingEvidence(green) ||
        green.command !== red.command ||
        Date.parse(red.recordedAt) > Date.parse(green.recordedAt))
    )
      return invalidState('invalid Green result');
  }
  return {
    stage,
    binding: Value.Check(CycleBindingSchema, binding) ? binding : null,
    red: isCommandEvidence(red) ? red : null,
    green: isCommandEvidence(green) ? green : null,
  };
}

function decodeModelingProgress(value: unknown): ModelingProgress {
  if (!isRecord(value)) {
    return {
      applicable: null,
      rationale: null,
      files: [],
      machineValidated: false,
      simulationPassed: null,
    };
  }
  const applicable =
    typeof value.applicable === 'boolean' ? value.applicable : null;
  const simulationPassed =
    typeof value.simulationPassed === 'boolean' ? value.simulationPassed : null;
  return {
    applicable,
    rationale: typeof value.rationale === 'string' ? value.rationale : null,
    files: Array.isArray(value.files)
      ? value.files.filter((file): file is string => typeof file === 'string')
      : [],
    machineValidated: value.machineValidated === true,
    simulationPassed,
  };
}

function decodeDiscovery(
  value: unknown,
  phase: string,
  status: string,
): DiscoveryProgress {
  if (
    !isRecord(value) ||
    !isOneOf(value.stage, ['discovering', 'finalizing']) ||
    !isNonNegativeInteger(value.revision)
  )
    return invalidState('invalid discovery progress');
  const path = decodeNullableString(value.path, 'discovery.path');
  const digest = decodeNullableString(value.digest, 'discovery.digest');
  if (
    value.revision === 0
      ? path !== null || digest !== null || value.stage !== 'discovering'
      : !path ||
        !/^artifacts\/02-modeling\/discovery\/[a-f0-9-]{36}\/revision-\d+\.json$/.test(
          path,
        ) ||
        !digest ||
        !/^[a-f0-9]{64}$/.test(digest)
  )
    return invalidState('invalid discovery snapshot reference');
  if (
    status === 'waiting_answer' &&
    (phase !== 'modeling' || value.stage !== 'discovering' || !path)
  )
    return invalidState('waiting_answer requires active discovery');
  return { stage: value.stage, revision: value.revision, path, digest };
}

function decodeCodingBaseline(value: unknown): CodingBaseline | null {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    typeof value.gitAvailable !== 'boolean' ||
    typeof value.capturedAt !== 'string' ||
    (value.dirtyPaths !== undefined &&
      (!Array.isArray(value.dirtyPaths) ||
        !value.dirtyPaths.every((path) => typeof path === 'string'))) ||
    !isRecord(value.fileHashes)
  ) {
    return invalidState('invalid Coding baseline');
  }
  const entries = Object.entries(value.fileHashes);
  if (!entries.every((entry) => typeof entry[1] === 'string')) {
    return invalidState('Coding baseline hashes must be strings');
  }
  const dirtyPaths = Array.isArray(value.dirtyPaths)
    ? value.dirtyPaths.flatMap((path) =>
        typeof path === 'string' ? [path] : [],
      )
    : entries.map(([path]) => path);
  return {
    gitAvailable: value.gitAvailable,
    dirtyPaths,
    capturedAt: value.capturedAt,
    fileHashes: Object.fromEntries(
      entries.flatMap(([path, hash]) =>
        typeof hash === 'string' ? [[path, hash]] : [],
      ),
    ),
  };
}

function decodePendingGate(value: unknown): PendingGate | null {
  if (value === null) return null;
  if (!isRecord(value))
    return invalidState('pendingGate must be an object or null');
  if (!isOneOf(value.phase, ACTIVE_PHASES))
    return invalidState('pendingGate has an unknown phase');
  const stringFields = [
    'id',
    'path',
    'subject',
    'reportPath',
    'artifactDigest',
    'createdAt',
  ] as const;
  if (stringFields.some((field) => typeof value[field] !== 'string')) {
    return invalidState('pendingGate has invalid string fields');
  }
  if (
    !Array.isArray(value.artifactPaths) ||
    !value.artifactPaths.every((path) => typeof path === 'string')
  ) {
    return invalidState('pendingGate.artifactPaths must be a string array');
  }
  return {
    id: String(value.id),
    path: String(value.path),
    phase: value.phase,
    subject: String(value.subject),
    reportPath: String(value.reportPath),
    artifactPaths: value.artifactPaths.flatMap((path) =>
      typeof path === 'string' ? [path] : [],
    ),
    artifactDigest: String(value.artifactDigest),
    createdAt: String(value.createdAt),
  };
}

function decodeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return invalidState('history must be an array');
  return value.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.at !== 'string' ||
      typeof entry.event !== 'string' ||
      !isOneOf(entry.phase, WORKFLOW_PHASES) ||
      !isNonNegativeInteger(entry.round) ||
      (entry.detail !== undefined && typeof entry.detail !== 'string')
    ) {
      return invalidState(`history entry ${index} is invalid`);
    }
    const decoded: HistoryEntry = {
      at: entry.at,
      event: entry.event,
      phase: entry.phase,
      round: entry.round,
    };
    if (typeof entry.detail === 'string') decoded.detail = entry.detail;
    return decoded;
  });
}

export async function loadConfig(root: string): Promise<EvidenceConfig> {
  const configured = await readJson<unknown>(root, CONFIG_PATH);
  if (configured === null) return structuredClone(DEFAULT_CONFIG);
  if (!isRecord(configured))
    throw new Error(`Invalid ${CONFIG_PATH}: expected a JSON object`);
  if (configured.version !== undefined && configured.version !== 1) {
    throw new Error(
      `Unsupported ${CONFIG_PATH} version: ${String(configured.version)}`,
    );
  }

  const configuredModels = isRecord(configured.models) ? configured.models : {};
  const configuredGates = isRecord(configured.gates) ? configured.gates : {};
  if ('domain' in configuredModels || 'domain' in configuredGates) {
    throw new Error(
      `Invalid ${CONFIG_PATH}: domain 阶段已合并为 modeling；请将 models.domain / gates.domain 改为 modeling。`,
    );
  }
  if ('requirements' in configuredModels || 'requirements' in configuredGates) {
    throw new Error(
      `Invalid ${CONFIG_PATH}: requirements 已并入 modeling；请移除 models.requirements / gates.requirements，核对 modeling 配置后 /reload。`,
    );
  }
  const models = structuredClone(DEFAULT_CONFIG.models);
  const gates = { ...DEFAULT_CONFIG.gates };
  for (const phase of ACTIVE_PHASES) {
    const profile = isRecord(configuredModels[phase])
      ? configuredModels[phase]
      : null;
    if (profile) {
      const rawModel = profile.model;
      const model =
        typeof rawModel === 'string' && rawModel.trim()
          ? rawModel.trim()
          : null;
      const thinkingLevel: ThinkingLevel = isOneOf(
        profile.thinkingLevel,
        THINKING_LEVELS,
      )
        ? profile.thinkingLevel
        : models[phase].thinkingLevel;
      models[phase] = { model, thinkingLevel };
    }
    const gateMode = configuredGates[phase];
    if (isOneOf(gateMode, GATE_MODES)) gates[phase] = gateMode;
  }

  const configuredCommands = configured.qualityCommands;
  let qualityCommands = [...DEFAULT_CONFIG.qualityCommands];
  if (Array.isArray(configuredCommands)) {
    qualityCommands = configuredCommands.flatMap((value) => {
      if (typeof value !== 'string' || !value.trim()) return [];
      return [value.trim()];
    });
  }

  return {
    version: 1,
    maxRounds: normalizePositiveInteger(
      configured.maxRounds,
      DEFAULT_CONFIG.maxRounds,
    ),
    autoContinueArtifacts: configuredBoolean(
      configured.autoContinueArtifacts,
      DEFAULT_CONFIG.autoContinueArtifacts,
    ),
    newSessionPerPhase: configuredBoolean(
      configured.newSessionPerPhase,
      DEFAULT_CONFIG.newSessionPerPhase,
    ),
    gitCheckpointOnApproval: configuredBoolean(
      configured.gitCheckpointOnApproval,
      DEFAULT_CONFIG.gitCheckpointOnApproval,
    ),
    qualityCommands,
    commandTimeoutMs: normalizePositiveInteger(
      configured.commandTimeoutMs,
      DEFAULT_CONFIG.commandTimeoutMs,
    ),
    models,
    gates,
  };
}

export async function loadState(root: string): Promise<EvidenceState | null> {
  const raw = await readJson<unknown>(root, STATE_PATH);
  if (raw === null) return null;
  if (!isRecord(raw)) return invalidState('expected a JSON object');
  if (raw.version !== 6)
    return invalidState(
      `unsupported version ${String(raw.version)}；交互建模需要 v6，请备份旧运行后 /evidence-reset、/evidence-init，不迁移旧 Gate`,
    );
  if (typeof raw.runId !== 'string' || !/^[a-f0-9-]{36}$/.test(raw.runId))
    return invalidState('invalid runId');
  if (!isOneOf(raw.phase, WORKFLOW_PHASES))
    return invalidState('unknown phase');
  if (!isOneOf(raw.status, WORKFLOW_STATUSES))
    return invalidState('unknown status');
  if (typeof raw.projectName !== 'string' || typeof raw.goal !== 'string') {
    return invalidState('projectName and goal must be strings');
  }
  if (
    typeof raw.paused !== 'boolean' ||
    !isNonNegativeInteger(raw.round) ||
    !isNonNegativeInteger(raw.currentArtifactIndex)
  ) {
    return invalidState('invalid pause or progress fields');
  }
  if (typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') {
    return invalidState('createdAt and updatedAt must be strings');
  }
  if (!isRecord(raw.coding)) return invalidState('missing coding progress');
  const coding = raw.coding;
  if (
    !Array.isArray(coding.storyIds) ||
    !coding.storyIds.every((value) => typeof value === 'string')
  ) {
    return invalidState('coding.storyIds must be a string array');
  }
  if (
    !Array.isArray(coding.changedFiles) ||
    !coding.changedFiles.every((value) => typeof value === 'string')
  ) {
    return invalidState('coding.changedFiles must be a string array');
  }
  if (!isNonNegativeInteger(coding.currentStoryIndex))
    return invalidState('invalid coding story index');
  if ((raw.phase === 'complete') !== (raw.status === 'complete')) {
    return invalidState('complete phase and status must agree');
  }

  const cycles = decodeCompletedCycles(coding.cycles);
  const verifications = decodeVerifications(coding.verifications);
  if (
    !isNonNegativeInteger(coding.revisionStart) ||
    coding.revisionStart > cycles.length
  )
    return invalidState('invalid revision cycle boundary');
  if (
    coding.planDigest !== null &&
    (typeof coding.planDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(coding.planDigest))
  )
    return invalidState('invalid test plan digest');
  if (
    !Value.Check(
      Type.Record(
        Type.String({ pattern: '^US-\\d{3}$' }),
        StoryRecordReferenceSchema,
        { additionalProperties: false },
      ),
      coding.records,
    )
  )
    return invalidState('invalid story record references');

  return {
    version: 6,
    runId: raw.runId,
    projectName: raw.projectName,
    goal: raw.goal,
    phase: raw.phase,
    status: raw.status,
    paused: raw.paused,
    round: raw.round,
    currentArtifactIndex: raw.currentArtifactIndex,
    pendingGate: decodePendingGate(raw.pendingGate),
    feedback: decodeNullableString(raw.feedback, 'feedback'),
    lastReport: decodeNullableString(raw.lastReport, 'lastReport'),
    lastError: decodeNullableString(raw.lastError, 'lastError'),
    modeling: decodeModelingProgress(raw.modeling),
    discovery: decodeDiscovery(raw.discovery, raw.phase, raw.status),
    coding: {
      storyIds: coding.storyIds.flatMap((value) =>
        typeof value === 'string' ? [value] : [],
      ),
      currentStoryIndex: coding.currentStoryIndex,
      changedFiles: coding.changedFiles.flatMap((value) =>
        typeof value === 'string' ? [value] : [],
      ),
      baseline: decodeCodingBaseline(coding.baseline),
      planDigest: coding.planDigest,
      cycles,
      verifications,
      revisionStart: coding.revisionStart,
      records: coding.records,
      tdd: decodeTddCycle(coding.tdd),
    },
    history: decodeHistory(raw.history),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function appendHistory(
  state: EvidenceState,
  event: string,
  detail?: string,
): void {
  const entry: EvidenceState['history'][number] = {
    at: new Date().toISOString(),
    event,
    phase: state.phase,
    round: state.round,
  };
  if (detail) entry.detail = detail;
  state.history.push(entry);
  if (state.history.length > 200)
    state.history.splice(0, state.history.length - 200);
}

export async function saveState(
  root: string,
  state: EvidenceState,
): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(root, STATE_PATH, state);
}

export function createInitialState(
  projectName: string,
  goal: string,
): EvidenceState {
  const now = new Date().toISOString();
  const state: EvidenceState = {
    version: 6,
    runId: randomUUID(),
    projectName,
    goal,
    phase: 'modeling',
    status: 'ready',
    paused: false,
    round: 0,
    currentArtifactIndex: 0,
    pendingGate: null,
    feedback: null,
    lastReport: null,
    lastError: null,
    discovery: initialDiscovery(),
    modeling: {
      applicable: null,
      rationale: null,
      files: [],
      machineValidated: false,
      simulationPassed: null,
    },
    coding: {
      storyIds: [],
      currentStoryIndex: 0,
      changedFiles: [],
      baseline: null,
      planDigest: null,
      cycles: [],
      verifications: [],
      revisionStart: 0,
      records: {},
      tdd: {
        stage: 'red',
        binding: null,
        red: null,
        green: null,
      },
    },
    history: [],
    createdAt: now,
    updatedAt: now,
  };
  appendHistory(state, 'workflow_initialized', goal.slice(0, 200));
  return state;
}

export async function ensureWorkspace(root: string): Promise<void> {
  const directories = [
    '.evidence',
    'artifacts/00-input',
    'artifacts/01-requirements',
    'artifacts/02-modeling',
    'artifacts/03-architecture',
    'artifacts/04-planning',
    'artifacts/05-coding',
    'artifacts/06-review',
    'artifacts/gates',
    'reports',
  ];
  await Promise.all(
    directories.map((directory) =>
      mkdir(projectPath(root, directory), { recursive: true }),
    ),
  );
}

export async function removeWorkflowState(
  root: string,
  removeArtifacts: boolean,
): Promise<void> {
  await rm(projectPath(root, STATE_PATH), { force: true });
  if (!removeArtifacts) return;

  await Promise.all(
    [
      'artifacts/01-requirements',
      'artifacts/02-modeling',
      // Retired layout is removed only when the human explicitly deletes artifacts.
      'artifacts/02-domain',
      'artifacts/03-architecture',
      'artifacts/04-planning',
      'artifacts/05-coding',
      'artifacts/06-review',
      'artifacts/gates',
      'reports',
    ].map((path) =>
      rm(projectPath(root, path), { recursive: true, force: true }),
    ),
  );
  await ensureWorkspace(root);
}

export function activePhaseOrThrow(state: EvidenceState): ActivePhase {
  if (state.phase === 'complete')
    throw new Error('Workflow is already complete');
  return state.phase;
}

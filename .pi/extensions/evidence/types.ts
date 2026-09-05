export const ACTIVE_PHASES = [
  'requirements',
  'domain',
  'architecture',
  'planning',
  'coding',
  'review',
] as const;

export type ActivePhase = (typeof ACTIVE_PHASES)[number];
export type WorkflowPhase = ActivePhase | 'complete';
export type GateMode = 'auto' | 'review' | 'review_if';
export type WorkflowStatus =
  | 'ready'
  | 'running'
  | 'waiting_review'
  | 'blocked'
  | 'complete';
export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export interface ModelProfile {
  /** provider/model-id. Null means inherit the model selected in Pi. */
  model: string | null;
  thinkingLevel: ThinkingLevel;
}

export interface EvidenceConfig {
  version: 1;
  maxRounds: number;
  autoContinueArtifacts: boolean;
  newSessionPerPhase: boolean;
  gitCheckpointOnApproval: boolean;
  qualityCommands: string[];
  commandTimeoutMs: number;
  models: Record<ActivePhase, ModelProfile>;
  gates: Record<ActivePhase, GateMode>;
}

export interface PendingGate {
  id: string;
  path: string;
  phase: ActivePhase;
  subject: string;
  reportPath: string;
  artifactPaths: string[];
  artifactDigest: string;
  createdAt: string;
}

export type TddStage = 'red' | 'green' | 'refactor';

export interface TddCommandEvidence {
  command: string;
  observation: string;
  exitCode: number;
  killed: boolean;
  output: string;
  recordedAt: string;
}

export interface TddCycle {
  stage: TddStage;
  red: TddCommandEvidence | null;
  green: TddCommandEvidence | null;
}

export interface CodingBaseline {
  gitAvailable: boolean;
  dirtyPaths: string[];
  fileHashes: Record<string, string>;
  capturedAt: string;
}

export interface CodingProgress {
  storyIds: string[];
  currentStoryIndex: number;
  changedFiles: string[];
  baseline: CodingBaseline | null;
  tdd: TddCycle;
}

export interface ModelingProgress {
  applicable: boolean | null;
  rationale: string | null;
  files: string[];
  machineValidated: boolean;
  simulationPassed: boolean | null;
}

export interface HistoryEntry {
  at: string;
  event: string;
  phase: WorkflowPhase;
  round: number;
  detail?: string;
}

export interface EvidenceState {
  version: 2;
  projectName: string;
  goal: string;
  phase: WorkflowPhase;
  status: WorkflowStatus;
  paused: boolean;
  round: number;
  currentArtifactIndex: number;
  pendingGate: PendingGate | null;
  feedback: string | null;
  lastReport: string | null;
  lastError: string | null;
  modeling: ModelingProgress;
  coding: CodingProgress;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface OccurrenceRule {
  needle: string;
  minimum: number;
  label: string;
}

export interface ArtifactSpec {
  key: string;
  label: string;
  output: string;
  promptFile: string;
  inputs: string[];
  kind?: 'markdown' | 'fm-model';
  skillFile?: string;
  minChars: number;
  requiredSections: string[];
  minTableRows?: number;
  minUniqueStoryIds?: number;
  occurrences?: OccurrenceRule[];
}

export interface PhaseDefinition {
  id: ActivePhase;
  label: string;
  skillFile: string;
  artifacts: ArtifactSpec[];
}

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ArtifactValidation {
  path: string;
  passed: boolean;
  chars: number;
  tableRows: number;
  issues: ValidationIssue[];
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckItem {
  name: string;
  status: CheckStatus;
  details: string;
  command?: string;
  exitCode?: number;
  output?: string;
}

export interface CheckReport {
  phase: ActivePhase;
  subject: string;
  round: number;
  passed: boolean;
  warnings: number;
  createdAt: string;
  items: CheckItem[];
}

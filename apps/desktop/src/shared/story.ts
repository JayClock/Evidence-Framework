import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type {
  BusinessStoryProjection,
  WhatIfResult,
} from '@evidence-poc/evidence-agent';

export const STORY_IPC_CHANNELS = {
  LIST_FLOWS: 'evidence:story:list-flows',
  PROJECT: 'evidence:story:project',
  WHAT_IF: 'evidence:story:what-if',
  INVALIDATED: 'evidence:story:invalidated',
} as const;

/** Explicit snapshots include unsaved inspector edits; omission reads disk. */
export interface StoryModelInput {
  readonly rootPath: string;
  readonly document?: DomainModelDocument;
}

export interface StoryProjectInput extends StoryModelInput {
  readonly flowId: string;
  /** Facts-only mode works without credentials and never calls an LLM. */
  readonly skipAi?: boolean;
}

export interface StoryProjectResult {
  readonly flow: FlowScenarioTrace;
  readonly projection: BusinessStoryProjection;
}

export interface StoryWhatIfInput extends StoryModelInput {
  readonly flowId: string;
  readonly currentStepSequence: number;
  /** Refuse to answer against a step that changed since it was displayed. */
  readonly stepHash: string;
  readonly question: string;
}

export interface StoryInvalidatedEvent {
  readonly rootPath: string;
}

export interface StoryPlaybackState {
  readonly activeFlowId?: string;
  readonly currentStepSequence: number;
  readonly isPlaying: boolean;
  readonly projection?: BusinessStoryProjection;
  readonly loading: boolean;
  readonly error?: string;
}

export interface EvidenceStoryApi {
  listFlows: (input: StoryModelInput) => Promise<readonly FlowScenarioTrace[]>;
  project: (input: StoryProjectInput) => Promise<StoryProjectResult>;
  whatIf: (input: StoryWhatIfInput) => Promise<WhatIfResult>;
  onInvalidated: (
    listener: (event: StoryInvalidatedEvent) => void,
  ) => () => void;
}

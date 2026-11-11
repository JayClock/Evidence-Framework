/** One interview question recorded by `evidence-discovery`. */
export interface TraceQuestion {
  questionId: string;
  question: string;
  targetAttribute?: string;
  intent?: string;
}

/** The `interview-trace.json` slice the frontier reads. */
export interface InterviewTraceRecord {
  traceId: string;
  timestamp: string;
  focus: { contextRef?: string; evidenceRef: string; roleRef?: string };
  narrative: { judgment: string; story: string; keyData?: readonly string[] };
  qa: readonly TraceQuestion[];
  userInput: { rawText: string; confirmedFacts: readonly string[] };
  targetBindings: readonly {
    evidenceRef: string;
    attributeName?: string;
    sourceType: string;
    upstreamEvidenceRef?: string;
    sourceDescription?: string;
  }[];
}

export interface InterviewTraceDocument {
  schemaVersion: string;
  modelId: string;
  traces: readonly InterviewTraceRecord[];
}

/** Recorded human closure markers defined by the evidence-modeling gate. */
export const CLOSURE_PREFIXES = [
  '范围结束确认：',
  '全局追责结束确认：',
] as const;

export interface OpenQuestion {
  traceId: string;
  questionId: string;
  question: string;
  targetAttribute?: string;
}

export interface FrontierDependencyGap {
  kind: 'dangling-evidence' | 'unbound-key-data';
  message: string;
  ref?: string;
}

export interface DependencyFrontier {
  /** Context of the newest record, or null before the first interview. */
  contextRef: string | null;
  evidenceRef: string | null;
  roleRef: string | null;
  /** Business judgment plus story of the newest record. */
  story: string;
  judgment: string;
  keyData: readonly string[];
  /** Questions from the newest round that no later round answered. */
  openQuestions: readonly OpenQuestion[];
  /** Refs the trace cites that the model no longer contains. */
  gaps: readonly FrontierDependencyGap[];
  /** True once a closure marker for `contextRef` is recorded. */
  closed: boolean;
  /** Entities confirmed so far in the newest record. */
  confirmedFacts: readonly string[];
}

const isClosure = (fact: string, contextRef: string | undefined): boolean =>
  contextRef !== undefined &&
  CLOSURE_PREFIXES.some((prefix) => fact === `${prefix}${contextRef}`);

/**
 * Derives the current dependency frontier from the trace and the model.
 *
 * The frontier only reports what the newest round says: it never invents a
 * question, and it never treats an unanswered item as agreed. A question
 * counts as answered once that same round binds the attribute it asks about.
 */
export const calculateFrontier = ({
  trace,
  entityIds,
}: {
  trace: InterviewTraceDocument | null;
  entityIds: readonly string[];
}): DependencyFrontier => {
  const newest = trace?.traces.at(-1);

  if (newest === undefined) {
    return {
      contextRef: null,
      evidenceRef: null,
      roleRef: null,
      story: '',
      judgment: '',
      keyData: [],
      openQuestions: [],
      gaps: [],
      closed: false,
      confirmedFacts: [],
    };
  }

  const boundInRecord = new Set(
    newest.targetBindings.flatMap((binding) =>
      binding.attributeName === undefined ? [] : [binding.attributeName],
    ),
  );
  const known = new Set(entityIds);
  const gaps: FrontierDependencyGap[] = [];

  for (const ref of [
    newest.focus.evidenceRef,
    ...newest.targetBindings.map((binding) => binding.evidenceRef),
    ...newest.targetBindings.flatMap((binding) =>
      binding.upstreamEvidenceRef === undefined
        ? []
        : [binding.upstreamEvidenceRef],
    ),
  ]) {
    if (!known.has(ref)) {
      gaps.push({
        kind: 'dangling-evidence',
        message: `追溯记录引用了模型中不存在的凭证：${ref}`,
        ref,
      });
    }
  }

  const openQuestions = newest.qa
    .filter(
      (entry) =>
        entry.targetAttribute === undefined ||
        !boundInRecord.has(entry.targetAttribute),
    )
    .map((entry) => ({
      traceId: newest.traceId,
      questionId: entry.questionId,
      question: entry.question,
      ...(entry.targetAttribute === undefined
        ? {}
        : { targetAttribute: entry.targetAttribute }),
    }));

  return {
    contextRef: newest.focus.contextRef ?? null,
    evidenceRef: newest.focus.evidenceRef,
    roleRef: newest.focus.roleRef ?? null,
    story: newest.narrative.story,
    judgment: newest.narrative.judgment,
    keyData: newest.narrative.keyData ?? [],
    openQuestions,
    gaps,
    closed: newest.userInput.confirmedFacts.some((fact) =>
      isClosure(fact, newest.focus.contextRef),
    ),
    confirmedFacts: newest.userInput.confirmedFacts,
  };
};

import { readFile } from 'node:fs/promises';

import type { InterviewTraceDocument } from '@evidence-poc/evidence-modeling-orchestrator';

import { tracePathOf } from './modelSource';

export type TraceReadResult =
  | { success: true; trace: InterviewTraceDocument }
  | { success: true; trace: null }
  | { success: false; error: string };

/**
 * Reads `.evidence/traces/interview-trace.json` without validating it.
 *
 * The pure `calculateFrontier` in the orchestrator owns the business read; this
 * reader only refuses files that are not a trace at all, so a partially written
 * interview log surfaces as an error instead of an empty frontier.
 */
export const readInterviewTrace = async (
  rootPath: string,
  readFileImpl: typeof readFile = readFile,
): Promise<TraceReadResult> => {
  // `.evidence/` lives next to a bundle file, not inside it.
  const file = tracePathOf(rootPath);

  let raw: string;

  try {
    raw = await readFileImpl(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: true, trace: null };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '无法读取追溯日志。',
    };
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as { traces?: unknown }).traces)
    ) {
      return {
        success: false,
        error: '追溯日志缺少 traces 数组，无法推导依赖前沿。',
      };
    }

    return { success: true, trace: parsed as InterviewTraceDocument };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? `追溯日志不是合法 JSON：${error.message}`
          : '追溯日志不是合法 JSON。',
    };
  }
};

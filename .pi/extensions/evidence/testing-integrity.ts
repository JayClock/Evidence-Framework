import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { hasInvalidTestOutput, validateTestFilePath } from './test-files.ts';
import {
  CompletedCycleSchema,
  TaskVerificationSchema,
  type CompletedTddCycle,
  type TaskVerification,
} from './testing-schema.ts';
import type { TddCommandEvidence } from './types.ts';

export function isPassingEvidence(evidence: TddCommandEvidence): boolean {
  return (
    evidence.exitCode === 0 &&
    !evidence.killed &&
    !hasInvalidTestOutput(evidence.output) &&
    Number.isFinite(Date.parse(evidence.recordedAt))
  );
}
export function isRedEvidence(evidence: TddCommandEvidence): boolean {
  return (
    evidence.exitCode !== 0 &&
    evidence.exitCode !== 126 &&
    evidence.exitCode !== 127 &&
    !evidence.killed &&
    !hasInvalidTestOutput(evidence.output) &&
    Number.isFinite(Date.parse(evidence.recordedAt))
  );
}
export function decodeCompletedCycles(value: unknown): CompletedTddCycle[] {
  if (!Value.Check(Type.Array(CompletedCycleSchema, { maxItems: 1000 }), value))
    throw new Error('invalid completed TDD cycles');
  for (const [index, cycle] of value.entries()) {
    if (
      cycle.id !== index + 1 ||
      !isRedEvidence(cycle.red) ||
      !isPassingEvidence(cycle.green) ||
      !isPassingEvidence(cycle.refactor) ||
      cycle.red.command !== cycle.green.command ||
      cycle.red.command !== cycle.refactor.command ||
      Date.parse(cycle.red.recordedAt) > Date.parse(cycle.green.recordedAt) ||
      Date.parse(cycle.green.recordedAt) >
        Date.parse(cycle.refactor.recordedAt) ||
      Object.keys(cycle.testFileHashes).length === 0
    )
      throw new Error(`invalid TDD cycle evidence: ${cycle.id}`);
    Object.keys(cycle.testFileHashes).forEach(validateTestFilePath);
  }
  return value;
}
export function decodeVerifications(value: unknown): TaskVerification[] {
  if (
    !Value.Check(Type.Array(TaskVerificationSchema, { maxItems: 1000 }), value)
  )
    throw new Error('invalid task verifications');
  for (const verification of value) {
    if (
      new Set(verification.checks.map((check) => check.checkId)).size !==
        verification.checks.length ||
      verification.checks.some((check) => !isPassingEvidence(check.evidence))
    )
      throw new Error(`invalid verification evidence: ${verification.taskId}`);
  }
  return value;
}

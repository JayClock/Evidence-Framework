import { compactCanonicalJson } from '@evidence-poc/evidence-schema';
import { digestOf } from '../validation/modelDigest.js';
import type { StepFingerprintInput } from './types.js';

/** Hash only local facts, even when passed a complete step at runtime. */
export const computeStepHash = (input: StepFingerprintInput): string =>
  digestOf(
    compactCanonicalJson({
      entityId: input.entityId,
      entityKind: input.entityKind,
      actingRoleRef: input.actingRoleRef,
      asOf: input.asOf,
      basedOn: input.basedOn,
      values: input.values,
      derivedAssertions: input.derivedAssertions,
    }),
  );

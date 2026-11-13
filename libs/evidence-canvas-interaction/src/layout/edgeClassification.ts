import type { EntityAST } from '@evidence-poc/evidence-schema';

/**
 * Why two objects in different Contexts are connected.
 *
 * A boundary crossing is not one thing. A settled moment can discharge another
 * contract's obligation, a capability role can be filled by whoever wins the
 * work, and two contracts can only meet because they trade in the same object.
 * Reading them as one dashed line hides the place where the architecture is
 * actually allowed to change.
 */
export type CrossContextEdgeKind =
  /** A settled moment in one Context is cited by another Context. */
  | 'moment_trace'
  /** A capability role is filled from outside the Context that depends on it. */
  | 'role_inversion'
  /** Two Contexts meet through an object they both trade in. */
  | 'shared_thing'
  /** Any other permitted boundary crossing. */
  | 'standard_cross';

const MOMENT_EVIDENCE_KINDS: readonly string[] = [
  'fulfillment_confirmation',
  'other_evidence',
  'contract',
];

const isMomentEvidence = (entity: EntityAST): boolean =>
  entity.category === 'evidence' &&
  MOMENT_EVIDENCE_KINDS.includes(entity.kind);

const isThing = (entity: EntityAST): boolean =>
  entity.category === 'participant' && entity.kind === 'thing';

/**
 * Names the reason a relationship crosses a Context boundary.
 *
 * Returns `null` when both ends sit in the same Context, because then the edge
 * says nothing about the architecture: it is an ordinary reference inside one
 * agreement.
 */
export const classifyCrossContextEdge = (input: {
  source: EntityAST;
  target: EntityAST;
  kind: 'plays_role' | 'references';
  crossContext: boolean;
}): CrossContextEdgeKind | null => {
  const { source, target, kind, crossContext } = input;

  if (!crossContext) {
    return null;
  }

  // A role is the socket a foreign player implements, whatever the role kind.
  if (kind === 'plays_role') {
    return 'role_inversion';
  }

  if (isThing(source) || isThing(target)) {
    return 'shared_thing';
  }

  if (isMomentEvidence(source) && isMomentEvidence(target)) {
    return 'moment_trace';
  }

  if (target.category === 'role' && target.kind === 'evidence') {
    return 'role_inversion';
  }

  return 'standard_cross';
};

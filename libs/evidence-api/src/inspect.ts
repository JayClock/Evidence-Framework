import type { EntityAST } from '@evidence-poc/evidence-schema';

import {
  partyRolesPlayedByParticipants,
  type FmIndex,
} from './adapter/fmAdapter.js';

/**
 * What a designer needs before writing a single resource.
 *
 * The summary never proposes a route: it lists what the model contains, which
 * Party Roles an actual `participant.party` plays — only those can become
 * callable actors — and which Contexts exist. Deciding the resource shape stays
 * a design act, which is why the answer is a list of clues rather than a plan.
 */

/** One line of the inventory a designer reads. */
export interface InspectEntry {
  id: string;
  label?: string;
  category?: string;
  kind?: string;
  /** Null when the object belongs to no Context, e.g. a Participant Party. */
  contextRef?: string | null;
}

export interface InspectSummary {
  schemaVersion: string;
  model: Record<string, unknown>;
  fmCheckSummary: unknown;
  roles: InspectEntry[];
  playedPartyRoles: string[];
  unplayedPartyRoles: string[];
  resourceClues: InspectEntry[];
  contexts: string[];
  scenarios: [string, unknown][];
  inputFiles: Record<string, string>;
}

/**
 * One inventory line, with every field printed even when it is null.
 *
 * A missing `contextRef` is information — a Party sits outside every Context —
 * so the key stays and says so instead of disappearing from the report.
 */
const entryOf = (entity: EntityAST, withCategory: boolean): InspectEntry => ({
  id: entity.id,
  label: entity.label,
  ...('kind' in entity ? { kind: entity.kind } : {}),
  ...(withCategory ? { category: entity.category } : {}),
  contextRef:
    'contextRef' in entity && entity.contextRef !== undefined
      ? entity.contextRef
      : null,
});

const byId = (left: InspectEntry, right: InspectEntry): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

/** Builds the read-only inventory an API design starts from. */
export const inspectSummary = (index: FmIndex): InspectSummary => {
  const played = partyRolesPlayedByParticipants(index);
  const roles = [...index.entities.values()].filter(
    (entity) => entity.category === 'role',
  );

  return {
    schemaVersion: index.compiled.schemaVersion,
    model: index.compiled.model as unknown as Record<string, unknown>,
    fmCheckSummary: index.check,
    roles: roles.map((entity) => entryOf(entity, false)).sort(byId),
    playedPartyRoles: [...played].sort(),
    unplayedPartyRoles: roles
      .filter((entity) => entity.kind === 'party' && !played.has(entity.id))
      .map((entity) => entity.id)
      .sort(),
    resourceClues: [...index.entities.values()]
      .filter(
        (entity) => entity.category === 'evidence' || entity.category === 'participant',
      )
      .map((entity) => entryOf(entity, true))
      .sort(byId),
    contexts: [...index.entities.values()]
      .filter((entity) => entity.category === 'context')
      .map((entity) => entity.id)
      .sort(),
    scenarios: [...index.scenarios.entries()]
      .map(([id, scenario]): [string, unknown] => [id, scenario.label])
      .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0)),
    inputFiles: index.files,
  };
};

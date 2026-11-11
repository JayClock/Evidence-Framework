import { createHash } from 'node:crypto';

import {
  REQUIRED_EVIDENCE_TIME_ATTRIBUTES,
  type DomainModelDocument,
  type EvidenceKind,
  isEvidenceEntity,
} from '@evidence-poc/evidence-schema';

import {
  indexSuite,
  type EvidenceInstance,
  type ValidationSuite,
} from './validationSuite.js';
import { isTimestampText } from './typedValues.js';

/**
 * The deterministic Evidence-only timeline `build_fm_timeline.py` produced.
 *
 * Order is never derived from timestamps: a lane is read in the order the
 * instances' `basedOn` links establish, and two instances with no basis path
 * between them are reported as unresolved instead of guessed.
 */

/** Business time of one instance, as the lane and the checks read it. */
export type TimelineTime =
  | { kind: 'interval'; startedAt: unknown; expiredAt: unknown }
  | { kind: 'moment'; attribute: string; at: unknown };

export interface TimelineEvidenceType {
  entityRef: string;
  contextRef: string;
  evidenceKind: EvidenceKind;
  timeAttributes: readonly string[];
}

export interface TimelineInstance {
  instanceRef: string;
  entityRef: string;
  contextRef: string;
  evidenceKind: EvidenceKind;
  time: TimelineTime | null;
  basedOn: readonly string[];
  values: Record<string, unknown>;
}

export interface TimelineDependency {
  sourceRef: string;
  targetRef: string;
}

export interface TimelineUnresolvedOrder {
  leftRef: string;
  rightRef: string;
  reason: string;
}

export interface EvidenceTimeline {
  schemaVersion: '5.0';
  modelId: unknown;
  lanes: readonly { contextRef: string }[];
  evidenceTypes: readonly TimelineEvidenceType[];
  instances: readonly TimelineInstance[];
  dependencies: readonly TimelineDependency[];
  unresolvedOrder: readonly TimelineUnresolvedOrder[];
}

export interface TimelineSummary {
  laneCount: number;
  evidenceTypeCount: number;
  instanceCount: number;
  dependencyCount: number;
  unresolvedOrderCount: number;
  sha256: string;
}

const UNRESOLVED_REASON =
  'no instance basis path; timestamps do not imply dependency';

/**
 * Compact JSON with sorted keys, byte-identical to the Python writer.
 *
 * The FM reports hash this text, so key order and separators are part of the
 * contract rather than a formatting preference.
 */
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
};

/** `sha256:<hex>` over the canonical JSON plus a trailing newline. */
export const digestOf = (value: unknown): string =>
  `sha256:${createHash('sha256')
    .update(`${canonicalJson(value)}\n`, 'utf8')
    .digest('hex')}`;

const timeAttributesOf = (kind: string): readonly string[] =>
  isEvidenceKind(kind) ? REQUIRED_EVIDENCE_TIME_ATTRIBUTES[kind] : [];

const isEvidenceKind = (kind: string): kind is EvidenceKind =>
  kind in REQUIRED_EVIDENCE_TIME_ATTRIBUTES;

const timeOf = (
  instance: EvidenceInstance,
  kind: EvidenceKind,
): TimelineTime | null => {
  const names = timeAttributesOf(kind);

  if (names.length === 2) {
    // Both keys are always printed: a missing bound is `null`, not an absent key,
    // so the timeline digest is the same whether or not the value was asserted.
    return {
      kind: 'interval',
      startedAt: instance.values[names[0] as string] ?? null,
      expiredAt: instance.values[names[1] as string] ?? null,
    };
  }

  if (names.length === 1 && names[0] !== undefined) {
    const attribute = names[0];

    return attribute in instance.values
      ? { kind: 'moment', attribute, at: instance.values[attribute] }
      : null;
  }

  return null;
};

const parseTime = (value: unknown): number | null =>
  isTimestampText(value) ? Date.parse(value) : null;

const boundsOf = (time: TimelineTime | null): [number | null, number | null] => {
  if (time === null) {
    return [null, null];
  }

  if (time.kind === 'interval') {
    return [parseTime(time.startedAt), parseTime(time.expiredAt)];
  }

  const value = parseTime(time.at);

  return [value, value];
};

/**
 * Builds the timeline and the ordering problems it cannot resolve.
 *
 * An interval that starts after it expires, a basis cycle, or a basis formed
 * after the instance that depends on it are errors rather than warnings: each
 * one means the lane order would be a fiction.
 */
export const buildTimeline = (
  model: DomainModelDocument,
  suite: ValidationSuite,
): { timeline: EvidenceTimeline; errors: readonly string[] } => {
  const evidenceEntities = new Map(
    model.entities
      .filter(isEvidenceEntity)
      .map((entity) => [entity.id, entity] as const),
  );
  const lanes = [
    ...new Set(
      [...evidenceEntities.values()].map((entity) => entity.contextRef),
    ),
  ].sort();
  const evidenceTypes = [...evidenceEntities.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([entityRef, entity]) => ({
      entityRef,
      contextRef: entity.contextRef,
      evidenceKind: entity.kind,
      timeAttributes: timeAttributesOf(entity.kind),
    }));

  const errors: string[] = [];
  const { instances } = indexSuite(suite);
  const bounds = new Map<string, [number | null, number | null]>();
  const timelineInstances: TimelineInstance[] = [];

  for (const instanceId of [...instances.keys()].sort()) {
    const instance = instances.get(instanceId) as EvidenceInstance;
    const entity = evidenceEntities.get(instance.entityRef);

    if (entity === undefined) {
      continue;
    }

    const time = timeOf(instance, entity.kind);
    const [start, end] = boundsOf(time);

    bounds.set(instanceId, [start, end]);

    if (start !== null && end !== null && start > end) {
      errors.push(`${instanceId}: Evidence interval starts after it expires`);
    }

    timelineInstances.push({
      instanceRef: instanceId,
      entityRef: instance.entityRef,
      contextRef: entity.contextRef,
      evidenceKind: entity.kind,
      time,
      basedOn: [...(instance.basedOn ?? [])].sort(),
      values: instance.values,
    });
  }

  const visit = (instanceId: string, path: readonly string[]): void => {
    if (path.includes(instanceId)) {
      errors.push(`${instanceId}: basedOn cycle detected`);

      return;
    }

    for (const basis of instances.get(instanceId)?.basedOn ?? []) {
      if (!instances.has(basis)) {
        continue;
      }

      const basisFormed = bounds.get(basis)?.[0] ?? null;
      const currentStart = bounds.get(instanceId)?.[0] ?? null;

      if (
        basisFormed !== null &&
        currentStart !== null &&
        basisFormed > currentStart
      ) {
        errors.push(`${instanceId}: basedOn references future Evidence '${basis}'`);
      }

      visit(basis, [...path, instanceId]);
    }
  };

  for (const instanceId of [...instances.keys()].sort()) {
    visit(instanceId, []);
  }

  const dependencies = timelineInstances
    .flatMap((instance) =>
      instance.basedOn
        .filter((basis) => bounds.has(basis))
        .map((basis) => ({ sourceRef: basis, targetRef: instance.instanceRef })),
    )
    .sort((left, right) =>
      left.sourceRef === right.sourceRef
        ? left.targetRef.localeCompare(right.targetRef)
        : left.sourceRef.localeCompare(right.sourceRef),
    );

  const adjacency = new Map<string, Set<string>>(
    [...bounds.keys()].map((instanceId) => [instanceId, new Set<string>()]),
  );

  for (const dependency of dependencies) {
    adjacency.get(dependency.sourceRef)?.add(dependency.targetRef);
  }

  const reachable = (
    source: string,
    target: string,
    seen: ReadonlySet<string> = new Set<string>(),
  ): boolean => {
    if (source === target) {
      return true;
    }

    const visited = new Set(seen);

    if (visited.has(source)) {
      return false;
    }

    visited.add(source);

    return [...(adjacency.get(source) ?? [])].some((item) =>
      reachable(item, target, visited),
    );
  };

  const unresolvedOrder: TimelineUnresolvedOrder[] = [];
  const ids = [...bounds.keys()].sort();

  ids.forEach((source, index) => {
    for (const target of ids.slice(index + 1)) {
      const left = evidenceEntities.get(
        instances.get(source)?.entityRef ?? '',
      );
      const right = evidenceEntities.get(
        instances.get(target)?.entityRef ?? '',
      );

      if (left?.contextRef !== right?.contextRef) {
        continue;
      }

      if (!reachable(source, target) && !reachable(target, source)) {
        unresolvedOrder.push({
          leftRef: source,
          rightRef: target,
          reason: UNRESOLVED_REASON,
        });
      }
    }
  });

  return {
    timeline: {
      schemaVersion: '5.0',
      modelId: model.manifest.id,
      lanes: lanes.map((contextRef) => ({ contextRef })),
      evidenceTypes,
      instances: timelineInstances,
      dependencies,
      unresolvedOrder,
    },
    errors: [...new Set(errors)],
  };
};

/** The five collections a summary counts, present even when nothing was built. */
export type TimelineCollections = Pick<
  EvidenceTimeline,
  'lanes' | 'evidenceTypes' | 'instances' | 'dependencies' | 'unresolvedOrder'
>;

/** An empty timeline, which is what a check reports when it never got to build one. */
export const emptyTimelineCollections = (): TimelineCollections => ({
  lanes: [],
  evidenceTypes: [],
  instances: [],
  dependencies: [],
  unresolvedOrder: [],
});

/** The counts and digest `check_fm.py` puts under `timelineSummary`. */
export const timelineSummary = (timeline: TimelineCollections): TimelineSummary => ({
  laneCount: timeline.lanes.length,
  evidenceTypeCount: timeline.evidenceTypes.length,
  instanceCount: timeline.instances.length,
  dependencyCount: timeline.dependencies.length,
  unresolvedOrderCount: timeline.unresolvedOrder.length,
  sha256: digestOf(timeline),
});

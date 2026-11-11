import type { DesignDocument } from '../loader/apiLoader.js';
import type { FmIndex } from '../adapter/fmAdapter.js';
import { partyRolesPlayedByParticipants } from '../adapter/fmAdapter.js';
import {
  errorDiagnostic,
  gapDiagnostic,
  type Diagnostic,
} from '../diagnostics.js';
import { compareText } from '../order.js';
import type { ProjectedCapability } from './capabilities.js';

/**
 * Whether the API accounts for the whole model, not just the part it likes.
 *
 * Every Evidence, Participant and Thing entity is either reachable through an
 * interface or explained as an internal/external activity with a business
 * reason. "Internal" is not an escape hatch: an entity that already has a write
 * interface cannot also be declared out of scope, or the two statements
 * contradict each other.
 */

type JsonObject = Record<string, unknown>;

/** Categories the model expects the API to account for. */
const RESOURCE_CATEGORIES = new Set(['evidence', 'thing', 'participant']);

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/** One modelled object and how the design accounted for it. */
export interface ModelCoverageRow {
  entityRef: string;
  /** Null for a Party, which belongs to no Context. */
  contextRef: unknown;
  handling: 'api' | 'internal' | 'external' | 'gap';
  capabilityRefs: string[];
  basis: unknown;
}

const hasWriteInterface = (
  capabilities: readonly ProjectedCapability[],
): boolean =>
  capabilities.some((capability) => {
    const effect = isRecord(capability['effect']) ? capability['effect'] : {};

    return effect['kind'] === 'append_evidence';
  });

/**
 * True when the entity is formed by a Party Role nobody plays.
 *
 * Such an entity cannot be called into existence over HTTP — no one can act — so
 * the design may legitimately declare its formation as an internal activity.
 */
const formationRoleWithoutPlayer = (
  entity: JsonObject,
  index: FmIndex,
  playedPartyRoles: ReadonlySet<string>,
): boolean => {
  const roleRef = asString(entity['responsibleRoleRef']);
  const role = roleRef === undefined ? undefined : index.entities.get(roleRef);

  return (
    roleRef !== undefined &&
    role !== undefined &&
    role.category === 'role' &&
    role.kind === 'party' &&
    !playedPartyRoles.has(roleRef)
  );
};

export interface ProjectModelCoverageResult {
  modelCoverage: ModelCoverageRow[];
  diagnostics: Diagnostic[];
}

/**
 * Accounts for every entity the model contains.
 *
 * The row is what a reviewer reads: `api` means interfaces exist, `internal` or
 * `external` means the design explained why not, and `gap` means the question is
 * still open.
 */
export const projectModelCoverage = (
  design: DesignDocument,
  index: FmIndex,
  capabilities: readonly ProjectedCapability[],
): ProjectModelCoverageResult => {
  const diagnostics: Diagnostic[] = [];
  const result: ModelCoverageRow[] = [];
  const playedPartyRoles = partyRolesPlayedByParticipants(index);
  const objects = new Map(
    [...index.entities.values()]
      .filter((entity) => RESOURCE_CATEGORIES.has(entity.category))
      .map((entity) => [entity.id, entity as unknown as JsonObject] as const),
  );
  const activities = new Map<string, JsonObject>();

  for (const activity of recordsOf(design['nonApiActivities'])) {
    const ref = String(activity['entityRef'] ?? '');

    if (!objects.has(ref)) {
      diagnostics.push(
        errorDiagnostic(
          'FM_REF_NOT_FOUND',
          '非接口活动须对应整体 FM 中的实际业务对象',
          ref,
        ),
      );
    }

    if (activities.has(ref)) {
      diagnostics.push(
        errorDiagnostic('MODEL_HANDLING_CONFLICT', '同一对象的非接口处理重复', ref),
      );
    }

    activities.set(ref, activity);
  }

  for (const ref of [...objects.keys()].sort(compareText)) {
    const entity = objects.get(ref) as JsonObject;
    const interfaces = capabilities.filter((capability) => {
      const effect = isRecord(capability['effect']) ? capability['effect'] : {};

      return effect['targetRef'] === ref;
    });
    const writeInterfaceExists = hasWriteInterface(interfaces);
    const activity = activities.get(ref);
    const formationRoleUnplayed = formationRoleWithoutPlayer(
      entity,
      index,
      playedPartyRoles,
    );
    const nonApiFormationWithApiReads =
      activity !== undefined &&
      interfaces.length > 0 &&
      entity['category'] === 'evidence' &&
      !writeInterfaceExists &&
      formationRoleUnplayed;

    let handling: ModelCoverageRow['handling'] =
      interfaces.length > 0
        ? 'api'
        : activity === undefined
          ? 'gap'
          : (activity['handling'] as ModelCoverageRow['handling']);

    if (interfaces.length > 0 && activity !== undefined && !nonApiFormationWithApiReads) {
      diagnostics.push(
        errorDiagnostic(
          'MODEL_HANDLING_CONFLICT',
          '对象已有写入接口，或非接口活动没有限定为未扮演责任角色的凭证形成，不能同时声明整体内部／外部处理',
          ref,
        ),
      );
      handling = 'gap';
    }

    if (activity !== undefined) {
      const basis = isRecord(activity['basis']) ? activity['basis'] : {};
      const reasoning = asString(basis['reasoning']) ?? '';
      const fmRefs = stringsOf(basis['fmRefs']);
      const sourceRefs = stringsOf(basis['sourceRefs']);

      if (reasoning === '' || !(fmRefs.includes(ref) || sourceRefs.length > 0)) {
        diagnostics.push(
          gapDiagnostic(
            'MODEL_HANDLING_BASIS',
            `${ref}.handling`,
            'business',
            '内部或外部活动须引用对应 FM 对象或业务来源；不能以技术决定排除接口',
            ref,
          ),
        );
        handling = 'gap';
      }
    }

    if (interfaces.length === 0 && activity === undefined) {
      diagnostics.push(
        gapDiagnostic(
          'MODEL_ENTITY_UNCOVERED',
          `${ref}.api`,
          'coverage',
          '整体 FM 对象尚无接口或有依据的内部／外部处理说明',
          ref,
        ),
      );
    }

    if (
      entity['category'] === 'evidence' &&
      interfaces.length > 0 &&
      !writeInterfaceExists &&
      !nonApiFormationWithApiReads
    ) {
      diagnostics.push(
        gapDiagnostic(
          'MODEL_EVIDENCE_WRITE_MISSING',
          `${ref}.formation`,
          'coverage',
          '仅有读取不能覆盖凭证形成能力；除非其责任 Party Role 未被 participant.party 扮演且已声明非接口形成',
          ref,
        ),
      );
      handling = 'gap';
    }

    result.push({
      entityRef: ref,
      contextRef: entity['contextRef'] ?? null,
      handling,
      capabilityRefs: [...new Set(interfaces.map((item) => item.id))].sort(compareText),
      basis: activity?.['basis'] ?? null,
    });
  }

  return { modelCoverage: result, diagnostics };
};

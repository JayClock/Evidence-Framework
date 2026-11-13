import type {
  DomainModelDocument,
  EntityAST,
} from '@evidence-poc/evidence-schema';

export interface CardSummary {
  responsibility: string | null;
  responsibilityRef: string | null;
  /** The concrete party that signs or stamps this evidence, if one is known. */
  partyBadge: PartyBadge | null;
  attributes: string[];
  remainingAttributes: number;
  keyDataCount: number;
  rules: string[];
}

/**
 * Who signs a card, shown as a badge instead of a drawn line.
 *
 * A model separates the responsibility (a Role) from the player (a Party). The
 * role is a stable socket; the party is the organisation that actually stamps
 * the document. Drawing the player as an edge crowds a board with lines that
 * carry no business meaning beyond "this organisation signed it", so the card
 * states it in its own corner.
 */
export interface PartyBadge {
  /** Every party that plays the responsible role, in model order. */
  participants: readonly { id: string; label: string }[];
  /** Label of the first player; the rest are counted, not spelled out. */
  label: string;
  total: number;
}

const buildPartyBadges = (
  document: DomainModelDocument,
  entities: ReadonlyMap<string, EntityAST>,
): ReadonlyMap<string, PartyBadge> => {
  const playersByRole = new Map<string, string[]>();

  for (const relationship of document.relationships) {
    if (relationship.kind !== 'plays_role') {
      continue;
    }

    const player = entities.get(relationship.sourceRef);

    if (player?.category !== 'participant' || player.kind !== 'party') {
      continue;
    }

    const bucket = playersByRole.get(relationship.targetRef) ?? [];

    if (!bucket.includes(player.id)) {
      bucket.push(player.id);
    }

    playersByRole.set(relationship.targetRef, bucket);
  }

  const badges = new Map<string, PartyBadge>();

  for (const entity of document.entities) {
    // A Contract is the bilateral agreement itself: its two roles are the point,
    // so naming one signer behind a badge would hide the other side.
    if (entity.category !== 'evidence' || entity.kind === 'contract') {
      continue;
    }

    const roleId = entity.responsibleRoleRef;
    const participants = (
      roleId === undefined ? [] : (playersByRole.get(roleId) ?? [])
    )
      .map((id) => entities.get(id))
      .filter((candidate): candidate is EntityAST => candidate !== undefined)
      .map(({ id, label }) => ({ id, label }));

    if (participants.length === 0) {
      continue;
    }

    badges.set(entity.id, {
      participants,
      label: participants[0]!.label,
      total: participants.length,
    });
  }

  return badges;
};

/** A view of explicit model facts, not another source of editable metadata. */
export const summarizeCards = (
  document: DomainModelDocument,
): ReadonlyMap<string, CardSummary> => {
  const entities = new Map(
    document.entities.map((entity) => [entity.id, entity]),
  );
  const rulesByEntity = new Map<string, Set<string>>();
  for (const rule of document.rules) {
    const refs = new Set([
      ...Object.values(rule.bindings).flatMap((binding) =>
        'ref' in binding ? [binding.ref] : [],
      ),
      ...(rule.target ? [rule.target.entityRef] : []),
    ]);
    for (const ref of refs) {
      const ids = rulesByEntity.get(ref) ?? new Set<string>();
      ids.add(rule.id);
      rulesByEntity.set(ref, ids);
    }
  }
  const rules = new Map(document.rules.map((rule) => [rule.id, rule]));
  const partyBadges = buildPartyBadges(document, entities);

  return new Map(
    document.entities.map((entity: EntityAST) => {
      const ref =
        entity.category === 'evidence'
          ? (entity.responsibleRoleRef ?? null)
          : null;
      const attributes = [...(entity.attributes ?? [])].sort(
        (left, right) =>
          Number(right.keyData === true) - Number(left.keyData === true),
      );
      const ruleIds = new Set(rulesByEntity.get(entity.id));
      for (const attribute of attributes) {
        if (attribute.derivedByRuleRef && rules.has(attribute.derivedByRuleRef))
          ruleIds.add(attribute.derivedByRuleRef);
      }
      return [
        entity.id,
        {
          responsibility:
            ref === null ? null : (entities.get(ref)?.label ?? ref),
          responsibilityRef: ref,
          partyBadge: partyBadges.get(entity.id) ?? null,
          attributes: attributes
            .slice(0, 3)
            .map((attribute) => attribute.label ?? attribute.name),
          remainingAttributes: Math.max(0, attributes.length - 3),
          keyDataCount: attributes.filter(
            (attribute) => attribute.keyData === true,
          ).length,
          rules: [...ruleIds].map((id) => rules.get(id)!.label),
        },
      ];
    }),
  );
};

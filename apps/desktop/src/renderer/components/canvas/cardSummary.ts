import type {
  DomainModelDocument,
  EntityAST,
} from '@evidence-poc/evidence-schema';

export interface CardSummary {
  responsibility: string | null;
  responsibilityRef: string | null;
  attributes: string[];
  remainingAttributes: number;
  keyDataCount: number;
  rules: string[];
}

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

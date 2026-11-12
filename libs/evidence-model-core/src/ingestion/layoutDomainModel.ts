import type { DomainModelDocument, EntityAST } from '@evidence-poc/evidence-schema';

/** Canvas coordinate of one entity. */
export interface LayoutPoint {
  x: number;
  y: number;
}

/**
 * Horizontal bands the method reads left to right.
 *
 * Pre-contract sourcing sits left of the contract it sourced, the fulfilment
 * sequence runs to the right because it happens after signing, and the things a
 * contract is about hang below on their own row.
 */
export const LAYOUT_COLUMNS = {
  preContract: 0,
  contract: 520,
  fulfillment: 1040,
  domain: 0,
} as const;

export const LAYOUT_ROWS = {
  /** First row of every column; roles and parties share the contract column. */
  first: 140,
  /** Vertical distance between two cards in the same column. */
  step: 150,
  /** Things start below the lowest fulfilment card. */
  domain: 820,
} as const;

const isPreContractEvidence = (
  entity: EntityAST,
  preContractContextIds: ReadonlySet<string>,
): boolean =>
  entity.category === 'evidence' && preContractContextIds.has(entity.contextRef);

const isContractEvidence = (entity: EntityAST): boolean =>
  entity.category === 'evidence' && entity.kind === 'contract';

/**
 * Assigns every entity a slot on the canvas.
 *
 * Positions are derived from the model, not from the draft, so a model that was
 * re-read from disk lays out the same way as one that was just compiled. Each
 * entity takes exactly one slot, so two entities never share a coordinate —
 * which is what makes the result safe to hand to a canvas that has no collision
 * handling of its own.
 */
export const layoutDomainModel = (
  document: DomainModelDocument,
): Record<string, LayoutPoint> => {
  const layout: Record<string, LayoutPoint> = {};

  const preContractContextIds = new Set(
    document.entities
      .filter(
        (entity) => entity.category === 'context' && entity.kind === 'pre_contract',
      )
      .map((entity) => entity.id),
  );

  const rows = { preContract: 0, contract: 0, fulfillment: 0, domain: 0 };

  const takeRow = (column: keyof typeof rows): number => {
    const row = rows[column];
    rows[column] += 1;
    return row;
  };

  const place = (id: string, column: keyof typeof rows): void => {
    const row = takeRow(column);

    layout[id] = {
      x: LAYOUT_COLUMNS[column],
      y:
        column === 'domain'
          ? LAYOUT_ROWS.domain + row * LAYOUT_ROWS.step
          : LAYOUT_ROWS.first + row * LAYOUT_ROWS.step,
    };
  };

  for (const entity of document.entities) {
    if (entity.category === 'context') {
      continue;
    }

    if (entity.category === 'participant' && entity.kind === 'thing') {
      place(entity.id, 'domain');
      continue;
    }

    if (entity.category === 'evidence') {
      if (isPreContractEvidence(entity, preContractContextIds)) {
        place(entity.id, 'preContract');
        continue;
      }

      if (isContractEvidence(entity)) {
        place(entity.id, 'contract');
        continue;
      }

      place(entity.id, 'fulfillment');
      continue;
    }

    // Roles and parties annotate the contract they belong to.
    place(entity.id, 'contract');
  }

  return layout;
};

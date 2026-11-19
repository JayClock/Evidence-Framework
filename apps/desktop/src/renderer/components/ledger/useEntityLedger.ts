import { useMemo, useState } from 'react';

import type { DiagnosticIndex } from '@evidence-poc/desktop-feature-canvas';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  countLedgerCategories,
  filterEntityLedger,
  projectEntityLedger,
  type LedgerCategory,
} from './entityLedgerProjection';

export const useEntityLedger = (
  document: DomainModelDocument,
  diagnostics: DiagnosticIndex | null,
  active: boolean,
) => {
  const [category, setCategory] = useState<LedgerCategory>('all');
  const [query, setQuery] = useState('');
  const projected = useMemo(
    () => (active ? projectEntityLedger(document, diagnostics) : []),
    [active, document, diagnostics],
  );
  const counts = useMemo(() => countLedgerCategories(projected), [projected]);
  const rows = useMemo(
    () => filterEntityLedger(projected, category, query),
    [projected, category, query],
  );
  return { category, setCategory, query, setQuery, counts, rows };
};

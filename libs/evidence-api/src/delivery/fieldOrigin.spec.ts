import { expect, it } from 'vitest';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { fieldFor } from '../index.js';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

it('classifies fields without needing a projection or filesystem', () => {
  const graph = createDomainGraph({
    manifest: {
      type: 'fm_model',
      schemaVersion: '5.0',
      id: 'test',
      name: 'test',
      version: '1',
      ruleLanguage: 'CEL',
      entryContextRefs: [],
    },
    entities: [],
    relationships: [],
    rules: [],
  } satisfies DomainModelDocument);
  const field = {
    name: 'amount',
    label: '金额',
    meaning: '金额',
    valueType: 'decimal' as const,
  };
  expect(fieldFor(field, graph, 'evidence.test').reason).toBe('caller');
  expect(
    fieldFor({ ...field, name: 'confirmed_at' }, graph, 'evidence.test').reason,
  ).toBe('service-time');
  // A dangling derivation never accidentally becomes caller input.
  expect(
    fieldFor(
      { ...field, derivedByRuleRef: 'rule.missing' },
      graph,
      'evidence.test',
    ),
  ).toMatchObject({ reason: 'derived', ruleRef: 'rule.missing' });
});

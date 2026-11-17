import { readFileSync } from 'node:fs';
import {
  strictValidateDomainModel,
  type DomainModelDocument,
} from '../../src/index.js';

const model = JSON.parse(
  readFileSync(
    new URL(
      '../../../../examples/full-spectrum-procurement/model/full-spectrum-procurement.evidence.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as DomainModelDocument;

describe('full-spectrum procurement golden model', () => {
  it('passes strict FM validation', () => {
    expect(strictValidateDomainModel(model).issues).toEqual([]);
  });

  it('covers all categories, kinds, capabilities, flows and CEL rule kinds', () => {
    expect(new Set(model.entities.map((e) => e.category))).toEqual(
      new Set(['context', 'participant', 'role', 'evidence']),
    );
    for (const [category, kinds] of Object.entries({
      context: ['pre_contract', 'contract', 'domain'],
      participant: ['party', 'thing'],
      role: ['party', 'domain', 'third_party', 'context', 'evidence'],
      evidence: [
        'rfp',
        'proposal',
        'contract',
        'fulfillment_request',
        'fulfillment_confirmation',
        'other_evidence',
      ],
    }))
      expect(
        new Set(
          model.entities
            .filter((e) => e.category === category)
            .map((e) => e.kind),
        ),
      ).toEqual(new Set(kinds));
    expect(
      new Set(
        model.entities.flatMap((e) =>
          e.category === 'participant' && e.domainRole ? [e.domainRole] : [],
        ),
      ),
    ).toEqual(new Set(['calculator', 'checker']));
    expect(new Set(model.relationships.map((r) => r.kind))).toEqual(
      new Set(['plays_role', 'references']),
    );
    expect(
      new Set(
        model.relationships.flatMap((r) => (r.flowKind ? [r.flowKind] : [])),
      ),
    ).toEqual(new Set(['primary', 'breach_compensation', 'escalation']));
    expect(new Set(model.rules.map((r) => r.kind))).toEqual(
      new Set([
        'eligibility',
        'precondition',
        'derivation',
        'invariant',
        'breach',
        'completion',
      ]),
    );
    const attributes = model.entities.flatMap((e) => e.attributes ?? []);
    for (const type of [
      'timestamp',
      'money',
      'decimal',
      'int',
      'string',
      'bool',
    ])
      expect(attributes.some((a) => a.valueType === type)).toBe(true);
    expect(attributes.every((a) => Boolean(a.meaning))).toBe(true);
    expect(
      model.entities.some(
        (e) => e.category === 'context' && e.parentContextRef,
      ),
    ).toBe(true);
    expect(
      model.relationships.every(
        (r) => r.sourceCardinality && r.targetCardinality,
      ),
    ).toBe(true);
  });
});

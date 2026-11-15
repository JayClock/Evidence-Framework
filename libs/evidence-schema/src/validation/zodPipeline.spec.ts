import { describe, expect, it } from 'vitest';
import {
  DomainModelDocumentSchema,
  EntityASTSchema,
  ExampleTestASTSchema,
  strictValidateDomainModel,
  type DomainModelDocument,
  type ValidationCode,
} from '../index.js';
import {
  cloneDocument,
  loadFixtureModel,
  requireEntity,
  requireEvidence,
} from '../../tests/support/fixtures.js';

const base = () => cloneDocument(loadFixtureModel());
const first = <T>(items: readonly T[]): T => {
  const [item] = items;
  if (item === undefined) throw new Error('expected a fixture item');
  return item;
};
const raw = (value: unknown) => value as Record<string, unknown>;
const entity = (doc: DomainModelDocument) =>
  raw(requireEvidence(doc, 'request.payment'));

const cases: [string, ValidationCode, (doc: DomainModelDocument) => void][] = [
  [
    'missing entity discriminator',
    'collection.item',
    (d) => {
      delete entity(d).type;
    },
  ],
  [
    'malformed collection item',
    'collection.item',
    (d) => {
      raw(d).entities = [null];
    },
  ],
  [
    'malformed relationship id',
    'id.invalid',
    (d) => {
      raw(d.relationships[0]).id = 123;
    },
  ],
  [
    'malformed rule id',
    'id.invalid',
    (d) => {
      raw(d.rules[0]).id = 'NOT VALID';
    },
  ],
  [
    'missing evidence context',
    'entity.contextRef.missing',
    (d) => {
      delete entity(d).contextRef;
    },
  ],
  [
    'non-context target',
    'entity.contextRef.notContext',
    (d) => {
      entity(d).contextRef = 'role.buyer';
    },
  ],
  [
    'unknown context',
    'entity.contextRef.unresolved',
    (d) => {
      entity(d).contextRef = 'context.ghost';
    },
  ],
  [
    'unknown parent',
    'entity.contextRef.unresolved',
    (d) => {
      raw(requireEntity(d, 'context.product-catalog')).parentContextRef =
        'context.ghost';
    },
  ],
  [
    'unknown root',
    'relationship.endpoint.unresolved',
    (d) => {
      raw(requireEntity(d, 'context.product-catalog')).rootRefs = [
        'thing.ghost',
      ];
    },
  ],
  [
    'unknown responsible role',
    'entity.responsibleRole.unresolved',
    (d) => {
      entity(d).responsibleRoleRef = 'role.ghost';
    },
  ],
  [
    'foreign responsible role',
    'entity.responsibleRole.foreign',
    (d) => {
      entity(d).responsibleRoleRef = 'role.wechat-provider';
    },
  ],
  [
    'missing contract roles',
    'entity.roleRefs.missing',
    (d) => {
      delete raw(requireEntity(d, 'contract.product-procurement')).roleRefs;
    },
  ],
  [
    'unknown contract role',
    'entity.roleRefs.unresolved',
    (d) => {
      raw(requireEntity(d, 'contract.product-procurement')).roleRefs = [
        'role.buyer',
        'role.ghost',
      ];
    },
  ],
  [
    'invalid cardinality shape',
    'relationship.cardinality',
    (d) => {
      raw(d.relationships[0]).sourceCardinality = { min: 0, max: 0 };
    },
  ],
  [
    'unknown relationship field',
    'entity.unknownField',
    (d) => {
      raw(d.relationships[0]).extra = true;
    },
  ],
  [
    'unknown rule field',
    'entity.unknownField',
    (d) => {
      raw(d.rules[0]).extra = true;
    },
  ],
  [
    'malformed rule target',
    'rule.target.unresolved',
    (d) => {
      raw(d.rules[0]).target = { attribute: 'x' };
    },
  ],
  [
    'missing result type',
    'rule.resultType',
    (d) => {
      delete raw(d.rules[0]).resultType;
    },
  ],
  [
    'invalid CEL alias',
    'rule.shape',
    (d) => {
      first(d.rules).bindings['not-a-variable'] = { type: 'bool' };
    },
  ],
  [
    'empty attribute label',
    'attribute.shape',
    (d) => {
      first(requireEvidence(d, 'request.payment').attributes ?? []).label = '';
    },
  ],
];

describe('Zod pipeline and diagnostic contract', () => {
  it.each(cases)('preserves the code for %s', (_name, code, mutate) => {
    const doc = base();
    mutate(doc);
    expect(strictValidateDomainModel(doc)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([expect.objectContaining({ code })]),
    });
  });

  it('exposes graph checks from the public schema, not only the validation wrapper', () => {
    const doc = base();
    entity(doc).responsibleRoleRef = 'role.ghost';
    const parsed = DomainModelDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          code: 'custom',
          params: expect.objectContaining({
            validationCode: 'entity.responsibleRole.unresolved',
          }),
        }),
      );
  });

  it('does not silently default missing fields or strip unsupported fields', () => {
    expect(
      EntityASTSchema.safeParse({
        id: 'party.test',
        category: 'participant',
        kind: 'party',
        label: 'Test',
      }).success,
    ).toBe(false);
    const doc = base();
    raw(doc).extra = true;
    expect(DomainModelDocumentSchema.safeParse(doc).success).toBe(false);
    expect(strictValidateDomainModel({ ...doc, rules: undefined }).valid).toBe(
      false,
    );
  });

  it('preserves array positions and object identity in syntax and graph diagnostics', () => {
    const doc = base();
    const position = doc.entities.findIndex(
      (item) => item.id === 'request.payment',
    );
    entity(doc).responsibleRoleRef = 'role.ghost';
    expect(strictValidateDomainModel(doc).issues).toContainEqual(
      expect.objectContaining({
        path: `entities[${position}].responsibleRoleRef`,
        objectId: 'request.payment',
      }),
    );
    first(requireEvidence(doc, 'request.payment').attributes ?? []).label = '';
    expect(strictValidateDomainModel(doc).issues).toContainEqual(
      expect.objectContaining({
        code: 'attribute.shape',
        path: `entities[${position}].attributes[0].label`,
        objectId: 'request.payment',
      }),
    );
  });

  it('validates the supported single-file bundle envelope without accepting arbitrary extras', () => {
    const doc = {
      ...base(),
      type: 'fm_bundle',
      schemaVersion: '5.0',
      readme: 'Model notes',
    };
    expect(DomainModelDocumentSchema.safeParse(doc).success).toBe(true);
    expect(
      strictValidateDomainModel({ ...doc, schemaVersion: '4.0' }).valid,
    ).toBe(false);
    expect(strictValidateDomainModel({ ...doc, type: 'other' }).valid).toBe(
      false,
    );
    expect(strictValidateDomainModel({ ...doc, readme: 42 }).valid).toBe(false);
    expect(strictValidateDomainModel({ ...doc, typo: true }).valid).toBe(false);
  });

  it('checks global ID collisions between all three collections', () => {
    const doc = base();
    first(doc.rules).id = first(doc.relationships).id;
    expect(strictValidateDomainModel(doc).issues).toContainEqual(
      expect.objectContaining({ code: 'id.duplicate', path: 'rules[0].id' }),
    );
  });

  it('collects independent graph failures without mutating the source', () => {
    const doc = base();
    entity(doc).responsibleRoleRef = 'role.ghost';
    first(doc.relationships).sourceRef = 'party.ghost';
    const snapshot = structuredClone(doc);
    const codes = strictValidateDomainModel(doc).issues.map(
      (issue) => issue.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        'entity.responsibleRole.unresolved',
        'relationship.endpoint.unresolved',
      ]),
    );
    expect(doc).toEqual(snapshot);
  });

  it('validates acceptance metadata with Zod even outside a document', () => {
    const test = {
      flow: 'payment',
      actingRoleRef: 'role.buyer',
      asOf: '2026-03-31T10:00:00Z',
    };
    expect(
      ExampleTestASTSchema.safeParse({ ...test, inputs: {} }).success,
    ).toBe(false);
    expect(
      ExampleTestASTSchema.safeParse({ ...test, tags: ['a', 'a'] }).success,
    ).toBe(false);
    expect(
      ExampleTestASTSchema.safeParse({ ...test, expect: { '$.bad': Infinity } })
        .success,
    ).toBe(false);
  });
});

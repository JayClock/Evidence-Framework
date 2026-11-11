import { describe, expect, it } from 'vitest';

import {
  MODEL_NON_SOURCE_TREES,
  modelSourcePaths,
  parseModelSourceFiles,
  serializeDomainModel,
  stringifyModelJson,
} from '../index.js';
import { createProcurementModel } from '../../tests/support/modelFixture.js';

/** Parsing follows file order, so compare collections as id-sorted sets. */
const canonical = (document: ReturnType<typeof createProcurementModel>) => ({
  ...document,
  entities: [...document.entities].sort((left, right) =>
    left.id.localeCompare(right.id),
  ),
  relationships: [...document.relationships].sort((left, right) =>
    left.id.localeCompare(right.id),
  ),
  rules: [...document.rules].sort((left, right) =>
    left.id.localeCompare(right.id),
  ),
});

describe('modelSourcePaths', () => {
  it('names entity, relationship and rule files from their identity', () => {
    const model = createProcurementModel();
    const paths = modelSourcePaths([
      ...model.entities,
      ...model.relationships,
      ...model.rules,
    ]);

    expect(paths.get('contract.procurement')).toBe(
      'entities/evidence-contract--procurement.json',
    );
    expect(paths.get('role.buyer')).toBe('entities/role-party--buyer.json');
    expect(paths.get('thing.product')).toBe(
      'entities/participant-thing--product.json',
    );
    expect(paths.get('relation.request-references-contract')).toBe(
      'relationships/relation--request-references-contract.json',
    );
    expect(paths.get('rule.payment-completed')).toBe(
      'rules/rule--payment-completed.json',
    );
  });

  it('disambiguates colliding slugs deterministically', () => {
    const base = createProcurementModel();
    const template = base.entities.find(
      (entity) => entity.id === 'thing.product',
    )!;
    const paths = modelSourcePaths([
      { ...template, id: 'thing.a-b' },
      { ...template, id: 'thing.a.b' },
    ]);

    expect(paths.get('thing.a-b')).toBe('entities/participant-thing--a-b.json');
    expect(paths.get('thing.a.b')).toBe(
      'entities/participant-thing--a-b-2.json',
    );
    expect(
      modelSourcePaths([
        { ...template, id: 'thing.a.b' },
        { ...template, id: 'thing.a-b' },
      ]).get('thing.a-b'),
    ).toBe('entities/participant-thing--a-b.json');
  });
});

describe('stringifyModelJson', () => {
  it('writes two-space JSON with a trailing newline', () => {
    expect(stringifyModelJson({ b: 1, a: 2 })).toBe(
      '{\n  "b": 1,\n  "a": 2\n}\n',
    );
  });

  it('sorts keys only when asked', () => {
    expect(
      stringifyModelJson({ b: 1, a: { d: 1, c: 2 } }, { sortKeys: true }),
    ).toBe('{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}\n');
  });
});

describe('serializeDomainModel', () => {
  it('writes the manifest first, then the three source trees', () => {
    const files = serializeDomainModel(createProcurementModel());
    const paths = files.map((file) => file.path);

    expect(paths[0]).toBe('model.json');
    expect(
      paths.slice(1, 13).every((path) => path.startsWith('entities/')),
    ).toBe(true);
    expect(paths.slice(1, 13)).toEqual([...paths.slice(1, 13)].sort());
    expect(
      paths.slice(13, 19).every((path) => path.startsWith('relationships/')),
    ).toBe(true);
    expect(paths.slice(19)).toEqual([
      'rules/rule--contract-total.json',
      'rules/rule--payment-completed.json',
    ]);
  });

  it('is deterministic and newline terminated', () => {
    const model = createProcurementModel();
    const first = serializeDomainModel(model);
    const second = serializeDomainModel(structuredClone(model));

    expect(first).toEqual(second);
    expect(first.every((file) => file.content.endsWith('\n'))).toBe(true);
  });
});

describe('parseModelSourceFiles', () => {
  it('round-trips a serialized model', () => {
    const model = createProcurementModel();
    const parsed = parseModelSourceFiles(serializeDomainModel(model));

    expect(parsed.issues).toEqual([]);
    expect(canonical(parsed.document)).toEqual(canonical(model));
  });

  it('reports malformed JSON without throwing', () => {
    const parsed = parseModelSourceFiles([
      ...serializeDomainModel(createProcurementModel()),
      { path: 'entities/broken.json', content: '{ nope' },
    ]);

    expect(parsed.issues.map((issue) => issue.path)).toContain(
      'entities/broken.json',
    );
    expect(parsed.document.entities.length).toBeGreaterThan(0);
  });

  it('reports a missing manifest and an empty model', () => {
    const parsed = parseModelSourceFiles([]);

    expect(parsed.issues.map((issue) => issue.message)).toEqual([
      'model.json is required at the model root.',
      'model must contain at least one entity.',
    ]);
  });

  it('reports duplicate ids and unsupported document types', () => {
    const model = createProcurementModel();
    const files = serializeDomainModel(model);

    const parsed = parseModelSourceFiles([
      ...files,
      { path: 'entities/duplicate.json', content: files[1]!.content },
      {
        path: 'rules/other.json',
        content: '{"type":"scenario","id":"scenario.x"}',
      },
    ]);

    expect(parsed.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("duplicate id 'context.procurement'"),
        expect.stringContaining('unsupported document type "scenario"'),
      ]),
    );
  });

  it('ignores non-source trees and non-JSON files', () => {
    const model = createProcurementModel();
    const files = serializeDomainModel(model);
    const parsed = parseModelSourceFiles([
      ...files,
      {
        path: 'validation/scenarios/scenario--x.json',
        content: '{"type":"scenario","id":"scenario.x"}',
      },
      { path: 'entities/notes.md', content: '# notes' },
      { path: '.hidden/secret.json', content: '{}' },
    ]);

    expect(parsed.issues).toEqual([]);
    expect(canonical(parsed.document)).toEqual(canonical(model));
    expect(MODEL_NON_SOURCE_TREES).toContain('validation');
  });

  it('can run the static FM checks inline', () => {
    const model = createProcurementModel();

    model.entities = model.entities.filter(
      (entity) => entity.id !== 'request.payment',
    );

    const parsed = parseModelSourceFiles(serializeDomainModel(model), {
      validate: true,
    });

    expect(parsed.issues.map((issue) => issue.code)).toContain(
      'relationship.endpoint.unresolved',
    );
  });
});

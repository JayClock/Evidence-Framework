import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { canonicalJson, sortedKeys } from './canonicalJson.js';
import {
  diagnosticToJson,
  errorDiagnostic,
  gapDiagnostic,
  hasErrors,
  hasGaps,
  normalizeDiagnostics,
} from './diagnostics.js';
import {
  API_DESIGN_SECTIONS,
  DesignJsonError,
  loadDesign,
  parseStrictJson,
  validateProjection,
} from './loader/apiLoader.js';
import {
  API_PROJECTION_SCHEMA,
  API_PROJECTION_SCHEMA_TEXT,
} from './schemas/apiProjectionSchema.js';
import { API_SCHEMA, API_SCHEMA_TEXT } from './schemas/apiSchema.js';
import { instanceErrors } from './schemas/jsonSchema.js';

const fixture = (name: string): string =>
  fileURLToPath(
    new URL(`../tests/fixtures/${name}`, import.meta.url),
  );

describe('the embedded contracts', () => {
  it('are the documents this package ships, byte for byte', () => {
    for (const [name, text, parsed] of [
      ['api.schema.json', API_SCHEMA_TEXT, API_SCHEMA],
      ['api-projection.schema.json', API_PROJECTION_SCHEMA_TEXT, API_PROJECTION_SCHEMA],
    ] as const) {
      const onDisk = readFileSync(
        fileURLToPath(
          new URL(`../schemas/${name}`, import.meta.url),
        ),
        'utf8',
      );

      // The manifest records a digest of the contract, so the bytes matter and
      // not just the parsed document.
      expect(text).toBe(onDisk);
      expect(parsed).toEqual(JSON.parse(onDisk));
    }
  });

  it('name the sections whose ids must be unique', () => {
    expect(API_DESIGN_SECTIONS).toEqual([
      'sources',
      'decisions',
      'resources',
      'bindings',
      'scenarios',
      'capabilities',
      'journeys',
    ]);
  });
});

describe('loadDesign', () => {
  it('accepts the full lifecycle design', () => {
    const { design, diagnostics } = loadDesign(fixture('full-lifecycle/api.json'));

    expect(diagnostics).toEqual([]);
    expect(design).not.toBeNull();
    expect((design as { id: string }).id).toBe('api.product-procurement');
  });

  it('refuses YAML, which the contract no longer accepts', () => {
    expect(loadDesign('/project/api.yaml').diagnostics).toEqual([
      expect.objectContaining({
        code: 'DESIGN_INVALID',
        severity: 'error',
        message: 'API 设计必须使用 .json 文件，不再接受 YAML',
      }),
    ]);
  });

  it('reports a design that is not an object', () => {
    expect(loadDesign('/project/api.json', '[]').diagnostics).toEqual([
      expect.objectContaining({ message: '设计必须是单个 JSON 对象' }),
    ]);
  });

  it('refuses a duplicated key, which JSON.parse would silently collapse', () => {
    const { design, diagnostics } = loadDesign(
      '/project/api.json',
      '{"id": "api.a", "id": "api.b"}',
    );

    expect(design).toBeNull();
    expect(diagnostics[0]?.message).toContain('设计包含重复 JSON key: id');
  });

  it('refuses a non-standard constant', () => {
    expect(
      loadDesign('/project/api.json', '{"schemaVersion": NaN}').diagnostics[0]?.message,
    ).toContain('设计包含非 JSON 常量');
  });

  it('reports schema violations with the location a reader can jump to', () => {
    const { design, diagnostics } = loadDesign(
      '/project/api.json',
      JSON.stringify({ schemaVersion: '4.0', id: 'NotAnId', sources: [] }),
    );

    expect(design).not.toBeNull();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((item) => item.code === 'DESIGN_INVALID')).toBe(true);
    expect(diagnostics.some((item) => item.location === '$')).toBe(true);
  });

  it('reports a duplicated id inside one section', () => {
    const document = JSON.parse(
      readFileSync(fixture('full-lifecycle/api.json'), 'utf8'),
    ) as { decisions: Record<string, unknown>[] };
    document.decisions.push({ ...(document.decisions[0] as Record<string, unknown>) });

    const { diagnostics } = loadDesign(
      '/project/api.json',
      JSON.stringify(document),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'DUPLICATE_ID',
        message: `decisions 中 ID 重复: ${document.decisions[0]?.id}`,
      }),
    ]);
  });
});

describe('validateProjection', () => {
  it('reports a document that is not a projection', () => {
    expect(validateProjection({ schemaVersion: '5.0' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PROJECTION_INVALID' }),
      ]),
    );
  });
});

describe('parseStrictJson', () => {
  it('reports invalid JSON instead of throwing a SyntaxError', () => {
    expect(() => parseStrictJson('{')).toThrow(DesignJsonError);
    expect(parseStrictJson('{"a": 1}')).toEqual({ a: 1 });
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every depth and ends with a newline', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
      '{\n  "a": [\n    {\n      "c": 3,\n      "d": 2\n    }\n  ],\n  "b": 1\n}\n',
    );
    expect(sortedKeys({ b: [1, 2], a: 0 })).toEqual({ a: 0, b: [1, 2] });
  });
});

describe('instanceErrors', () => {
  it('enforces the formats the contracts declare and ignores the rest', () => {
    const schema = {
      type: 'object',
      properties: {
        at: { type: 'string', format: 'date-time' },
        link: { type: 'string', format: 'uri-reference' },
        unknown: { type: 'string', format: 'hal' },
      },
    };

    expect(instanceErrors(schema, { at: '2026-09-01T09:15:00Z', link: '/a/b' })).toEqual([]);
    expect(instanceErrors(schema, { at: 'not a time' })).toHaveLength(1);
    expect(instanceErrors(schema, { unknown: 'anything' })).toEqual([]);
  });

  it('refuses a schema that resolves an external reference', () => {
    expect(instanceErrors({ $ref: '#/x' }, {})).toEqual([
      '只支持本地内联 JSON Schema，不解析引用',
    ]);
  });
});

describe('diagnostics', () => {
  it('prints the fields the reports carry, dropping absent ones', () => {
    expect(
      diagnosticToJson(errorDiagnostic('X', 'broken', 'resource.a')),
    ).toEqual({
      code: 'X',
      severity: 'error',
      message: 'broken',
      targetRef: 'resource.a',
      location: null,
      relatedRefs: [],
    });
    expect(
      diagnosticToJson(gapDiagnostic('Y', 'resource.a.thing', 'business', 'open')),
    ).toMatchObject({ gapKey: 'resource.a.thing', category: 'business' });
  });

  it('answers the two questions the exit status depends on', () => {
    const findings = [
      errorDiagnostic('A', 'a'),
      gapDiagnostic('B', 'b', 'design', 'b'),
    ];

    expect(hasErrors(findings)).toBe(true);
    expect(hasGaps(findings)).toBe(true);
    expect(hasErrors([findings[1] as never])).toBe(false);
    expect(hasGaps([findings[0] as never])).toBe(false);
  });

  it('orders by severity then code and never repeats a finding', () => {
    const findings = [
      errorDiagnostic('B', 'second'),
      gapDiagnostic('A', 'k', 'design', 'a gap'),
      errorDiagnostic('A', 'first'),
      errorDiagnostic('B', 'second'),
    ];

    expect(
      normalizeDiagnostics(findings).map((item) => `${item.severity}:${item.code}`),
    ).toEqual(['error:A', 'error:B', 'gap:A']);
  });
});

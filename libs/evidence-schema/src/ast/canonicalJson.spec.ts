import { describe, expect, it } from 'vitest';
import { compactCanonicalJson, prettyCanonicalJson } from './canonicalJson.js';

describe('canonical JSON', () => {
  it('sorts nested objects without reordering arrays or mutating input', () => {
    const value = { z: [{ b: '履约', a: 2 }, 1], a: true };
    expect(compactCanonicalJson(value)).toBe(
      '{"a":true,"z":[{"a":2,"b":"履约"},1]}',
    );
    expect(Object.keys(value)).toEqual(['z', 'a']);
    expect(Object.keys(value.z[0] as object)).toEqual(['b', 'a']);
    expect(prettyCanonicalJson(value)).toBe(
      '{\n  "a": true,\n  "z": [\n    {\n      "a": 2,\n      "b": "履约"\n    },\n    1\n  ]\n}\n',
    );
  });

  it('follows JSON semantics for omitted values, sparse arrays and toJSON', () => {
    const sparse = Array<unknown>(3);
    sparse[2] = NaN;
    expect(compactCanonicalJson({ b: undefined, a: sparse })).toBe(
      '{"a":[null,null,null]}',
    );
    expect(compactCanonicalJson(new Date('2026-01-01T00:00:00Z'))).toBe(
      '"2026-01-01T00:00:00.000Z"',
    );
    expect(compactCanonicalJson(undefined)).toBe('null');
    expect(prettyCanonicalJson(null)).toBe('null\n');
  });

  it('sorts integer-like keys lexically in compact output', () => {
    expect(compactCanonicalJson({ 2: 'two', 10: 'ten' })).toBe(
      '{"10":"ten","2":"two"}',
    );
    // JSON.stringify retains the historical integer-key ordering in files.
    expect(prettyCanonicalJson({ 2: 'two', 10: 'ten' })).toBe(
      '{\n  "2": "two",\n  "10": "ten"\n}\n',
    );
  });

  it('rejects cycles and bigint rather than silently losing data', () => {
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    expect(() => compactCanonicalJson(cycle)).toThrow();
    expect(() => prettyCanonicalJson(1n)).toThrow();
  });
});

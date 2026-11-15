import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createProcurementModel } from '../testing/modelFixture.js';
import { digestOf } from './modelDigest.js';

// Historical wire representation, deliberately independent of the new helper.
const legacyJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(legacyJson).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${legacyJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};

describe('model digest compatibility', () => {
  it('keeps fixed SHA-256 vectors including UTF-8 and the final newline', () => {
    expect(digestOf(null)).toBe(
      'sha256:38e0b9de817f645c4bec37c0d4a3e58baecccb040f5718dc069a72c7385a0bed',
    );
    expect(digestOf({ b: [true, null, '履约'], a: 1 })).toBe(
      'sha256:809d8d435c38f365e0e2ecb0dcb8de52f673bf1afb9bf0a32be73eaaed190bf0',
    );
  });

  it('keeps real model hashes identical to the legacy serialization', () => {
    const model = createProcurementModel();
    expect(digestOf(model)).toBe(
      `sha256:${createHash('sha256')
        .update(`${legacyJson(model)}\n`)
        .digest('hex')}`,
    );
    expect(digestOf({ z: model, a: 1 })).toBe(digestOf({ a: 1, z: model }));
  });
});

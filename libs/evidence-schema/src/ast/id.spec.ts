import { describe, expect, it } from 'vitest';

import {
  ATTRIBUTE_NAME_PATTERN,
  CEL_VARIABLE_PATTERN,
  DOMAIN_ID_PATTERN,
  MODEL_VERSION_PATTERN,
  isAttributeName,
  isCelVariableName,
  isDomainId,
  isModelVersion,
} from '../index.js';

describe('id grammar', () => {
  it.each([
    'request.payment',
    'context.product-procurement',
    'role.buyer',
    'contract',
    'a1',
    'a.b.c-1',
  ])('accepts %s as a domain id', (value) => {
    expect(DOMAIN_ID_PATTERN.test(value)).toBe(true);
    expect(isDomainId(value)).toBe(true);
  });

  it.each([
    'Request.Payment',
    '1request',
    '-request',
    'request..payment',
    'request.payment-',
    '',
    'request payment',
  ])('rejects %s as a domain id', (value) => {
    expect(isDomainId(value)).toBe(false);
  });

  it('rejects non-string ids', () => {
    expect(isDomainId(undefined)).toBe(false);
    expect(isDomainId(42)).toBe(false);
    expect(isDomainId({ id: 'request.payment' })).toBe(false);
  });

  it.each(['confirmed_at', 'total_minor_units', 'name', 'a1_b2'])(
    'accepts %s as an attribute name',
    (value) => {
      expect(ATTRIBUTE_NAME_PATTERN.test(value)).toBe(true);
      expect(isAttributeName(value)).toBe(true);
    },
  );

  it.each(['confirmedAt', 'Confirmed_at', 'confirmedat_', '_confirmed_at', 'a.b'])(
    'rejects %s as an attribute name',
    (value) => {
      expect(isAttributeName(value)).toBe(false);
    },
  );

  it('accepts semantic versions with prerelease metadata', () => {
    expect(isModelVersion('1.0.0')).toBe(true);
    expect(isModelVersion('1.1.0-rc.1')).toBe(true);
    expect(isModelVersion('0.0.1+build.7')).toBe(true);
  });

  it('rejects malformed model versions', () => {
    expect(MODEL_VERSION_PATTERN.test('1.0')).toBe(false);
    expect(isModelVersion('v1.0.0')).toBe(false);
    expect(isModelVersion(undefined)).toBe(false);
  });

  it.each(['request', 'confirmations', '_now', 'a1'])(
    'accepts %s as a CEL alias',
    (value) => {
      expect(CEL_VARIABLE_PATTERN.test(value)).toBe(true);
      expect(isCelVariableName(value)).toBe(true);
    },
  );

  it.each(['1request', 'request-number', 'request number', ''])(
    'rejects %s as a CEL alias',
    (value) => {
      expect(isCelVariableName(value)).toBe(false);
    },
  );
});

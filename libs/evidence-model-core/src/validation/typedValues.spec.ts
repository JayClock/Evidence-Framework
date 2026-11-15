import { validateTypedValue } from './typedValues.js';

describe('CEL JSON typed values', () => {
  it.each([
    ['int', 0],
    ['int', Number.MIN_SAFE_INTEGER],
    ['int', Number.MAX_SAFE_INTEGER],
    ['int', '10'],
    ['int', '-9223372036854775808'],
    ['int', '9223372036854775807'],
    ['uint', 0],
    ['uint', '18446744073709551615'],
  ])('accepts %s value %s without precision loss', (type, value) => {
    expect(validateTypedValue(value, type)).toBeNull();
  });

  it.each([
    ['int', 9007199254740992],
    ['int', Infinity],
    ['int', 1.5],
    ['int', '9223372036854775808'],
    ['int', '-9223372036854775809'],
    ['int', '1e3'],
    ['int', '01'],
    ['int', '+1'],
    ['int', '-0'],
    ['int', ''],
    ['int', true],
    ['int', 1n],
    ['uint', -1],
    ['uint', '-1'],
    ['uint', '18446744073709551616'],
  ])('rejects %s value %s outside the JSON integer contract', (type, value) => {
    expect(validateTypedValue(value, type)).not.toBeNull();
  });

  it.each(['1ns', '1us', '1µs', '300ms', '-1.5h', '2h45m', '0.000000001s'])(
    'accepts native duration syntax %s',
    (value) => {
      expect(validateTypedValue(value, 'duration')).toBeNull();
    },
  );

  it.each(['', '1d', '1', 'seconds', '1s trailing', 1000])(
    'rejects invalid native duration %s',
    (value) => {
      expect(validateTypedValue(value, 'duration')).toBe(
        'must be a CEL duration string',
      );
    },
  );
});

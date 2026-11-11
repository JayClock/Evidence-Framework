import { describe, expect, it } from 'vitest';

import { parseRoute } from './App';

describe('parseRoute', () => {
  it('defaults to the dashboard', () => {
    expect(parseRoute('')).toEqual({ name: 'dashboard' });
    expect(parseRoute('#/dashboard')).toEqual({ name: 'dashboard' });
    expect(parseRoute('#/unknown')).toEqual({ name: 'dashboard' });
  });

  it('reads the project root from the editor route', () => {
    expect(
      parseRoute('#/editor?rootPath=%2FUsers%2Fevidence%2Fwarehouse%20model'),
    ).toEqual({ name: 'editor', rootPath: '/Users/evidence/warehouse model' });
  });

  it('keeps a missing root path empty so the screen can explain it', () => {
    expect(parseRoute('#/editor')).toEqual({ name: 'editor', rootPath: '' });
  });
});

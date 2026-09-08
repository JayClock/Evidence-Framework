import { describe, expect, it } from 'vitest';
import { normalizeFmModelFiles } from './files.ts';

describe('FM model submission paths', () => {
  it('normalizes and sorts supported source and validation files', () => {
    expect(
      normalizeFmModelFiles([
        { path: 'entities/role--buyer.yaml', content: 'type: entity' },
        { path: './model.yaml', content: 'type: fm_model' },
        {
          path: 'validation/scenarios/scenario--success.yaml',
          content: 'type: fm_scenario',
        },
      ]),
    ).toEqual([
      { path: 'entities/role--buyer.yaml', content: 'type: entity\n' },
      { path: 'model.yaml', content: 'type: fm_model\n' },
      {
        path: 'validation/scenarios/scenario--success.yaml',
        content: 'type: fm_scenario\n',
      },
    ]);
  });

  it('accepts business-pattern sources and bounded discovery notes', () => {
    const files = [
      'model.yaml',
      'business-patterns/pattern--payment.yaml',
      'discovery/scope.md',
      'discovery/domain-inventory.yaml',
    ];
    expect(
      normalizeFmModelFiles(files.map((path) => ({ path, content: 'source' }))),
    ).toHaveLength(files.length);
  });

  it.each([
    '../state.json',
    '/tmp/model.yaml',
    'generated/model.json',
    '02-business-patterns.md',
    'discovery/../model.yaml',
    'discovery/script.py',
    'status.md',
  ])('rejects an unsafe or generated path: %s', (path) => {
    expect(() =>
      normalizeFmModelFiles([
        { path: 'model.yaml', content: 'type: fm_model' },
        { path, content: '{}' },
      ]),
    ).toThrow();
  });

  it('requires a manifest and unique paths', () => {
    expect(() =>
      normalizeFmModelFiles([{ path: 'entities/a.yaml', content: '{}' }]),
    ).toThrow('model.yaml');
    expect(() =>
      normalizeFmModelFiles([
        { path: 'model.yaml', content: '{}' },
        { path: './model.yaml', content: '{}' },
      ]),
    ).toThrow('重复');
  });
});

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isBundleProject,
  modelSourceOf,
  projectDirectoryOf,
} from './modelSource';

describe('model source paths', () => {
  it('keeps the tree layout for a project folder', () => {
    const root = path.resolve('/models/procurement');

    expect(isBundleProject(root)).toBe(false);
    expect(modelSourceOf(root)).toBe(path.join(root, '.evidence', 'fm'));
    expect(projectDirectoryOf(root)).toBe(root);
  });

  it('points at the file and its folder for a bundle project', () => {
    const bundle = path.resolve('/models/procurement.evidence.json');

    expect(isBundleProject(bundle)).toBe(true);
    expect(modelSourceOf(bundle)).toBe(bundle);
    expect(projectDirectoryOf(bundle)).toBe(path.dirname(bundle));
  });
});

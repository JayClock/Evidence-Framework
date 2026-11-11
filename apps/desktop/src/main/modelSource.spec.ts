import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isBundleProject,
  modelSourceOf,
  projectDirectoryOf,
  tracePathOf,
} from './modelSource';

const trace = path.join('.evidence', 'traces', 'interview-trace.json');

describe('model source paths', () => {
  it('keeps the tree layout for a project folder', () => {
    const root = path.resolve('/models/procurement');

    expect(isBundleProject(root)).toBe(false);
    expect(modelSourceOf(root)).toBe(path.join(root, '.evidence', 'fm'));
    expect(projectDirectoryOf(root)).toBe(root);
    expect(tracePathOf(root)).toBe(path.join(root, trace));
  });

  it('points at the file and its folder for a bundle project', () => {
    const bundle = path.resolve('/models/procurement.evidence.json');

    expect(isBundleProject(bundle)).toBe(true);
    expect(modelSourceOf(bundle)).toBe(bundle);
    expect(projectDirectoryOf(bundle)).toBe(path.dirname(bundle));
    expect(tracePathOf(bundle)).toBe(path.join(path.dirname(bundle), trace));
  });
});

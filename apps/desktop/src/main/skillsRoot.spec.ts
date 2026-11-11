import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BUNDLED_SKILLS_DIRECTORY,
  PROJECT_SKILLS_DIRECTORY,
  resolveSkillsRoot,
} from './skillsRoot';

const RESOURCES_PATH = '/Applications/Evidence Modeling.app/Contents/Resources';
const PROJECT_ROOT = '/models/procurement';

describe('resolveSkillsRoot', () => {
  it('prefers a project that ships its own skills', () => {
    const bundled = path.join(RESOURCES_PATH, BUNDLED_SKILLS_DIRECTORY);

    expect(
      resolveSkillsRoot({
        projectRoot: PROJECT_ROOT,
        resourcesPath: RESOURCES_PATH,
        fileExists: (candidate) =>
          candidate === path.join(PROJECT_ROOT, PROJECT_SKILLS_DIRECTORY) ||
          candidate === bundled,
      }),
    ).toBe(path.join(PROJECT_ROOT, PROJECT_SKILLS_DIRECTORY));
  });

  it('falls back to the tree unpacked next to app.asar', () => {
    const bundled = path.join(RESOURCES_PATH, BUNDLED_SKILLS_DIRECTORY);

    expect(
      resolveSkillsRoot({
        projectRoot: PROJECT_ROOT,
        resourcesPath: RESOURCES_PATH,
        fileExists: (candidate) => candidate === bundled,
      }),
    ).toBe(bundled);
  });

  it('climbs out of apps/desktop while developing', () => {
    const workspaceSkills = path.join(
      '/repo',
      PROJECT_SKILLS_DIRECTORY,
    );

    expect(
      resolveSkillsRoot({
        projectRoot: PROJECT_ROOT,
        resourcesPath: undefined,
        searchStartDirectory: '/repo/apps/desktop',
        fileExists: (candidate) => candidate === workspaceSkills,
      }),
    ).toBe(workspaceSkills);
  });

  it('returns the project path when no tree exists anywhere', () => {
    expect(
      resolveSkillsRoot({
        projectRoot: PROJECT_ROOT,
        resourcesPath: RESOURCES_PATH,
        searchStartDirectory: '/repo/apps/desktop',
        fileExists: () => false,
      }),
    ).toBe(path.join(PROJECT_ROOT, PROJECT_SKILLS_DIRECTORY));
  });
});

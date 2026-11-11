import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PYTHON_VARIABLE,
  SKILLS_ROOT_VARIABLE,
  SKILL_PACKAGE_NAMES,
  skillEnvironment,
} from './skillEnvironment.js';

const SKILLS_ROOT = '/Applications/Evidence Modeling.app/Contents/Resources/skills';

describe('skillEnvironment', () => {
  it('publishes one directory variable per skill package', () => {
    const environment = skillEnvironment({
      skillsRoot: SKILLS_ROOT,
      pythonExecutablePath: `${SKILLS_ROOT}/../python-runtime/bin/python`,
    });

    expect(environment[SKILLS_ROOT_VARIABLE]).toBe(SKILLS_ROOT);
    expect(environment.FM_SKILL_DIR).toBe(
      path.join(SKILLS_ROOT, 'evidence-fm'),
    );
    expect(environment.API_SKILL_DIR).toBe(
      path.join(SKILLS_ROOT, 'evidence-api'),
    );
    expect(environment.DISCOVERY_SKILL_DIR).toBe(
      path.join(SKILLS_ROOT, 'evidence-discovery'),
    );
    expect(environment.MODELING_SKILL_DIR).toBe(
      path.join(SKILLS_ROOT, 'evidence-modeling'),
    );
    expect(environment.VISUAL_SKILL_DIR).toBe(
      path.join(SKILLS_ROOT, 'evidence-visualization'),
    );
    // The command snippets in the FM guides address their own package this way.
    expect(environment.SKILL_DIR).toBe(path.join(SKILLS_ROOT, 'evidence-fm'));
  });

  it('points PYTHON at the pinned interpreter', () => {
    const environment = skillEnvironment({
      skillsRoot: SKILLS_ROOT,
      pythonExecutablePath: '/runtime/bin/python',
    });

    expect(environment[PYTHON_VARIABLE]).toBe('/runtime/bin/python');
  });

  it('omits PYTHON instead of publishing a path that does not run', () => {
    const environment = skillEnvironment({
      skillsRoot: SKILLS_ROOT,
      pythonExecutablePath: null,
    });

    expect(environment).not.toHaveProperty(PYTHON_VARIABLE);
  });

  it('names every skill package the desktop ships', () => {
    const environment = skillEnvironment({
      skillsRoot: SKILLS_ROOT,
      pythonExecutablePath: null,
    });
    const published = Object.values(environment).filter((value) =>
      SKILL_PACKAGE_NAMES.some((name) => value.endsWith(`/${name}`)),
    );

    expect(published).toHaveLength(SKILL_PACKAGE_NAMES.length + 1);
  });
});

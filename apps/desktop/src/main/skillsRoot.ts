import { existsSync } from 'node:fs';
import path from 'node:path';

/** Project-local skill tree, the source of truth when a project has one. */
export const PROJECT_SKILLS_DIRECTORY = path.join('.agents', 'skills');

/**
 * Directory name the desktop installers unpack the skills into.
 *
 * It sits next to `app.asar` because the Python scripts it contains are run by a
 * subprocess, which cannot read through the asar archive.
 */
export const BUNDLED_SKILLS_DIRECTORY = 'skills';

/** Electron's resources directory, or undefined in a plain Node process. */
export const defaultResourcesPath = (): string | undefined =>
  (process as { resourcesPath?: string }).resourcesPath;

export interface SkillsRootOptions {
  /** Absolute directory that owns `.evidence/`. */
  projectRoot: string;
  /** `process.resourcesPath` in a packaged app; empty outside Electron. */
  resourcesPath?: string | undefined;
  /** Where the fallback search climbs from; defaults to `process.cwd()`. */
  searchStartDirectory?: string;
  fileExists?: (candidate: string) => boolean;
}

const exists = (candidate: string): boolean => existsSync(candidate);

/**
 * Picks the skill tree an agent session and the sensors should read.
 *
 * The order keeps two promises at once: a project may ship its own skills and
 * those always win, and a packaged app still works on a machine that never
 * cloned this repository. Returns the project path when nothing exists so the
 * caller reports one deterministic location instead of a moving fallback.
 */
export const resolveSkillsRoot = ({
  projectRoot,
  resourcesPath = defaultResourcesPath(),
  searchStartDirectory = process.cwd(),
  fileExists = exists,
}: SkillsRootOptions): string => {
  const projectSkills = path.join(path.resolve(projectRoot), PROJECT_SKILLS_DIRECTORY);

  if (fileExists(projectSkills)) {
    return projectSkills;
  }

  if (resourcesPath !== undefined && resourcesPath.trim() !== '') {
    const bundledSkills = path.join(resourcesPath, BUNDLED_SKILLS_DIRECTORY);

    if (fileExists(bundledSkills)) {
      return bundledSkills;
    }
  }

  // Development: the app runs from `apps/desktop`, the skills live at the
  // workspace root. Climb instead of hard-coding a relative depth so an
  // unpacked build or a different cwd still finds them.
  let directory = path.resolve(searchStartDirectory);

  for (;;) {
    const candidate = path.join(directory, PROJECT_SKILLS_DIRECTORY);

    if (fileExists(candidate)) {
      return candidate;
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      return projectSkills;
    }

    directory = parent;
  }
};

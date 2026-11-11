import path from 'node:path';

/** Every skill package a session may address from a shell command. */
export const SKILL_PACKAGE_NAMES = [
  'evidence-discovery',
  'evidence-fm',
  'evidence-api',
  'evidence-visualization',
  'evidence-modeling',
] as const;

export type SkillPackageName = (typeof SKILL_PACKAGE_NAMES)[number];

/**
 * Variable each package's guides use for their own directory.
 *
 * The skill documents write commands such as
 * `"$PYTHON" -B "$FM_SKILL_DIR/scripts/check_fm.py"`, so the harness has to
 * publish the resolved paths instead of asking the model to guess them.
 */
const SKILL_DIRECTORY_VARIABLES: Record<SkillPackageName, string> = {
  'evidence-discovery': 'DISCOVERY_SKILL_DIR',
  'evidence-fm': 'FM_SKILL_DIR',
  'evidence-api': 'API_SKILL_DIR',
  'evidence-visualization': 'VISUAL_SKILL_DIR',
  'evidence-modeling': 'MODELING_SKILL_DIR',
};

/** Environment variable holding the skill tree in use. */
export const SKILLS_ROOT_VARIABLE = 'EVIDENCE_SKILLS_ROOT';

/** Environment variable holding the pinned interpreter. */
export const PYTHON_VARIABLE = 'PYTHON';

export interface SkillEnvironmentInput {
  /** Absolute skill tree, the one the session and the sensors read. */
  skillsRoot: string;
  /** Pinned interpreter, or null while no valid one exists. */
  pythonExecutablePath: string | null;
}

/**
 * Variables a shell command in a skill needs in order to run the pinned scripts.
 *
 * Only install-level paths appear here. Per-project state (`MODEL_DIR`,
 * `TRACE_FILE`, …) stays out: one process serves several project windows, and a
 * single global value would silently describe the wrong model. Those paths are
 * resolvable from the shell's working directory, which is the project root.
 */
export const skillEnvironment = ({
  skillsRoot,
  pythonExecutablePath,
}: SkillEnvironmentInput): Record<string, string> => {
  const root = path.resolve(skillsRoot);
  const environment: Record<string, string> = {
    [SKILLS_ROOT_VARIABLE]: root,
  };

  for (const name of SKILL_PACKAGE_NAMES) {
    environment[SKILL_DIRECTORY_VARIABLES[name]] = path.join(root, name);
  }

  // `evidence-fm`'s guides address their own package as `$SKILL_DIR`.
  environment.SKILL_DIR = path.join(root, 'evidence-fm');

  if (pythonExecutablePath !== null) {
    environment[PYTHON_VARIABLE] = pythonExecutablePath;
  }

  return environment;
};

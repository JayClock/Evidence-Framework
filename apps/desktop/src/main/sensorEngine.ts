import path from 'node:path';

import { createPythonEnvResolver } from '@evidence-poc/evidence-agent-core';
import {
  SENSORS_ENGINE_ENVIRONMENT_VARIABLE,
  sensorsEngineModeOf,
  type SensorsEngineMode,
  type SensorsEngineOptions,
} from '@evidence-poc/evidence-modeling-orchestrator';

/**
 * How the desktop builds a sensor engine.
 *
 * The sensors run in-process by default, so a packaged app needs no Python
 * runtime on disk. `python` and `shadow` stay available for a developer
 * comparing the two implementations, and only those two build a resolver.
 */
export interface SensorEngineOptionsInput {
  /** Absolute project directory; the resolver's root when one is built. */
  projectDirectory: string;
  /** Skill tree the session reads, when the caller already resolved it. */
  skillsRoot?: string;
  environment?: NodeJS.ProcessEnv;
}

export const desktopSensorsMode = (
  environment: NodeJS.ProcessEnv = process.env,
): SensorsEngineMode => sensorsEngineModeOf(environment);

/** Engine options for one project, with a resolver only when the mode needs one. */
export const desktopSensorEngineOptions = ({
  projectDirectory,
  skillsRoot,
  environment = process.env,
}: SensorEngineOptionsInput): SensorsEngineOptions => {
  const mode = desktopSensorsMode(environment);
  const resolvedRoot = path.resolve(projectDirectory);

  return {
    mode,
    ...(skillsRoot === undefined ? {} : { skillsRoot }),
    ...(mode === 'native'
      ? {}
      : { resolver: createPythonEnvResolver({ projectRoot: resolvedRoot }) }),
  };
};

/** Environment variable a developer sets to switch modes. */
export const SENSOR_MODE_VARIABLE = SENSORS_ENGINE_ENVIRONMENT_VARIABLE;

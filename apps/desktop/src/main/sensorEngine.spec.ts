import { describe, expect, it } from 'vitest';

import {
  SENSOR_MODE_VARIABLE,
  desktopSensorEngineOptions,
  desktopSensorsMode,
} from './sensorEngine';

describe('desktopSensorsMode', () => {
  it('runs the sensors in-process unless a developer asks otherwise', () => {
    expect(desktopSensorsMode({})).toBe('native');
    expect(desktopSensorsMode({ [SENSOR_MODE_VARIABLE]: 'shadow' })).toBe('shadow');
    expect(() =>
      desktopSensorsMode({ [SENSOR_MODE_VARIABLE]: 'wasm' }),
    ).toThrow(/must be python, native or shadow/);
  });
});

describe('desktopSensorEngineOptions', () => {
  it('builds no interpreter resolver for the default mode', () => {
    const options = desktopSensorEngineOptions({
      projectDirectory: '/models/procurement',
      environment: {},
    });

    expect(options.mode).toBe('native');
    expect(options.resolver).toBeUndefined();
  });

  it('builds a resolver when the mode starts a process', () => {
    const options = desktopSensorEngineOptions({
      projectDirectory: '/models/procurement',
      environment: { [SENSOR_MODE_VARIABLE]: 'python' },
    });

    expect(options.mode).toBe('python');
    expect(options.resolver?.projectRoot).toBe('/models/procurement');
  });

  it('passes the resolved skill tree through', () => {
    expect(
      desktopSensorEngineOptions({
        projectDirectory: '/models/procurement',
        skillsRoot: '/install/resources/skills',
        environment: {},
      }).skillsRoot,
    ).toBe('/install/resources/skills');
  });
});

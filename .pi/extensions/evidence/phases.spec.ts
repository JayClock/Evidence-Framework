import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHASE_DEFINITIONS, PHASE_ORDER } from './phases.ts';

describe('phase definitions', () => {
  it('has a definition for every ordered phase', () => {
    expect(Object.keys(PHASE_DEFINITIONS)).toEqual(PHASE_ORDER);
  });

  it('inserts machine-verifiable fulfillment modeling before structural domain design', () => {
    expect(PHASE_DEFINITIONS.domain.artifacts.map((item) => item.key)).toEqual([
      'ubiquitous-language',
      'bounded-contexts',
      'fulfillment-model',
      'entities-and-value-objects',
      'aggregates',
      'domain-events',
    ]);
    expect(PHASE_DEFINITIONS.domain.artifacts[2]).toMatchObject({
      kind: 'fm-model',
      skillFile: '.pi/skills/evidence-modeling/SKILL.md',
    });
  });

  it('uses unique artifact paths', () => {
    const outputs = PHASE_ORDER.flatMap((phase) =>
      PHASE_DEFINITIONS[phase].artifacts.map((item) => item.output),
    );
    expect(new Set(outputs).size).toBe(outputs.length);
  });

  it('references existing skills and prompt templates', async () => {
    const paths = PHASE_ORDER.flatMap((phase) => {
      const definition = PHASE_DEFINITIONS[phase];
      return [
        definition.skillFile,
        ...definition.artifacts.map((item) => item.promptFile),
      ];
    });
    await expect(
      Promise.all(paths.map((path) => access(resolve(process.cwd(), path)))),
    ).resolves.toBeDefined();
  });
});

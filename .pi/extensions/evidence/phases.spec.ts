import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHASE_DEFINITIONS, PHASE_ORDER } from './phases.ts';

describe('phase definitions', () => {
  it('has a definition for every ordered phase', () => {
    expect(Object.keys(PHASE_DEFINITIONS)).toEqual(PHASE_ORDER);
  });

  it('builds a unified FM model before DDD boundary and tactical projections', () => {
    expect(PHASE_DEFINITIONS.domain.artifacts.map((item) => item.key)).toEqual([
      'ubiquitous-language',
      'fulfillment-model',
      'bounded-contexts',
      'entities-and-value-objects',
      'aggregates',
      'domain-events',
    ]);
    expect(PHASE_DEFINITIONS.domain.artifacts[1]).toMatchObject({
      kind: 'fm-model',
      skillFile: '.pi/skills/evidence-modeling/SKILL.md',
    });
  });

  it('feeds FM into every domain projection and architecture contract without quantity quotas', () => {
    const domain = PHASE_DEFINITIONS.domain.artifacts;
    expect(domain[1].inputs).not.toContain(
      'artifacts/02-domain/bounded-contexts.md',
    );
    for (const spec of domain.slice(2)) {
      expect(spec.inputs).toContain('artifacts/02-domain/fm-model');
      expect(spec.minTableRows).toBeUndefined();
    }
    for (const key of ['api-contracts', 'data-model']) {
      expect(
        PHASE_DEFINITIONS.architecture.artifacts.find(
          (spec) => spec.key === key,
        )?.inputs,
      ).toContain('artifacts/02-domain/fm-model');
    }
  });

  it('defines test strategy and reusable procedures at the end of architecture', () => {
    const artifacts = PHASE_DEFINITIONS.architecture.artifacts;
    expect(artifacts.map((item) => item.key)).toEqual([
      'context-map',
      'architecture-style',
      'tech-stack',
      'module-structure',
      'api-contracts',
      'data-model',
      'test-strategy',
      'test-procedures',
    ]);
    expect(artifacts.at(-1)?.inputs).toContain(
      'artifacts/03-architecture/test-strategy.md',
    );
  });

  it('passes testing contracts into planning and review without adding phases', () => {
    const testingInputs = [
      'artifacts/03-architecture/test-strategy.md',
      'artifacts/03-architecture/test-procedures.md',
    ];
    for (const artifact of [
      ...PHASE_DEFINITIONS.planning.artifacts,
      ...PHASE_DEFINITIONS.review.artifacts,
    ]) {
      expect(artifact.inputs).toEqual(expect.arrayContaining(testingInputs));
    }
    expect(PHASE_DEFINITIONS.review.artifacts[0].inputs).toEqual(
      expect.arrayContaining([
        'artifacts/01-requirements/story-map.md',
        'artifacts/04-planning/sprint-1-backlog.md',
      ]),
    );
    expect(PHASE_ORDER).toEqual([
      'requirements',
      'domain',
      'architecture',
      'planning',
      'coding',
      'review',
    ]);
  });

  it('only depends on earlier generated artifacts', () => {
    const artifacts = PHASE_ORDER.flatMap(
      (phase) => PHASE_DEFINITIONS[phase].artifacts,
    );
    const outputs = artifacts.map((item) => item.output);
    for (const [index, artifact] of artifacts.entries()) {
      for (const input of artifact.inputs) {
        const upstreamIndex = outputs.indexOf(input);
        if (upstreamIndex !== -1) expect(upstreamIndex).toBeLessThan(index);
      }
    }
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

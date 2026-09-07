import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHASE_DEFINITIONS, PHASE_ORDER } from './phases.ts';

describe('phase definitions', () => {
  it('has a definition for every ordered phase', () => {
    expect(Object.keys(PHASE_DEFINITIONS)).toEqual(PHASE_ORDER);
  });

  it('has one modeling entry with language and FM, not standalone DDD documents', () => {
    expect(PHASE_ORDER).toContain('modeling');
    expect(PHASE_ORDER).not.toContain('domain');
    const definition = PHASE_DEFINITIONS.modeling;
    expect(PHASE_ORDER).not.toContain('requirements');
    expect(definition.skillFile).toBe('.pi/skills/evidence-modeling/SKILL.md');
    expect(definition.artifacts.map((item) => item.key)).toEqual([
      'ubiquitous-language',
      'fulfillment-model',
      'personas',
      'problem-statement',
      'story-map',
    ]);
    expect(definition.artifacts[1]).toMatchObject({
      kind: 'fm-model',
      output: 'artifacts/02-modeling/fm-model/status.md',
    });
    for (const spec of definition.artifacts) {
      expect(spec.minTableRows).toBeUndefined();
      expect(spec.inputs.some((path) => path.includes('03-architecture'))).toBe(
        false,
      );
    }
  });

  it('feeds FM into architecture design mappings and contracts without legacy DDD inputs', () => {
    for (const key of [
      'context-map',
      'module-structure',
      'api-contracts',
      'data-model',
      'test-strategy',
    ]) {
      const spec = PHASE_DEFINITIONS.architecture.artifacts.find(
        (item) => item.key === key,
      )!;
      expect(spec.inputs).toContain('artifacts/02-modeling/fm-model');
    }
    const specs = PHASE_ORDER.flatMap(
      (phase) => PHASE_DEFINITIONS[phase].artifacts,
    );
    for (const spec of specs) {
      expect([spec.output, ...spec.inputs].join('\n')).not.toMatch(
        /02-domain|bounded-contexts\.md|entities-and-value-objects\.md|aggregates\.md|domain-events\.md/,
      );
    }
    expect(
      PHASE_DEFINITIONS.architecture.artifacts[0].requiredSections,
    ).toContain('FM 映射');
    expect(
      PHASE_DEFINITIONS.architecture.artifacts.find(
        (spec) => spec.key === 'module-structure',
      )?.requiredSections,
    ).toEqual(expect.arrayContaining(['按需领域设计', '表达缺口']));
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
      'modeling',
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
        if (
          !input.startsWith('artifacts/') ||
          [
            'artifacts/00-input/requirements.md',
            'artifacts/05-coding',
          ].includes(input)
        )
          continue;
        const upstreamIndex = outputs.findIndex(
          (output) => output === input || output.startsWith(`${input}/`),
        );
        expect(
          upstreamIndex,
          `missing producer for ${input}`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          upstreamIndex,
          `future input ${input} for ${artifact.key}`,
        ).toBeLessThan(index);
      }
    }
  });

  it('uses unique artifact paths', () => {
    const outputs = PHASE_ORDER.flatMap((phase) =>
      PHASE_DEFINITIONS[phase].artifacts.map((item) => item.output),
    );
    expect(new Set(outputs).size).toBe(outputs.length);
  });

  it('removes the duplicate domain skill and standalone DDD templates', async () => {
    for (const path of [
      '.pi/skills/evidence-domain/SKILL.md',
      ...[
        'bounded-contexts',
        'entities-and-value-objects',
        'aggregates',
        'domain-events',
      ].map((key) => `.pi/extensions/evidence/templates/evidence-${key}.md`),
    ]) {
      await expect(access(resolve(process.cwd(), path))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
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

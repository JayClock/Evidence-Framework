import { strictValidateDomainModel } from '@evidence-poc/evidence-schema';
import { describe, expect, it } from 'vitest';

import {
  MODEL_BUNDLE_TYPE,
  UpdateEntityCommand,
  createModelSession,
  MODEL_README_PATH,
  isModelBundlePath,
  isModelBundleShape,
  modelBundleSourceFiles,
  packModelSourceFiles,
  parseModelBundleText,
  serializeDomainModel,
  serializeModelBundle,
} from '../index.js';
import { createProcurementModel } from '../testing/modelFixture.js';

const bundleOf = (document: ReturnType<typeof createProcurementModel>) =>
  ({ ...document, type: MODEL_BUNDLE_TYPE, schemaVersion: '5.0' }) as const;

describe('isModelBundlePath', () => {
  it('recognises the single-file suffix only', () => {
    expect(isModelBundlePath('order.evidence.json')).toBe(true);
    expect(isModelBundlePath('./models/order.EVIDENCE.JSON')).toBe(true);
    expect(isModelBundlePath('model.json')).toBe(false);
    expect(isModelBundlePath('evidence.json')).toBe(false);
  });
});

describe('serializeModelBundle', () => {
  it('wraps the document with a type and schema version', () => {
    const bundle = JSON.parse(
      serializeModelBundle(createProcurementModel()),
    ) as Record<string, unknown>;

    expect(bundle['type']).toBe(MODEL_BUNDLE_TYPE);
    expect(bundle['schemaVersion']).toBe('5.0');
    expect(Array.isArray(bundle['entities'])).toBe(true);
    expect(bundle['validation']).toBeUndefined();
    expect(bundle['readme']).toBeUndefined();
  });

  it('sorts items by id so the same model always writes the same bytes', () => {
    const document = createProcurementModel();
    const reversed = {
      ...document,
      entities: [...document.entities].reverse(),
      relationships: [...document.relationships].reverse(),
      rules: [...document.rules].reverse(),
    };

    expect(serializeModelBundle(reversed)).toBe(serializeModelBundle(document));
    expect(serializeModelBundle(document, { sortItems: false })).not.toBe(
      serializeModelBundle(reversed, { sortItems: false }),
    );
  });

  it('keeps the extras a bundle carried', () => {
    const text = serializeModelBundle({
      ...bundleOf(createProcurementModel()),
      readme: '范围与来源说明。\n',
      validation: {
        instances: [{ id: 'evidence-instance.a' }],
        scenarios: [],
      },
    });
    const bundle = JSON.parse(text) as Record<string, unknown>;

    expect(bundle['readme']).toBe('范围与来源说明。\n');
    expect(bundle['validation']).toEqual({
      instances: [{ id: 'evidence-instance.a' }],
      scenarios: [],
    });
  });
});

describe('parseModelBundleText', () => {
  it('parses a serialized document back into the same model', () => {
    const document = createProcurementModel();
    const result = parseModelBundleText(serializeModelBundle(document));

    expect(result.issues).toEqual([]);
    expect(result.document.manifest).toEqual(document.manifest);
    expect(result.document.entities).toHaveLength(document.entities.length);
    expect(result.document.relationships).toHaveLength(
      document.relationships.length,
    );
    expect(result.document.rules).toHaveLength(document.rules.length);
    expect(strictValidateDomainModel(result.document).valid).toBe(true);
    expect(isModelBundleShape(result.document)).toBe(true);
  });

  it('never throws on malformed input', () => {
    expect(parseModelBundleText('{').issues[0]?.message).toContain(
      'invalid JSON',
    );
    expect(parseModelBundleText('[]').issues[0]?.message).toContain(
      'expected a JSON object',
    );
    expect(
      parseModelBundleText('{}').issues.map((issue) => issue.path),
    ).toEqual(expect.arrayContaining(['type', 'manifest', 'entities']));
  });

  it('reports schema version, item type and duplicate id problems', () => {
    const document = createProcurementModel();
    const entity = document.entities[0];
    const text = JSON.stringify({
      type: MODEL_BUNDLE_TYPE,
      schemaVersion: '4.0',
      manifest: document.manifest,
      entities: [entity, entity, { ...entity, type: 'rule' }],
      relationships: [],
      rules: [],
    });
    const paths = parseModelBundleText(text).issues.map((issue) => issue.path);

    expect(paths).toContain('schemaVersion');
    expect(paths).toContain('entities[1]');
    expect(paths).toContain('entities[2]');
  });

  it('runs the static FM checks only when asked', () => {
    const document = createProcurementModel();
    const text = serializeModelBundle({
      ...document,
      manifest: { ...document.manifest, id: 'Not A Domain Id' },
    });

    expect(parseModelBundleText(text).issues).toEqual([]);
    expect(
      parseModelBundleText(text, { validate: true }).issues.length,
    ).toBeGreaterThan(0);
  });

  it('round-trips extras through serialize and parse', () => {
    const text = serializeModelBundle({
      ...bundleOf(createProcurementModel()),
      readme: '说明\n',
      validation: {
        instances: [{ id: 'evidence-instance.a', type: 'evidence_instance' }],
        scenarios: [{ id: 'scenario.a', type: 'fm_scenario' }],
      },
    });
    const { document, issues } = parseModelBundleText(text);

    expect(issues).toEqual([]);
    expect(document.readme).toBe('说明\n');
    expect(document.validation?.instances).toHaveLength(1);
    expect(document.validation?.scenarios).toHaveLength(1);
  });
});

describe('editing a bundled document', () => {
  it('keeps bundle extras across a command and a re-serialize', () => {
    const text = serializeModelBundle({
      ...bundleOf(createProcurementModel()),
      readme: '说明\n',
      validation: {
        instances: [{ id: 'evidence-instance.a', type: 'evidence_instance' }],
        scenarios: [],
      },
    });
    const session = createModelSession({
      document: parseModelBundleText(text).document,
    });

    session.dispatch(
      new UpdateEntityCommand('contract.procurement', {
        label: '采购合同（Procurement Contract）',
      }),
    );

    const rewritten = JSON.parse(
      serializeModelBundle(session.getDocument()),
    ) as Record<string, unknown>;

    expect(rewritten['readme']).toBe('说明\n');
    expect(rewritten['validation']).toEqual({
      instances: [{ id: 'evidence-instance.a', type: 'evidence_instance' }],
      scenarios: [],
    });
  });
});

describe('modelBundleSourceFiles', () => {
  it('projects a bundle back onto the directory layout', () => {
    const files = modelBundleSourceFiles({
      ...bundleOf(createProcurementModel()),
      readme: '说明',
      validation: {
        instances: [{ id: 'evidence-instance.a', type: 'evidence_instance' }],
        scenarios: [{ id: 'scenario.a', type: 'fm_scenario' }],
      },
    });
    const paths = files.map((file) => file.path);

    expect(paths[0]).toBe('model.json');
    expect(paths).toContain('entities/evidence-contract--procurement.json');
    expect(paths).toContain('validation/instances/evidence-instance--a.json');
    expect(paths).toContain('validation/scenarios/scenario--a.json');
    expect(paths.at(-1)).toBe(MODEL_README_PATH);
    expect(files.at(-1)?.content).toBe('说明\n');
  });

  it('matches the directory serializer for the model part', () => {
    const document = createProcurementModel();
    const fromBundle = modelBundleSourceFiles(document).filter(
      (file) =>
        file.path.endsWith('.json') && !file.path.startsWith('validation/'),
    );

    expect(fromBundle).toEqual(serializeDomainModel(document));
  });
});

describe('packModelSourceFiles', () => {
  it('carries validation inputs and the readme into the bundle', () => {
    const files = [
      ...serializeDomainModel(createProcurementModel()),
      {
        path: 'validation/instances/evidence-instance--a.json',
        content: JSON.stringify({ id: 'evidence-instance.a' }),
      },
      {
        path: 'validation/scenarios/scenario--a.json',
        content: JSON.stringify({ id: 'scenario.a' }),
      },
      { path: MODEL_README_PATH, content: '说明\n' },
      { path: 'generated/compiled-model.json', content: '{}' },
    ];
    const { bundle, issues } = packModelSourceFiles(files);

    expect(issues).toEqual([]);
    expect(bundle.readme).toBe('说明\n');
    expect(bundle.validation?.instances).toEqual([
      { id: 'evidence-instance.a' },
    ]);
    expect(bundle.validation?.scenarios).toEqual([{ id: 'scenario.a' }]);
  });

  it('reports a malformed validation file instead of dropping it', () => {
    const files = [
      ...serializeDomainModel(createProcurementModel()),
      { path: 'validation/instances/broken.json', content: '{' },
    ];
    const { issues } = packModelSourceFiles(files);

    expect(issues.map((issue) => issue.path)).toContain(
      'validation/instances/broken.json',
    );
  });
});

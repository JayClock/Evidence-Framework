import { createHash } from 'node:crypto';
import {
  parseModelBundleText,
  serializeModelBundle,
} from '@evidence-poc/evidence-model-core';
import { procurementEvolution } from '../../tests/support/procurement.js';
import { canonicalJson } from '../canonicalJson.js';
import { buildDelivery } from '../projector.js';
import { validateProjection } from '../loader/apiLoader.js';
import { renderOutputs } from './outputRenderer.js';

const digest = (content: string) =>
  createHash('sha256').update(content, 'utf8').digest('hex');
interface Manifest {
  inputs: Record<string, string>;
  outputs: Record<string, { sha256: string; bytes: number }>;
}
const mismatches = (files: Record<string, string>): string[] => {
  const manifest = JSON.parse(files['manifest.json']!) as Manifest;
  const names = [
    ...new Set([
      ...Object.keys(manifest.outputs),
      ...Object.keys(files).filter((name) => name !== 'manifest.json'),
    ]),
  ].sort();
  return names.filter((name) => {
    const content = files[name];
    const entry = manifest.outputs[name];
    return (
      content === undefined ||
      entry === undefined ||
      entry.sha256 !== digest(content) ||
      entry.bytes !== Buffer.byteLength(content, 'utf8')
    );
  });
};

describe('deterministic delivery integrity', () => {
  it.each(
    procurementEvolution().map(
      (document, index) => [index + 1, document] as const,
    ),
  )(
    'renders stage %s repeatedly and round-trips model bundles without byte drift',
    (_stage, document) => {
      document.manifest.name = '采购协议 · Δ';
      const original = JSON.stringify(document);
      const snapshot = buildDelivery(document);
      const files = renderOutputs(snapshot);
      expect(mismatches(files)).toEqual([]);
      expect(renderOutputs(buildDelivery(structuredClone(document)))).toEqual(
        files,
      );
      const reordered = structuredClone(document);
      reordered.entities.reverse();
      reordered.relationships.reverse();
      reordered.rules.reverse();
      expect(renderOutputs(buildDelivery(reordered))).toEqual(files);
      const parsed = parseModelBundleText(serializeModelBundle(document));
      expect(parsed.issues).toEqual([]);
      expect(renderOutputs(buildDelivery(parsed.document))).toEqual(files);
      expect(JSON.stringify(document)).toBe(original);
      const manifest = JSON.parse(files['manifest.json']!) as Manifest;
      expect(manifest.inputs).toEqual(snapshot.digests);
      expect(manifest.outputs).not.toHaveProperty('manifest.json');
      expect(Object.keys(files).sort()).toEqual(
        [
          'deployment.compose.json',
          'http-journeys.json',
          'limitations.md',
          'manifest.json',
          'openapi.json',
          'projection.json',
          'routes.json',
          'topology.json',
        ]
          .filter(
            (name) =>
              name !== 'limitations.md' || snapshot.limitations.length > 0,
          )
          .sort(),
      );
      expect(validateProjection(JSON.parse(files['projection.json']!))).toEqual(
        [],
      );
      expect(files['projection.json']).toBe(canonicalJson(snapshot));
      expect(files['openapi.json']).toBe(canonicalJson(snapshot.openapi));
      expect(files['routes.json']).toBe(canonicalJson(snapshot.routes));
      expect(JSON.parse(files['http-journeys.json']!)).toEqual({
        runtimeValidated: false,
        journeys: snapshot.journeys,
        hypermedia: snapshot.hypermedia,
      });
      expect(manifest.outputs['openapi.json']!.bytes).toBeGreaterThan(
        files['openapi.json']!.length,
      );
    },
  );

  it('detects altered, missing and unmanifested files using exact UTF-8 bytes', () => {
    const files = renderOutputs(buildDelivery(procurementEvolution()[3]!));
    expect(
      mismatches({ ...files, 'openapi.json': files['openapi.json'] + '\r\n' }),
    ).toEqual(['openapi.json']);
    const missing = { ...files };
    delete missing['routes.json'];
    expect(mismatches(missing)).toEqual(['routes.json']);
    expect(mismatches({ ...files, 'extra.json': '{}' })).toEqual([
      'extra.json',
    ]);
  });
});

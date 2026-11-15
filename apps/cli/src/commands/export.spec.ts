import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  statSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { dispatch } from '../router.js';

const source = fileURLToPath(
  new URL(
    '../../../../examples/acceptance/procurement.evidence.json',
    import.meta.url,
  ),
);
let root: string, model: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'evidence-export-'));
  model = path.join(root, 'model.evidence.json');
  writeFileSync(model, readFileSync(source));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const context = () => ({
  cwd: root,
  stdout: () => undefined,
  stderr: () => undefined,
  color: false,
});

it('exports validated contracts and native acceptance together, deterministically', async () => {
  const args = ['export', '--model', model, '--out', 'generated'];
  expect(await dispatch(args, context())).toBe(0);
  const out = path.join(root, 'generated');
  expect(readdirSync(out)).toEqual(['acceptance.stepci.yml', 'openapi.json']);
  const before = readFileSync(path.join(out, 'openapi.json'), 'utf8');
  expect(JSON.parse(before).openapi).toBe('3.1.0');
  expect(await dispatch(args, context())).toBe(0);
  expect(readFileSync(path.join(out, 'openapi.json'), 'utf8')).toBe(before);
});
it('selects individual artifacts and Hurl without stale mixed generations', async () => {
  expect(
    await dispatch(['export', '--model', model, '--openapi'], context()),
  ).toBe(0);
  expect(readdirSync(path.join(root, 'dist'))).toEqual(['openapi.json']);
  expect(
    await dispatch(
      ['export', '--model', model, '--tests', '--format', 'hurl'],
      context(),
    ),
  ).toBe(0);
  expect(readdirSync(path.join(root, 'dist'))).toEqual(['flow-001.hurl']);
});
it('leaves previous output intact if acceptance compilation fails', async () => {
  expect(await dispatch(['export', '--model', model], context())).toBe(0);
  const suite = path.join(root, 'dist', 'acceptance.stepci.yml');
  const before = readFileSync(suite, 'utf8');
  const broken = JSON.parse(readFileSync(model, 'utf8'));
  for (const entity of broken.entities) delete entity.examples;
  writeFileSync(model, JSON.stringify(broken));
  expect(await dispatch(['export', '--model', model], context())).toBe(1);
  expect(readFileSync(suite, 'utf8')).toBe(before);
});

it('verifies exact artifacts without writes and diagnoses missing, changed and orphan files', async () => {
  const args = ['export', '--model', model, '--out', 'generated'];
  const errors: string[] = [];
  const ctx = { ...context(), stderr: (text: string) => errors.push(text) };
  expect(await dispatch([...args, '--verify'], ctx)).toBe(1);
  expect(errors.pop()).toContain('MISSING: openapi.json');
  expect(readdirSync(root)).toEqual(['model.evidence.json']);
  expect(await dispatch(args, ctx)).toBe(0);
  const out = path.join(root, 'generated');
  const file = path.join(out, 'openapi.json');
  const modified = statSync(file).mtimeMs;
  expect(await dispatch([...args, '--verify'], ctx)).toBe(0);
  expect(statSync(file).mtimeMs).toBe(modified);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  rmSync(path.join(out, 'acceptance.stepci.yml'));
  mkdirSync(path.join(out, 'old'));
  writeFileSync(path.join(out, 'old', 'orphan.hurl'), 'orphan');
  expect(await dispatch([...args, '--verify'], ctx)).toBe(1);
  expect(errors.pop()).toMatch(
    /MISSING: acceptance.stepci.yml[\s\S]*MODIFIED: openapi.json[\s\S]*EXTRA: old\/orphan.hurl[\s\S]*evidence export/,
  );
  expect(await dispatch(args, ctx)).toBe(0);
  expect(await dispatch([...args, '--verify'], ctx)).toBe(0);
  rmSync(file);
  symlinkSync(path.join(root, 'missing'), file);
  expect(await dispatch([...args, '--verify'], ctx)).toBe(1);
});

it('refuses destructive output overlaps including symlink aliases', async () => {
  for (const out of ['.', path.parse(root).root, model])
    expect(
      await dispatch(['export', '--model', model, '--out', out], context()),
    ).toBe(1);
  symlinkSync(root, path.join(root, 'alias'));
  expect(
    await dispatch(['export', '--model', model, '--out', 'alias'], context()),
  ).toBe(1);
  expect(readFileSync(model, 'utf8')).toBe(readFileSync(source, 'utf8'));
});

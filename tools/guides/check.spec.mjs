import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkDocuments, collectDocuments } from './check.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'evidence-guides-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, text = '# Source\n') => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    return path;
  };
  return { root, put };
}

test('resolves relative files, directories, encoded names and angle paths without writing', (t) => {
  const { root, put } = fixture(t);
  put('docs/来源 文件.md');
  const source = put(
    'docs/index.md',
    [
      '[encoded](%E6%9D%A5%E6%BA%90%20%E6%96%87%E4%BB%B6.md#heading)',
      '[angle](<来源 文件.md>)',
      '[directory](../docs/)',
      '[title](<来源 文件.md> "Source")',
    ].join('\n'),
  );
  const before = readFileSync(source);
  const result = checkDocuments(root, ['docs/index.md']);
  assert.deepEqual(result.errors, []);
  assert.equal(result.localLinks, 4);
  assert.deepEqual(readFileSync(source), before);
});

test('reports absent documents and links with their line numbers', (t) => {
  const { root, put } = fixture(t);
  put('index.md', '# Guide\n\n[missing](docs/no.md)\n');
  const result = checkDocuments(root, ['index.md', 'absent.md']);
  assert.equal(result.errors.length, 2);
  assert.match(
    result.errors[0],
    /index.md:3: docs\/no.md: missing local target/,
  );
  assert.match(result.errors[1], /required document is missing/);
});

test('ignores fenced samples, remote links, local anchors and template variables', (t) => {
  const { root, put } = fixture(t);
  put(
    'index.md',
    [
      '````markdown',
      '[sample](missing.md)',
      '```',
      '[still sample](missing.md)',
      '````',
      '~~~bash',
      '[sample](missing.md)',
      '~~~',
      '[web](https://example.invalid/guide)',
      '[mail](mailto:a@example.invalid)',
      '[cdn](//example.invalid/a)',
      '[anchor](#heading)',
      '[template]({{path}})',
      '[variable](${ROOT}/guide.md)',
    ].join('\n'),
  );
  const result = checkDocuments(root, ['index.md']);
  assert.deepEqual(result.errors, []);
  assert.equal(result.localLinks, 0);
});

test('rejects malformed encoding and paths outside the project', (t) => {
  const { root, put } = fixture(t);
  put('index.md', '[bad](%ZZ.md)\n[out](../outside.md)\n');
  const result = checkDocuments(root, ['index.md']);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /invalid URL encoding/);
  assert.match(result.errors[1], /escapes project root/);
});

test('rejects symlink targets outside the project', (t) => {
  const { root, put } = fixture(t);
  const external = mkdtempSync(join(tmpdir(), 'external-guides-'));
  t.after(() => rmSync(external, { recursive: true, force: true }));
  writeFileSync(join(external, 'guide.md'), '# External\n');
  symlinkSync(external, join(root, 'external'));
  put('index.md', '[external](external/guide.md)\n');
  assert.match(checkDocuments(root, ['index.md']).errors[0], /through symlink/);
});

test('rejects obsolete architecture guidance rather than keeping a compatibility paragraph', (t) => {
  const { root, put } = fixture(t);
  for (const text of ['保留分布式单体方向', 'distributed-monolith']) {
    put('index.md', text);
    assert.match(
      checkDocuments(root, ['index.md']).errors[0],
      /obsolete architecture/,
    );
  }
  put('index.md', '模块化单体，模块通过进程内公开契约协作。');
  assert.deepEqual(checkDocuments(root, ['index.md']).errors, []);
});

test('scans maintained docs and workflow templates, not generated facts or historical evidence', (t) => {
  const { root, put } = fixture(t);
  put('docs/engineering/new-guide.md');
  put('.agents/skills/evidence-task-planning/assets/task-plan-template.md');
  put('.evidence/fm/generated/report.md');
  put('.evidence/checks/old/record.md');
  put('.agents/skills/evidence-task-planning/evals/README.md');
  const files = collectDocuments(root);
  assert.ok(files.includes('docs/engineering/new-guide.md'));
  assert.ok(
    files.includes(
      '.agents/skills/evidence-task-planning/assets/task-plan-template.md',
    ),
  );
  assert.ok(
    files.includes('docs/guides/index.md'),
    'entry is required even when absent',
  );
  assert.ok(
    !files.some(
      (file) =>
        file.includes('/generated/') ||
        file.includes('/checks/') ||
        file.includes('/evals/'),
    ),
  );
  assert.ok(
    checkDocuments(root).errors.some((error) =>
      error.includes('docs/guides/index.md: required'),
    ),
  );
});

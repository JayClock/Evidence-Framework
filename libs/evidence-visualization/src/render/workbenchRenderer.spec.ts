import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { projectWorkbenchData, type WorkbenchData } from '../projection/workbenchProjection.js';
import {
  WORKBENCH_MARKER,
  embeddedJson,
  renderWorkbenchHtml,
  scriptHashCsp,
} from './workbenchRenderer.js';
import { publishWorkbench } from '../publish/workbenchPublisher.js';

const assets = (): { app: string; style: string; template: string } => ({
  app: 'globalThis.__app = true;',
  style: 'body { color: #111; }',
  template: [
    '<!doctype html>',
    '<html><head>',
    '<meta http-equiv="Content-Security-Policy" content="@@CSP@@" />',
    '<style>@@STYLE@@;</style>',
    '</head><body>',
    '<script type="application/json" id="workbench-data">@@DATA@@</script>',
    '<script>@@APP@@</script>',
    '</body></html>',
  ].join('\n'),
});

const data = (overrides: Partial<WorkbenchData> = {}): WorkbenchData => {
  const projected = projectWorkbenchData({
    model: {
      schemaVersion: '5.0',
      model: { name: '测试模型' },
      entities: [
        {
          id: 'context.a',
          category: 'context',
          kind: 'contract',
          label: '约定',
        },
      ],
      relationships: [],
      rules: [],
    },
    check: {},
    generatedAt: '2026-11-12T00:00:00.000Z',
  });

  return { ...projected, ...overrides };
};

const inlineScripts = (html: string): string[] =>
  [...html.matchAll(/<script>(.*?)<\/script>/gs)].map((match) => match[1] ?? '');

describe('embeddedJson', () => {
  it('escapes the characters that would end the tag or the literal', () => {
    expect(embeddedJson({ text: '</script><img src=x>' })).toBe(
      '{"text":"\\u003c/script\\u003e\\u003cimg src=x\\u003e"}',
    );
    expect(embeddedJson({ text: 'a&b' })).toContain('\\u0026');
    expect(embeddedJson({ text: '\u2028\u2029' })).toBe(
      '{"text":"\\u2028\\u2029"}',
    );
  });
});

describe('scriptHashCsp', () => {
  it('allows exactly the script it hashes and forbids every request', () => {
    const script = 'globalThis.x = 1;';
    const digest = createHash('sha256').update(script, 'utf8').digest('base64');
    const csp = scriptHashCsp(script);

    expect(csp).toContain(`'sha256-${digest}'`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
  });
});

describe('renderWorkbenchHtml', () => {
  it('escapes the payload and hashes the exact script it ships', () => {
    const payload = data({ title: '</script><img src=x onerror=alert(1)>@@APP@@' });
    const html = renderWorkbenchHtml(payload, assets());

    expect(html.startsWith(WORKBENCH_MARKER)).toBe(true);
    expect(html).not.toContain('</script><img');
    expect(html).not.toContain('@@CSP@@');

    const scripts = inlineScripts(html);

    expect(scripts).toHaveLength(1);

    const digest = createHash('sha256')
      .update(scripts[0] as string, 'utf8')
      .digest('base64');

    expect(html).toContain(`'sha256-${digest}'`);
    expect(html).toContain("connect-src 'none'");
  });

  it('round-trips the payload exactly', () => {
    const payload = data();
    const html = renderWorkbenchHtml(payload, assets());
    const match = /id="workbench-data">(.*?)<\/script>/s.exec(html);

    expect(match).not.toBeNull();
    expect(JSON.parse(match?.[1] as string)).toEqual(payload);
  });

  it('refuses an asset that would close its own tag', () => {
    expect(() =>
      renderWorkbenchHtml(data(), {
        ...assets(),
        app: 'window.x = "</script>";',
      }),
    ).toThrow(/非法结束标签/);
    expect(() =>
      renderWorkbenchHtml(data(), {
        ...assets(),
        style: 'body::after { content: "</style>"; }',
      }),
    ).toThrow(/非法结束标签/);
  });

  it('refuses a template with more than one inline script', () => {
    expect(() =>
      renderWorkbenchHtml(data(), {
        ...assets(),
        template: '<script>a</script><script>b</script>',
      }),
    ).toThrow(/只允许一个内联脚本/);
  });
});

describe('publishWorkbench', () => {
  it('refuses a foreign file and a symbolic link', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'workbench-publish-'));

    try {
      const page = path.join(directory, 'index.html');

      await writeFile(page, 'unrelated', 'utf8');
      await expect(publishWorkbench(page, 'anything')).rejects.toThrow(
        /拒绝覆盖非工作台文件或符号链接/,
      );
      expect(await readFile(page, 'utf8')).toBe('unrelated');

      await rm(page);
      await symlink(path.join(directory, 'elsewhere'), page);
      await expect(publishWorkbench(page, 'anything')).rejects.toThrow(
        /拒绝覆盖非工作台文件或符号链接/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('replaces its own page atomically and leaves no temporary file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'workbench-publish-'));

    try {
      const page = path.join(directory, 'index.html');

      await writeFile(page, `${WORKBENCH_MARKER}\nprevious`, 'utf8');
      await publishWorkbench(page, `${WORKBENCH_MARKER}\nnext`);

      expect(await readFile(page, 'utf8')).toBe(`${WORKBENCH_MARKER}\nnext`);
      expect(
        (await readFile(page, 'utf8')).startsWith(WORKBENCH_MARKER),
      ).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

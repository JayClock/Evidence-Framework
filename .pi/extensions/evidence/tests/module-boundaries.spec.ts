import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve('.pi/extensions/evidence');

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(path) : [path];
      }),
    )
  )
    .flat()
    .filter(
      (path) =>
        path.endsWith('.ts') &&
        !path.endsWith('.spec.ts') &&
        !path.endsWith('-support.ts'),
    );
}

function parse(path: string, content: string) {
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

describe('Evidence module boundaries', () => {
  it('keeps the discovered entry point as a single adapter export', async () => {
    const path = join(root, 'index.ts');
    const file = parse(path, await readFile(path, 'utf8'));
    expect(file.statements).toHaveLength(1);
    const declaration = file.statements[0];
    expect(ts.isExportDeclaration(declaration)).toBe(true);
    if (!ts.isExportDeclaration(declaration))
      throw new Error('Expected adapter export');
    expect(declaration.moduleSpecifier?.getText(file)).toBe(
      "'./adapters/pi/register.ts'",
    );
  });

  it('registers tools, commands and lifecycle handlers only in the Pi adapter', async () => {
    const violations: string[] = [];
    for (const path of await sourceFiles(root)) {
      const name = relative(root, path).replaceAll('\\', '/');
      if (name.startsWith('adapters/pi/')) continue;
      const file = parse(path, await readFile(path, 'utf8'));
      walk(file, (node) => {
        if (
          !ts.isCallExpression(node) ||
          !ts.isPropertyAccessExpression(node.expression)
        )
          return;
        const call = node.expression;
        if (
          call.expression.getText(file) === 'pi' &&
          ['registerTool', 'registerCommand', 'on'].includes(call.name.text)
        )
          violations.push(name);
      });
    }
    expect(violations).toEqual([]);
  });
});

import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function isTestFile(path: string): boolean {
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|(?:^|\/)[^/]*\.(?:spec|test)\.[^/]+$/i.test(
    path,
  );
}
export function isProductionSourceFile(path: string): boolean {
  return (
    !isTestFile(path) &&
    /\.(?:css|html|java|js|jsx|kt|kts|scss|sql|ts|tsx)$/i.test(path)
  );
}
export function validateTestFilePath(path: string): void {
  if (
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '..' || part === '.') ||
    /^(?:\.pi|\.evidence|\.git|node_modules|artifacts|reports)(?:\/|$)/.test(
      path,
    ) ||
    !isTestFile(path)
  ) {
    throw new Error(`无效测试文件路径：${path}`);
  }
}
export async function testFileHashes(
  root: string,
  paths: string[],
): Promise<Record<string, string>> {
  const realRoot = await realpath(root);
  const entries = await Promise.all(
    paths.map(async (path) => {
      validateTestFilePath(path);
      try {
        const resolved = await realpath(resolve(root, path));
        const relativePath = relative(realRoot, resolved);
        if (
          isAbsolute(relativePath) ||
          relativePath === '..' ||
          relativePath.startsWith(`..${sep}`)
        )
          throw new Error('outside root');
        const content = await readFile(resolved);
        if (content.length === 0) throw new Error('empty file');
        return [
          path,
          createHash('sha256').update(content).digest('hex'),
        ] as const;
      } catch {
        throw new Error(`测试文件不存在、为空或越出项目目录：${path}`);
      }
    }),
  );
  return Object.fromEntries(entries);
}
export function validateFocusedTestCommand(command: string): string {
  const normalized = command.trim();
  if (!normalized || /[\n\r;|&><`]|\$\(/.test(normalized)) {
    throw new Error(
      '聚焦测试命令必须是单条命令，不能包含重定向、管道、命令替换或命令连接符。',
    );
  }
  const runner =
    /^(?:npm(?:\s+run)?\s+test\b|npx\s+(?:nx\s+test|vitest|jest)\b|pnpm(?:\s+run)?\s+test\b|yarn\s+test\b|nx\s+test\b|(?:\.\/)?[\w./-]*gradlew(?:\.bat)?\s+(?:test|check)\b|(?:\.\/)?[\w./-]*mvnw(?:\.cmd)?\s+test\b)/i;
  if (!runner.test(normalized))
    throw new Error(
      '聚焦命令必须直接调用受支持的测试入口（npm/nx/vitest/jest/Gradle/Maven）。',
    );
  if (
    /(?:^|\s)(?:--(?:passWithNoTests|if-present|update(?:Snapshot)?|dry-run)|-u)(?:\s|=|$)/i.test(
      normalized,
    )
  ) {
    throw new Error('测试命令不能跳过测试、更新快照或仅试运行。');
  }
  return normalized;
}
export function hasInvalidTestOutput(output: string): boolean {
  return (
    !output.trim() ||
    /no (?:tests?|test suite) (?:found|were found)|(?:^|\n)\s*#\s*tests\s+0\b|\b0 tests? (?:passed|collected|executed)\b|tests? run:\s*0\b|NO-SOURCE|command not found|SyntaxError|Cannot find module|compilation (?:failed|error)|error TS\d+/i.test(
      output,
    )
  );
}

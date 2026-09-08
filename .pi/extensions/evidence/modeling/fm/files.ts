import type { FmModelFile } from './contracts.ts';

const ROOT_FILES = new Set([
  'model.yaml',
  'README.md',
  '00-overview.md',
  '01-glossary.md',
]);

const MODEL_FILE_PATTERN =
  /^(?:entities|fulfillments|relationships|rules|business-patterns)\/[a-z0-9][a-z0-9-]*\.yaml$/;

const DISCOVERY_FILE_PATTERN = /^discovery\/[a-z0-9][a-z0-9-]*\.(?:md|yaml)$/;

const VALIDATION_FILE_PATTERN =
  /^validation\/(?:instances|scenarios)\/[a-z0-9][a-z0-9-]*\.yaml$/;

function normalizedRelativePath(path: string): string {
  const normalized = path.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`非法 FM 文件路径：${path}`);
  }
  if (
    !ROOT_FILES.has(normalized) &&
    !MODEL_FILE_PATTERN.test(normalized) &&
    !DISCOVERY_FILE_PATTERN.test(normalized) &&
    !VALIDATION_FILE_PATTERN.test(normalized)
  ) {
    throw new Error(`FM 文件路径不在允许范围内：${path}`);
  }
  return normalized;
}

export function normalizeFmModelFiles(files: FmModelFile[]): FmModelFile[] {
  if (files.length > 200) throw new Error('FM 模型文件不能超过 200 个');
  const seen = new Set<string>();
  const normalized = files.map((file) => {
    const path = normalizedRelativePath(file.path);
    if (seen.has(path)) throw new Error(`重复的 FM 文件路径：${path}`);
    if (!file.content.trim()) throw new Error(`FM 文件不能为空：${path}`);
    if (file.content.length > 500_000)
      throw new Error(`单个 FM 文件不能超过 500000 字符：${path}`);
    seen.add(path);
    return { path, content: `${file.content.trimEnd()}\n` };
  });
  if (!seen.has('model.yaml')) throw new Error('FM 模型必须包含 model.yaml');
  return normalized.sort((left, right) => left.path.localeCompare(right.path));
}

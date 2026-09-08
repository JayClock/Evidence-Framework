import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { digestText } from '../../modeling/digest.ts';
import type { DiscoveryContent } from '../../modeling/discovery/schema.ts';
import {
  readText,
  relativeProjectPath,
  REQUIREMENTS_PATH,
} from '../../storage.ts';

function allowedSourcePath(path: string): boolean {
  return (
    !path.startsWith('.evidence/') &&
    !path.startsWith('.pi/') &&
    !path.startsWith('reports/') &&
    (!path.startsWith('artifacts/') || path.startsWith('artifacts/00-input/'))
  );
}

export async function captureSources(
  root: string,
  sources: DiscoveryContent['sources'],
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) throw new Error(`重复来源 ID：${source.id}`);
    ids.add(source.id);
    const path = relativeProjectPath(root, source.path);
    // Evidence-produced documents cannot be recycled as an independent business source.
    if (path !== source.path || !allowedSourcePath(path))
      throw new Error(
        `来源必须是项目内的原始材料，而非模型或报告：${source.path}`,
      );
    const resolvedPath = relativeProjectPath(
      await realpath(root),
      await realpath(resolve(root, path)),
    );
    if (!allowedSourcePath(resolvedPath))
      throw new Error(`来源链接指向受保护记录：${path}`);
    const text = await readText(root, path);
    if (!text.trim()) throw new Error(`来源文件不存在或为空：${path}`);
    hashes[path] = digestText(text);
  }
  const input = await readText(root, REQUIREMENTS_PATH);
  if (!input.trim()) throw new Error('缺少原始输入');
  hashes[REQUIREMENTS_PATH] = digestText(input);
  return hashes;
}

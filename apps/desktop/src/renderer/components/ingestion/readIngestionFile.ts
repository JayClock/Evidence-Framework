import type { IngestionInputKind } from '@evidence-poc/desktop-contracts/ingestion';

const kindsByExtension = new Map<string, IngestionInputKind | null>([
  ['md', null],
  ['txt', null],
  ['csv', 'blueprint'],
  ['json', 'text'],
  ['yaml', 'text'],
  ['yml', 'text'],
  ['sql', 'text'],
]);

export const ingestionFileAccept = [...kindsByExtension.keys()]
  .map((extension) => `.${extension}`)
  .join(',');

const maxFileBytes = 20_000_000;

const readBytes = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result !== null && typeof reader.result !== 'string')
        resolve(reader.result);
      else reject(new Error('Missing file bytes'));
    };
    reader.onerror = reader.onabort = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

export const readIngestionFile = async (files: readonly File[]) => {
  const [file, ...rest] = files;
  if (!file || rest.length) throw new Error('每次请选择一个文件。');
  const extension = /\.([^.]+)$/.exec(file.name.toLowerCase())?.[1] ?? '';
  const kind = kindsByExtension.get(extension);
  if (kind === undefined)
    throw new Error('不支持此文件格式。请选择支持的纯文本文件。');
  if (file.size > maxFileBytes)
    throw new Error('文件超过 20 MB，请拆分后重试。');

  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(
      await readBytes(file),
    );
  } catch {
    throw new Error('无法读取这个文件，请确认它是 UTF-8 文本。');
  }
  if (content.includes('\0')) throw new Error('请选择 UTF-8 纯文本文件。');
  if (!content.trim()) throw new Error('文件没有可读取的文本。');

  return { content, kind, name: file.name };
};

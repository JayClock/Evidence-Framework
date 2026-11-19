import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@evidence-poc/desktop-ui-kit';
import type { LiveDeliveryArtifact } from '@evidence-poc/desktop-contracts/delivery';

const PREVIEW_LIMIT = 96_000;
const JSON_TOKEN =
  /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

const highlightJson = (source: string) => {
  const tokens = [];
  let end = 0;
  for (const match of source.matchAll(JSON_TOKEN)) {
    const start = match.index;
    tokens.push(source.slice(end, start));
    tokens.push(
      <span
        key={start}
        className={
          match[2]
            ? 'text-sky-300'
            : match[1]
              ? 'text-emerald-300'
              : 'text-amber-300'
        }
      >
        {match[0]}
      </span>,
    );
    end = start + match[0].length;
  }
  tokens.push(source.slice(end));
  return tokens;
};

export const CodePreviewPane = ({
  artifact,
  version,
  stale,
  actions,
}: {
  artifact: LiveDeliveryArtifact;
  version?: string | undefined;
  stale: boolean;
  actions: ReactNode;
}) => {
  const { path, content } = artifact;
  const [notice, setNotice] = useState('');
  const json = path.endsWith('.json');
  const isTruncated = content.length > PREVIEW_LIMIT;
  const highlighted = useMemo(() => {
    const excerpt = content.slice(0, PREVIEW_LIMIT);
    return json ? highlightJson(excerpt) : excerpt;
  }, [content, json]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setNotice('已复制文件内容');
    } catch {
      setNotice('复制失败，无法访问剪贴板');
    }
  };

  return (
    <section
      aria-label="产物预览"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-workbench-border bg-workbench-background px-4 py-1">
        <h3
          className="min-w-0 truncate font-mono text-xs font-semibold"
          title={path}
        >
          {path}
        </h3>
        <span className="rounded bg-workbench-subtle px-1.5 py-0.5 text-[10px] text-workbench-muted">
          {version ? `OpenAPI ${version}` : json ? 'JSON' : 'Markdown'}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="xs" disabled={stale} onClick={() => void copy()}>
            复制代码
          </Button>
          {actions}
        </div>
      </header>
      {notice || isTruncated ? (
        <p role="status" className="px-4 py-1 text-xs text-workbench-muted">
          {notice || '仅预览文件开头，复制和导出仍使用完整内容。'}
        </p>
      ) : null}
      <pre
        tabIndex={0}
        aria-label={`${path} 文件内容`}
        className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[#1e293b] p-4 font-mono text-xs leading-5 text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-300"
      >
        <code>{highlighted}</code>
      </pre>
    </section>
  );
};

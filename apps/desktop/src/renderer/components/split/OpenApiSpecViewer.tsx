import { useMemo, useState } from 'react';

import * as YAML from 'yaml';

import { CodeEditor } from '@evidence-poc/desktop-ui-kit';
import type { DeliveryContract } from '@evidence-poc/evidence-api';

import type { LiveDeliveryPreview } from '../../../shared/delivery';
import { buildOpenApiLineIndex } from './openApiLineIndex';

export type OpenApiFormat = 'yaml' | 'json';

export interface OpenApiSpecViewerProps {
  analysis: LiveDeliveryPreview | null;
  /** The preview describes an older revision than the canvas shows. */
  stale: boolean;
  loading: boolean;
  error: string | null;
  /** Object the rest of the workspace is pointing at. */
  focusEntityId?: string | null;
  /** Replays a focus request even when the target did not change. */
  revealToken?: number;
  /** A contract line a reader pressed, named back to the canvas. */
  onFocusEntity?: (entityId: string) => void;
}

const FORMATS: readonly { id: OpenApiFormat; label: string }[] = [
  { id: 'yaml', label: 'YAML' },
  { id: 'json', label: 'JSON' },
];

const serialize = (spec: DeliveryContract, format: OpenApiFormat): string =>
  format === 'json'
    ? JSON.stringify(spec, null, 2)
    : YAML.stringify(spec, { lineWidth: 0, aliasDuplicateObjects: false });

/**
 * The contract the model becomes, read beside the model itself.
 *
 * This is the question a backend architect asks first — "I drew the topology,
 * what HTTP does it imply?" — and until now the answer lived inside the delivery
 * hub, one modal away from the graph that produced it. Reading it here means a
 * field added on the left can be watched landing on the right.
 *
 * The pane is deliberately read-only: a contract is a projection, so the only
 * honest way to change a line is to change the model that produces it.
 */
export const OpenApiSpecViewer = ({
  analysis,
  stale,
  loading,
  error,
  focusEntityId = null,
  revealToken = 0,
  onFocusEntity,
}: OpenApiSpecViewerProps) => {
  const [format, setFormat] = useState<OpenApiFormat>('yaml');
  const spec = analysis?.openapi ?? null;
  const [text, index] = useMemo(() => {
    if (spec === null) return ['', null] as const;

    const serialized = serialize(spec, format);

    return [
      serialized,
      buildOpenApiLineIndex(serialized, analysis?.bindings ?? []),
    ] as const;
  }, [spec, format, analysis?.bindings]);

  const routes = spec === null ? 0 : Object.keys(spec.paths).length;
  const schemas = spec === null ? 0 : Object.keys(spec.components.schemas).length;

  const revealLine = useMemo(() => {
    if (index === null || focusEntityId === null) return null;

    const line = index.entityLine.get(focusEntityId);
    if (line === undefined) return null;

    return { line, token: revealToken };
  }, [index, focusEntityId, revealToken]);

  const handleLineActivate = useMemo(() => {
    if (index === null || onFocusEntity === undefined) return undefined;

    return (line: number) => {
      const entityId = index.lineEntity.get(line);

      if (entityId !== undefined) onFocusEntity(entityId);
    };
  }, [index, onFocusEntity]);

  return (
    <section
      aria-label="交付契约"
      data-region="openapi-spec"
      className="flex h-full min-h-0 w-full flex-col bg-white"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-evidence-line bg-evidence-surface/60 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-semibold text-evidence-ink">
            交付契约
          </span>
          <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-evidence-muted">
            openapi.{format}
          </span>
          {spec === null ? null : (
            <span className="text-[10px] text-evidence-muted">
              {routes} 条路由 · {schemas} 个 Schema
            </span>
          )}
          {stale && spec !== null ? (
            <span
              data-stale-contract=""
              className="rounded-full bg-[#fff8e8] px-2 py-0.5 text-[10px] text-evidence-role"
            >
              待刷新
            </span>
          ) : null}
        </div>

        <div
          role="group"
          aria-label="契约格式"
          className="flex items-center rounded border border-evidence-line bg-white p-0.5 text-[10px]"
        >
          {FORMATS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={format === candidate.id}
              onClick={() => setFormat(candidate.id)}
              className={[
                'rounded px-1.5 py-0.5 transition-colors',
                format === candidate.id
                  ? 'bg-evidence-accent text-white'
                  : 'text-evidence-muted hover:text-evidence-ink',
              ].join(' ')}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {spec === null ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[11px] text-evidence-muted">
            {error !== null
              ? `无法投影契约：${error}`
              : loading
                ? '正在投影交付契约…'
                : '当前模型还没有可交付的路由。'}
          </div>
        ) : (
          <CodeEditor
            label="交付契约（OpenAPI 3.1）"
            language={format}
            value={text}
            revealLine={revealLine}
            {...(handleLineActivate === undefined
              ? {}
              : { onLineActivate: handleLineActivate })}
          />
        )}
      </div>
    </section>
  );
};

import type { CSSProperties } from 'react';

import { useLiveApi } from './LiveApiContext';
import {
  EVIDENCE_TIME_ATTRIBUTE_NAMES,
  type EntityAST,
} from '@evidence-poc/evidence-schema';
import type {
  CanvasViewMode,
  LayoutNode,
} from '@evidence-poc/evidence-canvas-interaction';
import type { CardSummary } from './cardSummary';
import type { StoryStepMarker } from './storyFocus';

import {
  CATEGORY_TOKENS,
  entityColor,
  entityKindLabel,
  entityRadius,
  entityShape,
  formatBusinessTimeWindow,
} from './colors';

interface NodeCardProps {
  node: LayoutNode;
  selected: boolean;
  dimmed: boolean;
  highlighted: boolean;
  viewMode: CanvasViewMode;
  summary: CardSummary;
  storyValues?: Readonly<Record<string, unknown>>;
  storyStep?: StoryStepMarker;
  triggeredRuleIds?: readonly string[];
  outOfScope?: boolean;
  onHover: (nodeId: string | null) => void;
  onSelect: (nodeId: string) => void;
}

const timeAttributes = (entity: EntityAST): string[] =>
  EVIDENCE_TIME_ATTRIBUTE_NAMES.filter(
    (name) =>
      entity.attributes?.some((candidate) => candidate.name === name) === true,
  );

const businessTime = (
  entity: EntityAST,
  values?: Readonly<Record<string, unknown>>,
): string | null => {
  const present = timeAttributes(entity);

  if (present.length === 0) {
    return null;
  }

  return formatBusinessTimeWindow(present, (name) =>
    typeof values?.[name] === 'string'
      ? (values[name] as string)
      : entity.attributes?.find((attribute) => attribute.name === name)?.label,
  );
};

/**
 * The request's window, drawn as a bar with two ends.
 *
 * `started_at` and `expired_at` are both mandatory on a request, so the shape
 * says "this obligation is open over a period". A rounded bar rather than a
 * plain line, because the corner is where the "expired" end reads.
 */
export const IntervalTaskBar = ({
  accent,
  window,
}: {
  accent: string;
  window: string | null;
}) => (
  <span
    aria-label={`履行时段：${window ?? 'started_at → expired_at'}`}
    data-start-attribute="started_at"
    data-end-attribute="expired_at"
    data-node-shape="interval"
    title={window ?? 'started_at → expired_at'}
    className="mt-0.5 flex w-full items-center gap-1"
  >
    <span
      className="h-[6px] w-[6px] shrink-0 rounded-full"
      style={{ backgroundColor: accent }}
    />
    <span
      className="h-[4px] flex-1 rounded-full"
      style={{ backgroundColor: `${accent}66` }}
    />
    <span className="truncate text-[8px]" style={{ color: accent }}>
      {window ?? '有效履行窗口'}
    </span>
    <span
      className="h-[4px] flex-1 rounded-full"
      style={{ backgroundColor: `${accent}66` }}
    />
    <span
      className="h-[6px] w-[6px] shrink-0 rounded-full"
      style={{ backgroundColor: accent }}
    />
  </span>
);

/**
 * The confirmation's instant, drawn as a stamp.
 *
 * A confirmation has one end (`confirmed_at`); giving it the same bar as the
 * request would say the obligation is still open. The ring is the signature
 * metaphor the method uses: this moment already happened and cannot change.
 */
export const MomentStamp = ({
  accent,
  time,
  confirmation,
}: {
  accent: string;
  time: string | null;
  confirmation: boolean;
}) => (
  <span
    aria-label={`${confirmation ? '盖章确认' : '签署时刻'}：${time ?? (confirmation ? 'confirmed_at' : 'signed_at')}`}
    data-time-attribute={confirmation ? 'confirmed_at' : 'signed_at'}
    data-node-shape="moment"
    className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full border-2 border-double px-1.5 py-[1px] text-[8px] font-semibold"
    style={{ borderColor: accent, color: accent }}
  >
    <span
      className="h-[6px] w-[6px] shrink-0 rounded-full border"
      style={{ borderColor: accent }}
    />
    <span className="truncate">
      {confirmation ? '盖章确认' : '签署时刻'} · {time}
    </span>
  </span>
);

/** Show declared parameter labels and unanimous example values, never invent
 * constants or silently choose a branch's conflicting sample value. */
export const CapabilityChips = ({ entity }: { entity: EntityAST }) => {
  if (entity.category !== 'participant' || !entity.domainRole) return null;
  return (
    <div
      data-capability={entity.domainRole}
      className="mt-1 flex max-w-full flex-col gap-0.5 text-[9px] text-[#3d7553]"
    >
      <span className="rounded-full border border-[#78a788] bg-white px-2 font-semibold">
        {entity.domainRole === 'calculator' ? 'ƒ 测算器' : '✓ 核验器'}
      </span>
      {(entity.attributes ?? []).slice(0, 3).map((attribute) => {
        const values = (entity.examples ?? [])
          .map((example) => example.value[attribute.name])
          .filter((value) => value !== undefined);
        const value =
          values.length &&
          values.every((v) => JSON.stringify(v) === JSON.stringify(values[0]))
            ? values[0]
            : undefined;
        const formatted =
          typeof value === 'number' && /rate/i.test(attribute.name)
            ? `${Number((value * 100).toPrecision(8))}%`
            : typeof value === 'string'
              ? value
              : value === undefined
                ? null
                : JSON.stringify(value);
        return (
          <span
            key={attribute.name}
            className="truncate rounded border border-[#78a788]/50 px-1"
            title={attribute.meaning}
          >
            {attribute.label ?? attribute.name}
            {formatted === null ? '' : `：${formatted}`}
          </span>
        );
      })}
    </div>
  );
};

/**
 * One placed business object, drawn as the paper the method talks about.
 *
 * The metaphor is a sticky note on a workshop board rather than a UML box: a
 * tinted sheet, a coloured spine naming the category, and a shape that tells a
 * request window from a confirmation stamp without reading the label.
 */
export const NodeCard = ({
  node,
  selected,
  dimmed,
  highlighted,
  viewMode,
  summary,
  storyValues,
  storyStep,
  triggeredRuleIds,
  outOfScope = false,
  onHover,
  onSelect,
}: NodeCardProps) => {
  const { entity, box } = node;
  const api = useLiveApi();
  const routes = api.byEntity.get(entity.id) ?? [];
  const primary = routes.find((route) => route.method === 'POST') ?? routes[0];
  const color = entityColor(entity);
  const token = CATEGORY_TOKENS[entity.category];
  const time = businessTime(entity, storyValues);
  const shape = entityShape(entity);
  const standard = viewMode !== 'simplified';
  const fields = summary.attributes.slice(0, viewMode === 'expanded' ? 3 : 1);
  const remaining =
    summary.remainingAttributes + summary.attributes.length - fields.length;
  const storyLabel =
    storyStep &&
    (storyStep.status === 'active'
      ? `当前步骤 ${storyStep.sequence}`
      : `步骤 ${storyStep.sequence} 完成`);

  return (
    <div
      role="button"
      tabIndex={outOfScope ? -1 : 0}
      aria-disabled={outOfScope || undefined}
      aria-label={`${entity.label}（${entityKindLabel(entity)}）${storyLabel ? ` · ${storyLabel}` : ''}`}
      aria-pressed={selected}
      data-story-step={storyStep?.status}
      data-node-id={entity.id}
      data-category={entity.category}
      data-node-shape={shape}
      className={[
        'absolute flex cursor-pointer flex-col overflow-hidden rounded-lg border border-[color:var(--canvas-card-stroke)] bg-white text-left shadow-sm transition-[opacity,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-evidence-accent motion-reduce:transition-none',
        selected ? 'ring-2 ring-evidence-accent ring-offset-1' : '',
        highlighted && !selected ? 'shadow-[0_0_0_2px_#2f5d8f55]' : '',
        dimmed ? 'opacity-20' : 'opacity-100',
      ].join(' ')}
      style={
        {
          opacity: outOfScope ? 0.15 : undefined,
          pointerEvents: outOfScope ? 'none' : undefined,
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          '--canvas-card-stroke': selected
            ? 'var(--color-evidence-accent)'
            : shape === 'moment'
              ? color
              : 'var(--color-workbench-border)',
          borderWidth: shape === 'moment' ? 2 : 1,
          borderLeftWidth: 3,
          borderLeftColor: color,
          borderRadius:
            entity.category === 'evidence' ? 8 : entityRadius(entity),
        } as CSSProperties
      }
      onMouseEnter={() => !outOfScope && onHover(entity.id)}
      onMouseLeave={() => !outOfScope && onHover(null)}
      onFocus={() => !outOfScope && onHover(entity.id)}
      onBlur={() => !outOfScope && onHover(null)}
      onClick={() => !outOfScope && onSelect(entity.id)}
      onKeyDown={(event) => {
        if (outOfScope) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(entity.id);
        }
      }}
    >
      <header
        className={[
          'flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-workbench-border px-2 py-1.5',
          storyStep?.status === 'active'
            ? 'bg-evidence-accent text-white'
            : storyStep?.status === 'completed'
              ? 'bg-green-50 text-green-800'
              : 'bg-workbench-background text-evidence-ink',
        ].join(' ')}
      >
        <span
          className="truncate text-[12px] leading-tight font-semibold"
          title={entity.label}
        >
          {storyStep ? (
            <span aria-hidden="true">
              {storyStep.status === 'active' ? '▶ ' : '✓ '}
            </span>
          ) : null}
          {entity.label}
        </span>
        <span
          className="max-w-[48%] shrink-0 truncate rounded px-1.5 py-0.5 text-[9px] leading-tight font-medium"
          style={storyStep ? undefined : { color, backgroundColor: token.fill }}
          title={storyLabel ?? `${token.label} · ${entityKindLabel(entity)}`}
        >
          {storyLabel ?? entityKindLabel(entity)}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden px-2 text-[9px] leading-tight">
        <div className="flex min-w-0 items-center gap-1 empty:hidden">
          {entity.category === 'evidence' &&
          entity.kind === 'fulfillment_request' ? (
            <span
              data-rights-claim=""
              className="min-w-0 truncate rounded bg-[#fff8e8] px-1 text-[8px] text-[#8d6200]"
              title={`主张方：${summary.partyBadge?.label ?? summary.responsibility ?? '待声明'}`}
            >
              权利方主张
            </span>
          ) : null}
          {summary.partyBadge !== null ? (
            <span
              className="min-w-0 truncate rounded border border-[#78a788] bg-[#eff8f1] px-1 text-[#3d7553]"
              title={`当事人：${summary.partyBadge.participants
                .map(({ label, id }) => `${label}（${id}）`)
                .join('、')}`}
              aria-label={`当事人：${summary.partyBadge.label}`}
              data-card-party-badge=""
            >
              ◉ {summary.partyBadge.label}
              {summary.partyBadge.total > 1
                ? ` +${summary.partyBadge.total - 1}`
                : ''}
            </span>
          ) : null}
          {summary.responsibility !== null ? (
            <span
              className="min-w-0 truncate rounded border bg-white px-1 text-[#8d6200]"
              title={`责任角色：${summary.responsibility}（${summary.responsibilityRef}）`}
              aria-label={`责任角色：${summary.responsibility}`}
            >
              ⚑ {summary.responsibility}
            </span>
          ) : null}
        </div>
        {standard ? (
          <span
            className="max-w-full truncate text-[8px] text-evidence-muted"
            title={entity.id}
          >
            {entity.id}
          </span>
        ) : null}
        {api.active && entity.category === 'evidence' ? (
          <span
            data-api-route={entity.id}
            className="mt-0.5 block max-w-full truncate rounded bg-white/70 px-1 text-[8px] text-evidence-muted"
            title={
              api.stale
                ? 'API 草稿待刷新'
                : routes
                    .map(
                      (route) =>
                        `${route.exposure === 'internal' ? '内部' : '对外'} ${route.method} ${route.path}`,
                    )
                    .join('\n') || '当前无路由覆盖，请检查履约结构。'
            }
          >
            {api.stale
              ? 'API 待刷新'
              : primary === undefined
                ? 'No API Exposure'
                : `${primary.exposure === 'internal' ? '内部 · ' : ''}${primary.method} ${primary.path}`}
            {!api.stale && routes.length > 1 ? ` +${routes.length - 1}` : ''}
          </span>
        ) : null}
        {shape === 'interval' ? (
          <IntervalTaskBar accent={color} window={time} />
        ) : null}
        {shape === 'moment' ? (
          <MomentStamp
            accent={color}
            time={time}
            confirmation={
              entity.category === 'evidence' &&
              entity.kind === 'fulfillment_confirmation'
            }
          />
        ) : null}
        <CapabilityChips entity={entity} />
      </div>
      {standard ? (
        <div
          data-card-meta=""
          className="flex shrink-0 flex-col gap-0.5 border-t border-workbench-border px-2 py-1 text-[9px] leading-tight text-workbench-muted"
        >
          {time !== null ? (
            <div className="truncate" title={time}>
              时间：{time}
            </div>
          ) : null}
          {fields.map((field) => {
            const value =
              storyValues && Object.hasOwn(storyValues, field.name)
                ? storyValues[field.name]
                : undefined;
            const detail =
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
                ? String(value)
                : field.valueType;
            return (
              <div
                key={field.name}
                className="truncate font-mono text-workbench-body"
                title={`${field.label}${detail === undefined ? '' : `: ${detail}`}`}
              >
                {field.name}
                {detail === undefined ? '' : `: ${detail}`}
                {field.key ? ' · Key' : ''}
              </div>
            );
          })}
          {fields.length === 0 ? <span>无属性</span> : null}
          {remaining > 0 ? <span>另有 {remaining} 个字段</span> : null}
          {[...(summary.ruleFormulas ?? [])]
            .sort(
              (a, b) =>
                Number(triggeredRuleIds?.includes(b.id)) -
                Number(triggeredRuleIds?.includes(a.id)),
            )
            .slice(0, viewMode === 'expanded' ? 2 : 1)
            .map((rule) => (
              <div
                key={rule.id}
                data-card-rule={rule.id}
                data-rule-triggered={
                  triggeredRuleIds?.includes(rule.id) ? 'true' : undefined
                }
                style={{
                  color: triggeredRuleIds?.includes(rule.id)
                    ? '#b42318'
                    : undefined,
                }}
                className="truncate font-mono text-[8px] text-[#8d6200]"
                title={`${rule.label} (${rule.kind})\n${rule.expression}`}
                aria-label={`CEL ${rule.kind}：${rule.expression}`}
              >
                ƒ {rule.expression}
              </div>
            ))}
          <div className="flex justify-between gap-1">
            <span>关键数据 {summary.keyDataCount}</span>
            {summary.rules.length ? (
              <span
                className="rounded bg-[#fff8e8] px-1 text-[#8d6200]"
                title={summary.rules.join('、')}
              >
                规则 {summary.rules.length}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

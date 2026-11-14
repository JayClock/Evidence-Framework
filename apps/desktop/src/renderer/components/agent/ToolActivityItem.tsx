import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';

import type { AgentActivity } from '../../state/useAgentSession';
import { cn } from '@evidence-poc/desktop-ui-kit';

/**
 * The agent's tools, named the way a modeler reads them.
 *
 * The raw name stays visible beside the title: the activity stream is also the
 * audit trail of what was called, and hiding the identifier would make it
 * harder to match a line here against a protocol log.
 */
export const TOOL_TITLES: Record<string, string> = {
  get_app_state: '读取桌面端状态',
  get_domain_model: '读取领域模型 AST',
  get_selected_entity: '读取选中的业务对象',
  get_key_data_audit: '读取关键数据台账',
  get_canvas_screenshot: '截取画布',
  apply_model_patch: '提交模型补丁',
  introduce_fulfillment_pair: '新增成对履约项',
  add_breach_compensation: '新增违约补偿分支',
  roleify_and_invert_dependency: '反转依赖并隔离变化点',
  get_delivery_topology: '读取交付拓扑',
  export_openapi_contract: '导出 OpenAPI 契约',
  run_scenario_replay: '回放业务场景',
  audit_production_drift: '比对生产轨迹与模型',
  run_stage_gate: '执行阶段门禁',
  run_sensors: '运行检查器',
};

const STATUS_LABEL: Record<AgentActivity['status'], string> = {
  running: '执行中',
  completed: '已完成',
  failed: '失败',
};

const StatusIcon = ({ status }: { status: AgentActivity['status'] }) =>
  status === 'running' ? (
    <Loader2
      aria-hidden="true"
      className="h-3 w-3 animate-spin text-evidence-accent"
    />
  ) : status === 'completed' ? (
    <Check aria-hidden="true" className="h-3 w-3 text-evidence-participant" />
  ) : (
    <X aria-hidden="true" className="h-3 w-3 text-[#b42318]" />
  );

export interface ToolActivityItemProps {
  activity: AgentActivity;
}

/** One tool call: its verdict at a glance, its input on demand. */
export const ToolActivityItem = ({ activity }: ToolActivityItemProps) => {
  const [open, setOpen] = useState(false);
  const title = TOOL_TITLES[activity.toolName] ?? activity.toolName;

  return (
    <section
      aria-label={`工具调用 ${activity.toolName}`}
      data-activity-tool={activity.toolName}
      data-activity-status={activity.status}
      className="rounded border border-evidence-line bg-white/70 text-[11px]"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left hover:bg-[#f1f3f6]"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <StatusIcon status={activity.status} />
          <span className="shrink-0 text-evidence-ink">{title}</span>
          <span className="truncate font-mono text-[10px] text-evidence-muted">
            {activity.toolName}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-evidence-muted">
          <span
            className={cn(activity.status === 'failed' && 'text-[#b42318]')}
          >
            {STATUS_LABEL[activity.status]}
          </span>
          {open ? (
            <ChevronDown aria-hidden="true" className="h-3 w-3" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-3 w-3" />
          )}
        </span>
      </button>

      {open ? (
        <pre className="max-h-48 overflow-auto border-t border-evidence-line/60 bg-evidence-surface/60 px-2 py-1.5 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-[#414751] select-text">
          {activity.input === undefined || activity.input === null
            ? '（无入参）'
            : JSON.stringify(activity.input, null, 2)}
        </pre>
      ) : null}
    </section>
  );
};

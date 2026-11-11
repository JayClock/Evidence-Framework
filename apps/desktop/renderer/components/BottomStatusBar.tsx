import type { ValidationResult } from '@evidence-poc/evidence-schema';
import type { DomainGraphLayout } from '@evidence-poc/evidence-canvas-interaction';

interface BottomStatusBarProps {
  layout: DomainGraphLayout;
  validation: ValidationResult;
  dirty: boolean;
  savedAt: string | null;
  saveError: string | null;
  externalChangeAt: string | null;
  onReload: () => void;
  onDismissExternalChange: () => void;
}

const issueSummary = (validation: ValidationResult): string => {
  if (validation.valid) {
    return 'FM 一致性检查通过';
  }

  const first = validation.issues[0];

  return `${validation.issues.length} 个一致性问题${
    first === undefined ? '' : `：${first.path} ${first.message}`
  }`;
};

export const BottomStatusBar = ({
  layout,
  validation,
  dirty,
  savedAt,
  saveError,
  externalChangeAt,
  onReload,
  onDismissExternalChange,
}: BottomStatusBarProps) => (
  <footer className="col-span-2 flex h-8 shrink-0 items-center justify-between gap-3 border-t border-evidence-line bg-white/85 px-3 text-[10px] text-evidence-muted">
    <div className="flex min-w-0 items-center gap-3">
      <span title={validation.valid ? undefined : issueSummary(validation)}>
        <span
          className={[
            'mr-1 inline-block h-1.5 w-1.5 rounded-full',
            validation.valid ? 'bg-[#3d7553]' : 'bg-[#b42318]',
          ].join(' ')}
        />
        {validation.valid
          ? '静态检查通过'
          : `静态检查 ${validation.issues.length} 项`}
      </span>
      <span>业务对象 {layout.nodes.length}</span>
      <span>履约对 {layout.fulfillmentGroups.length}</span>
      <span>上下文 {layout.contextGroups.length}</span>
      {layout.omittedContextIds.length > 0 ? (
        <span className="text-[#b42318]" title="空壳上下文没有绘制">
          空壳上下文 {layout.omittedContextIds.length}
        </span>
      ) : null}
    </div>

    <div className="flex items-center gap-3">
      {saveError !== null ? (
        <span className="text-[#b42318]">{saveError}</span>
      ) : null}
      {externalChangeAt !== null ? (
        <span className="flex items-center gap-2 text-[#8d6200]">
          <span>磁盘上的源树已被外部修改</span>
          <button
            type="button"
            onClick={onReload}
            className="rounded border border-[#8d6200]/40 px-1.5 py-0.5 text-[10px] hover:bg-[#8d6200]/10"
          >
            重新加载
          </button>
          <button
            type="button"
            onClick={onDismissExternalChange}
            className="text-[10px] underline decoration-dotted"
          >
            忽略
          </button>
        </span>
      ) : null}
      {dirty ? (
        <span className="text-[#b42318]">有未保存修改</span>
      ) : savedAt === null ? (
        <span>尚未写入磁盘</span>
      ) : (
        <span>已保存 {new Date(savedAt).toLocaleTimeString('zh-CN')}</span>
      )}
    </div>
  </footer>
);

import { Button } from '@evidence-poc/desktop-ui-kit';

import { useAiConfiguration } from '../../state/AiConfiguration';

export const AiModelStatusPill = ({
  compact = false,
}: {
  compact?: boolean;
}) => {
  const ai = useAiConfiguration();
  if (!ai) return null;

  if (compact) {
    const label =
      ai.status === null
        ? 'AI · 正在检测'
        : ai.aiConfigured && ai.status.activeModelId
          ? ai.status.activeModelId
          : 'AI · 未配置';

    return (
      <Button
        type="button"
        onClick={ai.openSettings}
        aria-label={`配置大模型：${label}`}
        title={`配置大模型：${label}`}
        className="max-w-40 rounded-full border-workbench-border bg-workbench-background px-2.5 font-medium hover:bg-workbench-subtle"
        size="xs"
      >
        {ai.aiConfigured ? (
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-workbench-status-dot"
          />
        ) : null}
        <span className="truncate">{label}</span>
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={ai.openSettings}
      aria-label="配置大模型"
      title="配置大模型（⌘/Ctrl+,）"
      className="evidence-no-drag max-w-48 truncate rounded-full border border-evidence-line px-3 py-1 text-xs text-evidence-muted hover:text-evidence-accent"
    >
      {ai.status === null
        ? 'AI · 正在检测'
        : ai.aiConfigured
          ? `AI · ${ai.status.activeModelId}`
          : 'AI · 未配置'}
    </button>
  );
};

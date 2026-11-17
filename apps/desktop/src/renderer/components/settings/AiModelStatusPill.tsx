import { useAiConfiguration } from '../../state/AiConfiguration';

export const AiModelStatusPill = () => {
  const ai = useAiConfiguration();
  if (!ai) return null;
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

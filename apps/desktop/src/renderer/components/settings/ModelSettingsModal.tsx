import { useState, type SubmitEvent } from 'react';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@evidence-poc/desktop-ui-kit';
import type {
  AiConfigStatus,
  AiModelDescriptor,
  AiThinkingLevel,
  EvidenceAiConfigApi,
} from '@evidence-poc/desktop-contracts/aiConfig';
import { WorkbenchDialog } from '../layout/WorkbenchDialog';

const modelKey = ({ provider, id }: AiModelDescriptor) =>
  JSON.stringify([provider, id]);

const levelLabels: Record<AiThinkingLevel, string> = {
  off: '关闭',
  minimal: '极低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '很高',
  max: '最高',
};

const selectClass =
  'w-full rounded-md border border-workbench-border bg-workbench-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring';

export const ModelSettingsModal = ({
  api,
  status,
  onStatus,
  onClose,
}: {
  api: EvidenceAiConfigApi;
  status: AiConfigStatus | null;
  onStatus: (status: AiConfigStatus) => void;
  onClose: () => void;
}) => {
  const [key, setKey] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [pending, setPending] = useState<
    'select' | 'test' | 'reload' | 'open' | null
  >(null);
  const [message, setMessage] = useState('');
  const models = status?.availableModels ?? [];
  const active = models.find(
    ({ provider, id }) =>
      provider === status?.activeProviderId && id === status.activeModelId,
  );
  const selected = models.find((entry) => modelKey(entry) === key) ?? active;
  const request = selected && {
    providerId: selected.provider,
    modelId: selected.id,
  };
  const groups = new Map<string, AiModelDescriptor[]>();
  for (const entry of models) {
    const group = groups.get(entry.provider);
    if (group) group.push(entry);
    else groups.set(entry.provider, [entry]);
  }
  const busy = pending !== null;

  const selectModel = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!request || busy) return;
    const thinkingLevel = selected?.thinkingLevels.find(
      (option) => option === level,
    );
    setPending('select');
    setMessage('');
    try {
      onStatus(
        await api.selectModel({
          ...request,
          ...(thinkingLevel && { thinkingLevel }),
        }),
      );
      onClose();
    } catch {
      setMessage('无法保存模型选择，请检查 Pi 模型和配置目录权限。');
    } finally {
      setPending(null);
    }
  };

  const testConnection = async () => {
    if (!request || busy) return;
    setPending('test');
    setMessage('');
    try {
      const result = await api.testConnection(request);
      setMessage(
        result.success
          ? `连接成功 · ${result.latencyMs ?? 0} ms`
          : (result.error ?? '连接失败。'),
      );
    } catch {
      setMessage('连接失败，请检查 Pi 模型配置与网络。');
    } finally {
      setPending(null);
    }
  };

  const accessPi = async (action: 'reload' | 'open') => {
    if (busy) return;
    setPending(action);
    setMessage('');
    try {
      if (action === 'open') await api.openConfigDirectory();
      else {
        const next = await api.reload();
        onStatus(next);
        setKey('');
        setQuery('');
        setLevel('');
        if (!next.error) setMessage('已重新读取 Pi 配置。');
      }
    } catch {
      setMessage(
        action === 'open'
          ? '无法打开 Pi 配置目录。请确认目录存在。'
          : '无法重新读取 Pi 配置。',
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <WorkbenchDialog
      size="settings"
      title="配置大模型 / AI Model Settings"
      description="选择 Pi 已配置的模型。保存后，Pi CLI 与 Evidence 共用此默认模型。"
      busy={busy}
      onClose={onClose}
    >
      <form
        onSubmit={selectModel}
        className="flex min-h-0 flex-col gap-4 overflow-y-auto"
      >
        {status ? (
          <p className="break-all text-xs text-workbench-muted">
            Pi 配置目录：{status.agentDir}
          </p>
        ) : (
          <p role="status">正在读取 Pi 配置…</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void accessPi('open')}
          >
            打开 Pi 配置目录
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void accessPi('reload')}
          >
            {pending === 'reload' ? '正在读取…' : '重新加载 Pi 配置'}
          </Button>
        </div>
        {status?.error && <p role="alert">{status.error}</p>}
        {status?.notice && <p role="status">{status.notice}</p>}
        {active ? (
          <p className="text-sm">
            当前：{active.name}（{active.provider}） · 思考：
            {levelLabels[status?.thinkingLevel ?? 'off']}
          </p>
        ) : status && !status.error ? (
          <p className="text-sm">
            没有可用模型。请在 Pi 中登录提供商，或在配置目录的 models.json
            中定义自定义端点。
          </p>
        ) : null}
        {models.length > 0 && (
          <>
            <div role="search" aria-label="模型选择">
              <Command
                label="搜索可用模型"
                className="rounded-md border border-workbench-border"
              >
                <CommandInput
                  name="modelSearch"
                  aria-label="搜索可用模型"
                  data-dialog-autofocus=""
                  placeholder="搜索模型名称、ID 或提供商…"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={busy}
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList label="Pi 可用模型" className="max-h-44">
                  <CommandEmpty>没有匹配的模型</CommandEmpty>
                  {[...groups].map(([provider, entries]) => (
                    <CommandGroup key={provider} heading={provider}>
                      {entries.map((entry) => {
                        const value = modelKey(entry);
                        const chosen = selected && modelKey(selected) === value;
                        return (
                          <CommandItem
                            key={value}
                            value={value}
                            keywords={[entry.name, entry.id, provider]}
                            disabled={busy}
                            onSelect={() => {
                              setKey(value);
                              setLevel('');
                              setMessage('');
                            }}
                          >
                            <span className="truncate">{entry.name}</span>
                            <span className="ml-auto truncate text-workbench-muted">
                              {entry.id}
                            </span>
                            {chosen && <span className="shrink-0">已选择</span>}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </div>
            {selected && selected.thinkingLevels.length > 1 && (
              <label className="flex flex-col gap-1.5 text-sm">
                思考级别
                <select
                  name="thinkingLevel"
                  className={selectClass}
                  disabled={busy}
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                >
                  <option value="">使用 Pi 设置</option>
                  {selected.thinkingLevels.map((option) => (
                    <option key={option} value={option}>
                      {levelLabels[option]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void testConnection()}
              >
                {pending === 'test' ? '正在测试…' : '测试连通性'}
              </Button>
              <Button type="submit" disabled={busy}>
                {pending === 'select' ? '正在保存…' : '设为默认模型'}
              </Button>
            </div>
          </>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </form>
    </WorkbenchDialog>
  );
};

import { useId, useState } from 'react';
import { Button, DialogClose } from '@evidence-poc/desktop-ui-kit';
import {
  AI_PROVIDER_PRESETS,
  type AiConfigStatus,
  type EvidenceAiConfigApi,
  type SaveAiConfigRequest,
  type SupportedProviderId,
} from '@evidence-poc/desktop-contracts/aiConfig';
import { WorkbenchDialog } from '../layout/WorkbenchDialog';

type Action = 'save' | 'test' | 'import';

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
  const initial =
    AI_PROVIDER_PRESETS.find((p) => p.id === status?.activeProviderId) ??
    AI_PROVIDER_PRESETS[0];
  const [providerId, setProviderId] = useState(initial.id);
  const [modelId, setModelId] = useState(
    status?.activeModelId ?? initial.recommendedModels[0]?.id ?? '',
  );
  const [baseUrl, setBaseUrl] = useState(
    status?.baseUrl ?? initial.defaultBaseUrl ?? '',
  );
  const [apiKey, setApiKey] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState(
    status?.thinkingLevel ?? 'off',
  );
  const keyId = useId();
  const [pending, setPending] = useState<Action | null>(null);
  const busy = pending !== null;
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const preset =
    AI_PROVIDER_PRESETS.find((p) => p.id === providerId) ??
    AI_PROVIDER_PRESETS[0];
  const models = [
    ...new Map(
      [
        ...preset.recommendedModels,
        ...(status?.availableModels.filter((m) => m.provider === providerId) ??
          []),
      ].map((m) => [m.id, m]),
    ).values(),
  ];
  const selectProvider = (id: SupportedProviderId) => {
    const next =
      AI_PROVIDER_PRESETS.find((p) => p.id === id) ?? AI_PROVIDER_PRESETS[0];
    setProviderId(id);
    setModelId(next.recommendedModels[0]?.id ?? '');
    setBaseUrl(next.defaultBaseUrl ?? '');
    setApiKey('');
    setNotice('');
  };
  const request = (): SaveAiConfigRequest => ({
    providerId,
    modelId,
    baseUrl,
    apiKey,
    thinkingLevel,
  });
  const run = async (action: Action) => {
    if (busy || (action !== 'import' && !modelId.trim())) return;
    setPending(action);
    setNotice('');
    setFailed(false);
    try {
      if (action === 'test') {
        const result = await api.testConnection(request());
        setFailed(!result.success);
        setNotice(
          result.success
            ? `连接成功 · ${result.latencyMs ?? 0} ms`
            : (result.error ?? '连接失败'),
        );
      } else if (action === 'save') {
        const result = await api.save(request());
        if (!result.success) throw new Error('保存失败');
        setApiKey('');
        onStatus(await api.getStatus());
        onClose();
      } else {
        const result = await api.importCli();
        const next = await api.getStatus();
        onStatus(next);
        if (
          next.activeProviderId &&
          AI_PROVIDER_PRESETS.some((p) => p.id === next.activeProviderId)
        ) {
          setProviderId(next.activeProviderId);
          setModelId(next.activeModelId ?? '');
          setBaseUrl(next.baseUrl ?? '');
        }
        setApiKey('');
        setNotice(
          result.imported
            ? '已导入桌面 Pi 配置；请选择模型并保存。已有桌面凭证不会被覆盖。'
            : '未发现可导入的凭证。',
        );
      }
    } catch {
      setFailed(true);
      setNotice(
        '操作失败。请检查桌面配置目录与网络；升级时可能需要解锁旧凭证的系统密钥环。',
      );
    } finally {
      setPending(null);
    }
  };
  const inputClass =
    'min-h-9 w-full rounded-md border border-workbench-border bg-white px-3 text-xs font-normal outline-none focus-visible:ring-2 focus-visible:ring-evidence-ring';
  const actionClass = 'rounded-md px-3.5 text-xs font-medium';
  return (
    <WorkbenchDialog
      size="settings"
      title="大语言模型设置 (AI Model Settings)"
      description="配置驱动 Copilot、智能摄取与业务放映推演的大语言模型服务。"
      busy={busy}
      onClose={() => {
        setApiKey('');
        onClose();
      }}
    >
      <form
        className="flex min-h-0 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run('save');
        }}
      >
        <div className="min-h-0 overflow-y-auto overscroll-contain p-1">
          <fieldset
            disabled={busy}
            className="flex min-w-0 flex-col gap-3.5 text-xs"
          >
            <legend className="sr-only">模型连接配置</legend>
            <label className="flex flex-col gap-1.5 font-medium">
              模型提供商 (Provider)
              <select
                className={inputClass}
                name="provider"
                data-dialog-autofocus=""
                value={providerId}
                onChange={(event) =>
                  selectProvider(event.target.value as SupportedProviderId)
                }
              >
                {AI_PROVIDER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <label htmlFor={keyId} className="font-medium">
                  API 密钥 (API Key)
                </label>
                <p
                  id={keyId + '-storage'}
                  className="text-[11px] text-emerald-700"
                >
                  保存在桌面专用的 Pi auth.json 中（未加密）
                </p>
              </div>
              <input
                className={inputClass}
                id={keyId}
                name="apiKey"
                aria-describedby={keyId + '-storage ' + keyId + '-help'}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] text-workbench-muted">
                <p id={keyId + '-help'}>
                  留空保留已存凭证，或使用环境变量 / 本地无密钥端点。
                </p>
                <button
                  type="button"
                  className="underline"
                  onClick={() => setApiKey('')}
                >
                  清空输入
                </button>
              </div>
            </div>
            <label className="flex flex-col gap-1.5 font-medium">
              服务网关地址 (Base URL · 可选)
              <input
                className={inputClass}
                name="baseUrl"
                aria-describedby={keyId + '-endpoint-help'}
                spellCheck={false}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="使用厂商默认地址"
              />
            </label>
            <p
              id={keyId + '-endpoint-help'}
              className="-mt-2 text-[11px] text-workbench-muted"
            >
              仅向你信任的端点发送 API Key。Ollama 请填写完整兼容地址，例如
              http://localhost:11434/v1。
            </p>
            <label className="flex flex-col gap-1.5 font-medium">
              模型名称
              <input
                className={inputClass}
                list={keyId + '-models'}
                name="modelId"
                spellCheck={false}
                required
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              />
            </label>
            <datalist id={keyId + '-models'}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </datalist>
            <label className="flex flex-col gap-1.5 font-medium">
              推理级别
              <select
                className={inputClass}
                name="thinkingLevel"
                value={thinkingLevel}
                onChange={(event) =>
                  setThinkingLevel(event.target.value as typeof thinkingLevel)
                }
              >
                {['off', 'low', 'medium', 'high'].map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </label>
            {status?.hasLocalPiCliConfig ? (
              <div className="rounded-md border border-workbench-border bg-workbench-background p-3 text-xs text-workbench-muted">
                检测到本地 Pi CLI 配置。仅在你点击时读取并导入，不修改 CLI
                文件。
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => void run('import')}
                >
                  一键导入现有配置
                </button>
              </div>
            ) : null}
            {status?.error ? (
              <p role="alert" className="text-xs text-red-700">
                {status.error}
              </p>
            ) : null}
            <p className="text-[11px] text-workbench-muted">
              测试会发送一条简短请求，可能产生少量费用。
            </p>
          </fieldset>
        </div>
        {busy || notice ? (
          <p
            role={failed ? 'alert' : 'status'}
            className={`text-xs ${failed ? 'text-red-700' : busy ? 'text-workbench-muted' : 'text-emerald-700'}`}
          >
            {pending === 'test'
              ? '正在测试连通性…'
              : busy
                ? '正在处理…'
                : notice}
          </p>
        ) : null}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            className={`${actionClass} border-workbench-border bg-workbench-subtle`}
            type="button"
            variant="secondary"
            size="md"
            disabled={busy || !modelId.trim()}
            loading={pending === 'test'}
            onClick={() => void run('test')}
          >
            测试连通性 (15s)
          </Button>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button
                className={actionClass}
                size="md"
                type="button"
                disabled={busy}
              >
                取消
              </Button>
            </DialogClose>
            <Button
              className={`${actionClass} px-4`}
              size="md"
              type="submit"
              variant="default"
              disabled={busy || !modelId.trim()}
              loading={pending === 'save'}
            >
              保存并立即生效
            </Button>
          </div>
        </div>
      </form>
    </WorkbenchDialog>
  );
};

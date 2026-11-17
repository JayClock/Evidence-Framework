import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
} from '@evidence-poc/desktop-ui-kit';
import {
  AI_PROVIDER_PRESETS,
  type AiConfigStatus,
  type EvidenceAiConfigApi,
  type SaveAiConfigRequest,
  type SupportedProviderId,
} from '@evidence-poc/desktop-contracts/aiConfig';

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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const preset = AI_PROVIDER_PRESETS.find((p) => p.id === providerId)!;
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
    const next = AI_PROVIDER_PRESETS.find((p) => p.id === id)!;
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
  const run = async (action: 'save' | 'test' | 'import') => {
    setBusy(true);
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
            ? '已导入安全存储；请选择模型并保存。已有桌面凭证不会被覆盖。'
            : '未发现可导入的凭证。',
        );
      }
    } catch {
      setFailed(true);
      setNotice('操作失败。请检查配置、系统密钥环与网络；凭证不会明文保存。');
    } finally {
      setBusy(false);
    }
  };
  const inputClass =
    'w-full rounded border border-evidence-line bg-white px-3 py-2 text-sm';
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) {
          setApiKey('');
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>配置大模型 / AI Settings</DialogTitle>
          <DialogDescription>
            无需安装 Pi CLI。API Key
            仅在主进程通过系统密钥环加密保存。测试会发送一条简短请求，可能产生少量费用。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run('save');
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <label className="block text-sm">
              提供商
              <select
                className={inputClass}
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
            <label className="block text-sm">
              API Key
              <input
                className={inputClass}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="留空保留已存凭证，或使用环境变量 / 本地无密钥端点"
              />
            </label>
            <button
              type="button"
              className="text-xs underline"
              onClick={() => setApiKey('')}
            >
              清空输入
            </button>
            <label className="block text-sm">
              Base URL
              <input
                className={inputClass}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="使用厂商默认地址"
              />
            </label>
            <p className="text-xs text-evidence-muted">
              仅向你信任的端点发送 API Key。Ollama 请填写完整兼容地址，例如
              http://localhost:11434/v1。
            </p>
            <label className="block text-sm">
              模型名称
              <input
                className={inputClass}
                list="ai-model-options"
                required
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              />
            </label>
            <datalist id="ai-model-options">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </datalist>
            <label className="block text-sm">
              推理级别
              <select
                className={inputClass}
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
              <div className="rounded border border-evidence-line p-3 text-xs">
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!modelId.trim()}
                onClick={() => void run('test')}
              >
                测试连通性
              </Button>
              <Button type="submit" disabled={!modelId.trim()}>
                保存并生效
              </Button>
            </div>
          </fieldset>
          {busy ? (
            <p role="status" className="text-sm">
              正在处理…
            </p>
          ) : notice ? (
            <p
              role={failed ? 'alert' : 'status'}
              className={
                failed ? 'text-sm text-red-700' : 'text-sm text-green-700'
              }
            >
              {notice}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
};

export type SupportedProviderId =
  | 'deepseek'
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'qwen'
  | 'google'
  | 'minimax-cn'
  | 'moonshotai-cn'
  | 'custom-openai-compatible';
export type AiThinkingLevel = 'off' | 'low' | 'medium' | 'high';

export interface ProviderPreset {
  id: SupportedProviderId;
  label: string;
  defaultBaseUrl?: string;
  recommendedModels: Array<{ id: string; name: string }>;
}

/** Display hints only; model metadata and protocols belong to the SDK. */
export const AI_PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    recommendedModels: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ],
  },
  {
    id: 'qwen',
    label: '通义千问 Qwen',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    recommendedModels: [
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-max', name: 'Qwen Max' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    recommendedModels: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    recommendedModels: [{ id: 'gpt-4o', name: 'GPT-4o' }],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    recommendedModels: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    recommendedModels: [
      { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
    ],
  },
  {
    id: 'minimax-cn',
    label: 'MiniMax',
    recommendedModels: [{ id: 'MiniMax-M2.5', name: 'MiniMax M2.5' }],
  },
  {
    id: 'moonshotai-cn',
    label: 'Kimi',
    recommendedModels: [{ id: 'kimi-k2.5', name: 'Kimi K2.5' }],
  },
  {
    id: 'custom-openai-compatible',
    label: '自定义 OpenAI 兼容端点 / Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    recommendedModels: [],
  },
];

export interface AiConfigStatus {
  isConfigured: boolean;
  activeProviderId: SupportedProviderId | null;
  activeModelId: string | null;
  baseUrl?: string;
  thinkingLevel: AiThinkingLevel;
  hasLocalPiCliConfig: boolean;
  availableModels: Array<{ provider: string; id: string; name: string }>;
  /** No secrets, credential bytes or raw SDK errors may cross this boundary. */
  error?: string;
}
export interface SaveAiConfigRequest {
  providerId: SupportedProviderId;
  modelId: string;
  /** Blank retains an existing credential (or uses environment / keyless local auth). */
  apiKey: string;
  baseUrl?: string;
  thinkingLevel?: AiThinkingLevel;
}
export type TestAiConnectionRequest = SaveAiConfigRequest;
export interface TestAiConnectionResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
}
export const AI_NOT_CONFIGURED = 'AI_NOT_CONFIGURED';
export const EVIDENCE_AI_CONFIG_IPC_CHANNELS = {
  getStatus: 'evidence:ai-config:get-status',
  save: 'evidence:ai-config:save',
  testConnection: 'evidence:ai-config:test-connection',
  importCli: 'evidence:ai-config:import-cli',
  changed: 'evidence:ai-config:changed',
} as const;
export interface EvidenceAiConfigApi {
  getStatus(): Promise<AiConfigStatus>;
  save(request: SaveAiConfigRequest): Promise<{ success: boolean }>;
  testConnection(
    request: TestAiConnectionRequest,
  ): Promise<TestAiConnectionResult>;
  importCli(): Promise<{ imported: boolean; providerId?: string }>;
  onChanged(listener: (status: AiConfigStatus) => void): () => void;
}

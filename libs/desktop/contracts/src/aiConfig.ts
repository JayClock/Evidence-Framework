export const AI_THINKING_LEVELS = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type AiThinkingLevel = (typeof AI_THINKING_LEVELS)[number];

export interface AiModelDescriptor {
  provider: string;
  id: string;
  name: string;
  thinkingLevels: AiThinkingLevel[];
}

export interface AiConfigStatus {
  agentDir: string;
  isConfigured: boolean;
  activeProviderId: string | null;
  activeModelId: string | null;
  activeModelName: string | null;
  thinkingLevel: AiThinkingLevel;
  availableModels: AiModelDescriptor[];
  notice?: string;
  error?: string;
}

export interface ModelRef {
  providerId: string;
  modelId: string;
}

export interface SelectModelRequest extends ModelRef {
  thinkingLevel?: AiThinkingLevel;
}

export interface TestAiConnectionResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
}

export const AI_NOT_CONFIGURED = 'AI_NOT_CONFIGURED';
export const EVIDENCE_AI_CONFIG_IPC_CHANNELS = {
  getStatus: 'evidence:ai-config:get-status',
  reload: 'evidence:ai-config:reload',
  openConfigDirectory: 'evidence:ai-config:open-config-directory',
  selectModel: 'evidence:ai-config:select-model',
  testConnection: 'evidence:ai-config:test-connection',
  changed: 'evidence:ai-config:changed',
} as const;

export interface EvidenceAiConfigApi {
  getStatus(): Promise<AiConfigStatus>;
  reload(): Promise<AiConfigStatus>;
  openConfigDirectory(): Promise<void>;
  selectModel(request: SelectModelRequest): Promise<AiConfigStatus>;
  testConnection(request: ModelRef): Promise<TestAiConnectionResult>;
  onChanged(listener: (status: AiConfigStatus) => void): () => void;
}

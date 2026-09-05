import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGate, hashArtifacts } from './gates.ts';
import evidenceExtension from './index.ts';
import { createInitialState } from './storage.ts';
import {
  executeProcess,
  prepareFmSkill,
  readFmFixtureFiles,
} from './modeling-test-support.ts';
import {
  FM_MODEL_ROOT,
  FM_STATUS_PATH,
  listFmModelFiles,
  type FmModelFile,
} from './modeling.ts';
import { loadState, readText, saveState, writeTextAtomic } from './storage.ts';

interface ToolContext {
  cwd: string;
  ui: {
    notify: (message: string, level: string) => void;
    setStatus: (key: string, value: unknown) => void;
    setWidget: (key: string, value: unknown) => void;
    theme: { fg: (color: string, text: string) => string };
  };
}

interface RegisteredTool {
  name: string;
  execute: (
    toolCallId: string,
    params: { applicable: boolean; rationale: string; files: FmModelFile[] },
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    context: ToolContext,
  ) => Promise<unknown>;
}

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function submissionHarness() {
  const root = await mkdtemp(join(tmpdir(), 'evidence-modeling-tool-test-'));
  temporaryRoots.push(root);
  const state = createInitialState('test', 'goal');
  state.phase = 'domain';
  state.status = 'running';
  state.currentArtifactIndex = 2;
  await saveState(root, state);
  for (const path of [
    'artifacts/00-input/requirements.md',
    'artifacts/01-requirements/problem-statement.md',
    'artifacts/01-requirements/story-map.md',
    'artifacts/02-domain/ubiquitous-language.md',
    'artifacts/02-domain/bounded-contexts.md',
  ]) {
    await writeTextAtomic(root, path, `# ${path}\n`);
  }
  for (const path of [
    '.pi/skills/evidence-domain/SKILL.md',
    '.pi/extensions/evidence/templates/evidence-entities-and-value-objects.md',
  ]) {
    await writeTextAtomic(
      root,
      path,
      await readFile(join(process.cwd(), path), 'utf8'),
    );
  }
  const tools = new Map<string, RegisteredTool>();
  const api = {
    exec: vi.fn(executeProcess),
    registerTool: vi.fn((tool: RegisteredTool) => tools.set(tool.name, tool)),
    registerCommand: vi.fn(),
    on: vi.fn(),
    getAllTools: vi.fn(() => [
      { name: 'read' },
      { name: 'bash' },
      { name: 'evidence_submit_artifact' },
      { name: 'evidence_submit_fm_model' },
    ]),
    setActiveTools: vi.fn(),
    setThinkingLevel: vi.fn(),
    sendUserMessage: vi.fn(),
  };
  evidenceExtension(api as unknown as ExtensionAPI);
  const context: ToolContext = {
    cwd: root,
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      setWidget: vi.fn(),
      theme: { fg: (_color, text) => text },
    },
  };
  const tool = tools.get('evidence_submit_fm_model');
  if (!tool) throw new Error('FM submission tool was not registered');
  const submit = (applicable: boolean, files: FmModelFile[] = []) =>
    tool.execute(
      'call-1',
      {
        applicable,
        rationale: applicable
          ? '订阅合同包含双方付款权责与审计凭证链，需要验证正常支付和逾期场景；机器结果不代替业务确认。'
          : '当前范围只有本地工具操作，不包含合同、双方权责、支付、KPI、验收或审计凭证链。',
        files,
      },
      undefined,
      undefined,
      context,
    );
  return { root, state, api, submit };
}

describe('fulfillment modeling submission', () => {
  it('records an explicit not-applicable decision and continues domain design', async () => {
    const { root, api, submit } = await submissionHarness();
    await submit(false);
    const updated = await loadState(root);
    expect(updated?.modeling).toMatchObject({
      applicable: false,
      machineValidated: false,
      simulationPassed: null,
    });
    expect(updated?.currentArtifactIndex).toBe(3);
    expect(updated?.status).toBe('running');
    expect(await readText(root, FM_STATUS_PATH)).toContain('结论：不适用');
    expect(api.exec).not.toHaveBeenCalled();
    expect(api.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        'artifacts/02-domain/entities-and-value-objects.md',
      ),
      { deliverAs: 'followUp' },
    );
  });

  it('submits a real model, hashes its generated evidence, and preserves it on rejection', async () => {
    const { root, state, api, submit } = await submissionHarness();
    await prepareFmSkill(root);
    const files = await readFmFixtureFiles('valid-traceable-subscription');
    await submit(true, files);
    const updated = await loadState(root);
    if (!updated) throw new Error('Submitted state is missing');
    expect(updated.modeling).toMatchObject({
      applicable: true,
      machineValidated: true,
      simulationPassed: true,
    });
    expect(updated.currentArtifactIndex).toBe(3);
    expect(updated.modeling.files).toEqual(await listFmModelFiles(root));
    expect(updated.modeling.files).toEqual(
      expect.arrayContaining([
        FM_STATUS_PATH,
        ...files.map((file) => `${FM_MODEL_ROOT}/${file.path}`),
        `${FM_MODEL_ROOT}/generated/model.json`,
        `${FM_MODEL_ROOT}/generated/traceability.json`,
        `${FM_MODEL_ROOT}/generated/simulation.json`,
      ]),
    );
    expect(await readText(root, FM_STATUS_PATH)).toContain(
      'stakeholderReview：pending',
    );
    expect(
      await readText(
        root,
        `${FM_MODEL_ROOT}/validation/scenarios/scenario--successful-payment.yaml`,
      ),
    ).toContain('status: pending');
    expect(api.sendUserMessage).toHaveBeenCalledTimes(1);

    const gate = await createGate(
      root,
      updated,
      {
        phase: 'domain',
        subject: '领域建模',
        round: 0,
        passed: true,
        warnings: 0,
        createdAt: new Date().toISOString(),
        items: [],
      },
      'reports/domain-test.md',
    );
    expect(gate.artifactPaths).toEqual(
      expect.arrayContaining(updated.modeling.files),
    );
    const digest = await hashArtifacts(root, updated.modeling.files);
    // Re-submit the same inputs through a different staging directory.
    await saveState(root, state);
    await submit(true, files);
    expect(await hashArtifacts(root, updated.modeling.files)).toBe(digest);
    expect(await readdir(join(root, '.evidence/staging'))).toEqual([]);

    // Missing business evidence is a real schema/semantic failure, not broken YAML.
    const beforeRetry = await loadState(root);
    if (!beforeRetry) throw new Error('Submitted state is missing');
    beforeRetry.currentArtifactIndex = 2;
    await saveState(root, beforeRetry);
    const beforeState = await readText(root, '.evidence/state.json');
    const invalid = files.filter(
      (file) => file.path !== 'entities/confirmation--content-payment.yaml',
    );
    await expect(submit(true, invalid)).rejects.toThrow('履约模型校验失败');
    expect(await readText(root, '.evidence/state.json')).toBe(beforeState);
    expect(await hashArtifacts(root, updated.modeling.files)).toBe(digest);
    expect(await readdir(join(root, '.evidence/staging'))).toEqual([]);
    expect(api.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(
      await readdir(join(root, '.pi/skills/evidence-modeling/scripts')),
    ).not.toContain('__pycache__');

    await writeTextAtomic(
      root,
      `${FM_MODEL_ROOT}/generated/simulation.json`,
      '{"changed":true}\n',
    );
    expect(await hashArtifacts(root, gate.artifactPaths)).not.toBe(
      gate.artifactDigest,
    );
  }, 180_000);
});

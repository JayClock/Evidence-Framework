import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashArtifacts } from '../../../gates.ts';
import evidenceExtension from '../../../index.ts';
import { type FmModelFile } from '../../../modeling/fm/contracts.ts';
import { getPhaseDefinition } from '../../../phases.ts';
import { listFmModelFiles } from '../../../state/fm/index.ts';
import { FM_MODEL_ROOT, FM_STATUS_PATH } from '../../../state/fm/paths.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
  writeJsonAtomic,
  writeTextAtomic,
} from '../../../storage.ts';
import { seedDiscovery } from '../../../tests/support/discovery-test-support.ts';
import { domain } from '../../../tests/support/modeling-scope-test-support.ts';
import {
  executeProcess,
  prepareFmSkill,
  readFmFixtureFiles,
} from '../../../tests/support/modeling-test-support.ts';
import { validDocument } from '../../../tests/support/quality-test-support.ts';

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
    params: unknown,
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
  state.phase = 'modeling';
  state.status = 'running';
  state.currentArtifactIndex = 1;
  await saveState(root, state);
  for (const path of [
    'artifacts/00-input/requirements.md',
    'artifacts/01-requirements/problem-statement.md',
    'artifacts/01-requirements/story-map.md',
  ]) {
    await writeTextAtomic(root, path, `# ${path}\n`);
  }
  await seedDiscovery(root, state);
  await writeJsonAtomic(root, '.pi/evidence.json', {
    autoContinueArtifacts: false,
  });
  const language = getPhaseDefinition('modeling').artifacts[0];
  await writeTextAtomic(root, language.output, validDocument(language));
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
  const submit = async (applicable: boolean, files: FmModelFile[] = []) => {
    await tool.execute(
      'call-1',
      {
        applicable,
        rationale: applicable
          ? '当前包含独立领域规则或合同权责，需要建立统一 FM 并如实记录校验和单据模拟适用性；机器结果不代替业务确认。'
          : '当前范围只有简单的本地工具胶水集成，无独立对象身份、领域关系、规则、渠道协商或合同履约语义，不需建模。',
        files,
      },
      undefined,
      undefined,
      context,
    );
    expect((await loadState(root))?.pendingGate).toBeNull();
    for (const spec of getPhaseDefinition('modeling').artifacts.slice(2)) {
      const current = (await loadState(root))!;
      current.status = 'running';
      await saveState(root, current);
      await tools
        .get('evidence_submit_artifact')!
        .execute(
          'scope',
          { content: validDocument(spec) },
          undefined,
          undefined,
          context,
        );
    }
  };
  return { root, state, api, submit };
}

describe('unified FM modeling submission', () => {
  it('records an explicit not-applicable decision and waits for the modeling gate', async () => {
    const { root, api, submit } = await submissionHarness();
    await submit(false);
    const updated = await loadState(root);
    expect(updated?.modeling).toMatchObject({
      applicable: false,
      machineValidated: false,
      simulationPassed: null,
    });
    expect(updated?.currentArtifactIndex).toBe(5);
    expect(updated?.status).toBe('waiting_review');
    expect(updated?.pendingGate?.phase).toBe('modeling');
    expect(await readText(root, FM_STATUS_PATH)).toContain('结论：不适用');
    expect(api.exec).not.toHaveBeenCalled();
    expect(api.sendUserMessage).not.toHaveBeenCalled();
  });

  it('gates a pure domain model without claiming simulation or expert confirmation', async () => {
    const { root, submit } = await submissionHarness();
    await prepareFmSkill(root);
    const files = [
      ...domain,
      {
        path: 'discovery/open-questions.md',
        content: '# 待确认\n归档规则待具名领域专家确认。',
      },
    ];
    await submit(true, files);
    const updated = (await loadState(root))!;
    expect(updated.currentArtifactIndex).toBe(5);
    expect(updated.modeling).toMatchObject({
      applicable: true,
      machineValidated: true,
      simulationPassed: null,
    });
    const compiled = JSON.parse(
      await readText(root, `${FM_MODEL_ROOT}/generated/model.json`),
    );
    expect(compiled.fulfillments).toEqual([]);
    expect(compiled.model).toMatchObject({
      modelStatus: 'draft',
      stakeholderReview: { status: 'pending' },
    });
    expect(await readText(root, FM_STATUS_PATH)).toContain('未执行');
    expect(updated.modeling.files).not.toContain(
      `${FM_MODEL_ROOT}/generated/simulation.json`,
    );
    expect(updated.status).toBe('waiting_review');
    const gate = updated.pendingGate!;
    expect(gate.artifactPaths).toContain(
      `${FM_MODEL_ROOT}/discovery/open-questions.md`,
    );
    await writeTextAtomic(
      root,
      `${FM_MODEL_ROOT}/discovery/open-questions.md`,
      '# 已变更的发现记录',
    );
    expect(await hashArtifacts(root, gate.artifactPaths)).not.toBe(
      gate.artifactDigest,
    );
  }, 180_000);

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
    expect(updated.currentArtifactIndex).toBe(5);
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
      '以 model.yaml 为准；默认 draft / pending',
    );
    expect(
      await readText(
        root,
        `${FM_MODEL_ROOT}/validation/scenarios/scenario--successful-payment.yaml`,
      ),
    ).toContain('status: pending');
    expect(api.sendUserMessage).not.toHaveBeenCalled();
    expect(updated.status).toBe('waiting_review');
    const gate = updated.pendingGate!;
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
    beforeRetry.currentArtifactIndex = 1;
    beforeRetry.status = 'running';
    beforeRetry.pendingGate = null;
    await saveState(root, beforeRetry);
    const beforeState = await readText(root, '.evidence/state.json');
    const invalid = files.filter(
      (file) => file.path !== 'entities/confirmation--content-payment.yaml',
    );
    await expect(submit(true, invalid)).rejects.toThrow('统一 FM 模型校验失败');
    expect(await readText(root, '.evidence/state.json')).toBe(beforeState);
    expect(await hashArtifacts(root, updated.modeling.files)).toBe(digest);
    expect(await readdir(join(root, '.evidence/staging'))).toEqual([]);
    expect(api.sendUserMessage).not.toHaveBeenCalled();
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

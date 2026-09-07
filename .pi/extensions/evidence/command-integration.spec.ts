import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import evidenceExtension from './index.ts';
import { DISCOVERY_GUIDE_PATH } from './discovery-prompt.ts';
import { loadState, readText, writeTextAtomic } from './storage.ts';

interface RegisteredCommand {
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
}

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('evidence-init command', () => {
  it('initializes input and starts discovery without prewritten requirements', async () => {
    const root = await mkdtemp(join(tmpdir(), 'evidence-command-test-'));
    temporaryRoots.push(root);
    await writeFile(
      join(root, 'package.json'),
      '{"name":"integration-project"}\n',
    );
    await writeTextAtomic(
      root,
      'artifacts/00-input/requirements.md',
      '# 原始需求\n\n运行 Pi 后使用 `/evidence-init` 输入项目目标和原始需求；扩展会更新本文件。\n',
    );
    await writeTextAtomic(
      root,
      '.pi/skills/evidence-modeling/SKILL.md',
      '# 需求分析方法',
    );
    const guide = await readText(process.cwd(), DISCOVERY_GUIDE_PATH);
    await writeTextAtomic(root, DISCOVERY_GUIDE_PATH, guide);
    const commands = new Map<string, RegisteredCommand>();
    const setActiveTools = vi.fn();
    const registrationApi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn((name: string, definition: RegisteredCommand) => {
        commands.set(name, definition);
      }),
      on: vi.fn(),
      getAllTools: vi.fn(() => [
        { name: 'read' },
        { name: 'bash' },
        { name: 'evidence_ask_questions' },
        { name: 'evidence_save_discovery' },
        { name: 'evidence_check_model_draft' },
        { name: 'evidence_finalize_discovery' },
      ]),
      setActiveTools,
      setThinkingLevel: vi.fn(),
      setSessionName: vi.fn(),
      sendUserMessage: vi.fn(),
    };
    // SAFETY: evidence-init only uses the mocked registration/profile methods above;
    // model selection is skipped because the default phase model is null.
    evidenceExtension(registrationApi as unknown as ExtensionAPI);

    const context = {
      cwd: root,
      hasUI: true,
      isIdle: vi.fn(() => true),
      waitForIdle: vi.fn().mockResolvedValue(undefined),
      modelRegistry: { find: vi.fn() },
      ui: {
        confirm: vi.fn(),
        editor: vi.fn().mockResolvedValue('A testable product goal'),
        notify: vi.fn(),
        setEditorText: vi.fn(),
        setStatus: vi.fn(),
        setWidget: vi.fn(),
        theme: { fg: vi.fn((_color: string, text: string) => text) },
      },
    };
    // SAFETY: the command path exercised here accesses only the context members mocked above.
    const commandContext = context as unknown as ExtensionCommandContext;
    await commands.get('evidence-init')?.handler('', commandContext);

    expect(context.ui.editor).toHaveBeenCalledWith(
      '输入项目目标和原始需求',
      '',
    );
    const state = await loadState(root);
    expect(state).toMatchObject({
      projectName: 'integration-project',
      goal: 'A testable product goal',
      phase: 'modeling',
      discovery: { stage: 'discovering', revision: 0 },
      status: 'running',
    });
    expect(
      await readText(root, 'artifacts/00-input/requirements.md'),
    ).toContain('A testable product goal');
    expect(setActiveTools).toHaveBeenCalledWith([
      'read',
      'bash',
      'evidence_ask_questions',
      'evidence_save_discovery',
      'evidence_check_model_draft',
      'evidence_finalize_discovery',
    ]);

    await commands.get('evidence-run')?.handler('', commandContext);

    const running = await loadState(root);
    expect(running?.status).toBe('running');
    expect(state).not.toHaveProperty('interviews');
    expect(await readText(root, 'artifacts/00-input/interview.md')).toBe('');
    expect(registrationApi.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining('Evidence 交互式业务发现与建模'),
    );
    expect(registrationApi.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining(guide.trim()),
    );
    expect(registrationApi.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining('当前焦点：识别业务上下文'),
    );
  });
});

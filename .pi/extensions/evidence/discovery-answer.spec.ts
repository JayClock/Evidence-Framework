import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { qualityHarness } from './quality-test-support.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
} from './storage.ts';
import { loadDiscovery } from './discovery.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const success = {
  code: 0,
  killed: false,
  stdout: '{"login":"current-user"}\n',
  stderr: '',
};

async function waiting() {
  const h = await qualityHarness(roots);
  const state = createInitialState('test', '自动记录回答来源');
  state.status = 'running';
  await saveState(h.root, state);
  await h.tool('evidence_ask_questions', {
    expectedRevision: 0,
    questions: [
      {
        id: 'Q-001',
        focus: 'scope',
        prompt: '本次范围是什么？',
        impact: '决定建模边界',
        blocking: true,
        sourceRefs: ['INPUT'],
      },
    ],
  });
  h.api.exec.mockResolvedValue(success);
  h.ui.editor.mockResolvedValue('只处理客户档案。');
  h.ui.select.mockResolvedValue('事实或决定');
  // A manual fallback must never become the recorded identity.
  h.ui.input.mockResolvedValue('manual-name');
  return h;
}

async function snapshot(h: Awaited<ReturnType<typeof waiting>>) {
  return loadDiscovery(h.root, (await loadState(h.root))!);
}

describe('GitHub attribution for discovery answers', () => {
  it.each([
    ['事实或决定', 'answered'],
    ['未知，仍需澄清', 'unknown'],
    ['移出本次范围（回答中说明原因）', 'excluded'],
  ])(
    'automatically attributes %s without asking for a name',
    async (mode, status) => {
      const h = await waiting();
      h.ui.select.mockResolvedValue(mode);
      await h.command('evidence-answer', 'Q-001');
      expect((await snapshot(h)).answers).toEqual([
        expect.objectContaining({
          text: '只处理客户档案。',
          respondent: 'github.com/current-user',
          status,
        }),
      ]);
      expect(h.ui.input).not.toHaveBeenCalled();
      expect(h.api.exec).toHaveBeenCalledWith(
        'gh',
        ['api', '--hostname', 'github.com', 'user'],
        { cwd: h.root, timeout: 10000 },
      );
      expect(h.ui.editor).toHaveBeenCalledWith(
        expect.stringContaining('github.com/current-user'),
        '',
      );
    },
  );

  it('resolves the current account again on correction and retains original attribution', async () => {
    const h = await waiting();
    await h.command('evidence-answer', 'Q-001');
    const originalPath = (await loadState(h.root))!.discovery.path!;
    const original = await readText(h.root, originalPath);
    h.api.exec.mockResolvedValue({
      ...success,
      stdout: '{"login":"other-user"}\n',
    });
    h.ui.editor.mockResolvedValue('更正：还需要合并重复档案。');
    await h.command('evidence-answer', 'Q-001');
    expect(
      (await snapshot(h)).answers.map((answer) => answer.respondent),
    ).toEqual(['github.com/current-user', 'github.com/other-user']);
    expect(await readText(h.root, originalPath)).toBe(original);
    expect(h.api.exec).toHaveBeenCalledTimes(2);
    expect(h.ui.input).not.toHaveBeenCalled();
  });

  it('also uses GitHub attribution when evidence-next opens the answer flow', async () => {
    const h = await waiting();
    h.ui.select
      .mockResolvedValueOnce('Q-001 本次范围是什么？')
      .mockResolvedValueOnce('事实或决定');
    await h.command('evidence-next');
    expect((await snapshot(h)).answers[0].respondent).toBe(
      'github.com/current-user',
    );
    expect(h.ui.input).not.toHaveBeenCalled();
  });

  it.each([
    [
      'not authenticated',
      { ...success, code: 1, stderr: 'private diagnostics' },
    ],
    ['timed out', { ...success, killed: true }],
    ['empty login', { ...success, stdout: '{"login":""}' }],
    ['missing login', { ...success, stdout: '{}' }],
    ['invalid login', { ...success, stdout: '{"login":"name/injected"}' }],
    ['malformed response', { ...success, stdout: 'not json' }],
    ['null response', { ...success, stdout: 'null' }],
    ['missing gh', new Error('spawn gh ENOENT: private diagnostics')],
  ])(
    'leaves discovery untouched when identity lookup fails: %s',
    async (_label, result) => {
      const h = await waiting();
      if (result instanceof Error) h.api.exec.mockRejectedValue(result);
      else h.api.exec.mockResolvedValue(result);
      const before = await readText(h.root, '.evidence/state.json');
      const discoveryBefore = await snapshot(h);
      await h.command('evidence-answer', 'Q-001');
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
      expect(await snapshot(h)).toEqual(discoveryBefore);
      expect(h.ui.editor).not.toHaveBeenCalled();
      expect(h.ui.input).not.toHaveBeenCalled();
      expect(h.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('gh auth login --hostname github.com'),
        'warning',
      );
      expect(JSON.stringify(h.ui.notify.mock.calls)).not.toContain(
        'private diagnostics',
      );
    },
  );

  it.each([undefined, '   '])(
    'does not save cancelled or empty answers',
    async (text) => {
      const h = await waiting();
      h.ui.editor.mockResolvedValue(text);
      const before = await readText(h.root, '.evidence/state.json');
      await h.command('evidence-answer', 'Q-001');
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
      expect((await snapshot(h)).answers).toEqual([]);
    },
  );
});

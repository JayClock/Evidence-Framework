import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  realpath,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DeliveryRunner,
  launchPi,
  type Launch,
  type Packet,
} from './runner.js';

let root: string;
let scratch: string;
let packet: Packet;
const final = (text = '交付候选；尚未归档') =>
  JSON.stringify({
    type: 'message_end',
    message: {
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text }],
    },
  }) + '\n';
const launch: Launch = async ({ stdout }) => {
  stdout(final());
  return 0;
};

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'evidence-repo-test-')));
  scratch = await mkdtemp(join(tmpdir(), 'evidence-runs-test-'));
  execFileSync('git', ['init', '-q', root]);
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src/a.ts'), 'existing user change');
  await writeFile(join(root, 'AGENTS.md'), 'project instructions');
  await mkdir(join(root, 'docs/plans'), { recursive: true });
  await writeFile(join(root, 'docs/plans/plan.yaml'), 'status: planned');
  await mkdir(join(root, '.pi/agents'), { recursive: true });
  for (const role of ['worker', 'reviewer']) {
    await writeFile(
      join(root, '.pi/agents', `evidence-${role}.md`),
      await readFile(
        new URL(`../../agents/evidence-${role}.md`, import.meta.url),
      ),
    );
  }
  packet = {
    taskKey: 'harness.delivery',
    assignment: '实现指定行为，保留原有修改',
    sourceRefs: ['AGENTS.md'],
    allowedFiles: ['src/a.ts'],
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
});

function runner(run = launch) {
  return new DeliveryRunner(root, 'openai/test', 'high', run, scratch);
}

describe('independent delivery processes', () => {
  it('uses fresh nonpersistent processes and gives reviewer no mutation tools or worker conversation', async () => {
    const calls: Parameters<Launch>[0][] = [];
    const run = runner(async (call) => {
      calls.push(call);
      return launch(call);
    });
    const worker = await run.worker(packet);
    const review = await run.review(worker.runDir);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.args).toContain('--no-session');
      expect(call.args).toContain('--no-extensions');
      expect(call.args).toContain('--no-skills');
      expect(call.args).toContain('--no-prompt-templates');
      expect(call.args).not.toContain('--continue');
      expect(call.cwd).toBe(root);
    }
    expect(calls[0].args).toContain('read,bash,edit,write,grep,find,ls');
    expect(calls[1].args).toContain('read,grep,find,ls');
    expect(calls[1].args.join(' ')).not.toContain('交付候选');
    expect(review.role).toBe('reviewer');
    expect(review.taskKey).toBe(packet.taskKey);
    expect(await readFile(join(root, 'docs/plans/plan.yaml'), 'utf8')).toBe(
      'status: planned',
    );
  });

  it('takes tool permissions from the subagent definition, not a dispatcher table', async () => {
    const path = join(root, '.pi/agents/evidence-worker.md');
    await writeFile(
      path,
      (await readFile(path, 'utf8')).replace(
        'tools: read, bash, edit, write, grep, find, ls',
        'tools: read, grep',
      ),
    );
    await runner(async (call) => {
      expect(call.args[call.args.indexOf('--tools') + 1]).toBe('read,grep');
      const prompt = await readFile(
        call.args[call.args.indexOf('--append-system-prompt') + 1],
        'utf8',
      );
      expect(prompt).not.toContain('tools:');
      return launch(call);
    }).worker(packet);
  });

  it('captures the actual untracked baseline and preserves evidence outside the project', async () => {
    const result = await runner(async (call) => {
      await writeFile(join(root, 'src/a.ts'), 'implementation');
      return launch(call);
    }).worker(packet);
    expect(result.changedFiles).toEqual(['src/a.ts']);
    const manifest = JSON.parse(
      await readFile(join(result.runDir, 'result.json'), 'utf8'),
    );
    expect(manifest.before['src/a.ts']).not.toBe(manifest.after['src/a.ts']);
    expect(
      await readFile(join(result.runDir, 'baseline/src/a.ts'), 'utf8'),
    ).toBe('existing user change');
    expect(
      await readFile(join(result.runDir, 'events.jsonl'), 'utf8'),
    ).toContain('message_end');
    expect(result.runDir.startsWith(root)).toBe(false);
    expect(result).not.toHaveProperty('status');
  });

  it('rejects stale worker evidence before starting reviewer', async () => {
    const run = runner();
    const result = await run.worker(packet);
    await writeFile(join(root, 'src/a.ts'), 'changed after checks');
    await expect(run.review(result.runDir)).rejects.toThrow('工作树已变化');
  });

  it('detects out-of-scope changes without reverting them or allowing review', async () => {
    const run = runner(async (call) => {
      await writeFile(join(root, 'docs/plans/plan.yaml'), 'status: done');
      return launch(call);
    });
    await expect(run.worker(packet)).rejects.toThrow('越界');
    expect(await readFile(join(root, 'docs/plans/plan.yaml'), 'utf8')).toBe(
      'status: done',
    );
  });

  it('rejects protected and escaping allowlist paths before launch', async () => {
    for (const path of [
      '../outside',
      '/tmp/elsewhere',
      'docs/plans/plan.yaml',
      '.evidence/fm/model.json',
    ]) {
      await expect(
        runner().worker({ ...packet, allowedFiles: [path] }),
      ).rejects.toThrow();
    }
  });

  it('rejects missing sources and an already-aborted request', async () => {
    await expect(
      runner().worker({ ...packet, sourceRefs: ['missing.md'] }),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(runner().worker(packet, controller.signal)).rejects.toThrow(
      '中止',
    );
  });

  it.each([
    [
      'zero exit but model error',
      JSON.stringify({
        type: 'message_end',
        message: {
          role: 'assistant',
          stopReason: 'error',
          errorMessage: 'provider failed',
          content: [],
        },
      }),
      0,
    ],
    [
      'aborted',
      JSON.stringify({
        type: 'message_end',
        message: { role: 'assistant', stopReason: 'aborted', content: [] },
      }),
      0,
    ],
    ['nonzero', final(), 1],
    ['missing final', '', 0],
    ['malformed event', '{broken', 0],
    [
      'unfinished tool call',
      JSON.stringify({
        type: 'message_end',
        message: { role: 'assistant', stopReason: 'toolUse', content: [] },
      }),
      0,
    ],
  ])('does not treat %s as success', async (_name, output, code) => {
    await expect(
      runner(async ({ stdout, stderr }) => {
        stdout(output);
        stderr('complete diagnostic');
        return code;
      }).worker(packet),
    ).rejects.toThrow('交接失败');
  });

  it('rejects concurrent delegations sharing the worktree', async () => {
    let finish!: () => void;
    let started!: () => void;
    const active = new Promise<void>((resolve) => {
      started = resolve;
    });
    const run = runner(async (call) => {
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return launch(call);
    });
    const first = run.worker(packet);
    await active;
    await expect(run.worker(packet)).rejects.toThrow('已有');
    finish();
    await first;
  });

  it('preserves stderr on launcher failure and releases the delegation lock', async () => {
    let fail = true;
    const run = runner(async (call) => {
      if (fail) {
        fail = false;
        throw new Error('spawn unavailable');
      }
      return launch(call);
    });
    await expect(run.worker(packet)).rejects.toThrow('spawn unavailable');
    await expect(run.worker(packet)).resolves.toHaveProperty('role', 'worker');
  });

  it('propagates cancellation to a real process and escalates if SIGTERM is ignored', async () => {
    if (process.platform === 'win32') return;
    const executable = join(scratch, 'pi');
    await writeFile(
      executable,
      '#!/usr/bin/env node\nprocess.on("SIGTERM", () => {}); process.stdout.write("ready\\n"); setInterval(() => {}, 1000);\n',
    );
    await chmod(executable, 0o700);
    const previous = process.env.PATH;
    process.env.PATH = `${scratch}:${previous}`;
    const controller = new AbortController();
    let output = '';
    try {
      const code = await launchPi({
        cwd: root,
        args: [],
        signal: controller.signal,
        stdout: (chunk) => {
          output += chunk;
          if (output.includes('ready')) controller.abort();
        },
        stderr: () => {},
      });
      expect(code).toBe(124);
      expect(output).toContain('ready');
    } finally {
      process.env.PATH = previous;
    }
  });

  it('detects reviewer writes even when the launcher bypasses tool restrictions', async () => {
    const worker = await runner().worker(packet);
    await expect(
      runner(async (call) => {
        await writeFile(join(root, 'src/a.ts'), 'reviewer write');
        return launch(call);
      }).review(worker.runDir),
    ).rejects.toThrow('越界');
  });
});

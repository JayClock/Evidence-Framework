import { parseFrontmatter } from '@earendil-works/pi-coding-agent';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface Packet {
  taskKey: string;
  assignment: string;
  sourceRefs: string[];
  allowedFiles: string[];
}
type Role = 'worker' | 'reviewer';
type Snapshot = Record<string, string>;
export interface RunResult {
  role: Role;
  taskKey: string;
  runDir: string;
  changedFiles: string[];
  report: string;
}
interface Manifest extends RunResult {
  cwd: string;
  packet: Packet;
  before: Snapshot;
  after: Snapshot;
  exitCode: number;
  valid: boolean;
  failure: string;
  startedAt: string;
}
export type Launch = (options: {
  cwd: string;
  args: string[];
  signal?: AbortSignal;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}) => Promise<number>;

// A process boundary is not a sandbox. In particular worker bash retains the
// caller's OS permissions. This launcher never archives business/task state.
export const launchPi: Launch = ({ cwd, args, signal, stdout, stderr }) =>
  new Promise((resolveExit, reject) => {
    if (signal?.aborted) {
      reject(new Error('委派已中止'));
      return;
    }
    const child = spawn('pi', args, {
      cwd,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', stdout);
    child.stderr.on('data', stderr);
    let stopped = false;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const kill = (sig: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid)
          process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
          stderr(String(error));
      }
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      kill('SIGTERM');
      escalation = setTimeout(() => kill('SIGKILL'), 2000);
    };
    const timeout = setTimeout(stop, 30 * 60 * 1000);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    const cleanup = () => {
      clearTimeout(timeout);
      if (escalation) clearTimeout(escalation);
      signal?.removeEventListener('abort', stop);
    };
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('close', (code) => {
      cleanup();
      resolveExit(stopped ? 124 : (code ?? 1));
    });
  });

function safePath(root: string, path: string): string {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '..' || part === '.') ||
    path.startsWith('.git/')
  )
    throw new Error(`非法项目路径: ${path}`);
  const target = resolve(root, path);
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const real = realpathSync(ancestor);
  if (real !== root && (!real.startsWith(root + '/') || real !== ancestor))
    throw new Error(`路径逃逸或符号链接: ${path}`);
  return target;
}
function protectedPath(path: string): boolean {
  return (
    path === 'AGENTS.md' ||
    path.startsWith('.evidence/') ||
    path.startsWith('docs/plans/') ||
    /(^|\/)(plan\.ya?ml|review\.html)$/.test(path)
  );
}
function snapshot(root: string): Snapshot {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, maxBuffer: 32 * 1024 * 1024 },
  )
    .toString()
    .split('\0')
    .filter(Boolean);
  const result: Snapshot = {};
  for (const path of [...new Set(paths)].sort()) {
    const absolute = join(root, path);
    try {
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) throw new Error(`不支持嵌套仓库: ${path}`);
      const content = stat.isSymbolicLink()
        ? readlinkSync(absolute)
        : readFileSync(absolute);
      result[path] = createHash('sha256')
        .update(String(stat.mode))
        .update(content)
        .digest('hex');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return result;
}
function changed(before: Snapshot, after: Snapshot): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((path) => before[path] !== after[path])
    .sort();
}

export class DeliveryRunner {
  private active = false;
  constructor(
    private readonly cwd: string,
    private readonly model: string,
    private readonly thinking: string,
    private readonly launch: Launch = launchPi,
    private readonly scratchRoot = tmpdir(),
  ) {}

  async worker(packet: Packet, signal?: AbortSignal): Promise<RunResult> {
    return this.exclusive(async () => {
      if (
        !packet.taskKey.trim() ||
        !packet.assignment.trim() ||
        !packet.sourceRefs.length
      )
        throw new Error('任务、授权说明与来源不可为空');
      const root = realpathSync(this.cwd);
      for (const path of packet.sourceRefs)
        await readFile(safePath(root, path));
      for (const path of packet.allowedFiles) {
        safePath(root, path);
        if (protectedPath(path)) throw new Error(`仅主 Agent 可归档: ${path}`);
      }
      return this.run('worker', packet, signal);
    });
  }

  async review(workerRun: string, signal?: AbortSignal): Promise<RunResult> {
    return this.exclusive(async () => {
      let manifest: Manifest;
      try {
        manifest = JSON.parse(
          await readFile(join(workerRun, 'result.json'), 'utf8'),
        ) as Manifest;
        if (
          !manifest ||
          !manifest.after ||
          !manifest.packet ||
          !Array.isArray(manifest.packet.sourceRefs)
        )
          throw new Error('交付结构不完整');
      } catch (error) {
        throw new Error(`无法读取 worker 交付: ${String(error)}`);
      }
      if (
        !manifest.valid ||
        manifest.role !== 'worker' ||
        manifest.cwd !== realpathSync(this.cwd)
      )
        throw new Error(
          '需要当前仓库有效的 worker 交付，不接受失败或 reviewer 结果',
        );
      if (changed(manifest.after, snapshot(this.cwd)).length)
        throw new Error('worker 交付后工作树已变化，须重新执行并审查');
      return this.run('reviewer', manifest.packet, signal, resolve(workerRun));
    });
  }

  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.active) throw new Error('同一工作树已有委派正在执行');
    this.active = true;
    try {
      return await action();
    } finally {
      this.active = false;
    }
  }

  private async run(
    role: Role,
    packet: Packet,
    signal?: AbortSignal,
    workerRun?: string,
  ): Promise<RunResult> {
    if (signal?.aborted) throw new Error('委派已中止');
    const root = realpathSync(this.cwd);
    const agentPath = join(root, '.pi/agents', `evidence-${role}.md`);
    const { frontmatter, body } = parseFrontmatter(
      await readFile(agentPath, 'utf8'),
    );
    if (
      frontmatter.name !== `evidence-${role}` ||
      typeof frontmatter.tools !== 'string' ||
      !frontmatter.tools.trim() ||
      !body.trim()
    )
      throw new Error(`subagent 定义缺少 name/tools/正文: ${agentPath}`);
    const tools = frontmatter.tools
      .split(',')
      .map((name) => name.trim())
      .join(',');
    const before = snapshot(root);
    const startedAt = new Date().toISOString();
    const runDir = await mkdtemp(join(this.scratchRoot, 'evidence-delivery-'));
    if (role === 'worker') {
      for (const path of packet.allowedFiles) {
        const original = safePath(root, path);
        if (!existsSync(original)) continue;
        const baselinePath = join(runDir, 'baseline', path);
        await mkdir(dirname(baselinePath), { recursive: true });
        await writeFile(baselinePath, await readFile(original), {
          mode: 0o600,
        });
      }
    }
    const events = join(runDir, 'events.jsonl');
    const errors = join(runDir, 'stderr.log');
    const promptPath = join(runDir, 'agent.md');
    await writeFile(promptPath, body, { mode: 0o600 });
    const packetPath = join(runDir, 'packet.json');
    await writeFile(
      packetPath,
      JSON.stringify({ ...packet, workerRun, baseline: before }, null, 2),
      { mode: 0o600 },
    );
    await writeFile(events, '', { mode: 0o600 });
    await writeFile(errors, '', { mode: 0o600 });
    const args = [
      '--mode',
      'json',
      '-p',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--no-prompt-templates',
      '--model',
      this.model,
      '--thinking',
      this.thinking,
      '--tools',
      tools,
      '--append-system-prompt',
      promptPath,
      '--',
      `读取任务包 ${packetPath}，按独立 ${role} 协议执行。临时日志放在 ${runDir}。仅返回交接报告，不归档持久状态。`,
    ];
    let pending = '';
    let report = '';
    let stopReason = '';
    let parseFailure = false;
    const parseLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (
          event.type === 'message_end' &&
          event.message?.role === 'assistant'
        ) {
          stopReason = event.message.stopReason;
          report = (event.message.content ?? [])
            .filter((part: { type: string }) => part.type === 'text')
            .map((part: { text: string }) => part.text)
            .join('\n');
        }
      } catch {
        parseFailure = true;
      }
    };
    let exitCode = -1;
    let failure = '';
    try {
      exitCode = await this.launch({
        cwd: root,
        args,
        signal,
        stdout: (chunk) => {
          appendFileSync(events, chunk);
          pending += chunk;
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';
          for (const line of lines) parseLine(line);
        },
        stderr: (chunk) => appendFileSync(errors, chunk),
      });
    } catch (error) {
      failure = String(error);
      appendFileSync(errors, failure);
    }
    parseLine(pending);
    const after = snapshot(root);
    const changedFiles = changed(before, after);
    const outside =
      role === 'reviewer'
        ? changedFiles
        : changedFiles.filter((path) => !packet.allowedFiles.includes(path));
    if (outside.length)
      failure += `越界修改: ${outside.join(', ')}；未自动回滚。`;
    const valid =
      !failure &&
      !signal?.aborted &&
      exitCode === 0 &&
      stopReason === 'stop' &&
      !!report.trim() &&
      !parseFailure;
    const result: Manifest = {
      role,
      taskKey: packet.taskKey,
      runDir,
      changedFiles,
      report,
      packet,
      cwd: root,
      before,
      after,
      exitCode,
      valid,
      failure,
      startedAt,
    };
    await writeFile(
      join(runDir, 'result.json'),
      JSON.stringify(result, null, 2),
      { mode: 0o600 },
    );
    if (!valid)
      throw new Error(
        `交接失败：${failure || `exit=${exitCode}, stop=${stopReason}, aborted=${!!signal?.aborted}`}。完整证据保留在 ${runDir}`,
      );
    return { role, taskKey: packet.taskKey, runDir, changedFiles, report };
  }
}

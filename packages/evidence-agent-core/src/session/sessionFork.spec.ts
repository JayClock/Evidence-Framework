import { SessionForkError, forkSessionLines } from './sessionFork.js';

const header = (id: string, parentSession?: string) =>
  JSON.stringify({
    type: 'session',
    version: 3,
    id,
    timestamp: '2026-01-01T00:00:00.000Z',
    cwd: '/workspace/project',
    ...(parentSession === undefined ? {} : { parentSession }),
  });

const entry = (id: string, parentId: string | null) =>
  JSON.stringify({
    type: 'message',
    id,
    parentId,
    timestamp: '2026-01-01T00:00:00.000Z',
    message: { role: 'user', content: id },
  });

const parse = (lines: readonly string[]) => lines.map((line) => JSON.parse(line));

describe('forkSessionLines', () => {
  it('keeps only the ancestry of the fork point', () => {
    const lines = [
      header('session-source'),
      entry('m1', null),
      entry('m2', 'm1'),
      entry('m3', 'm2'),
      entry('sibling', 'm2'),
    ];

    const forked = forkSessionLines(lines, {
      newSessionId: 'session-branch',
      sourceEntryId: 'm2',
    });

    expect(parse(forked.lines).map((item) => item.id)).toEqual([
      'session-branch',
      'm1',
      'm2',
    ]);
    expect(forked.leafEntryId).toBe('m2');
    expect(forked.droppedEntryCount).toBe(2);
  });

  it('records the lineage in the new header', () => {
    const forked = forkSessionLines([header('session-source'), entry('m1', null)], {
      newSessionId: 'session-branch',
      timestamp: '2026-02-02T00:00:00.000Z',
    });

    expect(parse(forked.lines)[0]).toEqual(
      expect.objectContaining({
        id: 'session-branch',
        parentSession: 'session-source',
        timestamp: '2026-02-02T00:00:00.000Z',
        cwd: '/workspace/project',
      }),
    );
  });

  it('copies every entry when no fork point is given', () => {
    const lines = [
      header('session-source'),
      entry('m1', null),
      entry('m2', 'm1'),
    ];

    const forked = forkSessionLines(lines, { newSessionId: 'session-copy' });

    expect(forked.leafEntryId).toBe('m2');
    expect(forked.droppedEntryCount).toBe(0);
    expect(parse(forked.lines)).toHaveLength(3);
  });

  it('refuses a fork point that does not exist', () => {
    expect(() =>
      forkSessionLines([header('session-source'), entry('m1', null)], {
        newSessionId: 'session-branch',
        sourceEntryId: 'm9',
      }),
    ).toThrow(SessionForkError);
  });

  it('refuses a file without a session header', () => {
    expect(() =>
      forkSessionLines([entry('m1', null)], { newSessionId: 'session-branch' }),
    ).toThrow(/缺少 session 头/);
  });

  it('refuses a line that is not JSON', () => {
    expect(() =>
      forkSessionLines([header('session-source'), '{oops'], {
        newSessionId: 'session-branch',
      }),
    ).toThrow(/无法解析/);
  });

  it('terminates on a cyclic parent chain instead of looping', () => {
    const lines = [
      header('session-source'),
      entry('m1', 'm2'),
      entry('m2', 'm1'),
    ];

    const forked = forkSessionLines(lines, {
      newSessionId: 'session-branch',
      sourceEntryId: 'm1',
    });

    expect(forked.lines).toHaveLength(3);
  });

  it('never mutates the source lines', () => {
    const lines = [header('session-source'), entry('m1', null)];
    const copy = [...lines];

    forkSessionLines(lines, { newSessionId: 'session-branch' });

    expect(lines).toEqual(copy);
  });
});

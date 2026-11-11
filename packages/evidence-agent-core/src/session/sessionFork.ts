/**
 * One JSONL line of a Pi session transcript.
 *
 * The header carries identity, every other entry carries `id`/`parentId`, which
 * is what makes the transcript a tree instead of a log.
 */
interface TranscriptEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  [key: string]: unknown;
}

interface TranscriptHeader {
  type: 'session';
  id: string;
  timestamp: string;
  cwd: string;
  [key: string]: unknown;
}

export type SessionForkErrorCode =
  | 'MISSING_HEADER'
  | 'INVALID_LINE'
  | 'ENTRY_NOT_FOUND';

export class SessionForkError extends Error {
  readonly code: SessionForkErrorCode;

  constructor(code: SessionForkErrorCode, message: string) {
    super(message);
    this.name = 'SessionForkError';
    this.code = code;
  }
}

export interface SessionForkOptions {
  /** Identity written into the new transcript header. */
  newSessionId: string;
  /**
   * Entry the branch continues from.
   *
   * Omitted or `null` copies the whole transcript and only rewrites identity,
   * which is what a project-level fork means.
   */
  sourceEntryId?: string | null;
  /** Session id the new file descends from; defaults to the source header id. */
  parentSessionId?: string;
  /** Defaults to the source header timestamp. */
  timestamp?: string;
}

export interface SessionForkResult {
  /** New transcript lines, header first. */
  lines: string[];
  /** Entry the branch leaves off at, so the caller can resume from it. */
  leafEntryId: string | null;
  /** Entries that belonged to the abandoned sibling branches. */
  droppedEntryCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isHeader = (value: Record<string, unknown>): value is TranscriptHeader =>
  value.type === 'session' && typeof value.id === 'string';

const isEntry = (value: Record<string, unknown>): value is TranscriptEntry =>
  typeof value.id === 'string' && typeof value.type === 'string';

/**
 * Forks a session transcript at one entry without touching the original.
 *
 * A fork keeps the ancestry of the chosen entry and drops everything else: the
 * abandoned siblings of a decision stay in the source file, so the branch can
 * never quietly inherit a conclusion it did not reach. The new header records
 * `parentSession`, which keeps the lineage readable after the fact.
 */
export const forkSessionLines = (
  lines: readonly string[],
  options: SessionForkOptions,
): SessionForkResult => {
  let header: TranscriptHeader | null = null;
  const entries: TranscriptEntry[] = [];

  for (const line of lines) {
    if (line.trim() === '') {
      continue;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      throw new SessionForkError(
        'INVALID_LINE',
        '追溯会话文件包含无法解析的行，不能分叉。',
      );
    }

    if (!isRecord(parsed)) {
      throw new SessionForkError(
        'INVALID_LINE',
        '追溯会话文件的每一行都必须是 JSON 对象。',
      );
    }

    if (header === null && isHeader(parsed)) {
      header = parsed;
      continue;
    }

    if (isEntry(parsed)) {
      entries.push(parsed);
    }
  }

  if (header === null) {
    throw new SessionForkError(
      'MISSING_HEADER',
      '追溯会话文件缺少 session 头，不能分叉。',
    );
  }

  const sourceEntryId = options.sourceEntryId ?? null;
  let kept: TranscriptEntry[];

  if (sourceEntryId === null) {
    kept = entries;
  } else {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    if (!byId.has(sourceEntryId)) {
      throw new SessionForkError(
        'ENTRY_NOT_FOUND',
        `追溯会话文件中没有 ${sourceEntryId}，不能从该检查点分叉。`,
      );
    }

    const ancestors = new Set<string>();
    let cursor: TranscriptEntry | undefined = byId.get(sourceEntryId);

    while (cursor !== undefined && !ancestors.has(cursor.id)) {
      ancestors.add(cursor.id);
      cursor =
        cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }

    kept = entries.filter((entry) => ancestors.has(entry.id));
  }

  const forkedHeader: TranscriptHeader = {
    ...header,
    id: options.newSessionId,
    timestamp: options.timestamp ?? header.timestamp,
    parentSession: options.parentSessionId ?? header.id,
  };

  return {
    lines: [JSON.stringify(forkedHeader), ...kept.map((entry) => JSON.stringify(entry))],
    leafEntryId: kept.length === 0 ? null : kept[kept.length - 1]!.id,
    droppedEntryCount: entries.length - kept.length,
  };
};

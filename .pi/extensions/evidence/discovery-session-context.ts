import { createHash } from 'node:crypto';
import type {
  ContextEvent,
  ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import type { EvidenceState } from './types.ts';

export const DISCOVERY_CONTEXT_TYPE = 'evidence-discovery-context';
type Message = ContextEvent['messages'][number];
type Stamp = { runId: string; revision: number; promptDigest: string | null };
const queued = new WeakMap<ExtensionAPI, Stamp>();
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');

export function clearQueuedDiscoveryPrompt(pi: ExtensionAPI): void {
  queued.delete(pi);
}

// Retain sendUserMessage: unlike sendMessage(triggerTurn), it runs Pi's
// before_agent_start hook and thus installs the system policy on a fresh session.
export function sendWorkPrompt(
  pi: ExtensionAPI,
  state: EvidenceState,
  prompt: string,
): void {
  queued.delete(pi);
  if (state.phase === 'modeling' && state.discovery.stage === 'discovering') {
    queued.set(pi, {
      runId: state.runId,
      revision: state.discovery.revision,
      promptDigest: digest(prompt),
    });
  }
  try {
    pi.sendUserMessage(prompt);
  } catch (error) {
    queued.delete(pi);
    throw error;
  }
}

export function takeDiscoveryStamp(
  pi: ExtensionAPI,
  state: EvidenceState,
  prompt: string,
): Stamp {
  const pending = queued.get(pi);
  queued.delete(pi);
  if (
    pending?.runId === state.runId &&
    pending.revision === state.discovery.revision &&
    pending.promptDigest === digest(prompt)
  )
    return pending;
  // An actual human message is never marked as an extension-generated task.
  return {
    runId: state.runId,
    revision: state.discovery.revision,
    promptDigest: null,
  };
}

function stampOf(message: Message, runId: string): Stamp | null {
  if (
    message.role !== 'custom' ||
    message.customType !== DISCOVERY_CONTEXT_TYPE
  )
    return null;
  const stamp = message.details as Partial<Stamp> | undefined;
  if (
    stamp?.runId !== runId ||
    !Number.isInteger(stamp.revision) ||
    !(stamp.promptDigest === null || typeof stamp.promptDigest === 'string')
  )
    return null;
  return stamp as Stamp;
}

function matchesTask(message: Message, hash: string): boolean {
  if (message.role !== 'user') return false;
  if (typeof message.content === 'string')
    return digest(message.content) === hash;
  if (message.content.some((block) => block.type !== 'text')) return false;
  return (
    digest(
      message.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join(''),
    ) === hash
  );
}

function completeToolPairs(messages: Message[]): boolean {
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const block of message.content)
        if (block.type === 'toolCall') calls.add(block.id);
    } else if (message.role === 'toolResult') results.add(message.toolCallId);
  }
  return (
    calls.size === results.size && [...calls].every((id) => results.has(id))
  );
}

// Request-local projection only. Do not mutate Pi's session tree or discard real
// user messages, other extensions, compaction summaries, or half a tool exchange.
// Keep the newest managed generation in full, including all of its tool work.
export function projectDiscoveryMessages(
  messages: Message[],
  runId: string,
): Message[] {
  const markers = messages.flatMap((message, index) => {
    const stamp = stampOf(message, runId);
    return stamp ? [{ index, stamp }] : [];
  });
  if (markers.length < 2) return messages;
  const drop = new Set<number>();
  for (const { index, stamp } of markers.slice(0, -1)) {
    // Other before_agent_start hooks can inject custom messages between our
    // task and marker. Match the task digest, but never remove those messages.
    let taskIndex = index - 1;
    while (taskIndex >= 0 && messages[taskIndex].role === 'custom') taskIndex--;
    const ownedTask =
      stamp.promptDigest &&
      taskIndex >= 0 &&
      matchesTask(messages[taskIndex], stamp.promptDigest);
    let end = index + 1;
    while (
      end < messages.length &&
      (messages[end].role === 'assistant' ||
        messages[end].role === 'toolResult')
    )
      end++;
    if (!completeToolPairs(messages.slice(index + 1, end))) continue;
    if (ownedTask) drop.add(taskIndex);
    for (let i = index; i < end; i++) drop.add(i);
  }
  return messages.filter((_message, index) => !drop.has(index));
}

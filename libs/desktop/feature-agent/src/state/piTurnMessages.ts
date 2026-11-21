import type { ThreadMessageLike } from '@assistant-ui/react';
import type { AgentStreamEvent } from '@evidence-poc/desktop-contracts/agentIpc';

type Part = Exclude<ThreadMessageLike['content'], string>[number];
type ToolPart = Extract<Part, { type: 'tool-call' }> & { toolCallId: string };

/** Pi owns message assembly; only overlay execution results on its snapshots. */
export class PiTurnMessages {
  private finished: Part[] = [];
  private partial: readonly Part[] = [];
  private tools = new Map<string, ToolPart>();
  failure: string | null = null;
  interrupted = false;

  receive(event: AgentStreamEvent) {
    switch (event.type) {
      case 'assistant-message': {
        const parts = event.parts.map<Part>((part) =>
          part.type === 'tool-call'
            ? {
                type: 'tool-call',
                toolName: part.toolName,
                toolCallId: part.toolCallId,
                argsText: JSON.stringify(part.input ?? {}),
              }
            : part,
        );
        if (event.done) {
          this.finished.push(...parts);
          this.partial = [];
          this.failure = null;
        } else {
          this.partial = parts;
        }
        break;
      }
      case 'tool-call-started':
        this.tools.set(event.toolCallId, {
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          argsText: JSON.stringify(event.input ?? {}),
        });
        break;
      case 'tool-call-completed': {
        const tool = this.tools.get(event.toolCallId);
        this.tools.set(event.toolCallId, {
          ...tool,
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: event.output ?? null,
          isError: event.isError,
        });
        break;
      }
      case 'agent-error':
        this.partial = [];
        this.failure = event.message;
        break;
      case 'agent-settled':
        this.interrupted ||= event.aborted;
        break;
    }
  }

  content(): readonly Part[] {
    const seen = new Set<string>();
    const parts = [...this.finished, ...this.partial].map((part) => {
      if (part.type !== 'tool-call' || !part.toolCallId) return part;
      seen.add(part.toolCallId);
      return { ...part, ...this.tools.get(part.toolCallId) };
    });
    // Extensions may report execution without a matching assistant tool part.
    for (const [id, tool] of this.tools) if (!seen.has(id)) parts.push(tool);
    return parts;
  }
}

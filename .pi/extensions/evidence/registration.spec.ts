import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import evidenceExtension from './index.ts';

describe('extension registration', () => {
  it('registers the complete local workflow surface', () => {
    const tools: string[] = [];
    const commands: string[] = [];
    const events: string[] = [];
    const registrationApi = {
      registerTool: vi.fn((definition: { name: string }) =>
        tools.push(definition.name),
      ),
      registerCommand: vi.fn((name: string) => commands.push(name)),
      on: vi.fn((event: string) => events.push(event)),
    };

    // SAFETY: the extension factory only invokes these three registration methods synchronously;
    // runtime API members are used later by the registered callbacks, which this test does not call.
    evidenceExtension(registrationApi as unknown as ExtensionAPI);

    expect(tools).toEqual([
      'evidence_ask_questions',
      'evidence_save_discovery',
      'evidence_check_model_draft',
      'evidence_finalize_discovery',
      'evidence_submit_artifact',
      'evidence_submit_fm_model',
      'evidence_tdd_red',
      'evidence_tdd_green',
      'evidence_complete_tdd_cycle',
      'evidence_verify_task',
      'evidence_complete_story',
    ]);
    expect(commands).toEqual([
      'evidence-answer',
      'evidence-init',
      'evidence-run',
      'evidence-status',
      'evidence-check',
      'evidence-review',
      'evidence-next',
      'evidence-revise',
      'evidence-back',
      'evidence-pause',
      'evidence-resume',
      'evidence-reset',
    ]);
    expect(events).toEqual([
      'session_start',
      'before_agent_start',
      'agent_settled',
      'tool_call',
    ]);
  });
});

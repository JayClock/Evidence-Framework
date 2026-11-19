import { describe, expect, it } from 'vitest';
import { evidenceToolNames } from '../tools/evidenceTools.js';
import {
  EVIDENCE_SYSTEM_PROMPT,
  STORMING_PROMPT,
  SOURCING_PROMPT,
  WHAT_IF_PROMPT,
  WORKFLOW_PROMPT,
} from './index.js';

describe('evidence modeling instructions', () => {
  it('associates each local intent with registered tools', () => {
    for (const [prompt, names] of [
      [STORMING_PROMPT, ['batch_add_evidence_stubs']],
      [
        SOURCING_PROMPT,
        [
          'get_focused_node_context',
          'bind_key_data_source',
          'split_evidence_to_pair',
          'assign_fulfillment_context',
        ],
      ],
      [
        WHAT_IF_PROMPT,
        ['simulate_what_if_challenge', 'grow_breach_compensation'],
      ],
    ] as const) {
      for (const name of names) {
        expect(prompt).toContain(name);
        expect(evidenceToolNames).toContain(name);
      }
    }
    expect(WORKFLOW_PROMPT).toContain('不强制顺序');
  });
  it('distinguishes persistence, provenance, hypotheses and delivery', () => {
    expect(EVIDENCE_SYSTEM_PROMPT).toContain('业务缺口不是保存的阻塞条件');
    expect(SOURCING_PROMPT).toContain('打开节点本身只读');
    expect(WHAT_IF_PROMPT).toContain('不因存在假设就写入规则或节点');
    expect(WORKFLOW_PROMPT).toContain('真实 HTTP 验收');
  });
});

import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_INSTRUCTIONS,
  EVIDENCE_SYSTEM_PROMPT,
  MODELING_PROMPT,
  ROLE_PROMPT,
  WORKFLOW_PROMPT,
} from './index.js';

describe('the built-in instructions', () => {
  it('cover the three things a turn needs: the role, the red lines, the loop', () => {
    expect(EVIDENCE_INSTRUCTIONS).toEqual([
      ROLE_PROMPT,
      MODELING_PROMPT,
      WORKFLOW_PROMPT,
    ]);
    expect(EVIDENCE_SYSTEM_PROMPT).toBe(EVIDENCE_INSTRUCTIONS.join('\n\n'));
  });

  it('name the tools the desktop registers, and nothing that has to be found', () => {
    for (const tool of [
      'apply_model_patch',
      'run_sensors',
      'get_canvas_selection',
    ]) {
      expect(EVIDENCE_SYSTEM_PROMPT).toContain(tool);
    }

    // A skill tree, a reference directory or a CLI command would send the model
    // looking for something the install does not ship.
    for (const relic of ['SKILL.md', '.agents', 'references/', 'npx ', '$']) {
      expect(EVIDENCE_SYSTEM_PROMPT).not.toContain(relic);
    }
  });
});

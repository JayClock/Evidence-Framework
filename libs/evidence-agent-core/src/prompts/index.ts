import { MODELING_PROMPT } from './modeling.js';
import { ROLE_PROMPT } from './role.js';
import { WORKFLOW_PROMPT } from './workflow.js';

/**
 * The instructions every evidence session starts with.
 *
 * A skill would be discovered from a directory the install may not have; these
 * sections are shipped as code, so a project only needs its model files.
 */
export const EVIDENCE_INSTRUCTIONS: readonly string[] = [
  ROLE_PROMPT,
  MODELING_PROMPT,
  WORKFLOW_PROMPT,
];

export { MODELING_PROMPT, ROLE_PROMPT, WORKFLOW_PROMPT };

/** One prompt string, for a host that replaces the system prompt wholesale. */
export const EVIDENCE_SYSTEM_PROMPT = EVIDENCE_INSTRUCTIONS.join('\n\n');

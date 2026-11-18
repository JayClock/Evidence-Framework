import { MODELING_PROMPT } from './modeling.js';
import { OPERATOR_PROMPT } from './operators.js';
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
  OPERATOR_PROMPT,
  WORKFLOW_PROMPT,
];

export {
  INGESTION_EXAMPLES,
  INGESTION_PROMPT,
  buildIngestionPrompt,
} from './ingestion.js';

export { MODELING_PROMPT, OPERATOR_PROMPT, ROLE_PROMPT, WORKFLOW_PROMPT };

/** One prompt string, for a host that replaces the system prompt wholesale. */
export const EVIDENCE_SYSTEM_PROMPT = EVIDENCE_INSTRUCTIONS.join('\n\n');

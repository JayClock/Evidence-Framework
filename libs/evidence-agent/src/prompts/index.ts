import { GOVERNANCE_PROMPT } from './governance.js';
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

export {
  GOVERNANCE_PROMPT,
  MODELING_PROMPT,
  OPERATOR_PROMPT,
  ROLE_PROMPT,
  WORKFLOW_PROMPT,
};

/** One prompt string, for a host that replaces the system prompt wholesale. */
export const EVIDENCE_SYSTEM_PROMPT = EVIDENCE_INSTRUCTIONS.join('\n\n');

/**
 * The instructions for a turn that starts from production.
 *
 * The red lines and the operators are the same, because a repair writes the
 * same model a workshop does. What changes is the loop: an audit reads a trace
 * and decides which side moves, instead of asking a business what it does.
 */
export const GOVERNANCE_INSTRUCTIONS: readonly string[] = [
  ROLE_PROMPT,
  MODELING_PROMPT,
  OPERATOR_PROMPT,
  GOVERNANCE_PROMPT,
];

export const GOVERNANCE_SYSTEM_PROMPT = GOVERNANCE_INSTRUCTIONS.join('\n\n');

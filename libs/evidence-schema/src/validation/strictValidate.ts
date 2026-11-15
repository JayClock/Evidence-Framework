import {
  DomainModelDocumentSchema,
  type DomainModelDocument,
} from '../ast/document.js';
import {
  dedupeIssues,
  DomainModelValidationError,
  type ValidationResult,
} from './errors.js';
import { mapZodIssues } from './mapZodIssues.js';

/** Syntax comes from the AST schemas; graph semantics from their superRefine. */
export function strictValidateDomainModel(input: unknown): ValidationResult {
  const parsed = DomainModelDocumentSchema.safeParse(input);
  if (parsed.success) return { valid: true, issues: [] };
  return {
    valid: false,
    issues: dedupeIssues(mapZodIssues(parsed.error.issues, input)),
  };
}

/** Validates without normalizing/mutating the caller's source objects. */
export function assertValidDomainModel(
  input: unknown,
): asserts input is DomainModelDocument {
  const result = strictValidateDomainModel(input);
  if (!result.valid) throw new DomainModelValidationError(result.issues);
}

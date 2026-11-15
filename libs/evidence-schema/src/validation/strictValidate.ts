import { z } from 'zod';
import {
  DomainModelDocumentSchema,
  type DomainModelDocument,
} from '../ast/document.js';
import {
  createIssue,
  dedupeIssues,
  DomainModelValidationError,
  type ValidationCode,
  type ValidationIssue,
  type ValidationResult,
} from './errors.js';

const isValidationCode = (value: unknown): value is ValidationCode =>
  typeof value === 'string' && value.includes('.');

const pathOf = (path: readonly (string | number)[]): string => {
  if (path.length === 0) return '$';

  return path.reduce<string>((result, part) => {
    if (typeof part === 'number') return `${result}[${part}]`;
    return result.length === 0 ? part : `${result}.${part}`;
  }, '');
};

const structuralCode = (issue: z.ZodIssue): ValidationCode => {
  const path = issue.path;
  const field = path.at(-1);
  const collection = path[0];
  const under = (name: string): boolean => path.includes(name);

  if (issue.code === z.ZodIssueCode.unrecognized_keys) {
    if (collection === 'manifest') return 'manifest.field';
    if (under('attributes')) return 'attribute.shape';
    if (under('examples')) return 'entity.shape';
    if (collection === 'entities') return 'entity.unknownField';
    if (collection === 'relationships') return 'relationship.shape';
    if (collection === 'rules') return 'rule.shape';
    return 'document.shape';
  }

  if (collection === 'manifest') return 'manifest.field';
  if (collection === 'relationships') {
    if (path.length === 1) return 'document.shape';
    return field === 'kind' || field === 'label'
      ? 'relationship.shape'
      : 'relationship.shape';
  }
  if (collection === 'rules') {
    if (path.length === 1) return 'document.shape';
    if (field === 'resultType') return 'rule.resultType';
    if (field === 'target') return 'rule.target.unresolved';
    return 'rule.shape';
  }
  if (collection === 'entities') {
    if (field === 'category') return 'entity.category';
    if (field === 'kind' || field === 'domainRole') return 'entity.kind';
    if (under('examples')) return 'entity.shape';
    if (field === 'label') return 'label.missing';
    if (under('attributes')) {
      if (field === 'name') return 'attribute.name';
      return 'attribute.shape';
    }
    if (field === 'id') return 'id.invalid';
    return 'entity.shape';
  }

  if (path.length === 0 || typeof field === 'undefined') {
    return 'document.shape';
  }
  return 'document.shape';
};

const codeOf = (issue: z.ZodIssue): ValidationCode => {
  const params = (issue as z.ZodIssue & { params?: Record<string, unknown> })
    .params;
  if (isValidationCode(params?.validationCode)) {
    return params.validationCode;
  }

  if (issue.code === z.ZodIssueCode.invalid_string) {
    const field = issue.path.at(-1);
    if (field === 'id' || field === 'sourceRef' || field === 'targetRef') {
      return 'id.invalid';
    }
    if (field === 'name' && issue.path.includes('attributes')) {
      return 'attribute.name';
    }
  }
  return structuralCode(issue);
};

const issueFromZod = (issue: z.ZodIssue): ValidationIssue => {
  const params = (issue as z.ZodIssue & { params?: Record<string, unknown> })
    .params;
  return createIssue({
    code: codeOf(issue),
    path: pathOf(issue.path),
    message: issue.message,
    ...(typeof params?.objectId === 'string'
      ? { objectId: params.objectId }
      : {}),
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The one public validation entry point.
 *
 * Zod owns syntax, discriminators and the typed AST. `DomainModelDocumentSchema`
 * invokes the graph `superRefine` pass after parsing, so callers receive the
 * historical ValidationCode contract without maintaining a second validator.
 */
export function strictValidateDomainModel(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (isRecord(input) && Object.hasOwn(input, 'validation')) {
    issues.push(
      createIssue({
        code: 'document.shape',
        path: '$.validation',
        message:
          'Legacy validation scenarios/instances are no longer supported; use entity examples[].test.',
      }),
    );
  }

  const parsed = DomainModelDocumentSchema.safeParse(input);
  if (parsed.success && issues.length === 0) {
    return { valid: true, issues: [] };
  }

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.path.length === 1 && issue.path[0] === 'validation') continue;
      issues.push(issueFromZod(issue));
    }
  }

  const deduped = dedupeIssues(issues);
  return { valid: deduped.length === 0, issues: deduped };
}

export function assertValidDomainModel(
  input: unknown,
): asserts input is DomainModelDocument {
  const result = strictValidateDomainModel(input);
  if (!result.valid) {
    throw new DomainModelValidationError(result.issues);
  }
}

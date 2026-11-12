/** Machine-readable identifiers for every static FM finding. */
export type ValidationCode =
  | 'document.shape'
  | 'manifest.field'
  | 'manifest.entryContextRef'
  | 'collection.item'
  | 'id.invalid'
  | 'id.duplicate'
  | 'label.missing'
  | 'entity.category'
  | 'entity.kind'
  | 'entity.unknownField'
  | 'entity.shape'
  | 'entity.contextRef.missing'
  | 'entity.contextRef.forbidden'
  | 'entity.contextRef.unresolved'
  | 'entity.contextRef.notContext'
  | 'entity.parentContextRef.cycle'
  | 'entity.contextRoots.missing'
  | 'entity.contextRoots.contractCount'
  | 'entity.contextRoots.foreign'
  | 'entity.responsibleRole.missing'
  | 'entity.responsibleRole.unresolved'
  | 'entity.responsibleRole.notPartyRole'
  | 'entity.responsibleRole.foreign'
  | 'entity.roleRefs.missing'
  | 'entity.roleRefs.count'
  | 'entity.roleRefs.unresolved'
  | 'entity.roleRefs.notPartyRole'
  | 'entity.roleRefs.foreign'
  | 'entity.roleResponsibility.forbidden'
  | 'entity.evidenceContext.kind'
  | 'entity.contract.rootMissing'
  | 'entity.participantParty.contextRef'
  | 'entity.domainRole.thingOnly'
  | 'attribute.shape'
  | 'attribute.name'
  | 'attribute.duplicate'
  | 'attribute.derivedByRuleRef.unresolved'
  | 'attribute.time.missing'
  | 'attribute.time.notKeyTimestamp'
  | 'relationship.shape'
  | 'relationship.endpoint.unresolved'
  | 'relationship.self'
  | 'relationship.cardinality'
  | 'relationship.contractPair'
  | 'relationship.playsRole.endpoints'
  | 'relationship.references.endpoints'
  | 'relationship.references.crossContext'
  | 'rule.shape'
  | 'rule.contextRef.unresolved'
  | 'rule.resultType'
  | 'rule.target.forbidden'
  | 'rule.target.required'
  | 'rule.target.unresolved'
  | 'rule.binding.unresolved'
  | 'rule.derivation.mismatch'
  | 'rule.derivation.context';

export interface ValidationIssue {
  code: ValidationCode;
  /** JSON-pointer-like location such as `entities[3].attributes[1].name`. */
  path: string;
  message: string;
  /** Stable id of the object that owns the finding, when one exists. */
  objectId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface IssueInput {
  code: ValidationCode;
  path: string;
  message: string;
  objectId?: string;
}

export function createIssue(input: IssueInput): ValidationIssue {
  const issue: ValidationIssue = {
    code: input.code,
    path: input.path,
    message: input.message,
  };

  if (input.objectId !== undefined) {
    issue.objectId = input.objectId;
  }

  return issue;
}

export function issueKey(issue: ValidationIssue): string {
  return `${issue.code}\u0000${issue.path}\u0000${issue.message}`;
}

export function dedupeIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const result: ValidationIssue[] = [];

  for (const issue of issues) {
    const key = issueKey(issue);

    if (!seen.has(key)) {
      seen.add(key);
      result.push(issue);
    }
  }

  return result;
}

export function formatIssue(issue: ValidationIssue): string {
  return `${issue.path}: [${issue.code}] ${issue.message}`;
}

/** Thrown by {@link assertValidDomainModel} when static checks fail. */
export class DomainModelValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    const [first] = issues;
    super(
      first === undefined
        ? 'Domain model is invalid.'
        : `${issues.length} domain model issue(s); first: ${formatIssue(first)}`,
    );
    this.name = 'DomainModelValidationError';
    this.issues = [...issues];
  }
}

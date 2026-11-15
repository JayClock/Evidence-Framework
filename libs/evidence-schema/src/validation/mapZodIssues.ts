import type { ZodIssue } from 'zod';
import {
  createIssue,
  type ValidationCode,
  type ValidationIssue,
} from './errors.js';

type Path = (string | number)[];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Array positions stay visible to CLI/disk adapters; objectId is for UI selection. */
const formatPath = (path: Path): string =>
  path.reduce<string>(
    (result, part) =>
      typeof part === 'number'
        ? `${result}[${part}]`
        : result
          ? `${result}.${part}`
          : part,
    '',
  ) || '$';

const structuralCode = (
  issue: ZodIssue,
  path: Path,
  owner: Record<string, unknown> | undefined,
): ValidationCode => {
  const [collection] = path;
  const field = path[2];
  if (path.length === 0 || (path.length === 1 && collection !== 'manifest'))
    return 'document.shape';
  if (collection === 'manifest')
    return path.length === 1 && issue.code !== 'unrecognized_keys'
      ? 'document.shape'
      : 'manifest.field';
  if (path.length === 2 && issue.code !== 'unrecognized_keys')
    return 'collection.item';
  if (field === 'type') return 'collection.item';
  if (field === 'id') return 'id.invalid';

  if (collection === 'entities') {
    if (field === 'attributes')
      return path.at(-1) === 'name'
        ? 'attribute.name'
        : path.at(-1) === 'derivedByRuleRef'
          ? 'attribute.derivedByRuleRef.unresolved'
          : 'attribute.shape';
    if (field === 'examples') return 'entity.shape';
    if (field === 'category') return 'entity.category';
    if (field === 'kind') return 'entity.kind';
    if (field === 'domainRole')
      return owner?.category === 'participant'
        ? 'entity.kind'
        : 'entity.domainRole.thingOnly';
    if (field === 'label') return 'label.missing';
    if (field === 'contextRef') {
      if (owner?.category === 'context') return 'entity.contextRef.forbidden';
      if (owner?.category === 'participant' && owner.kind === 'party')
        return 'entity.participantParty.contextRef';
      return issue.code === 'invalid_type' && issue.received === 'undefined'
        ? 'entity.contextRef.missing'
        : 'entity.contextRef.unresolved';
    }
    if (field === 'parentContextRef') return 'entity.contextRef.unresolved';
    if (field === 'rootRefs') return 'entity.contextRoots.missing';
    if (field === 'responsibleRoleRef' || field === 'roleRefs') {
      if (owner?.category === 'role')
        return 'entity.roleResponsibility.forbidden';
      return field === 'responsibleRoleRef'
        ? 'entity.responsibleRole.unresolved'
        : 'entity.roleRefs.missing';
    }
    return issue.code === 'unrecognized_keys'
      ? 'entity.unknownField'
      : 'entity.shape';
  }
  if (collection === 'relationships') {
    if (field === 'sourceCardinality' || field === 'targetCardinality')
      return 'relationship.cardinality';
    return issue.code === 'unrecognized_keys'
      ? 'entity.unknownField'
      : 'relationship.shape';
  }
  if (collection === 'rules') {
    if (field === 'resultType') return 'rule.resultType';
    if (field === 'target') return 'rule.target.unresolved';
    if (field === 'contextRef') return 'rule.contextRef.unresolved';
    return issue.code === 'unrecognized_keys' && path.length === 3
      ? 'entity.unknownField'
      : 'rule.shape';
  }
  return 'document.shape';
};

/** Keep the business diagnostic contract separate from Zod's versioned issue codes. */
export const mapZodIssues = (
  issues: readonly ZodIssue[],
  input: unknown,
): ValidationIssue[] =>
  issues.flatMap((issue) => {
    const params =
      issue.code === 'custom'
        ? (issue.params as
            | { validationCode?: ValidationCode; objectId?: string }
            | undefined)
        : undefined;
    const items = record(input) ? input[String(issue.path[0])] : undefined;
    const candidate: unknown =
      Array.isArray(items) && typeof issue.path[1] === 'number'
        ? items[issue.path[1]]
        : undefined;
    const owner = record(candidate) ? candidate : undefined;
    const paths =
      issue.code === 'unrecognized_keys'
        ? issue.keys.map((key) => [...issue.path, key])
        : [issue.path];
    return paths.map((path) =>
      createIssue({
        code: params?.validationCode ?? structuralCode(issue, path, owner),
        path: path.length === 1 ? `$.${formatPath(path)}` : formatPath(path),
        message: issue.message,
        objectId:
          params?.objectId ??
          (typeof owner?.id === 'string' ? owner.id : undefined),
      }),
    );
  });

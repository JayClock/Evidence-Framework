import type {
  EntityAST,
  EvidenceEntityAST,
  RelationshipAST,
  RuleAST,
} from '@evidence-poc/evidence-schema';

import type { BindDerivedRuleInput } from './derivationCommands.js';
import { BindDerivedRuleCommand } from './derivationCommands.js';
import {
  CreateContractCommand,
  CreateEntityCommand,
  DeleteEntityCommand,
  ReplaceContextRootsCommand,
  UpdateEntityCommand,
  type DeleteEntityOptions,
} from './entityCommands.js';
import {
  CreateFulfillmentPairCommand,
  type CreateFulfillmentPairInput,
} from './fulfillmentCommands.js';
import {
  CreateRelationshipCommand,
  DeleteRelationshipCommand,
} from './relationshipCommands.js';
import {
  CreateRuleCommand,
  DeleteRuleCommand,
  UpdateRuleCommand,
  type DeleteRuleOptions,
} from './ruleCommands.js';
import type { ModelCommand } from './types.js';

/**
 * A command written as plain JSON.
 *
 * Agents cannot ship class instances across IPC, so every edit travels as one
 * of these descriptions and is decoded back into a real command before it
 * reaches `ModelSession`. That keeps undo, guards and static checks identical
 * for human and agent edits.
 */
export type ModelPatchCommand =
  | { type: 'create-entity'; entity: EntityAST; index?: number }
  | { type: 'create-contract'; entity: EvidenceEntityAST }
  | {
      type: 'update-entity';
      entityId: string;
      patch: Readonly<Partial<EntityAST>>;
    }
  | {
      type: 'delete-entity';
      entityId: string;
      options?: DeleteEntityOptions;
    }
  | {
      type: 'replace-context-roots';
      contextId: string;
      rootRefs?: readonly string[];
    }
  | {
      type: 'create-relationship';
      relationship: RelationshipAST;
      index?: number;
    }
  | { type: 'delete-relationship'; relationshipId: string }
  | { type: 'create-rule'; rule: RuleAST; index?: number }
  | { type: 'update-rule'; ruleId: string; patch: Readonly<Partial<RuleAST>> }
  | { type: 'delete-rule'; ruleId: string; options?: DeleteRuleOptions }
  | { type: 'bind-derived-rule'; input: BindDerivedRuleInput }
  | { type: 'create-fulfillment-pair'; input: CreateFulfillmentPairInput };

/** Stable failure reasons for a malformed patch description. */
export type ModelPatchErrorCode =
  | 'patch.notArray'
  | 'patch.notObject'
  | 'patch.unknownType'
  | 'patch.missingField';

export class ModelPatchError extends Error {
  readonly code: ModelPatchErrorCode;
  readonly path: string;

  constructor(code: ModelPatchErrorCode, path: string, message: string) {
    super(message);
    this.name = 'ModelPatchError';
    this.code = code;
    this.path = path;
  }
}

const recordAt = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ModelPatchError(
      'patch.notObject',
      path,
      `${path} must be a JSON object.`,
    );
  }

  return value as Record<string, unknown>;
};

const requireField = <T>(
  source: Record<string, unknown>,
  field: string,
  path: string,
): T => {
  const value = source[field];

  if (value === undefined) {
    throw new ModelPatchError(
      'patch.missingField',
      `${path}.${field}`,
      `${path}.${field} is required.`,
    );
  }

  return value as T;
};

const optionalField = <T>(
  source: Record<string, unknown>,
  field: string,
): T | undefined => source[field] as T | undefined;

/**
 * Decodes one patch description into a command.
 *
 * Only the shape is checked here; identity, reference and red-line rules stay
 * with the command guards and `strictValidateDomainModel`.
 */
export const decodeModelPatchCommand = (
  input: unknown,
  path = 'commands[0]',
): ModelCommand<unknown> => {
  const command = recordAt(input, path);
  const type = requireField<string>(command, 'type', path);

  switch (type) {
    case 'create-entity':
      return new CreateEntityCommand(
        requireField<EntityAST>(command, 'entity', path),
        optionalField<number>(command, 'index'),
      );
    case 'create-contract':
      return new CreateContractCommand(
        requireField<EvidenceEntityAST>(command, 'entity', path),
      );
    case 'update-entity':
      return new UpdateEntityCommand(
        requireField<string>(command, 'entityId', path),
        requireField<Readonly<Partial<EntityAST>>>(command, 'patch', path),
      );
    case 'delete-entity':
      return new DeleteEntityCommand(
        requireField<string>(command, 'entityId', path),
        command.options === undefined
          ? {}
          : (command.options as DeleteEntityOptions),
      );
    case 'replace-context-roots':
      return new ReplaceContextRootsCommand(
        requireField<string>(command, 'contextId', path),
        optionalField<readonly string[]>(command, 'rootRefs'),
      );
    case 'create-relationship':
      return new CreateRelationshipCommand(
        requireField<RelationshipAST>(command, 'relationship', path),
        optionalField<number>(command, 'index'),
      );
    case 'delete-relationship':
      return new DeleteRelationshipCommand(
        requireField<string>(command, 'relationshipId', path),
      );
    case 'create-rule':
      return new CreateRuleCommand(
        requireField<RuleAST>(command, 'rule', path),
        optionalField<number>(command, 'index'),
      );
    case 'update-rule':
      return new UpdateRuleCommand(
        requireField<string>(command, 'ruleId', path),
        requireField<Readonly<Partial<RuleAST>>>(command, 'patch', path),
      );
    case 'delete-rule':
      return new DeleteRuleCommand(
        requireField<string>(command, 'ruleId', path),
        command.options === undefined
          ? {}
          : (command.options as DeleteRuleOptions),
      );
    case 'bind-derived-rule':
      return new BindDerivedRuleCommand(
        requireField<BindDerivedRuleInput>(command, 'input', path),
      );
    case 'create-fulfillment-pair':
      return new CreateFulfillmentPairCommand(
        requireField<CreateFulfillmentPairInput>(command, 'input', path),
      );
    default:
      throw new ModelPatchError(
        'patch.unknownType',
        `${path}.type`,
        `${path}.type '${type}' is not a supported model command.`,
      );
  }
};

/** Decodes a whole patch, keeping the reported path of the failing command. */
export const decodeModelPatch = (
  input: unknown,
): readonly ModelCommand<unknown>[] => {
  if (!Array.isArray(input)) {
    throw new ModelPatchError(
      'patch.notArray',
      'commands',
      'commands must be an array.',
    );
  }

  return input.map((command, index) =>
    decodeModelPatchCommand(command, `commands[${index}]`),
  );
};

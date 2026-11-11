import {
  type AttributeAST,
  type ContextEntityAST,
  type DomainModelDocument,
  type EntityAST,
  type EvidenceEntityAST,
  isAttributeName,
  isContextEntity,
  isContractEntity,
  isDomainId,
  isEvidenceEntity,
  isPartyRole,
  type RoleEntityAST,
} from '@evidence-poc/evidence-schema';

import { CommandErrorCode, ModelCommandError } from './types.js';

export function fail(
  code: CommandErrorCode,
  message: string,
  details: readonly string[] = [],
): never {
  throw new ModelCommandError(code, message, details);
}

export const assertId = (id: string): void => {
  if (!isDomainId(id)) {
    fail('id.invalid', `'${id}' does not match the FM identifier grammar.`);
  }
};

export const assertAttributeName = (name: string): void => {
  if (!isAttributeName(name)) {
    fail('attribute.notFound', `'${name}' must use lower snake_case.`);
  }
};

export const assertUniqueId = (
  document: DomainModelDocument,
  id: string,
): void => {
  const taken =
    document.entities.some((entity) => entity.id === id) ||
    document.relationships.some((relationship) => relationship.id === id) ||
    document.rules.some((rule) => rule.id === id);

  if (taken) {
    fail('id.duplicate', `id '${id}' is already used by another model source.`);
  }
};

export const requireEntity = (
  document: DomainModelDocument,
  entityId: string,
): EntityAST => {
  const entity = document.entities.find((item) => item.id === entityId);

  return entity ?? fail('entity.notFound', `unknown entity '${entityId}'.`);
};

export const requireContext = (
  document: DomainModelDocument,
  contextId: string,
): ContextEntityAST => {
  const context = requireEntity(document, contextId);

  return isContextEntity(context)
    ? context
    : fail('context.notFound', `'${contextId}' is not a Context.`);
};

export const requireContractContext = (
  document: DomainModelDocument,
  contextId: string,
): ContextEntityAST => {
  const context = requireContext(document, contextId);

  return context.kind === 'contract'
    ? context
    : fail('context.notContract', `'${contextId}' is not a Contract Context.`);
};

/** Enforces the root Contract of a Contract Context, the responsibility anchor. */
export const requireRootContract = (
  document: DomainModelDocument,
  contextId: string,
): EvidenceEntityAST => {
  const context = requireContractContext(document, contextId);
  const contracts = (context.rootRefs ?? [])
    .map((ref) => document.entities.find((entity) => entity.id === ref))
    .filter(isContractEntity);

  if (contracts.length !== 1) {
    fail(
      'context.rootMissing',
      `Contract Context '${contextId}' requires exactly one root Contract.`,
    );
  }

  return contracts[0];
};

export const requirePartyRole = (
  document: DomainModelDocument,
  roleId: string,
): RoleEntityAST => {
  const role = requireEntity(document, roleId);

  return isPartyRole(role)
    ? role
    : fail('role.notParty', `'${roleId}' must be a Party Role.`);
};

/** The responsible role of an evidence moment must be bound by the root Contract. */
export const requireRoleBoundByContract = (
  document: DomainModelDocument,
  contextId: string,
  roleId: string,
): void => {
  const contract = requireRootContract(document, contextId);
  const boundRoles = contract.roleRefs ?? [];

  if (!boundRoles.includes(roleId)) {
    fail(
      'role.notBound',
      `Role '${roleId}' is not bound by Contract '${contract.id}'.`,
      boundRoles,
    );
  }

  const role = requirePartyRole(document, roleId);

  if (role.contextRef !== contextId) {
    fail(
      'role.notBound',
      `Role '${roleId}' must belong to Contract Context '${contextId}'.`,
    );
  }
};

export const requireAttribute = (
  entity: EntityAST,
  attributeName: string,
): AttributeAST => {
  const attribute = entity.attributes?.find(
    (candidate) => candidate.name === attributeName,
  );

  return (
    attribute ??
    fail(
      'attribute.notFound',
      `entity '${entity.id}' has no attribute '${attributeName}'.`,
    )
  );
};

const CONTEXT_KIND_BY_EVIDENCE: Record<string, string> = {
  rfp: 'pre_contract',
  proposal: 'pre_contract',
  contract: 'contract',
  fulfillment_request: 'contract',
  fulfillment_confirmation: 'contract',
};

/** Category-specific guards that keep an inserted object well formed. */
export const assertEntityInsertable = (
  document: DomainModelDocument,
  entity: EntityAST,
): void => {
  assertId(entity.id);
  assertUniqueId(document, entity.id);

  switch (entity.category) {
    case 'context':
      if (entity.parentContextRef !== undefined) {
        requireContext(document, entity.parentContextRef);
      }

      return;

    case 'participant':
      if (entity.kind === 'party') {
        if (entity.contextRef !== undefined) {
          fail(
            'participant.contextRef',
            'Participant Party must stay outside every Context.',
          );
        }

        return;
      }

      if (entity.contextRef === undefined) {
        fail('participant.contextRef', 'Participant Thing requires contextRef.');
      }

      if (requireContext(document, entity.contextRef).kind !== 'domain') {
        fail(
          'context.notDomain',
          'Participant Thing must belong to a Domain Context.',
        );
      }

      return;

    case 'role':
      requireContext(document, entity.contextRef);

      return;

    case 'evidence':
      assertEvidenceInsertable(document, entity);

      return;
  }
};

const assertEvidenceInsertable = (
  document: DomainModelDocument,
  entity: EvidenceEntityAST,
): void => {
  const context = requireContext(document, entity.contextRef);
  const expectedKind = CONTEXT_KIND_BY_EVIDENCE[entity.kind];

  if (expectedKind !== undefined && context.kind !== expectedKind) {
    fail(
      'context.responsibility',
      `${entity.kind} must belong to a ${expectedKind} Context.`,
    );
  }

  if (entity.kind === 'contract') {
    const roleRefs = entity.roleRefs ?? [];

    if (roleRefs.length !== 2 || new Set(roleRefs).size !== 2) {
      fail(
        'role.notParty',
        'Contract requires exactly two distinct Party Roles.',
      );
    }

    for (const roleRef of roleRefs) {
      requirePartyRole(document, roleRef);
    }

    return;
  }

  if (entity.responsibleRoleRef === undefined) {
    fail(
      'context.responsibility',
      `${entity.kind} requires responsibleRoleRef provided by the contract parties.`,
    );
  }

  requirePartyRole(document, entity.responsibleRoleRef);
};

export const isEvidenceWithContract = (
  entity: EntityAST,
): entity is EvidenceEntityAST =>
  isEvidenceEntity(entity) &&
  (entity.kind === 'fulfillment_request' ||
    entity.kind === 'fulfillment_confirmation' ||
    entity.kind === 'contract');

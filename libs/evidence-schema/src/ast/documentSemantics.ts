import type { RefinementCtx } from 'zod';

import {
  EVIDENCE_TIME_ATTRIBUTE_NAMES,
  REQUIRED_EVIDENCE_TIME_ATTRIBUTES,
  type ContextEntityAST,
  type EntityAST,
  type EvidenceEntityAST,
  isContextEntity,
} from './entity.js';
import type { DomainModelDocument } from './document.js';
import { type RuleAST } from './rule.js';
import { type ValidationCode } from '../validation/errors.js';

interface IndexedEntity {
  value: EntityAST;
  position: number;
}

interface ModelIndex {
  entities: Map<string, IndexedEntity>;
  rules: Map<string, RuleAST>;
}

type Path = (string | number)[];

const addIssue = (
  ctx: RefinementCtx,
  code: ValidationCode,
  path: Path,
  message: string,
  objectId?: string,
): void => {
  ctx.addIssue({
    code: 'custom',
    path,
    message,
    params: { validationCode: code, ...(objectId ? { objectId } : {}) },
  });
};

const entityPath = (index: ModelIndex, id: string): Path => {
  const position = index.entities.get(id)?.position;
  return position === undefined ? ['entities'] : ['entities', position];
};

const entityOf = (
  index: ModelIndex,
  ref: string | undefined,
): EntityAST | undefined =>
  ref === undefined ? undefined : index.entities.get(ref)?.value;

const signatureOf = (entity: EntityAST | undefined): string =>
  entity === undefined ? '' : `${entity.category}.${entity.kind}`;

const ownerContextOf = (entity: EntityAST | undefined): string | undefined =>
  entity?.category === 'context' ? entity.id : entity?.contextRef;

const contextOf = (
  index: ModelIndex,
  entity: EntityAST,
): ContextEntityAST | undefined => {
  const ref = entity.category === 'context' ? undefined : entity.contextRef;
  const context = entityOf(index, ref);
  return isContextEntity(context) ? context : undefined;
};

const rootContractOf = (
  context: ContextEntityAST | undefined,
  index: ModelIndex,
): EvidenceEntityAST | undefined => {
  if (context?.kind !== 'contract') return undefined;

  const roots = context.rootRefs ?? [];
  if (roots.length !== 1) return undefined;
  const root = entityOf(index, roots[0]);
  return root?.category === 'evidence' && root.kind === 'contract'
    ? root
    : undefined;
};

const validateExamples = (
  entity: EntityAST,
  position: number,
  ctx: RefinementCtx,
): void => {
  const labels = new Set<string>();
  for (const [exampleIndex, example] of (entity.examples ?? []).entries()) {
    const path = ['entities', position, 'examples', exampleIndex] as Path;
    if (labels.has(example.label)) {
      addIssue(
        ctx,
        'entity.shape',
        [...path, 'label'],
        `duplicate example label '${example.label}'.`,
        entity.id,
      );
    }
    labels.add(example.label);

    if (example.test !== undefined && entity.category !== 'evidence') {
      addIssue(
        ctx,
        'entity.shape',
        [...path, 'test'],
        'only evidence examples can define acceptance tests',
        entity.id,
      );
    }
  }
};

const validateAttributes = (
  entity: EntityAST,
  position: number,
  index: ModelIndex,
  ctx: RefinementCtx,
): void => {
  const seen = new Set<string>();
  for (const [attributeIndex, attribute] of (
    entity.attributes ?? []
  ).entries()) {
    const path = ['entities', position, 'attributes', attributeIndex] as Path;
    if (seen.has(attribute.name)) {
      addIssue(
        ctx,
        'attribute.duplicate',
        [...path, 'name'],
        `duplicate attribute name '${attribute.name}'.`,
        entity.id,
      );
    }
    seen.add(attribute.name);

    if (
      (EVIDENCE_TIME_ATTRIBUTE_NAMES as readonly string[]).includes(
        attribute.name,
      ) &&
      (attribute.valueType !== 'timestamp' ||
        attribute.required !== true ||
        attribute.keyData !== true)
    ) {
      addIssue(
        ctx,
        'attribute.time.notKeyTimestamp',
        path,
        `attribute '${attribute.name}' must be a required keyData timestamp.`,
        entity.id,
      );
    }

    if (
      attribute.derivedByRuleRef !== undefined &&
      !index.rules.has(attribute.derivedByRuleRef)
    ) {
      addIssue(
        ctx,
        'attribute.derivedByRuleRef.unresolved',
        [...path, 'derivedByRuleRef'],
        `unknown derivedByRuleRef '${attribute.derivedByRuleRef}'.`,
        entity.id,
      );
    }
  }

  if (entity.category !== 'evidence') return;
  for (const requiredName of REQUIRED_EVIDENCE_TIME_ATTRIBUTES[entity.kind]) {
    if (!seen.has(requiredName)) {
      addIssue(
        ctx,
        'attribute.time.missing',
        ['entities', position, 'attributes'],
        `${entity.kind} requires explicit time attribute '${requiredName}'.`,
        entity.id,
      );
    }
  }
};

const validateContextEntity = (
  entity: ContextEntityAST,
  position: number,
  index: ModelIndex,
  ctx: RefinementCtx,
): void => {
  const path = ['entities', position] as Path;
  if (
    entity.parentContextRef !== undefined &&
    !isContextEntity(entityOf(index, entity.parentContextRef))
  ) {
    addIssue(
      ctx,
      'entity.contextRef.unresolved',
      [...path, 'parentContextRef'],
      `parentContextRef '${entity.parentContextRef}' must reference a Context.`,
      entity.id,
    );
  }

  const roots = entity.rootRefs;
  if (
    (entity.kind === 'contract' || entity.kind === 'domain') &&
    (!roots || roots.length === 0)
  ) {
    addIssue(
      ctx,
      'entity.contextRoots.missing',
      [...path, 'rootRefs'],
      `${entity.kind} Context must declare rootRefs with real content.`,
      entity.id,
    );
    return;
  }
  if (roots === undefined) return;

  if (entity.kind === 'contract') {
    const contractRoots = roots.filter(
      (ref) => signatureOf(entityOf(index, ref)) === 'evidence.contract',
    );
    if (roots.length !== 1 || contractRoots.length !== 1) {
      addIssue(
        ctx,
        'entity.contextRoots.contractCount',
        [...path, 'rootRefs'],
        'Contract Context must have exactly one root Contract.',
        entity.id,
      );
    }
  }

  for (const ref of roots) {
    const target = entityOf(index, ref);
    if (target === undefined) {
      addIssue(
        ctx,
        'relationship.endpoint.unresolved',
        [...path, 'rootRefs'],
        `rootRefs contains unknown id '${ref}'.`,
        entity.id,
      );
    } else if (ownerContextOf(target) !== entity.id) {
      addIssue(
        ctx,
        'entity.contextRoots.foreign',
        [...path, 'rootRefs'],
        `root '${ref}' must belong to this Context.`,
        entity.id,
      );
    }
  }
};

const validateEvidenceResponsibility = (
  entity: EvidenceEntityAST,
  position: number,
  context: ContextEntityAST | undefined,
  index: ModelIndex,
  ctx: RefinementCtx,
): void => {
  const path = ['entities', position, 'responsibleRoleRef'] as Path;
  if (entity.responsibleRoleRef === undefined) {
    addIssue(
      ctx,
      'entity.responsibleRole.missing',
      path,
      'non-contract Evidence requires responsibleRoleRef.',
      entity.id,
    );
    return;
  }

  const role = entityOf(index, entity.responsibleRoleRef);
  if (role === undefined) {
    addIssue(
      ctx,
      'entity.responsibleRole.unresolved',
      path,
      `unknown responsibleRoleRef '${entity.responsibleRoleRef}'.`,
      entity.id,
    );
    return;
  }
  if (signatureOf(role) !== 'role.party') {
    addIssue(
      ctx,
      'entity.responsibleRole.notPartyRole',
      path,
      `responsibleRoleRef '${entity.responsibleRoleRef}' must reference a Party Role.`,
      entity.id,
    );
    return;
  }

  const parent = entityOf(index, context?.parentContextRef);
  const owner =
    context?.kind === 'pre_contract' &&
    parent?.category === 'context' &&
    parent.kind === 'contract'
      ? parent
      : context;
  const expectedContext = owner?.id ?? entity.contextRef;
  if (ownerContextOf(role) !== expectedContext) {
    addIssue(
      ctx,
      'entity.responsibleRole.foreign',
      path,
      `responsible Role '${entity.responsibleRoleRef}' must belong to Context '${String(expectedContext)}'.`,
      entity.id,
    );
    return;
  }

  const contract = rootContractOf(owner, index);
  if (
    owner?.kind === 'contract' &&
    contract &&
    !contract.roleRefs?.includes(entity.responsibleRoleRef)
  ) {
    addIssue(
      ctx,
      'entity.responsibleRole.foreign',
      path,
      `responsible Role '${entity.responsibleRoleRef}' must be bound by Contract '${contract.id}'.`,
      entity.id,
    );
  }
};

const validateContractEntity = (
  entity: EvidenceEntityAST,
  position: number,
  context: ContextEntityAST | undefined,
  index: ModelIndex,
  ctx: RefinementCtx,
): void => {
  const path = ['entities', position] as Path;
  if (context?.kind !== 'contract') {
    addIssue(
      ctx,
      'entity.evidenceContext.kind',
      [...path, 'contextRef'],
      'Contract must belong to a Contract Context.',
      entity.id,
    );
  }
  if (!context?.rootRefs?.includes(entity.id)) {
    addIssue(
      ctx,
      'entity.contract.rootMissing',
      [...path, 'contextRef'],
      'Contract must be listed in the rootRefs of its Context.',
      entity.id,
    );
  }

  const roleRefs = entity.roleRefs;
  if (roleRefs === undefined) {
    addIssue(
      ctx,
      'entity.roleRefs.missing',
      [...path, 'roleRefs'],
      'Contract requires exactly two distinct contextual Party Roles.',
      entity.id,
    );
    return;
  }
  if (new Set(roleRefs).size !== 2 || roleRefs.length !== 2) {
    addIssue(
      ctx,
      'entity.roleRefs.count',
      [...path, 'roleRefs'],
      'Contract requires exactly two distinct Party Roles.',
      entity.id,
    );
  }
  for (const ref of roleRefs) {
    const role = entityOf(index, ref);
    if (role === undefined) {
      addIssue(
        ctx,
        'entity.roleRefs.unresolved',
        [...path, 'roleRefs'],
        `unknown roleRef '${ref}'.`,
        entity.id,
      );
    } else if (signatureOf(role) !== 'role.party') {
      addIssue(
        ctx,
        'entity.roleRefs.notPartyRole',
        [...path, 'roleRefs'],
        `roleRef '${ref}' must reference a Party Role.`,
        entity.id,
      );
    } else if (ownerContextOf(role) !== entity.contextRef) {
      addIssue(
        ctx,
        'entity.roleRefs.foreign',
        [...path, 'roleRefs'],
        `Party Role '${ref}' must belong to the Contract Context.`,
        entity.id,
      );
    }
  }
};

const validateEntities = (
  document: DomainModelDocument,
  index: ModelIndex,
  ctx: RefinementCtx,
): void => {
  for (const [position, entity] of document.entities.entries()) {
    validateExamples(entity, position, ctx);
    validateAttributes(entity, position, index, ctx);

    if (entity.category === 'context') {
      validateContextEntity(entity, position, index, ctx);
      continue;
    }

    const path = ['entities', position] as Path;
    const context = contextOf(index, entity);
    const needsContext =
      entity.category === 'evidence' ||
      entity.category === 'role' ||
      (entity.category === 'participant' && entity.kind === 'thing');

    if (needsContext && entity.contextRef === undefined) {
      addIssue(
        ctx,
        'entity.contextRef.missing',
        [...path, 'contextRef'],
        `${entity.category} requires contextRef.`,
        entity.id,
      );
    } else if (
      needsContext &&
      entityOf(index, entity.contextRef) === undefined
    ) {
      addIssue(
        ctx,
        'entity.contextRef.unresolved',
        [...path, 'contextRef'],
        `unknown contextRef '${entity.contextRef}'.`,
        entity.id,
      );
    } else if (needsContext && context === undefined) {
      addIssue(
        ctx,
        'entity.contextRef.notContext',
        [...path, 'contextRef'],
        `contextRef '${entity.contextRef}' must reference a Context.`,
        entity.id,
      );
    }

    if (
      entity.category === 'participant' &&
      entity.kind === 'party' &&
      entity.contextRef !== undefined
    ) {
      addIssue(
        ctx,
        'entity.participantParty.contextRef',
        [...path, 'contextRef'],
        'Participant Party must stay outside every Context.',
        entity.id,
      );
    }
    if (
      entity.category === 'participant' &&
      entity.domainRole !== undefined &&
      entity.kind !== 'thing'
    ) {
      addIssue(
        ctx,
        'entity.domainRole.thingOnly',
        [...path, 'domainRole'],
        'Only a Participant Thing may stand for a domain calculator or checker.',
        entity.id,
      );
    }

    if (
      entity.category === 'evidence' &&
      entity.asyncAcceptance === true &&
      entity.kind !== 'fulfillment_request'
    ) {
      addIssue(
        ctx,
        'entity.shape',
        [...path, 'asyncAcceptance'],
        'Only a fulfillment request may be accepted for asynchronous processing.',
        entity.id,
      );
    }
    if (
      entity.category === 'evidence' &&
      entity.callbackRoleRefs !== undefined
    ) {
      const seen = new Set<string>();
      for (const [i, ref] of entity.callbackRoleRefs.entries()) {
        const role = entityOf(index, ref);
        if (
          entity.kind !== 'fulfillment_confirmation' ||
          signatureOf(role) !== 'role.third_party' ||
          ownerContextOf(role) !== entity.contextRef ||
          seen.has(ref)
        ) {
          addIssue(
            ctx,
            'entity.shape',
            [...path, 'callbackRoleRefs', i],
            'Callback roles are unique third-party roles in the confirmation Context.',
            entity.id,
          );
        }
        seen.add(ref);
      }
    }
    if (entity.category === 'evidence' && entity.kind === 'contract') {
      validateContractEntity(entity, position, context, index, ctx);
      continue;
    }

    if (entity.category === 'evidence') {
      validateEvidenceResponsibility(entity, position, context, index, ctx);
      if (
        (entity.kind === 'fulfillment_request' ||
          entity.kind === 'fulfillment_confirmation') &&
        context?.kind !== 'contract'
      ) {
        addIssue(
          ctx,
          'entity.evidenceContext.kind',
          [...path, 'contextRef'],
          `${entity.kind} must belong to a Contract Context.`,
          entity.id,
        );
      }
      if (entity.kind === 'other_evidence' && context === undefined) {
        addIssue(
          ctx,
          'entity.evidenceContext.kind',
          [...path, 'contextRef'],
          'other_evidence must belong to a Contract, Pre-contract or Domain Context.',
          entity.id,
        );
      }
      if (
        (entity.kind === 'rfp' || entity.kind === 'proposal') &&
        context?.kind !== 'pre_contract'
      ) {
        addIssue(
          ctx,
          'entity.evidenceContext.kind',
          [...path, 'contextRef'],
          `${entity.kind} must belong to a Pre-contract Context.`,
          entity.id,
        );
      }
    }
    if (
      entity.category === 'participant' &&
      entity.kind === 'thing' &&
      context !== undefined &&
      context.kind !== 'domain'
    ) {
      addIssue(
        ctx,
        'entity.evidenceContext.kind',
        [...path, 'contextRef'],
        'Participant Thing must belong to a Domain Context.',
        entity.id,
      );
    }
  }

  for (const [entityId, indexed] of index.entities) {
    if (!isContextEntity(indexed.value)) continue;
    const seen = new Set<string>();
    let current: string | undefined = entityId;
    while (current !== undefined) {
      if (seen.has(current)) {
        addIssue(
          ctx,
          'entity.parentContextRef.cycle',
          [...entityPath(index, entityId), 'parentContextRef'],
          'Context parentContextRef chain cycles.',
          entityId,
        );
        break;
      }
      seen.add(current);
      const context = entityOf(index, current);
      current =
        context?.category === 'context' ? context.parentContextRef : undefined;
    }
  }
};

const PLAYS_ROLE_PAIRS = new Set([
  'participant.party>role.party',
  'participant.party>role.third_party',
  'participant.thing>role.domain',
]);

const isMomentEvidence = (entity: EntityAST | undefined): boolean =>
  entity?.category === 'evidence' &&
  ['fulfillment_confirmation', 'other_evidence', 'contract'].includes(
    entity.kind,
  );

const isPlaysRolePair = (source: EntityAST, target: EntityAST): boolean =>
  PLAYS_ROLE_PAIRS.has(`${signatureOf(source)}>${signatureOf(target)}`) ||
  (source.category === 'context' && signatureOf(target) === 'role.context') ||
  (isMomentEvidence(source) && signatureOf(target) === 'role.evidence');

const validateRelationships = (
  document: DomainModelDocument,
  index: ModelIndex,
  ctx: RefinementCtx,
): void => {
  for (const [position, relationship] of document.relationships.entries()) {
    const path = ['relationships', position] as Path;
    const source = entityOf(index, relationship.sourceRef);
    const target = entityOf(index, relationship.targetRef);
    if (source === undefined) {
      addIssue(
        ctx,
        'relationship.endpoint.unresolved',
        [...path, 'sourceRef'],
        `unknown sourceRef '${relationship.sourceRef}'.`,
        relationship.id,
      );
    }
    if (target === undefined) {
      addIssue(
        ctx,
        'relationship.endpoint.unresolved',
        [...path, 'targetRef'],
        `unknown targetRef '${relationship.targetRef}'.`,
        relationship.id,
      );
    }
    if (source === undefined || target === undefined) continue;
    if (relationship.sourceRef === relationship.targetRef) {
      addIssue(
        ctx,
        'relationship.self',
        path,
        'self relationships are not allowed.',
        relationship.id,
      );
      continue;
    }
    if (
      signatureOf(source) === 'evidence.contract' &&
      signatureOf(target) === 'evidence.contract'
    ) {
      addIssue(
        ctx,
        'relationship.contractPair',
        path,
        'Contract must not connect directly to Contract.',
        relationship.id,
      );
      continue;
    }

    if (relationship.kind === 'plays_role') {
      if (!isPlaysRolePair(source, target)) {
        if (
          source.category === 'evidence' &&
          !isMomentEvidence(source) &&
          signatureOf(target) === 'role.evidence'
        ) {
          addIssue(
            ctx,
            'relationship.playsRole.momentOnly',
            path,
            `Evidence Role '${target.label}' can only be played by a moment Evidence; '${source.label}' is an interval.`,
            relationship.id,
          );
        } else {
          addIssue(
            ctx,
            'relationship.playsRole.endpoints',
            path,
            'invalid plays_role direction or endpoint types.',
            relationship.id,
          );
        }
      } else if (
        source.category === 'evidence' &&
        signatureOf(target) === 'role.evidence' &&
        ownerContextOf(source) === ownerContextOf(target)
      ) {
        addIssue(
          ctx,
          'relationship.playsRole.endpoints',
          path,
          'Evidence Role player must come from another Context.',
          relationship.id,
        );
      }
      continue;
    }

    const sourceContext = ownerContextOf(source);
    const targetContext = ownerContextOf(target);
    const contractToProposal =
      signatureOf(source) === 'evidence.contract' &&
      signatureOf(target) === 'evidence.proposal';
    const evidenceToThing =
      source.category === 'evidence' &&
      signatureOf(target) === 'participant.thing';
    const confirmsRequest =
      signatureOf(source) === 'evidence.fulfillment_confirmation' &&
      signatureOf(target) === 'evidence.fulfillment_request';
    if (
      sourceContext !== targetContext &&
      !contractToProposal &&
      !evidenceToThing &&
      !confirmsRequest &&
      !(
        source.category === 'evidence' &&
        target.category === 'evidence' &&
        ['fulfillment_confirmation', 'other_evidence'].includes(target.kind)
      )
    ) {
      addIssue(
        ctx,
        'relationship.references.crossContext',
        path,
        'unsupported cross-context references relationship.',
        relationship.id,
      );
    }
    if (contractToProposal) {
      const proposalContext = entityOf(index, targetContext);
      if (
        proposalContext?.category !== 'context' ||
        proposalContext.parentContextRef !== sourceContext
      ) {
        addIssue(
          ctx,
          'relationship.references.crossContext',
          path,
          'Proposal Context must bind its parentContextRef to the referencing Contract Context.',
          relationship.id,
        );
      }
    }
    if (
      source.category === 'evidence' &&
      !evidenceToThing &&
      target.category !== 'evidence' &&
      signatureOf(target) !== 'role.evidence'
    ) {
      addIssue(
        ctx,
        'relationship.references.endpoints',
        path,
        'Evidence references must target a Thing, Evidence or Evidence Role.',
        relationship.id,
      );
    }
  }
};

const validateRules = (
  document: DomainModelDocument,
  index: ModelIndex,
  ctx: RefinementCtx,
): void => {
  for (const [position, rule] of document.rules.entries()) {
    const path = ['rules', position] as Path;
    if (!isContextEntity(entityOf(index, rule.contextRef))) {
      addIssue(
        ctx,
        'rule.contextRef.unresolved',
        [...path, 'contextRef'],
        `rule contextRef '${rule.contextRef}' must reference a Context.`,
        rule.id,
      );
    }
    for (const [variable, binding] of Object.entries(rule.bindings)) {
      if (
        typeof binding === 'object' &&
        binding !== null &&
        'ref' in binding &&
        typeof binding.ref === 'string' &&
        !index.entities.has(binding.ref)
      ) {
        addIssue(
          ctx,
          'rule.binding.unresolved',
          [...path, 'bindings', variable],
          `binding references unknown id '${binding.ref}'.`,
          rule.id,
        );
      }
    }
    if (rule.kind !== 'derivation' || rule.target === undefined) continue;
    const entity = entityOf(index, rule.target.entityRef);
    if (entity === undefined) {
      addIssue(
        ctx,
        'rule.target.unresolved',
        [...path, 'target'],
        `unknown target entity '${rule.target.entityRef}'.`,
        rule.id,
      );
      continue;
    }
    const attribute = entity.attributes?.find(
      (item) => item.name === rule.target?.attribute,
    );
    if (attribute === undefined) {
      addIssue(
        ctx,
        'rule.target.unresolved',
        [...path, 'target'],
        `target entity '${rule.target.entityRef}' has no attribute '${rule.target.attribute}'.`,
        rule.id,
      );
    } else if (attribute.derivedByRuleRef !== rule.id) {
      addIssue(
        ctx,
        'rule.derivation.mismatch',
        [...path, 'target'],
        `derivation Rule must be referenced by '${rule.target.entityRef}.${rule.target.attribute}'.`,
        rule.id,
      );
    }
  }
};

const validateDerivedAttributes = (
  index: ModelIndex,
  ctx: RefinementCtx,
): void => {
  for (const [entityId, indexed] of index.entities) {
    for (const [position, attribute] of (
      indexed.value.attributes ?? []
    ).entries()) {
      if (attribute.derivedByRuleRef === undefined) continue;
      const rule = index.rules.get(attribute.derivedByRuleRef);
      const path = [
        'entities',
        indexed.position,
        'attributes',
        position,
      ] as Path;
      if (rule === undefined) continue;
      if (
        rule.kind !== 'derivation' ||
        rule.target?.entityRef !== entityId ||
        rule.target.attribute !== attribute.name
      ) {
        addIssue(
          ctx,
          'rule.derivation.mismatch',
          path,
          `derivedByRuleRef '${attribute.derivedByRuleRef}' must target this exact attribute.`,
          entityId,
        );
      }
      if (rule?.contextRef !== ownerContextOf(indexed.value)) {
        addIssue(
          ctx,
          'rule.derivation.context',
          path,
          'derivation Rule must belong to the target Entity Context.',
          entityId,
        );
      }
    }
  }
};

/** Graph-level FM checks run only after every input has a typed Zod AST. */
export function refineDomainModel(
  document: DomainModelDocument,
  ctx: RefinementCtx,
): void {
  if (document.entities.length === 0) {
    addIssue(
      ctx,
      'document.shape',
      ['entities'],
      'model must contain at least one entity.',
    );
  }

  const index: ModelIndex = {
    entities: new Map(),
    rules: new Map(),
  };
  const ids = new Set<string>();

  for (const [position, entity] of document.entities.entries()) {
    if (ids.has(entity.id)) {
      addIssue(
        ctx,
        'id.duplicate',
        ['entities', position, 'id'],
        `duplicate id '${entity.id}' across model sources.`,
        entity.id,
      );
    } else {
      ids.add(entity.id);
      index.entities.set(entity.id, { value: entity, position });
    }
    if (
      entity.aliases &&
      new Set(entity.aliases).size !== entity.aliases.length
    ) {
      addIssue(
        ctx,
        'entity.shape',
        ['entities', position, 'aliases'],
        'aliases must be unique non-empty strings.',
        entity.id,
      );
    }
  }
  for (const [position, relationship] of document.relationships.entries()) {
    if (ids.has(relationship.id)) {
      addIssue(
        ctx,
        'id.duplicate',
        ['relationships', position, 'id'],
        `duplicate id '${relationship.id}' across model sources.`,
        relationship.id,
      );
    } else {
      ids.add(relationship.id);
    }
  }
  for (const [position, rule] of document.rules.entries()) {
    if (ids.has(rule.id)) {
      addIssue(
        ctx,
        'id.duplicate',
        ['rules', position, 'id'],
        `duplicate id '${rule.id}' across model sources.`,
        rule.id,
      );
    } else {
      ids.add(rule.id);
      index.rules.set(rule.id, rule);
    }
  }

  if (
    new Set(document.manifest.entryContextRefs).size !==
    document.manifest.entryContextRefs.length
  ) {
    addIssue(
      ctx,
      'manifest.field',
      ['manifest', 'entryContextRefs'],
      'manifest entryContextRefs must be unique.',
    );
  }
  for (const ref of document.manifest.entryContextRefs) {
    if (!isContextEntity(entityOf(index, ref))) {
      addIssue(
        ctx,
        'manifest.entryContextRef',
        ['manifest', 'entryContextRefs'],
        `entryContextRef '${ref}' must reference a Context.`,
      );
    }
  }

  validateEntities(document, index, ctx);
  validateRelationships(document, index, ctx);
  validateRules(document, index, ctx);
  validateDerivedAttributes(index, ctx);
}

import { describe, expect, it } from 'vitest';

import {
  DomainModelValidationError,
  assertValidDomainModel,
  strictValidateDomainModel,
  type DomainModelDocument,
  type RuleAST,
  type ValidationIssue,
} from '../index.js';
import {
  cloneDocument,
  loadFixtureModel,
  requireContext,
  requireEntity,
  requireEvidence,
  requireParticipant,
  requireRole,
} from '../../tests/support/fixtures.js';

const validate = (document: unknown) => strictValidateDomainModel(document);

const codes = (issues: readonly ValidationIssue[]) =>
  issues.map((issue) => issue.code);

const expectIssue = (document: unknown, code: string) => {
  const result = validate(document);

  expect(result.valid).toBe(false);
  expect(codes(result.issues)).toContain(code);
  return result;
};

const baseDocument = () => cloneDocument(loadFixtureModel());

const withDerivation = (): DomainModelDocument => {
  const document = baseDocument();
  const request = requireEvidence(document, 'request.payment');

  request.attributes?.push({
    name: 'derived_total',
    label: '派生应付金额',
    meaning: '按采购数量与协议单价派生',
    valueType: 'money',
    required: true,
    keyData: true,
    derivedByRuleRef: 'rule.payment-total',
  });
  document.rules.push({
    type: 'rule',
    id: 'rule.payment-total',
    kind: 'derivation',
    label: '应付金额派生',
    description: '按协议数量与单价派生应付金额。',
    contextRef: 'context.product-procurement',
    bindings: {
      request: { ref: 'request.payment' },
      contract: { ref: 'contract.product-procurement' },
    },
    expression: 'contract.quantity * 100',
    resultType: 'money',
    target: { entityRef: 'request.payment', attribute: 'derived_total' },
  });

  return document;
};

describe('fixture baseline', () => {
  it('accepts the product-procurement model without issues', () => {
    const result = validate(baseDocument());

    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts a derivation rule that writes its own attribute', () => {
    const result = validate(withDerivation());

    expect(result.issues).toEqual([]);
  });

  it('does not mutate the validated document', () => {
    const document = withDerivation();
    const snapshot = structuredClone(document);

    validate(document);

    expect(document).toEqual(snapshot);
  });

  it('deduplicates repeated findings', () => {
    const document = baseDocument();

    Object.assign(requireRole(document, 'role.buyer'), {
      roleRefs: ['role.seller'],
    });

    const result = validate(document);
    const keys = result.issues.map(
      (issue) => `${issue.code}|${issue.path}|${issue.message}`,
    );

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('document shape', () => {
  it('rejects non-object input', () => {
    expectIssue('not a model', 'document.shape');
    expectIssue(null, 'document.shape');
  });

  it('rejects a model without entities', () => {
    const document = baseDocument();

    document.entities = [];

    expectIssue(document, 'document.shape');
  });

  it('rejects missing collections', () => {
    const document = baseDocument() as unknown as Record<string, unknown>;

    delete document.rules;

    expectIssue(document, 'document.shape');
  });
});

describe('manifest checks', () => {
  it('rejects unsupported fields', () => {
    const document = baseDocument() as unknown as Record<string, unknown>;

    (document.manifest as Record<string, unknown>)['owner'] = 'someone';

    expectIssue(document, 'manifest.field');
  });

  it('rejects an unknown schema version', () => {
    const document = baseDocument();

    (document.manifest as unknown as Record<string, unknown>)['schemaVersion'] =
      '4.9';

    expectIssue(document, 'manifest.field');
  });

  it('rejects entry contexts that are not Contexts', () => {
    const document = baseDocument();

    document.manifest.entryContextRefs = ['request.payment'];

    expectIssue(document, 'manifest.entryContextRef');
  });

  it('rejects an empty entryContextRefs list', () => {
    const document = baseDocument();

    document.manifest.entryContextRefs = [];

    expectIssue(document, 'manifest.field');
  });
});

describe('identifier checks', () => {
  it('rejects ids outside the grammar', () => {
    const document = baseDocument();

    requireEvidence(document, 'request.payment').id = 'Request.Payment';

    expectIssue(document, 'id.invalid');
  });

  it('rejects duplicate ids across collections', () => {
    const document = baseDocument();

    document.entities.push(cloneEntity(document, 'role.buyer'));

    expectIssue(document, 'id.duplicate');
  });

  it('rejects unsupported entity fields', () => {
    const document = baseDocument();

    (requireEvidence(document, 'request.payment') as unknown as Record<string, unknown>)[
      'owner'
    ] = 'buyer';

    expectIssue(document, 'entity.unknownField');
  });

  it('rejects an unknown entity category', () => {
    const document = baseDocument();

    (requireRole(document, 'role.buyer') as unknown as Record<string, unknown>)[
      'category'
    ] = 'actor';

    expectIssue(document, 'entity.category');
  });

  it('rejects a kind that does not belong to its category', () => {
    const document = baseDocument();

    requireEvidence(document, 'contract.product-procurement').kind =
      'deal' as never;

    expectIssue(document, 'entity.kind');
  });

  it('rejects a missing label', () => {
    const document = baseDocument();

    requireRole(document, 'role.seller').label = '';

    expectIssue(document, 'label.missing');
  });
});

describe('attribute checks', () => {
  it('rejects camelCase attribute names', () => {
    const document = baseDocument();
    const request = requireEvidence(document, 'request.payment');

    request.attributes![0]!.name = 'startedAt';

    expectIssue(document, 'attribute.name');
  });

  it('rejects duplicate attribute names', () => {
    const document = baseDocument();
    const request = requireEvidence(document, 'request.payment');

    request.attributes!.push(structuredClone(request.attributes![0]!));

    expectIssue(document, 'attribute.duplicate');
  });

  it('rejects unsupported attribute fields', () => {
    const document = baseDocument();
    const request = requireEvidence(document, 'request.payment');

    (request.attributes![0] as unknown as Record<string, unknown>)['unit'] =
      'CNY';

    expectIssue(document, 'attribute.shape');
  });

  it('rejects unresolvable derivedByRuleRef', () => {
    const document = baseDocument();
    const request = requireEvidence(document, 'request.payment');

    request.attributes![0]!.derivedByRuleRef = 'rule.missing';

    expectIssue(document, 'attribute.derivedByRuleRef.unresolved');
  });

  it('requires every evidence time to be a keyData timestamp', () => {
    const document = baseDocument();
    const request = requireEvidence(document, 'request.payment');

    request.attributes![0]!.keyData = false;

    expectIssue(document, 'attribute.time.notKeyTimestamp');
  });

  it('requires the mandated time attribute to exist', () => {
    const document = baseDocument();
    const confirmation = requireEvidence(document, 'confirmation.payment');

    confirmation.attributes = confirmation.attributes?.filter(
      (attribute) => attribute.name !== 'confirmed_at',
    );

    expectIssue(document, 'attribute.time.missing');
  });

  it('rejects a derivation rule that targets another attribute', () => {
    const document = withDerivation();
    const rule = document.rules.find((item) => item.id === 'rule.payment-total')!;

    rule.target = { entityRef: 'request.payment', attribute: 'requested_minor_units' };

    expectIssue(document, 'rule.derivation.mismatch');
  });

  it('rejects a derivation rule owned by another context', () => {
    const document = withDerivation();
    const rule = document.rules.find((item) => item.id === 'rule.payment-total')!;

    rule.contextRef = 'context.wechat-payment';

    expectIssue(document, 'rule.derivation.context');
  });
});

describe('context checks', () => {
  it('rejects a domain context without roots', () => {
    const document = baseDocument();

    delete requireContext(document, 'context.product-catalog').rootRefs;

    expectIssue(document, 'entity.contextRoots.missing');
  });

  it('requires exactly one root contract per contract context', () => {
    const document = baseDocument();

    requireContext(document, 'context.product-procurement').rootRefs?.push(
      'evidence.delivery-note',
    );

    expectIssue(document, 'entity.contextRoots.contractCount');
  });

  it('rejects a root that belongs to another context', () => {
    const document = baseDocument();

    requireContext(document, 'context.product-catalog').rootRefs = [
      'thing.product',
      'role.buyer',
    ];

    expectIssue(document, 'entity.contextRoots.foreign');
  });

  it('rejects parentContextRef cycles', () => {
    const document = baseDocument();

    requireContext(document, 'context.product-catalog').parentContextRef =
      'context.product-sourcing';
    requireContext(document, 'context.product-sourcing').parentContextRef =
      'context.product-catalog';

    expectIssue(document, 'entity.parentContextRef.cycle');
  });

  it('forbids contextRef on a Context', () => {
    const document = baseDocument();

    (requireContext(document, 'context.product-catalog') as unknown as Record<
      string,
      unknown
    >)['contextRef'] = 'context.product-procurement';

    expectIssue(document, 'entity.contextRef.forbidden');
  });
});

describe('responsibility checks', () => {
  it('requires responsibleRoleRef on non-contract evidence', () => {
    const document = baseDocument();

    delete requireEvidence(document, 'request.payment').responsibleRoleRef;

    expectIssue(document, 'entity.responsibleRole.missing');
  });

  it('requires the responsible role to be a Party Role', () => {
    const document = baseDocument();

    requireEvidence(document, 'request.payment').responsibleRoleRef =
      'role.payment-proof';

    expectIssue(document, 'entity.responsibleRole.notPartyRole');
  });

  it('requires contracts to bind exactly two party roles', () => {
    const document = baseDocument();
    const contract = requireEvidence(document, 'contract.product-procurement');

    contract.roleRefs = ['role.buyer'];

    expectIssue(document, 'entity.roleRefs.count');
  });

  it('rejects roleRefs that are not Party Roles', () => {
    const document = baseDocument();

    requireEvidence(document, 'contract.product-procurement').roleRefs = [
      'role.buyer',
      'role.payment-proof',
    ];

    expectIssue(document, 'entity.roleRefs.notPartyRole');
  });

  it('forbids responsibility fields on a Role', () => {
    const document = baseDocument();

    Object.assign(requireRole(document, 'role.buyer'), {
      roleRefs: ['role.seller'],
    });

    expectIssue(document, 'entity.roleResponsibility.forbidden');
  });

  it('keeps Participant parties outside contexts', () => {
    const document = baseDocument();

    requireParticipant(document, 'party.buyer-agent').contextRef =
      'context.product-procurement';

    expectIssue(document, 'entity.participantParty.contextRef');
  });

  it('requires Participant things to live in a Domain Context', () => {
    const document = baseDocument();

    requireParticipant(document, 'thing.product').contextRef =
      'context.product-procurement';

    expectIssue(document, 'entity.evidenceContext.kind');
  });
});

describe('evidence context checks', () => {
  it('requires requests to belong to a Contract Context', () => {
    const document = baseDocument();

    requireEvidence(document, 'request.payment').contextRef =
      'context.product-catalog';

    expectIssue(document, 'entity.evidenceContext.kind');
  });

  it('requires rfp evidence to belong to a Pre-contract Context', () => {
    const document = baseDocument();

    requireEvidence(document, 'rfp.product-inquiry').contextRef =
      'context.product-procurement';

    expectIssue(document, 'entity.evidenceContext.kind');
  });

  it('requires the contract to be listed in its context roots', () => {
    const document = baseDocument();

    requireContext(document, 'context.product-procurement').rootRefs = [
      'contract.wechat-payment',
    ];

    expectIssue(document, 'entity.contract.rootMissing');
  });
});

describe('domain component checks', () => {
  it('accepts a calculator kept in the Domain Context', () => {
    const document = baseDocument();
    const product = requireParticipant(document, 'thing.product');

    product.domainRole = 'calculator';

    expect(validate(document).valid).toBe(true);
  });

  it('refuses a domain role on a Party', () => {
    const document = baseDocument();
    const buyer = requireParticipant(document, 'party.buyer-agent');

    buyer.domainRole = 'calculator';

    expectIssue(document, 'entity.domainRole.thingOnly');
  });

  it('refuses a domain role the vocabulary does not name', () => {
    const document = baseDocument();
    const product = requireParticipant(document, 'thing.product');

    product.domainRole = 'pricer' as never;

    expectIssue(document, 'entity.kind');
  });
});

describe('relationship checks', () => {
  it('rejects unknown endpoints', () => {
    const document = baseDocument();

    document.relationships[0]!.sourceRef = 'request.ghost';

    expectIssue(document, 'relationship.endpoint.unresolved');
  });

  it('rejects self relationships', () => {
    const document = baseDocument();
    const relationship = document.relationships[0]!;

    relationship.targetRef = relationship.sourceRef;

    expectIssue(document, 'relationship.self');
  });

  it('rejects contract-to-contract relationships', () => {
    const document = baseDocument();

    document.relationships.push({
      type: 'relationship',
      id: 'relation.contract-pair',
      kind: 'references',
      sourceRef: 'contract.product-procurement',
      targetRef: 'contract.wechat-payment',
      label: '错误连接',
    });

    expectIssue(document, 'relationship.contractPair');
  });

  it('rejects invalid plays_role endpoint pairs', () => {
    const document = baseDocument();
    const relationship = document.relationships.find(
      (item) => item.kind === 'plays_role',
    )!;

    relationship.sourceRef = 'role.seller';

    expectIssue(document, 'relationship.playsRole.endpoints');
  });

  it('accepts valid context playing role.context and contract playing role.evidence across contexts', () => {
    const document = baseDocument();

    // 1. Context playing role.context
    document.entities.push({
      type: 'entity',
      id: 'role.alipay-context',
      label: '支付宝上下文',
      category: 'role',
      kind: 'context',
      contextRef: 'context.product-procurement',
    });
    document.relationships.push({
      type: 'relationship',
      id: 'relation.context-plays-context-role',
      kind: 'plays_role',
      sourceRef: 'context.wechat-payment',
      targetRef: 'role.alipay-context',
      label: '外部上下文扮演角色',
    });

    // 2. Contract playing role.evidence across contexts
    document.entities.push({
      type: 'entity',
      id: 'role.payment-contract-evidence',
      label: '支付协议凭证角色',
      category: 'role',
      kind: 'evidence',
      contextRef: 'context.product-procurement',
    });
    document.relationships.push({
      type: 'relationship',
      id: 'relation.contract-plays-evidence-role',
      kind: 'plays_role',
      sourceRef: 'contract.wechat-payment',
      targetRef: 'role.payment-contract-evidence',
      label: '外部时刻合约扮演凭证角色',
    });

    const result = validate(document);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects interval evidence playing role.evidence', () => {
    const document = baseDocument();

    document.entities.push({
      type: 'entity',
      id: 'role.payment-evidence-role',
      label: '支付凭证角色',
      category: 'role',
      kind: 'evidence',
      contextRef: 'context.product-procurement',
    });
    // request.wechat-payment is a fulfillment_request (an interval), which cannot play role.evidence
    document.relationships.push({
      type: 'relationship',
      id: 'relation.interval-plays-evidence-role',
      kind: 'plays_role',
      sourceRef: 'request.wechat-payment',
      targetRef: 'role.payment-evidence-role',
      label: '时段凭证不可扮演角色',
    });

    expectIssue(document, 'relationship.playsRole.endpoints');
  });

  it('rejects malformed cardinality', () => {
    const document = baseDocument();

    document.relationships[0]!.sourceCardinality = { min: 2, max: 1 };

    expectIssue(document, 'relationship.cardinality');
  });

  it('rejects unsupported cross-context references', () => {
    const document = baseDocument();

    document.relationships.push({
      type: 'relationship',
      id: 'relation.cross-context',
      kind: 'references',
      sourceRef: 'request.payment',
      targetRef: 'thing.product',
      label: '允许的证据到对象引用',
    });
    document.relationships.push({
      type: 'relationship',
      id: 'relation.cross-context-invalid',
      kind: 'references',
      sourceRef: 'role.buyer',
      targetRef: 'request.wechat-payment',
      label: '跨上下文角色引用',
    });

    const result = validate(document);

    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain('relationship.references.crossContext');
  });
});

describe('rule checks', () => {
  it('requires decision rules to return bool', () => {
    const document = baseDocument();
    const rule = document.rules.find((item) => item.id === 'rule.delivery-completed')!;

    (rule as unknown as Record<string, unknown>)['resultType'] = 'string';

    expectIssue(document, 'rule.resultType');
  });

  it('forbids targets on non-derivation rules', () => {
    const document = baseDocument();
    const rule = document.rules.find((item) => item.id === 'rule.delivery-completed')!;

    rule.target = { entityRef: 'request.delivery', attribute: 'request_number' };

    expectIssue(document, 'rule.target.forbidden');
  });

  it('requires derivation rules to declare a target', () => {
    const document = baseDocument();

    document.rules.push({
      type: 'rule',
      id: 'rule.delivery-total',
      kind: 'derivation',
      label: '发货数量派生',
      description: '按发货单派生发货数量。',
      contextRef: 'context.product-procurement',
      bindings: { request: { ref: 'request.delivery' } },
      expression: '1',
      resultType: 'int',
    } as RuleAST);

    expectIssue(document, 'rule.target.required');
  });

  it('requires derivation targets to exist', () => {
    const document = withDerivation();
    const rule = document.rules.find((item) => item.id === 'rule.payment-total')!;

    rule.target = { entityRef: 'request.payment', attribute: 'missing_attribute' };

    expectIssue(document, 'rule.target.unresolved');
  });

  it('rejects bindings to unknown ids', () => {
    const document = baseDocument();
    const rule = document.rules.find((item) => item.id === 'rule.delivery-completed')!;

    rule.bindings['request'] = { ref: 'request.ghost' };

    expectIssue(document, 'rule.binding.unresolved');
  });

  it('requires rule contextRef to reference a Context', () => {
    const document = baseDocument();
    const rule = document.rules.find((item) => item.id === 'rule.delivery-completed')!;

    rule.contextRef = 'context.ghost';

    expectIssue(document, 'rule.contextRef.unresolved');
  });

  it('rejects malformed bindings', () => {
    const document = baseDocument();
    const rule = document.rules.find((item) => item.id === 'rule.delivery-completed')!;

    (rule as unknown as Record<string, Record<string, unknown>>)['bindings'][
      'request'
    ] = { cardinality: 'many' };

    expectIssue(document, 'rule.shape');
  });
});

describe('assertValidDomainModel', () => {
  it('returns for a valid model', () => {
    expect(() => assertValidDomainModel(baseDocument())).not.toThrow();
  });

  it('throws a typed error carrying every issue', () => {
    const document = baseDocument();

    delete requireEvidence(document, 'request.payment').responsibleRoleRef;

    try {
      assertValidDomainModel(document);
      expect.unreachable('validation should fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainModelValidationError);
      const validationError = error as DomainModelValidationError;

      expect(validationError.issues.length).toBeGreaterThan(0);
      expect(validationError.message).toContain('domain model issue');
    }
  });
});

function cloneEntity(
  document: DomainModelDocument,
  entityId: string,
): DomainModelDocument['entities'][number] {
  return structuredClone(requireEntity(document, entityId));
}

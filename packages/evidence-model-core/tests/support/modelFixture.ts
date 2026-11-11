import type {
  AttributeAST,
  DomainModelDocument,
  EntityAST,
  RelationshipAST,
  RuleAST,
} from '@evidence-poc/evidence-schema';

const timestamp = (
  name: string,
  label: string,
  meaning: string,
): AttributeAST => ({
  name,
  label,
  meaning,
  valueType: 'timestamp',
  required: true,
  keyData: true,
});

const context = (
  id: string,
  label: string,
  kind: 'contract' | 'domain' | 'pre_contract',
  rootRefs: string[],
): EntityAST => ({
  type: 'entity',
  id,
  category: 'context',
  kind,
  label,
  rootRefs,
});

const partyRole = (id: string, label: string, contextRef: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'role',
  kind: 'party',
  label,
  contextRef,
});

const party = (id: string, label: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'participant',
  kind: 'party',
  label,
});

/**
 * Minimal but complete Contract Context used by command, session and adapter
 * tests: one Contract bound to two Party Roles, one Fulfillment pair, one proof,
 * one domain object and one derivation rule.
 *
 * `strictValidateDomainModel(model).valid` is asserted in tests, so the fixture
 * cannot drift into an invalid model.
 */
export function createProcurementModel(): DomainModelDocument {
  const entities: EntityAST[] = [
    context('context.procurement', '采购合同上下文', 'contract', [
      'contract.procurement',
    ]),
    {
      type: 'entity',
      id: 'contract.procurement',
      category: 'evidence',
      kind: 'contract',
      label: '采购合同',
      contextRef: 'context.procurement',
      roleRefs: ['role.buyer', 'role.seller'],
      attributes: [
        timestamp('signed_at', '签署时间', '双方签署采购协议的业务时间'),
        {
          name: 'quantity',
          label: '采购数量',
          meaning: '协议约定的采购数量',
          valueType: 'int',
          required: true,
          keyData: true,
        },
        {
          name: 'total_minor_units',
          label: '协议总金额',
          meaning: '协议约定的最小货币单位整数总金额',
          valueType: 'int',
          required: true,
          keyData: true,
          derivedByRuleRef: 'rule.contract-total',
        },
      ],
    },
    partyRole('role.buyer', '买方', 'context.procurement'),
    partyRole('role.seller', '卖方', 'context.procurement'),
    party('party.buyer-agent', '买方采购员'),
    party('party.seller-sales', '卖方销售'),
    {
      type: 'entity',
      id: 'request.payment',
      category: 'evidence',
      kind: 'fulfillment_request',
      label: '付款请求',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.seller',
      attributes: [
        timestamp('started_at', '请求提出时间', '卖方提出付款请求的业务时间'),
        timestamp('expired_at', '付款截止时间', '买方完成付款的业务截止时间'),
        {
          name: 'requested_minor_units',
          label: '请求金额',
          meaning: '本次请求支付的最小货币单位整数金额',
          valueType: 'int',
          required: true,
          keyData: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'confirmation.payment',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      label: '付款确认',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.buyer',
      attributes: [
        timestamp('confirmed_at', '确认时间', '买方形成付款确认结果的业务时间'),
        {
          name: 'paid_minor_units',
          label: '确认金额',
          meaning: '买方确认支付的最小货币单位整数金额',
          valueType: 'int',
          required: true,
          keyData: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'evidence.bank-slip',
      category: 'evidence',
      kind: 'other_evidence',
      label: '银行回单',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.buyer',
      attributes: [timestamp('created_at', '回单形成时间', '银行回单形成的业务时间')],
    },
    context('context.catalogue', '商品目录上下文', 'domain', ['thing.product']),
    {
      type: 'entity',
      id: 'thing.product',
      category: 'participant',
      kind: 'thing',
      label: '商品',
      contextRef: 'context.catalogue',
      attributes: [
        {
          name: 'product_code',
          label: '商品编码',
          meaning: '商品目录中区分商品的编码',
          valueType: 'string',
          required: true,
          keyData: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'role.catalogue-item',
      category: 'role',
      kind: 'domain',
      label: '目录商品',
      contextRef: 'context.catalogue',
    },
  ];

  const relationships: RelationshipAST[] = [
    {
      type: 'relationship',
      id: 'relation.request-references-contract',
      kind: 'references',
      sourceRef: 'request.payment',
      targetRef: 'contract.procurement',
      label: '请求引用形成依据',
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 1, max: 1 },
    },
    {
      type: 'relationship',
      id: 'relation.confirmation-references-request',
      kind: 'references',
      sourceRef: 'confirmation.payment',
      targetRef: 'request.payment',
      label: '确认引用所属请求',
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 1, max: 1 },
    },
    {
      type: 'relationship',
      id: 'relation.slip-references-request',
      kind: 'references',
      sourceRef: 'evidence.bank-slip',
      targetRef: 'request.payment',
      label: '回单引用所属请求',
    },
    {
      type: 'relationship',
      id: 'relation.contract-references-product',
      kind: 'references',
      sourceRef: 'contract.procurement',
      targetRef: 'thing.product',
      label: '合同引用采购对象',
    },
    {
      type: 'relationship',
      id: 'relation.buyer-agent-plays-buyer',
      kind: 'plays_role',
      sourceRef: 'party.buyer-agent',
      targetRef: 'role.buyer',
      label: '经办买方角色',
    },
    {
      type: 'relationship',
      id: 'relation.product-plays-catalogue-item',
      kind: 'plays_role',
      sourceRef: 'thing.product',
      targetRef: 'role.catalogue-item',
      label: '商品扮演目录对象',
    },
  ];

  const rules: RuleAST[] = [
    {
      type: 'rule',
      id: 'rule.payment-completed',
      kind: 'completion',
      label: '付款履约完成判断',
      description:
        '同一付款请求存在有效期内的付款确认，且确认金额与请求金额一致时，付款履约完成。',
      contextRef: 'context.procurement',
      bindings: {
        request: { ref: 'request.payment' },
        confirmations: { ref: 'confirmation.payment', cardinality: 'many' },
      },
      expression:
        'confirmations.exists(c, c.confirmed_at >= request.started_at && c.confirmed_at <= request.expired_at && c.paid_minor_units == request.requested_minor_units)',
      resultType: 'bool',
    },
    {
      type: 'rule',
      id: 'rule.contract-total',
      kind: 'derivation',
      label: '协议总金额派生',
      description: '按协议数量与约定单价派生协议总金额。',
      contextRef: 'context.procurement',
      bindings: { contract: { ref: 'contract.procurement' } },
      expression: 'contract.quantity * 100',
      resultType: 'int',
      target: {
        entityRef: 'contract.procurement',
        attribute: 'total_minor_units',
      },
    },
  ];

  return {
    manifest: {
      type: 'fm_model',
      schemaVersion: '5.0',
      id: 'procurement-core',
      name: '采购履约核心模型',
      version: '1.0.0',
      ruleLanguage: 'CEL',
      entryContextRefs: ['context.procurement', 'context.catalogue'],
    },
    entities,
    relationships,
    rules,
  };
}

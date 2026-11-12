import {
  type AttributeAST,
  type ContextEntityAST,
  type DomainModelDocument,
  type EntityAST,
  type EvidenceKind,
  type RelationshipAST,
  type RuleAST,
  type ValueType,
  createEmptyDomainModel,
} from '@evidence-poc/evidence-schema';

import type {
  ProjectTemplateId,
  ProjectTemplateMeta,
} from '../../shared/projects';

/** Manifest fields a caller supplies when a project is created. */
export interface StarterContext {
  /** Business name the manifest carries and the dashboard shows. */
  name: string;
  /** Manifest id, unique inside one workspace. */
  modelId: string;
}

/** Manifest version every starter is written with. */
export const STARTER_MODEL_VERSION = '0.1.0';

const timeAttribute = (
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

const keyAttribute = (
  name: string,
  label: string,
  meaning: string,
  valueType: ValueType,
): AttributeAST => ({
  name,
  label,
  meaning,
  valueType,
  required: true,
  keyData: true,
});

const contractContext = (
  id: string,
  label: string,
  rootRefs: readonly string[],
): ContextEntityAST => ({
  type: 'entity',
  id,
  category: 'context',
  kind: 'contract',
  label,
  rootRefs: [...rootRefs],
});

const preContractContext = (
  id: string,
  label: string,
  rootRefs: readonly string[],
  parentContextRef: string,
): ContextEntityAST => ({
  type: 'entity',
  id,
  category: 'context',
  kind: 'pre_contract',
  label,
  rootRefs: [...rootRefs],
  parentContextRef,
});

const domainContext = (
  id: string,
  label: string,
  rootRefs: readonly string[],
): ContextEntityAST => ({
  type: 'entity',
  id,
  category: 'context',
  kind: 'domain',
  label,
  rootRefs: [...rootRefs],
});

const partyRole = (
  id: string,
  label: string,
  contextRef: string,
): EntityAST => ({
  type: 'entity',
  id,
  category: 'role',
  kind: 'party',
  label,
  contextRef,
});

const domainRole = (
  id: string,
  label: string,
  contextRef: string,
): EntityAST => ({
  type: 'entity',
  id,
  category: 'role',
  kind: 'domain',
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

const evidence = (
  id: string,
  kind: EvidenceKind,
  label: string,
  contextRef: string,
  responsibleRoleRef: string,
  attributes: readonly AttributeAST[],
): EntityAST => ({
  type: 'entity',
  id,
  category: 'evidence',
  kind,
  label,
  contextRef,
  responsibleRoleRef,
  attributes: [...attributes],
});

const references = (
  id: string,
  sourceRef: string,
  targetRef: string,
  label: string,
): RelationshipAST => ({
  type: 'relationship',
  id,
  kind: 'references',
  sourceRef,
  targetRef,
  label,
  sourceCardinality: { min: 1, max: 1 },
  targetCardinality: { min: 1, max: 1 },
});

const playsRole = (
  id: string,
  sourceRef: string,
  targetRef: string,
  label: string,
): RelationshipAST => ({
  type: 'relationship',
  id,
  kind: 'plays_role',
  sourceRef,
  targetRef,
  label,
});

const completionRule = (
  id: string,
  label: string,
  description: string,
  contextRef: string,
  requestRef: string,
  confirmationRef: string,
): RuleAST => ({
  type: 'rule',
  id,
  kind: 'completion',
  label,
  description,
  contextRef,
  bindings: {
    request: { ref: requestRef },
    confirmations: { ref: confirmationRef, cardinality: 'many' },
  },
  expression:
    'confirmations.exists(c, c.confirmed_at >= request.started_at && c.confirmed_at <= request.expired_at)',
  resultType: 'bool',
});

/**
 * A pre-contract context bound to its contract, so the proposal a contract
 * cites is traceable across the two contexts.
 */
const sourcingContext = (
  parentContextRef: string,
  rfpRef: string,
): ContextEntityAST =>
  preContractContext('context.sourcing', '询报价上下文', [rfpRef], parentContextRef);

const sourcingEntities = (): EntityAST[] => [
  {
    type: 'entity',
    id: 'rfp.product-inquiry',
    category: 'evidence',
    kind: 'rfp',
    label: '商品询价',
    contextRef: 'context.sourcing',
    responsibleRoleRef: 'role.buyer',
    attributes: [
      timeAttribute('started_at', '询价开始时间', '买方发出询价单的业务时间'),
      timeAttribute('expired_at', '报价截止时间', '本次询价接收报价的业务截止时间'),
      keyAttribute('quantity', '询价数量', '本次希望采购的商品数量', 'int'),
    ],
  },
  {
    type: 'entity',
    id: 'proposal.product-quotation',
    category: 'evidence',
    kind: 'proposal',
    label: '商品报价',
    contextRef: 'context.sourcing',
    responsibleRoleRef: 'role.seller',
    attributes: [
      timeAttribute('started_at', '报价开始时间', '卖方形成报价的业务时间'),
      timeAttribute('expired_at', '报价有效期截止时间', '本次报价失效的业务时间'),
      keyAttribute(
        'quoted_minor_units',
        '报价金额',
        '卖方按最小货币单位整数给出的报价金额',
        'int',
      ),
    ],
  },
];

const procurementTemplate = (context: StarterContext): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: context.modelId,
    name: context.name,
    version: STARTER_MODEL_VERSION,
    ruleLanguage: 'CEL',
    entryContextRefs: [
      'context.procurement',
      'context.sourcing',
      'context.catalog',
    ],
    description:
      '公对公商品采购履约起点：询价与报价、采购协议、发货/支付/开票三组履约项，以及标的物所在的商品目录上下文。',
  },
  entities: [
    contractContext('context.procurement', '采购协议上下文', [
      'contract.procurement',
    ]),
    {
      type: 'entity',
      id: 'contract.procurement',
      category: 'evidence',
      kind: 'contract',
      label: '商品采购协议',
      contextRef: 'context.procurement',
      roleRefs: ['role.buyer', 'role.seller'],
      attributes: [
        timeAttribute('signed_at', '协议签署时间', '买卖双方形成采购协议的业务时间'),
        keyAttribute('quantity', '采购数量', '协议约定的采购数量', 'int'),
        keyAttribute(
          'total_minor_units',
          '协议总金额',
          '协议约定的最小货币单位整数总金额',
          'int',
        ),
      ],
    },
    partyRole('role.buyer', '买方', 'context.procurement'),
    partyRole('role.seller', '卖方', 'context.procurement'),
    party('party.buyer-agent', '买方采购员'),
    party('party.seller-sales', '卖方销售'),
    sourcingContext('context.procurement', 'rfp.product-inquiry'),
    ...sourcingEntities(),
    evidence(
      'request.payment',
      'fulfillment_request',
      '支付申请',
      'context.procurement',
      'role.seller',
      [
        timeAttribute('started_at', '支付申请时间', '卖方提出支付申请的业务时间'),
        timeAttribute('expired_at', '支付截止时间', '买方完成支付的业务截止时间'),
        keyAttribute(
          'requested_minor_units',
          '申请支付金额',
          '本次申请支付的最小货币单位整数金额',
          'int',
        ),
      ],
    ),
    evidence(
      'confirmation.payment',
      'fulfillment_confirmation',
      '支付确认',
      'context.procurement',
      'role.buyer',
      [
        timeAttribute('confirmed_at', '支付确认时间', '买方形成支付结果的业务时间'),
        keyAttribute(
          'paid_minor_units',
          '确认支付金额',
          '买方确认支付的最小货币单位整数金额',
          'int',
        ),
      ],
    ),
    evidence(
      'request.delivery',
      'fulfillment_request',
      '发货申请',
      'context.procurement',
      'role.buyer',
      [
        timeAttribute('started_at', '发货申请时间', '买方提出发货要求的业务时间'),
        timeAttribute('expired_at', '发货截止时间', '卖方完成发货的业务截止时间'),
        keyAttribute('delivery_address', '收货地址', '本次发货的收货地址', 'string'),
      ],
    ),
    evidence(
      'confirmation.delivery',
      'fulfillment_confirmation',
      '发货确认',
      'context.procurement',
      'role.seller',
      [
        timeAttribute('confirmed_at', '发货确认时间', '卖方形成发货结果的业务时间'),
        keyAttribute('carrier', '承运方', '承担本次运输的承运方名称', 'string'),
      ],
    ),
    evidence(
      'evidence.delivery-note',
      'other_evidence',
      '发货单',
      'context.procurement',
      'role.seller',
      [timeAttribute('created_at', '发货单形成时间', '承运方开出运输单据的业务时间')],
    ),
    evidence(
      'request.invoice',
      'fulfillment_request',
      '开票申请',
      'context.procurement',
      'role.buyer',
      [
        timeAttribute('started_at', '开票申请时间', '买方提出开票申请的业务时间'),
        timeAttribute('expired_at', '开票截止时间', '卖方开出票据的业务截止时间'),
        keyAttribute('tax_number', '纳税人识别号', '买方用于开票的纳税人识别号', 'string'),
      ],
    ),
    evidence(
      'confirmation.invoice',
      'fulfillment_confirmation',
      '开票确认',
      'context.procurement',
      'role.seller',
      [
        timeAttribute('confirmed_at', '开票确认时间', '卖方开出票据的业务时间'),
        keyAttribute('invoice_number', '票据号码', '开出的票据业务号码', 'string'),
      ],
    ),
    evidence(
      'evidence.invoice',
      'other_evidence',
      '发票',
      'context.procurement',
      'role.seller',
      [timeAttribute('created_at', '发票形成时间', '票据交付买方的业务时间')],
    ),
    domainContext('context.catalog', '商品目录上下文', ['thing.product']),
    {
      type: 'entity',
      id: 'thing.product',
      category: 'participant',
      kind: 'thing',
      label: '商品',
      contextRef: 'context.catalog',
      attributes: [
        keyAttribute('product_code', '商品编码', '商品目录中区分商品的编码', 'string'),
        keyAttribute('name', '商品名称', '商品的业务名称', 'string'),
      ],
    },
    domainRole('role.catalog-item', '目录商品', 'context.catalog'),
  ],
  relationships: [
    references(
      'relation.contract-references-quotation',
      'contract.procurement',
      'proposal.product-quotation',
      '协议引用报价作为签订依据',
    ),
    references(
      'relation.quotation-references-inquiry',
      'proposal.product-quotation',
      'rfp.product-inquiry',
      '报价引用询价作为发起依据',
    ),
    references(
      'relation.inquiry-references-product',
      'rfp.product-inquiry',
      'thing.product',
      '询价针对商品目录中的商品',
    ),
    references(
      'relation.contract-references-product',
      'contract.procurement',
      'thing.product',
      '协议引用采购对象',
    ),
    references(
      'relation.payment-request-references-contract',
      'request.payment',
      'contract.procurement',
      '支付申请引用协议',
    ),
    references(
      'relation.payment-confirmation-references-request',
      'confirmation.payment',
      'request.payment',
      '支付确认引用所属申请',
    ),
    references(
      'relation.delivery-request-references-contract',
      'request.delivery',
      'contract.procurement',
      '发货申请引用协议',
    ),
    references(
      'relation.delivery-confirmation-references-request',
      'confirmation.delivery',
      'request.delivery',
      '发货确认引用所属申请',
    ),
    references(
      'relation.delivery-note-references-confirmation',
      'evidence.delivery-note',
      'confirmation.delivery',
      '发货单印证发货确认',
    ),
    references(
      'relation.invoice-request-references-contract',
      'request.invoice',
      'contract.procurement',
      '开票申请引用协议',
    ),
    references(
      'relation.invoice-confirmation-references-request',
      'confirmation.invoice',
      'request.invoice',
      '开票确认引用所属申请',
    ),
    references(
      'relation.invoice-references-confirmation',
      'evidence.invoice',
      'confirmation.invoice',
      '发票印证开票确认',
    ),
    playsRole(
      'relation.buyer-agent-plays-buyer',
      'party.buyer-agent',
      'role.buyer',
      '买方采购员经办买方角色',
    ),
    playsRole(
      'relation.seller-sales-plays-seller',
      'party.seller-sales',
      'role.seller',
      '卖方销售经办卖方角色',
    ),
    playsRole(
      'relation.product-plays-catalog-item',
      'thing.product',
      'role.catalog-item',
      '商品扮演目录商品角色',
    ),
  ],
  rules: [
    completionRule(
      'rule.payment-completed',
      '支付履约完成判断',
      '同一支付申请存在有效期内的支付确认时，支付履约完成。',
      'context.procurement',
      'request.payment',
      'confirmation.payment',
    ),
    completionRule(
      'rule.delivery-completed',
      '发货履约完成判断',
      '同一发货申请存在有效期内的发货确认时，发货履约完成。',
      'context.procurement',
      'request.delivery',
      'confirmation.delivery',
    ),
    completionRule(
      'rule.invoice-completed',
      '开票履约完成判断',
      '同一开票申请存在有效期内的开票确认时，开票履约完成。',
      'context.procurement',
      'request.invoice',
      'confirmation.invoice',
    ),
  ],
});

const subscriptionTemplate = (context: StarterContext): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: context.modelId,
    name: context.name,
    version: STARTER_MODEL_VERSION,
    ruleLanguage: 'CEL',
    entryContextRefs: [
      'context.subscription',
      'context.payment-support',
      'context.course-catalog',
    ],
    description:
      '内容订阅履约起点：订阅协议下的付款与内容访问两组履约项，断更补偿作为违约触发的履约项，付款由独立的支付协议上下文支撑。',
  },
  entities: [
    contractContext('context.subscription', '专栏订阅合同上下文', [
      'contract.subscription',
    ]),
    {
      type: 'entity',
      id: 'contract.subscription',
      category: 'evidence',
      kind: 'contract',
      label: '专栏订阅合同',
      contextRef: 'context.subscription',
      roleRefs: ['role.reader', 'role.publisher'],
      attributes: [
        timeAttribute('signed_at', '订阅签署时间', '读者与内容方形成订阅合同的业务时间'),
        keyAttribute('term_days', '订阅期天数', '合同约定的内容访问期限', 'int'),
        keyAttribute(
          'price_minor_units',
          '订阅价格',
          '合同约定的最小货币单位整数价格',
          'int',
        ),
      ],
    },
    partyRole('role.reader', '读者', 'context.subscription'),
    partyRole('role.publisher', '内容方', 'context.subscription'),
    party('party.reader', '读者'),
    party('party.publisher-editor', '专栏编辑'),
    evidence(
      'request.pay-subscription',
      'fulfillment_request',
      '订阅付款申请',
      'context.subscription',
      'role.publisher',
      [
        timeAttribute('started_at', '付款申请时间', '内容方提出付款要求的业务时间'),
        timeAttribute('expired_at', '付款截止时间', '读者完成付款的业务截止时间'),
        keyAttribute(
          'requested_minor_units',
          '申请支付金额',
          '本次申请支付的最小货币单位整数金额',
          'int',
        ),
      ],
    ),
    evidence(
      'confirmation.pay-subscription',
      'fulfillment_confirmation',
      '订阅付款确认',
      'context.subscription',
      'role.reader',
      [
        timeAttribute('confirmed_at', '付款确认时间', '读者形成付款结果的业务时间'),
        keyAttribute(
          'paid_minor_units',
          '确认支付金额',
          '读者确认支付的最小货币单位整数金额',
          'int',
        ),
      ],
    ),
    evidence(
      'request.content-access',
      'fulfillment_request',
      '付费内容访问申请',
      'context.subscription',
      'role.reader',
      [
        timeAttribute('started_at', '访问申请时间', '读者发起付费内容访问的业务时间'),
        timeAttribute('expired_at', '访问截止时间', '内容方放行付费内容的业务截止时间'),
      ],
    ),
    evidence(
      'confirmation.content-unlocked',
      'fulfillment_confirmation',
      '付费内容放行确认',
      'context.subscription',
      'role.publisher',
      [timeAttribute('confirmed_at', '放行确认时间', '内容方放行付费内容的业务时间')],
    ),
    evidence(
      'request.discontinue-refund',
      'fulfillment_request',
      '断更退款申请',
      'context.subscription',
      'role.reader',
      [
        timeAttribute('started_at', '退款申请时间', '读者因断更提出退款的业务时间'),
        timeAttribute('expired_at', '退款截止时间', '内容方完成退款的业务截止时间'),
        keyAttribute(
          'refund_minor_units',
          '申请退款金额',
          '读者申请退还的最小货币单位整数金额',
          'int',
        ),
      ],
    ),
    evidence(
      'confirmation.refund-completed',
      'fulfillment_confirmation',
      '退款完成确认',
      'context.subscription',
      'role.publisher',
      [
        timeAttribute('confirmed_at', '退款完成时间', '内容方完成退款的业务时间'),
        keyAttribute(
          'refunded_minor_units',
          '实际退款金额',
          '内容方实际退还的最小货币单位整数金额',
          'int',
        ),
      ],
    ),
    contractContext('context.payment-support', '移动支付协议上下文', [
      'contract.payment-support',
    ]),
    {
      type: 'entity',
      id: 'contract.payment-support',
      category: 'evidence',
      kind: 'contract',
      label: '移动支付用户协议',
      contextRef: 'context.payment-support',
      roleRefs: ['role.payer', 'role.payment-provider'],
      attributes: [
        timeAttribute('signed_at', '协议签署时间', '用户开通移动支付服务的业务时间'),
      ],
    },
    partyRole('role.payer', '付款用户', 'context.payment-support'),
    partyRole('role.payment-provider', '支付服务商', 'context.payment-support'),
    party('party.payment-provider-operator', '支付服务商运营'),
    evidence(
      'request.charge',
      'fulfillment_request',
      '扣款申请',
      'context.payment-support',
      'role.payment-provider',
      [
        timeAttribute('started_at', '扣款申请时间', '支付服务商发起扣款的业务时间'),
        timeAttribute('expired_at', '扣款截止时间', '扣款结果返回的业务截止时间'),
        keyAttribute(
          'charge_minor_units',
          '扣款金额',
          '本次扣除的最小货币单位整数金额',
          'int',
        ),
      ],
    ),
    evidence(
      'confirmation.charge',
      'fulfillment_confirmation',
      '扣款确认',
      'context.payment-support',
      'role.payer',
      [
        timeAttribute('confirmed_at', '扣款确认时间', '支付渠道返回扣款结果的业务时间'),
        keyAttribute(
          'charged_minor_units',
          '扣款成功金额',
          '实际扣除的最小货币单位整数金额',
          'int',
        ),
      ],
    ),
    domainContext('context.course-catalog', '专栏目录上下文', ['thing.column']),
    {
      type: 'entity',
      id: 'thing.column',
      category: 'participant',
      kind: 'thing',
      label: '专栏',
      contextRef: 'context.course-catalog',
      attributes: [
        keyAttribute('column_code', '专栏编码', '专栏目录中区分专栏的编码', 'string'),
        keyAttribute('title', '专栏标题', '专栏的业务标题', 'string'),
      ],
    },
    domainRole('role.catalog-column', '目录专栏', 'context.course-catalog'),
  ],
  relationships: [
    references(
      'relation.contract-references-column',
      'contract.subscription',
      'thing.column',
      '订阅合同引用被订阅的专栏',
    ),
    references(
      'relation.payment-request-references-contract',
      'request.pay-subscription',
      'contract.subscription',
      '付款申请引用订阅合同',
    ),
    references(
      'relation.payment-confirmation-references-request',
      'confirmation.pay-subscription',
      'request.pay-subscription',
      '付款确认引用所属申请',
    ),
    references(
      'relation.payment-confirmation-uses-charge',
      'confirmation.charge',
      'confirmation.pay-subscription',
      '支付协议中的扣款结果支撑订阅付款确认',
    ),
    references(
      'relation.access-request-references-contract',
      'request.content-access',
      'contract.subscription',
      '内容访问申请引用订阅合同',
    ),
    references(
      'relation.access-confirmation-references-request',
      'confirmation.content-unlocked',
      'request.content-access',
      '放行确认引用所属申请',
    ),
    references(
      'relation.refund-request-references-contract',
      'request.discontinue-refund',
      'contract.subscription',
      '断更退款申请引用订阅合同',
    ),
    references(
      'relation.refund-confirmation-references-request',
      'confirmation.refund-completed',
      'request.discontinue-refund',
      '退款完成确认引用所属申请',
    ),
    references(
      'relation.charge-request-references-contract',
      'request.charge',
      'contract.payment-support',
      '扣款申请引用支付协议',
    ),
    references(
      'relation.charge-confirmation-references-request',
      'confirmation.charge',
      'request.charge',
      '扣款确认引用所属申请',
    ),
    playsRole(
      'relation.reader-plays-reader',
      'party.reader',
      'role.reader',
      '读者本人经办读者角色',
    ),
    playsRole(
      'relation.reader-plays-payer',
      'party.reader',
      'role.payer',
      '读者本人经办付款用户角色',
    ),
    playsRole(
      'relation.editor-plays-publisher',
      'party.publisher-editor',
      'role.publisher',
      '专栏编辑经办内容方角色',
    ),
    playsRole(
      'relation.provider-operator-plays-provider',
      'party.payment-provider-operator',
      'role.payment-provider',
      '支付服务商运营经办支付服务商角色',
    ),
    playsRole(
      'relation.column-plays-catalog-column',
      'thing.column',
      'role.catalog-column',
      '专栏扮演目录专栏角色',
    ),
  ],
  rules: [
    completionRule(
      'rule.payment-completed',
      '订阅付款履约完成判断',
      '同一付款申请存在有效期内的付款确认时，订阅付款履约完成。',
      'context.subscription',
      'request.pay-subscription',
      'confirmation.pay-subscription',
    ),
    completionRule(
      'rule.content-access-completed',
      '内容访问履约完成判断',
      '同一访问申请存在有效期内的放行确认时，内容访问履约完成。',
      'context.subscription',
      'request.content-access',
      'confirmation.content-unlocked',
    ),
    completionRule(
      'rule.refund-completed',
      '断更退款履约完成判断',
      '同一退款申请存在有效期内的退款完成确认时，断更退款履约完成。',
      'context.subscription',
      'request.discontinue-refund',
      'confirmation.refund-completed',
    ),
    completionRule(
      'rule.charge-completed',
      '扣款履约完成判断',
      '同一扣款申请存在有效期内的扣款确认时，扣款履约完成。',
      'context.payment-support',
      'request.charge',
      'confirmation.charge',
    ),
  ],
});

const serviceBlueprintTemplate = (
  context: StarterContext,
): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: context.modelId,
    name: context.name,
    version: STARTER_MODEL_VERSION,
    ruleLanguage: 'CEL',
    entryContextRefs: [
      'context.engagement',
      'context.sourcing',
      'context.service-catalog',
    ],
    description:
      '服务蓝图变种的建模起点：把蓝图里的阶段、活动与交互产物落到询价、服务合同与交付验收这一条最小链路上，供工作坊继续补充后台行为与违约补偿。',
  },
  entities: [
    contractContext('context.engagement', '服务合同上下文', [
      'contract.engagement',
    ]),
    {
      type: 'entity',
      id: 'contract.engagement',
      category: 'evidence',
      kind: 'contract',
      label: '服务合同',
      contextRef: 'context.engagement',
      roleRefs: ['role.client', 'role.provider'],
      attributes: [
        timeAttribute('signed_at', '合同签署时间', '客户与服务方形成合同的业务时间'),
        keyAttribute('scope', '服务范围', '合同约定的服务范围', 'string'),
        keyAttribute(
          'fee_minor_units',
          '合同金额',
          '合同约定的最小货币单位整数金额',
          'int',
        ),
      ],
    },
    partyRole('role.client', '客户', 'context.engagement'),
    partyRole('role.provider', '服务方', 'context.engagement'),
    party('party.client-contact', '客户对接人'),
    party('party.provider-owner', '服务负责人'),
    preContractContext(
      'context.sourcing',
      '方案征询上下文',
      ['rfp.service-inquiry'],
      'context.engagement',
    ),
    {
      type: 'entity',
      id: 'rfp.service-inquiry',
      category: 'evidence',
      kind: 'rfp',
      label: '服务方案征询',
      contextRef: 'context.sourcing',
      responsibleRoleRef: 'role.client',
      attributes: [
        timeAttribute('started_at', '征询开始时间', '客户发出方案征询的业务时间'),
        timeAttribute('expired_at', '方案提交截止时间', '服务方提交方案的业务截止时间'),
      ],
    },
    {
      type: 'entity',
      id: 'proposal.service-proposal',
      category: 'evidence',
      kind: 'proposal',
      label: '服务方案',
      contextRef: 'context.sourcing',
      responsibleRoleRef: 'role.provider',
      attributes: [
        timeAttribute('started_at', '方案形成时间', '服务方形成方案的业务时间'),
        timeAttribute('expired_at', '方案有效期截止时间', '方案失效的业务时间'),
      ],
    },
    evidence(
      'request.service-delivery',
      'fulfillment_request',
      '服务交付申请',
      'context.engagement',
      'role.client',
      [
        timeAttribute('started_at', '交付申请时间', '客户要求开始交付的业务时间'),
        timeAttribute('expired_at', '交付截止时间', '服务方完成交付的业务截止时间'),
      ],
    ),
    evidence(
      'confirmation.service-acceptance',
      'fulfillment_confirmation',
      '服务验收确认',
      'context.engagement',
      'role.provider',
      [
        timeAttribute('confirmed_at', '验收确认时间', '服务方形成交付结果的业务时间'),
        keyAttribute('acceptance_result', '验收结论', '本次交付的验收结论', 'string'),
      ],
    ),
    evidence(
      'evidence.acceptance-form',
      'other_evidence',
      '验收单',
      'context.engagement',
      'role.provider',
      [timeAttribute('created_at', '验收单形成时间', '客户签署验收单的业务时间')],
    ),
    domainContext('context.service-catalog', '服务目录上下文', [
      'thing.service',
    ]),
    {
      type: 'entity',
      id: 'thing.service',
      category: 'participant',
      kind: 'thing',
      label: '服务项',
      contextRef: 'context.service-catalog',
      attributes: [
        keyAttribute('service_code', '服务编码', '服务目录中区分服务的编码', 'string'),
        keyAttribute('title', '服务名称', '服务的业务名称', 'string'),
      ],
    },
    domainRole('role.catalog-service', '目录服务项', 'context.service-catalog'),
  ],
  relationships: [
    references(
      'relation.contract-references-proposal',
      'contract.engagement',
      'proposal.service-proposal',
      '合同引用方案作为签订依据',
    ),
    references(
      'relation.proposal-references-inquiry',
      'proposal.service-proposal',
      'rfp.service-inquiry',
      '方案引用征询作为发起依据',
    ),
    references(
      'relation.contract-references-service',
      'contract.engagement',
      'thing.service',
      '合同引用被采购的服务项',
    ),
    references(
      'relation.delivery-request-references-contract',
      'request.service-delivery',
      'contract.engagement',
      '交付申请引用合同',
    ),
    references(
      'relation.acceptance-references-request',
      'confirmation.service-acceptance',
      'request.service-delivery',
      '验收确认引用所属申请',
    ),
    references(
      'relation.acceptance-form-references-confirmation',
      'evidence.acceptance-form',
      'confirmation.service-acceptance',
      '验收单印证验收确认',
    ),
    playsRole(
      'relation.client-contact-plays-client',
      'party.client-contact',
      'role.client',
      '客户对接人经办客户角色',
    ),
    playsRole(
      'relation.provider-owner-plays-provider',
      'party.provider-owner',
      'role.provider',
      '服务负责人经办服务方角色',
    ),
    playsRole(
      'relation.service-plays-catalog-service',
      'thing.service',
      'role.catalog-service',
      '服务项扮演目录服务项角色',
    ),
  ],
  rules: [
    completionRule(
      'rule.service-delivery-completed',
      '服务交付履约完成判断',
      '同一交付申请存在有效期内的验收确认时，服务交付履约完成。',
      'context.engagement',
      'request.service-delivery',
      'confirmation.service-acceptance',
    ),
  ],
});

const blankTemplate = (context: StarterContext): DomainModelDocument =>
  createEmptyDomainModel({
    id: context.modelId,
    name: context.name,
    version: STARTER_MODEL_VERSION,
    description: '空白起点：先确定合同上下文的当事双方，再从主要履约项开始补齐凭证。',
  });

interface TemplateDefinition {
  id: ProjectTemplateId;
  name: string;
  description: string;
  source: string;
  build: (context: StarterContext) => DomainModelDocument;
}

/**
 * Starter models offered when a project is created.
 *
 * The three non-blank entries replay the lecture cases (public procurement and
 * a subscription with breach compensation) plus the service-blueprint entry
 * point, so the first canvas already shows the meta-model in use.
 */
const TEMPLATES: readonly TemplateDefinition[] = [
  {
    id: 'blank',
    name: '空白模型',
    description:
      '只有 model.json 的空源树，适合已经想清楚业务边界的建模者从零开始。',
    source: '履约建模法元模型',
    build: blankTemplate,
  },
  {
    id: 'procurement',
    name: '公对公商品采购履约',
    description:
      '询价与报价、采购协议，加上发货、支付、开票三组履约项与对应凭证。',
    source: '直播案例：商品采购协议履约',
    build: procurementTemplate,
  },
  {
    id: 'subscription',
    name: '专栏订阅与断更补偿',
    description:
      '订阅付款与内容访问两组履约项，断更退款作为违约触发项，付款由支付协议上下文支撑。',
    source: '直播案例：极客时间专栏订阅',
    build: subscriptionTemplate,
  },
  {
    id: 'service_blueprint',
    name: '服务蓝图起点',
    description:
      '把服务蓝图的阶段与活动落成一条最小链路：方案征询、服务合同、交付验收。',
    source: '直播讲义：服务蓝图变种作为建模输入',
    build: serviceBlueprintTemplate,
  },
];

const templateById = (id: ProjectTemplateId): TemplateDefinition =>
  TEMPLATES.find((template) => template.id === id) ??
  TEMPLATES[0] ?? {
    id: 'blank',
    name: '空白模型',
    description: '',
    source: '',
    build: blankTemplate,
  };

/** Manifest id a caller gets when it does not name one. */
export const deriveModelId = (fallback: string, now = Date.now()): string => {
  const slug = fallback
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  const candidate = slug.length > 0 ? slug : `model-${now.toString(36)}`;

  return /^[a-z]/.test(candidate) ? candidate : `model-${candidate}`;
};

/** Builds the document a new project starts from. */
export const createStarterDocument = (
  templateId: ProjectTemplateId,
  context: StarterContext,
): DomainModelDocument => templateById(templateId).build(context);

/** Template cards the dashboard shows, with the counts each one produces. */
export const listProjectTemplates = (): readonly ProjectTemplateMeta[] =>
  TEMPLATES.map((template) => {
    const document = template.build({
      name: template.name,
      modelId: 'template-preview',
    });

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      source: template.source,
      entityCount: document.entities.length,
      relationshipCount: document.relationships.length,
      ruleCount: document.rules.length,
    };
  });

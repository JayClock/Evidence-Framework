import { describe, expect, it } from 'vitest';

import { strictValidateDomainModel } from '@evidence-poc/evidence-schema';

import {
  addBreachCompensation,
  introduceFulfillmentPair,
  isolateDomainCalculator,
  roleifyAndInvertDependency,
  type FulfillmentPairIntent,
} from './operators.js';
import { decodeModelPatch, type ModelPatchCommand } from './patches.js';
import { createModelSession } from '../session/createModelSession.js';
import { createProcurementModel } from '../../tests/support/modelFixture.js';

const apply = (
  model = createProcurementModel(),
  patch: { commands: readonly unknown[] },
) => {
  const session = createModelSession({ document: model });

  session.dispatchAll(decodeModelPatch(patch.commands));

  return { session, document: session.getDocument() };
};

/**
 * First command of a patch, narrowed to the pair command it must be.
 *
 * Reading the union member directly keeps the assertion honest: a test that
 * casts to `any` would still pass if the operator stopped emitting the command.
 */
const pairCommandOf = (commands: readonly ModelPatchCommand[]) => {
  const command = commands[0];

  if (command?.type !== 'create-fulfillment-pair') {
    throw new Error('the operator did not emit a fulfillment pair command');
  }

  return command;
};

const pairIntent = (
  overrides: Partial<FulfillmentPairIntent> = {},
): FulfillmentPairIntent => ({
  contextRef: 'context.procurement',
  request: {
    id: 'request.refund',
    label: '退款申请',
    responsibleRoleRef: 'role.buyer',
    window: '3 个工作日',
  },
  confirmation: {
    id: 'confirmation.refund',
    label: '退款到账确认',
    responsibleRoleRef: 'role.seller',
  },
  ...overrides,
});

describe('introduceFulfillmentPair', () => {
  it('writes a request, a confirmation and the reference to the root contract', () => {
    const model = createProcurementModel();
    const intent = pairIntent();
    const patch = introduceFulfillmentPair(model, intent);
    const { document } = apply(model, patch);

    expect(patch.createdIds).toEqual(['request.refund', 'confirmation.refund']);
    expect(
      document.entities.find((entity) => entity.id === 'request.refund'),
    ).toMatchObject({
      category: 'evidence',
      kind: 'fulfillment_request',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.buyer',
    });
    expect(
      document.entities.find((entity) => entity.id === 'confirmation.refund'),
    ).toMatchObject({
      kind: 'fulfillment_confirmation',
      responsibleRoleRef: 'role.seller',
    });
    expect(
      document.relationships.some(
        (relationship) =>
          relationship.sourceRef === 'request.refund' &&
          relationship.targetRef === 'contract.procurement',
      ),
    ).toBe(true);
    expect(
      document.rules.some(
        (rule) =>
          rule.kind === 'completion' &&
          Object.values(rule.bindings).some(
            (binding) => 'ref' in binding && binding.ref === 'request.refund',
          ),
      ),
    ).toBe(true);
  });

  it('models the mandatory business time instead of leaving it to the caller', () => {
    const patch = introduceFulfillmentPair(createProcurementModel(), pairIntent());
    const moment = pairCommandOf(patch.commands);

    expect(moment.type).toBe('create-fulfillment-pair');
    expect(moment.input.request.attributes.map((item) => item.name)).toEqual([
      'started_at',
      'expired_at',
    ]);
    expect(
      moment.input.confirmation.attributes.map((item) => item.name),
    ).toEqual(['confirmed_at']);
  });

  it('keeps the proof as its own evidence and links it to the confirmation', () => {
    const model = createProcurementModel();
    const patch = introduceFulfillmentPair(
      model,
      pairIntent({
        proof: { id: 'evidence.refund-receipt', label: '退款水单' },
      }),
    );
    const { document } = apply(model, patch);

    expect(patch.createdIds).toEqual([
      'evidence.refund-receipt',
      'request.refund',
      'confirmation.refund',
    ]);
    expect(
      document.entities.find(
        (entity) => entity.id === 'evidence.refund-receipt',
      ),
    ).toMatchObject({
      kind: 'other_evidence',
      responsibleRoleRef: 'role.seller',
    });
    expect(
      document.relationships.some(
        (relationship) =>
          relationship.sourceRef === 'confirmation.refund' &&
          relationship.targetRef === 'evidence.refund-receipt',
      ),
    ).toBe(true);
  });

  it('refuses a context it cannot name', () => {
    expect(() =>
      introduceFulfillmentPair(
        createProcurementModel(),
        pairIntent({ contextRef: 'context.unknown' }),
      ),
    ).toThrow("未知的上下文 'context.unknown'");
  });

  it('omits the contract reference when the context has no single root contract', () => {
    const model = createProcurementModel();
    const detached = {
      ...model,
      entities: model.entities.map((entity) =>
        entity.id === 'context.procurement'
          ? { ...entity, rootRefs: [] }
          : entity,
      ),
    };
    const patch = introduceFulfillmentPair(detached, pairIntent());

    expect(pairCommandOf(patch.commands).input.contractReferenceId).toBeUndefined();
  });
});

describe('addBreachCompensation', () => {
  it('declares the breach and the compensation pair that answers it', () => {
    const model = createProcurementModel();
    const patch = addBreachCompensation(model, {
      requestRef: 'request.payment',
      confirmationRef: 'confirmation.payment',
      condition: '超过约定窗口仍未到账',
      request: {
        id: 'request.penalty',
        label: '逾期违约金申请',
        responsibleRoleRef: 'role.seller',
        window: '5 个工作日',
      },
      confirmation: {
        id: 'confirmation.penalty',
        label: '违约金到账确认',
        responsibleRoleRef: 'role.buyer',
      },
    });
    const { document } = apply(model, patch);

    expect(patch.createdIds[0]).toBe('rule.request.payment-breached');
    expect(
      document.rules.find((rule) => rule.id === 'rule.request.payment-breached'),
    ).toMatchObject({
      kind: 'breach',
      description: '超过约定窗口仍未到账',
    });
    expect(
      document.entities.some((entity) => entity.id === 'request.penalty'),
    ).toBe(true);
    expect(
      document.entities.some(
        (entity) => entity.id === 'confirmation.penalty',
      ),
    ).toBe(true);
  });

  it('keeps the model free of hidden retries: the breach is a rule, not an undo', () => {
    const patch = addBreachCompensation(createProcurementModel(), {
      requestRef: 'request.payment',
      confirmationRef: 'confirmation.payment',
      condition: '超过约定窗口仍未到账',
      request: {
        id: 'request.penalty',
        label: '逾期违约金申请',
        responsibleRoleRef: 'role.seller',
      },
      confirmation: {
        id: 'confirmation.penalty',
        label: '违约金到账确认',
        responsibleRoleRef: 'role.buyer',
      },
    });
    const [breach] = patch.commands;

    if (breach?.type !== 'bind-breach-rule') {
      throw new Error('the operator did not emit a breach rule');
    }

    expect(breach.input.rule.expression).toContain('now > request.expired_at');
    expect(patch.commands.map((command) => command.type)).toEqual([
      'bind-breach-rule',
      'create-fulfillment-pair',
    ]);
  });

  it('rejects a request that does not exist', () => {
    expect(() =>
      addBreachCompensation(createProcurementModel(), {
        requestRef: 'request.ghost',
        confirmationRef: 'confirmation.payment',
        condition: '不存在',
        request: {
          id: 'request.penalty',
          label: '违约金申请',
          responsibleRoleRef: 'role.seller',
        },
        confirmation: {
          id: 'confirmation.penalty',
          label: '违约金确认',
          responsibleRoleRef: 'role.buyer',
        },
      }),
    ).toThrow("'request.ghost' 不是履约请求");
  });
});

describe('roleifyAndInvertDependency', () => {
  it('moves the capability into its own contract and lets the confirmation play the role', () => {
    const model = createProcurementModel();
    const patch = roleifyAndInvertDependency(model, {
      targetConfirmationRef: 'confirmation.payment',
      socket: { id: 'role.payment-capability', label: '付款能力' },
      supporting: {
        context: { id: 'context.wallet', label: '钱包支付服务' },
        contract: { id: 'contract.wallet', label: '钱包支付服务协议' },
        provider: { id: 'role.wallet-provider', label: '钱包服务商' },
        consumer: { id: 'role.wallet-user', label: '付款用户' },
        request: { id: 'request.wallet-charge', label: '钱包扣款请求' },
        confirmation: { id: 'confirmation.wallet-charge', label: '钱包扣款确认' },
      },
    });
    const { document } = apply(model, patch);

    expect(patch.createdIds).toEqual([
      'role.payment-capability',
      'context.wallet',
      'role.wallet-provider',
      'role.wallet-user',
      'contract.wallet',
      'request.wallet-charge',
      'confirmation.wallet-charge',
    ]);
    expect(
      document.entities.find((entity) => entity.id === 'role.payment-capability'),
    ).toMatchObject({
      category: 'role',
      kind: 'evidence',
      contextRef: 'context.procurement',
    });
    expect(
      document.entities.find((entity) => entity.id === 'context.wallet'),
    ).toMatchObject({ kind: 'contract', rootRefs: ['contract.wallet'] });
    expect(
      document.relationships.find(
        (relationship) =>
          relationship.sourceRef === 'confirmation.payment' &&
          relationship.targetRef === 'role.payment-capability',
      ),
    ).toMatchObject({ kind: 'references' });
    expect(
      document.relationships.find(
        (relationship) =>
          relationship.sourceRef === 'confirmation.wallet-charge' &&
          relationship.targetRef === 'role.payment-capability',
      ),
    ).toMatchObject({ kind: 'plays_role' });
  });

  it('leaves the core contract independent of the provider parties', () => {
    const model = createProcurementModel();
    const patch = roleifyAndInvertDependency(model, {
      targetConfirmationRef: 'confirmation.payment',
      socket: { id: 'role.payment-capability', label: '付款能力' },
      supporting: {
        context: { id: 'context.wallet', label: '钱包支付服务' },
        contract: { id: 'contract.wallet', label: '钱包支付服务协议' },
        provider: { id: 'role.wallet-provider', label: '钱包服务商' },
        consumer: { id: 'role.wallet-user', label: '付款用户' },
        request: { id: 'request.wallet-charge', label: '钱包扣款请求' },
        confirmation: { id: 'confirmation.wallet-charge', label: '钱包扣款确认' },
      },
    });
    const { document } = apply(model, patch);
    const coreContract = document.entities.find(
      (entity) => entity.id === 'contract.procurement',
    );

    expect(coreContract).toMatchObject({
      roleRefs: ['role.buyer', 'role.seller'],
    });
    expect(
      document.entities.some((entity) => entity.id === 'role.wallet-provider'),
    ).toBe(true);
  });

  it('keeps the resulting model free of static FM issues', () => {
    const model = createProcurementModel();
    const patch = roleifyAndInvertDependency(model, {
      targetConfirmationRef: 'confirmation.payment',
      socket: { id: 'role.payment-capability', label: '付款能力' },
      supporting: {
        context: { id: 'context.wallet', label: '钱包支付服务' },
        contract: { id: 'contract.wallet', label: '钱包支付服务协议' },
        provider: { id: 'role.wallet-provider', label: '钱包服务商' },
        consumer: { id: 'role.wallet-user', label: '付款用户' },
        request: { id: 'request.wallet-charge', label: '钱包扣款请求' },
        confirmation: { id: 'confirmation.wallet-charge', label: '钱包扣款确认' },
      },
    });
    const { document } = apply(model, patch);

    expect(strictValidateDomainModel(document).issues).toEqual([]);
  });

  it('rejects a target that is not a fulfillment confirmation', () => {
    expect(() =>
      roleifyAndInvertDependency(createProcurementModel(), {
        targetConfirmationRef: 'request.payment',
        socket: { id: 'role.payment-capability', label: '付款能力' },
        supporting: {
          context: { id: 'context.wallet', label: '钱包支付服务' },
          contract: { id: 'contract.wallet', label: '钱包支付服务协议' },
          provider: { id: 'role.wallet-provider', label: '钱包服务商' },
          consumer: { id: 'role.wallet-user', label: '付款用户' },
          request: { id: 'request.wallet-charge', label: '钱包扣款请求' },
          confirmation: {
            id: 'confirmation.wallet-charge',
            label: '钱包扣款确认',
          },
        },
      }),
    ).toThrow('是时段凭证');
  });
});

const calculatorIntent = (overrides: Record<string, unknown> = {}) => ({
  host: {
    ref: 'request.payment',
    attribute: {
      name: 'service_fee',
      label: '服务费',
      meaning: '按协议费率与请求金额派生的服务费',
      valueType: 'money' as const,
      required: true,
      keyData: true,
    },
  },
  context: { id: 'context.fee-rules', label: '费率规则上下文' },
  calculator: {
    id: 'thing.fee-calculator',
    label: '服务费计算器',
    meaning: '按协议费率计算服务费',
    attributes: [
      {
        name: 'rate',
        label: '费率',
        meaning: '协议约定的服务费率',
        valueType: 'decimal' as const,
        required: true,
        keyData: true,
      },
    ],
  },
  rule: {
    id: 'rule.service-fee',
    label: '服务费派生',
    description: '服务费 = 请求金额 × 协议费率',
    expression: 'host.requested_minor_units * calculator.rate',
    resultType: 'money' as const,
  },
  ...overrides,
});

describe('isolateDomainCalculator', () => {
  it('creates the Domain Context, the component and the derivation together', () => {
    const model = createProcurementModel();
    const patch = isolateDomainCalculator(model, calculatorIntent());
    const { document } = apply(model, patch);

    expect(patch.createdIds).toEqual([
      'context.fee-rules',
      'thing.fee-calculator',
      'request.payment.service_fee',
      'rule.service-fee',
    ]);
    expect(
      document.entities.find((entity) => entity.id === 'context.fee-rules'),
    ).toMatchObject({ kind: 'domain', rootRefs: ['thing.fee-calculator'] });
    expect(
      document.entities.find((entity) => entity.id === 'thing.fee-calculator'),
    ).toMatchObject({
      category: 'participant',
      kind: 'thing',
      domainRole: 'calculator',
      contextRef: 'context.fee-rules',
    });
  });

  it('binds both sides of the link the static check demands', () => {
    const model = createProcurementModel();
    const { document } = apply(model, isolateDomainCalculator(model, calculatorIntent()));
    const request = document.entities.find(
      (entity) => entity.id === 'request.payment',
    );

    expect(
      request?.attributes?.find((attribute) => attribute.name === 'service_fee'),
    ).toMatchObject({ derivedByRuleRef: 'rule.service-fee' });
    expect(document.rules.find((rule) => rule.id === 'rule.service-fee')).toMatchObject({
      contextRef: 'context.procurement',
      target: { entityRef: 'request.payment', attribute: 'service_fee' },
    });
  });

  it('keeps the resulting model free of static FM issues', () => {
    const model = createProcurementModel();
    const { document } = apply(model, isolateDomainCalculator(model, calculatorIntent()));

    expect(strictValidateDomainModel(document).issues).toEqual([]);
  });

  it('reuses a Domain Context that already exists instead of creating a second', () => {
    const model = createProcurementModel();
    const patch = isolateDomainCalculator(model, {
      ...calculatorIntent(),
      context: { id: 'context.catalogue', label: '商品目录上下文' },
    });

    expect(patch.createdIds).not.toContain('context.catalogue');
  });

  it('adds an attribute that the host does not carry yet', () => {
    const model = createProcurementModel();
    const patch = isolateDomainCalculator(model, {
      ...calculatorIntent(),
      host: {
        ref: 'confirmation.payment',
        attribute: {
          name: 'net_amount',
          label: '实收金额',
          meaning: '扣费后的实收金额',
          valueType: 'money' as const,
          required: true,
          keyData: true,
        },
      },
      rule: {
        id: 'rule.net-amount',
        label: '实收金额派生',
        description: '实收金额 = 请求金额 × 费率',
        expression: 'host.requested_minor_units * calculator.rate',
        resultType: 'money' as const,
      },
    });

    expect(patch.commands.map((command) => command.type)).toContain('add-attribute');
  });

  it('refuses to overwrite a value that is already derived', () => {
    const model = createProcurementModel();
    const request = model.entities.find((entity) => entity.id === 'request.payment');

    if (request?.category !== 'evidence') {
      throw new Error('fixture changed');
    }

    request.attributes?.push({
      name: 'already_derived',
      label: '已有派生',
      meaning: '已经由规则写入',
      valueType: 'int',
      derivedByRuleRef: 'rule.existing',
    });

    expect(() =>
      isolateDomainCalculator(model, {
        ...calculatorIntent(),
        host: {
          ref: 'request.payment',
          attribute: {
            name: 'already_derived',
            label: '已有派生',
            meaning: '已经由规则写入',
            valueType: 'int',
          },
        },
      }),
    ).toThrow('已有派生规则');
  });

  it('refuses a context that is not a Domain Context', () => {
    expect(() =>
      isolateDomainCalculator(
        createProcurementModel(),
        {
          ...calculatorIntent(),
          context: { id: 'context.procurement', label: '采购上下文' },
        },
      ),
    ).toThrow('不是领域上下文');
  });
});

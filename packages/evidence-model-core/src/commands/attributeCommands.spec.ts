import { describe, expect, it } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  AddAttributeCommand,
  RemoveAttributeCommand,
  UpdateAttributeCommand,
} from './attributeCommands.js';
import { BindDerivedRuleCommand } from './derivationCommands.js';
import { ModelCommandError } from './types.js';

const baseDocument = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'attribute-commands',
    name: '属性命令夹具（Attribute Commands Fixture）',
    version: '1.0.0',
    ruleLanguage: 'CEL',
    entryContextRefs: ['context.procurement'],
  },
  entities: [
    {
      type: 'entity',
      id: 'context.procurement',
      category: 'context',
      kind: 'contract',
      label: '商品采购（Procurement）',
      rootRefs: ['evidence.contract'],
    },
    {
      type: 'entity',
      id: 'evidence.contract',
      category: 'evidence',
      kind: 'contract',
      label: '采购协议（Procurement Contract）',
      contextRef: 'context.procurement',
      roleRefs: ['role.buyer', 'role.supplier'],
      attributes: [
        {
          name: 'signed_at',
          label: '签署时间（Signed At）',
          meaning: '双方签署时登记。',
          valueType: 'timestamp',
          required: true,
          keyData: true,
        },
        {
          name: 'total_amount',
          label: '合同总额（Total Amount）',
          meaning: '按数量与单价派生。',
          valueType: 'money',
          keyData: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'role.buyer',
      category: 'role',
      kind: 'party',
      label: '采购方（Buyer）',
      contextRef: 'context.procurement',
    },
    {
      type: 'entity',
      id: 'role.supplier',
      category: 'role',
      kind: 'party',
      label: '供应方（Supplier）',
      contextRef: 'context.procurement',
    },
  ],
  relationships: [],
  rules: [],
});

const attributeNames = (document: DomainModelDocument): string[] =>
  document.entities
    .find((entity) => entity.id === 'evidence.contract')!
    .attributes!.map((attribute) => attribute.name);

describe('AddAttributeCommand', () => {
  it('appends an attribute and undoes it', () => {
    const command = new AddAttributeCommand('evidence.contract', {
      name: 'delivery_days',
      label: '交付天数（Delivery Days）',
      meaning: '合同约定交付期限。',
      valueType: 'duration',
      keyData: true,
    });
    const outcome = command.apply(baseDocument());

    expect(attributeNames(outcome.document)).toContain('delivery_days');
    expect(attributeNames(outcome.inverse.apply(outcome.document).document)).toEqual([
      'signed_at',
      'total_amount',
    ]);
  });

  it('inserts at the requested position', () => {
    const outcome = new AddAttributeCommand(
      'evidence.contract',
      {
        name: 'currency',
        label: '币种（Currency）',
        meaning: '合同约定结算币种。',
        valueType: 'string',
      },
      1,
    ).apply(baseDocument());

    expect(attributeNames(outcome.document)).toEqual([
      'signed_at',
      'currency',
      'total_amount',
    ]);
  });

  it('rejects a duplicate name and an empty meaning', () => {
    expect(() =>
      new AddAttributeCommand('evidence.contract', {
        name: 'signed_at',
        label: '签署时间（Signed At）',
        meaning: '重复定义。',
      }).apply(baseDocument()),
    ).toThrowError(ModelCommandError);

    expect(() =>
      new AddAttributeCommand('evidence.contract', {
        name: 'empty_meaning',
        label: '空含义（Empty Meaning）',
        meaning: '   ',
      }).apply(baseDocument()),
    ).toThrowError(/must state who provides the value/);
  });
});

describe('RemoveAttributeCommand', () => {
  it('drops a plain attribute', () => {
    const outcome = new RemoveAttributeCommand(
      'evidence.contract',
      'total_amount',
    ).apply(baseDocument());

    expect(attributeNames(outcome.document)).toEqual(['signed_at']);
  });

  it('refuses to remove a derived attribute without cascade', () => {
    const bound = new BindDerivedRuleCommand({
      entityRef: 'evidence.contract',
      attribute: 'total_amount',
      rule: {
        id: 'rule.contract-total',
        label: '合同总额派生',
        description: '按合同参数派生。',
        bindings: { contract: { ref: 'evidence.contract' } },
        expression: 'contract.signed_at != null',
        resultType: 'money',
      },
    }).apply(baseDocument());

    expect(() =>
      new RemoveAttributeCommand('evidence.contract', 'total_amount').apply(
        bound.document,
      ),
    ).toThrowError(/is written by rule/);

    const removed = new RemoveAttributeCommand('evidence.contract', 'total_amount', {
      cascade: true,
    }).apply(bound.document);

    expect(attributeNames(removed.document)).toEqual(['signed_at']);
    expect(removed.document.rules).toHaveLength(0);
    expect(
      attributeNames(removed.inverse.apply(removed.document).document),
    ).toEqual(['signed_at', 'total_amount']);
  });
});

describe('UpdateAttributeCommand', () => {
  it('patches one field and restores it on undo', () => {
    const outcome = new UpdateAttributeCommand(
      'evidence.contract',
      'total_amount',
      { keyData: false, label: '协议总额（Agreed Total）' },
    ).apply(baseDocument());
    const updated = outcome.document.entities.find(
      (entity) => entity.id === 'evidence.contract',
    )!;

    expect(updated.attributes?.[1]).toMatchObject({
      name: 'total_amount',
      keyData: false,
      label: '协议总额（Agreed Total）',
    });

    const restored = outcome.inverse.apply(outcome.document).document;
    const original = restored.entities.find(
      (entity) => entity.id === 'evidence.contract',
    )!;

    expect(original.attributes?.[1]).toMatchObject({
      keyData: true,
      label: '合同总额（Total Amount）',
    });
  });

  it('rejects a rename while a derivation rule writes the attribute', () => {
    const bound = new BindDerivedRuleCommand({
      entityRef: 'evidence.contract',
      attribute: 'total_amount',
      rule: {
        id: 'rule.contract-total',
        label: '合同总额派生',
        description: '按合同参数派生。',
        bindings: { contract: { ref: 'evidence.contract' } },
        expression: 'contract.signed_at != null',
        resultType: 'money',
      },
    }).apply(baseDocument());

    expect(() =>
      new UpdateAttributeCommand('evidence.contract', 'total_amount', {
        name: 'agreed_total',
      }).apply(bound.document),
    ).toThrowError(/cannot be renamed/);
  });
});

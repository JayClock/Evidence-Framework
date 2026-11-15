import { runMutation } from '../testing/runMutation.js';
import type { ModelRecipe } from '../session/types.js';
import { describe, expect, it } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  addAttributeMutator,
  removeAttributeMutator,
  updateAttributeMutator,
} from './attributeMutations.js';
import { bindDerivedRuleMutator } from './derivationMutations.js';
import { ModelMutationError } from './errors.js';

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

describe('addAttributeMutator', () => {
  it('appends an attribute and undoes it', () => {
    const command = (draft: Parameters<ModelRecipe>[0]) =>
      addAttributeMutator(draft, 'evidence.contract', {
        name: 'delivery_days',
        label: '交付天数（Delivery Days）',
        meaning: '合同约定交付期限。',
        valueType: 'duration',
        keyData: true,
      });
    const outcome = runMutation(baseDocument(), command);

    expect(attributeNames(outcome.document)).toContain('delivery_days');
    expect(attributeNames(outcome.undo())).toEqual([
      'signed_at',
      'total_amount',
    ]);
  });

  it('inserts at the requested position', () => {
    const outcome = runMutation(
      baseDocument(),
      (draft: Parameters<ModelRecipe>[0]) =>
        addAttributeMutator(
          draft,
          'evidence.contract',
          {
            name: 'currency',
            label: '币种（Currency）',
            meaning: '合同约定结算币种。',
            valueType: 'string',
          },
          1,
        ),
    );

    expect(attributeNames(outcome.document)).toEqual([
      'signed_at',
      'currency',
      'total_amount',
    ]);
  });

  it('rejects a duplicate name and an empty meaning', () => {
    expect(() =>
      runMutation(baseDocument(), (draft: Parameters<ModelRecipe>[0]) =>
        addAttributeMutator(draft, 'evidence.contract', {
          name: 'signed_at',
          label: '签署时间（Signed At）',
          meaning: '重复定义。',
        }),
      ),
    ).toThrowError(ModelMutationError);

    expect(() =>
      runMutation(baseDocument(), (draft: Parameters<ModelRecipe>[0]) =>
        addAttributeMutator(draft, 'evidence.contract', {
          name: 'empty_meaning',
          label: '空含义（Empty Meaning）',
          meaning: '   ',
        }),
      ),
    ).toThrowError(/must state who provides the value/);
  });
});

describe('removeAttributeMutator', () => {
  it('drops a plain attribute', () => {
    const outcome = runMutation(
      baseDocument(),
      (draft: Parameters<ModelRecipe>[0]) =>
        removeAttributeMutator(draft, 'evidence.contract', 'total_amount'),
    );

    expect(attributeNames(outcome.document)).toEqual(['signed_at']);
  });

  it('refuses to remove a derived attribute without cascade', () => {
    const bound = runMutation(
      baseDocument(),
      (draft: Parameters<ModelRecipe>[0]) =>
        bindDerivedRuleMutator(draft, {
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
        }),
    );

    expect(() =>
      runMutation(bound.document, (draft: Parameters<ModelRecipe>[0]) =>
        removeAttributeMutator(draft, 'evidence.contract', 'total_amount'),
      ),
    ).toThrowError(/is written by rule/);

    const removed = runMutation(
      bound.document,
      (draft: Parameters<ModelRecipe>[0]) =>
        removeAttributeMutator(draft, 'evidence.contract', 'total_amount', {
          cascade: true,
        }),
    );

    expect(attributeNames(removed.document)).toEqual(['signed_at']);
    expect(removed.document.rules).toHaveLength(0);
    expect(attributeNames(removed.undo())).toEqual([
      'signed_at',
      'total_amount',
    ]);
  });
});

describe('updateAttributeMutator', () => {
  it('patches one field and restores it on undo', () => {
    const outcome = runMutation(
      baseDocument(),
      (draft: Parameters<ModelRecipe>[0]) =>
        updateAttributeMutator(draft, 'evidence.contract', 'total_amount', {
          keyData: false,
          label: '协议总额（Agreed Total）',
        }),
    );
    const updated = outcome.document.entities.find(
      (entity) => entity.id === 'evidence.contract',
    )!;

    expect(updated.attributes?.[1]).toMatchObject({
      name: 'total_amount',
      keyData: false,
      label: '协议总额（Agreed Total）',
    });

    const restored = outcome.undo();
    const original = restored.entities.find(
      (entity) => entity.id === 'evidence.contract',
    )!;

    expect(original.attributes?.[1]).toMatchObject({
      keyData: true,
      label: '合同总额（Total Amount）',
    });
  });

  it('rejects a rename while a derivation rule writes the attribute', () => {
    const bound = runMutation(
      baseDocument(),
      (draft: Parameters<ModelRecipe>[0]) =>
        bindDerivedRuleMutator(draft, {
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
        }),
    );

    expect(() =>
      runMutation(bound.document, (draft: Parameters<ModelRecipe>[0]) =>
        updateAttributeMutator(draft, 'evidence.contract', 'total_amount', {
          name: 'agreed_total',
        }),
      ),
    ).toThrowError(/cannot be renamed/);
  });
});

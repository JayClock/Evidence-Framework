import { describe, expect, it } from 'vitest';

import type {
  DomainModelDocument,
  EntityAST,
} from '@evidence-poc/evidence-schema';

import { auditDomainComponentNaming } from './lintRules.js';

const domainRole = (id: string, label: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'role',
  kind: 'domain',
  label,
  contextRef: 'context.pricing',
});

const calculatorThing = (id: string, label: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'participant',
  kind: 'thing',
  label,
  contextRef: 'context.pricing',
  domainRole: 'calculator',
});

const modelWith = (entities: readonly EntityAST[]): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'advisory-fixture',
    name: '命名建议样例',
    version: '1.0.0',
    ruleLanguage: 'CEL',
    entryContextRefs: ['context.pricing'],
  },
  entities: [...entities],
  relationships: [],
  rules: [],
});

describe('auditDomainComponentNaming', () => {
  it('says nothing about a component named after what it does', () => {
    expect(
      auditDomainComponentNaming(
        modelWith([
          domainRole('role.pricer', '折扣计价器'),
          domainRole('role.auditor', '资格审核员'),
          calculatorThing('thing.tier', '阶梯价计算器'),
          calculatorThing('thing.eligibility', 'EligibilityChecker'),
        ]),
      ),
    ).toEqual([]);
  });

  it('points at a component named after the work instead of the actor', () => {
    const advisories = auditDomainComponentNaming(
      modelWith([
        domainRole('role.discount', '折扣算法'),
        calculatorThing('thing.price', '价格计算'),
      ]),
    );

    expect(advisories.map((advisory) => advisory.entityId)).toEqual([
      'role.discount',
      'thing.price',
    ]);
    expect(advisories[0]?.suggestion).toBe('折扣计算器');

    for (const advisory of advisories) {
      expect(advisory.code).toBe('ROLE_DOMAIN_NAME_NOT_ANTHROPOMORPHIC');
      expect(advisory.message).toContain(advisory.suggestion);
    }
  });

  it('leaves parties and plain things alone', () => {
    expect(
      auditDomainComponentNaming(
        modelWith([
          {
            type: 'entity',
            id: 'role.buyer',
            category: 'role',
            kind: 'party',
            label: '采购方',
            contextRef: 'context.pricing',
          },
          {
            type: 'entity',
            id: 'thing.course',
            category: 'participant',
            kind: 'thing',
            label: '课程',
            contextRef: 'context.pricing',
          },
        ]),
      ),
    ).toEqual([]);
  });
});

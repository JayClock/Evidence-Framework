import { describe, expect, it } from 'vitest';

import {
  ENTITY_CATEGORIES,
  INSPECTOR_ATTRIBUTE_FIELDS,
  INSPECTOR_GROUP_IDS,
  INSPECTOR_GROUP_LABELS,
  INSPECTOR_RULE_FIELDS,
  getInspectorGroup,
  getInspectorGroups,
  getReferenceConstraint,
} from '../index.js';

describe('inspector groups', () => {
  it('exposes a general group for every entity category', () => {
    for (const category of ENTITY_CATEGORIES) {
      const groups = getInspectorGroups(category);

      expect(groups.map((group) => group.id)).toContain('general');
      expect(groups.every((group) => group.category === category)).toBe(true);
    }
  });

  it('labels every declared group', () => {
    for (const groupId of INSPECTOR_GROUP_IDS) {
      expect(INSPECTOR_GROUP_LABELS[groupId].length).toBeGreaterThan(0);
    }
  });

  it('locates a group by id', () => {
    expect(getInspectorGroup('evidence', 'responsibility')?.label).toBe(
      INSPECTOR_GROUP_LABELS.responsibility,
    );
    expect(getInspectorGroup('participant', 'fulfillment')).toBeUndefined();
  });

  it('keeps evidence ids and kinds read-only metadata', () => {
    const general = getInspectorGroup('evidence', 'general');

    expect(general?.properties.map((property) => property.field)).toEqual([
      'id',
      'label',
      'kind',
    ]);
    expect(general?.properties[0]?.editor).toBe('readonly-id');
    expect(general?.properties[2]?.options?.map((option) => option.value)).toEqual([
      'rfp',
      'proposal',
      'contract',
      'fulfillment_request',
      'fulfillment_confirmation',
      'other_evidence',
    ]);
  });

  it('keeps contexts to context-level fields', () => {
    const fields = getInspectorGroups('context').flatMap((group) =>
      group.properties.map((property) => property.field),
    );

    expect(fields).toContain('parentContextRef');
    expect(fields).toContain('rootRefs');
    expect(fields).not.toContain('responsibleRoleRef');
    expect(fields).not.toContain('roleRefs');
  });
});

describe('reference constraints', () => {
  it('requires a Context for contextRef', () => {
    expect(getReferenceConstraint('evidence', 'contextRef')).toEqual({
      categories: ['context'],
    });
  });

  it('restricts responsible roles to same-context Party Roles', () => {
    expect(getReferenceConstraint('evidence', 'responsibleRoleRef')).toEqual({
      categories: ['role'],
      kinds: ['party'],
      sameContext: true,
    });
  });

  it('returns undefined for plain text fields', () => {
    expect(getReferenceConstraint('evidence', 'label')).toBeUndefined();
    expect(getReferenceConstraint('context', 'label')).toBeUndefined();
  });
});

describe('attribute and rule fields', () => {
  it('exposes the key-data flag and derived rule editor', () => {
    const fields = INSPECTOR_ATTRIBUTE_FIELDS.map((field) => field.field);

    expect(fields).toContain('keyData');
    expect(fields).toContain('derivedByRuleRef');
    expect(
      INSPECTOR_ATTRIBUTE_FIELDS.find(
        (field) => field.field === 'derivedByRuleRef',
      )?.editor,
    ).toBe('cel-editor');
    expect(
      INSPECTOR_ATTRIBUTE_FIELDS.find((field) => field.field === 'valueType')
        ?.options,
    ).not.toBeUndefined();
  });

  it('keeps the CEL expression editable in the rule panel', () => {
    expect(
      INSPECTOR_RULE_FIELDS.find((field) => field.field === 'expression')
        ?.editor,
    ).toBe('cel-editor');
    expect(
      INSPECTOR_RULE_FIELDS.find((field) => field.field === 'kind')?.options?.map(
        (option) => option.value,
      ),
    ).toEqual([
      'derivation',
      'precondition',
      'invariant',
      'eligibility',
      'completion',
      'breach',
    ]);
  });
});

import {
  EVIDENCE_TIME_ATTRIBUTE_NAMES,
  type AttributeAST,
} from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { DeliveryField } from './routes.js';

const timeAttributes = new Set<string>(EVIDENCE_TIME_ATTRIBUTE_NAMES);

/** Shared by contract generation and the live inspector; no filesystem dependencies. */
export const fieldFor = (
  attribute: AttributeAST,
  graph: DomainGraph,
  entityRef: string,
): DeliveryField => {
  const rule = graph.derivationRule(entityRef, attribute.name);
  const field: DeliveryField = {
    name: attribute.name,
    label: attribute.label,
    valueType: attribute.valueType ?? 'string',
    required: attribute.required === true,
    reason: 'caller',
    meaning: attribute.meaning,
  };
  if (rule !== undefined || attribute.derivedByRuleRef !== undefined)
    return {
      ...field,
      reason: 'derived',
      ruleRef: rule?.id ?? attribute.derivedByRuleRef,
      ...(rule === undefined ? {} : { ruleExpression: rule.expression }),
    };
  return timeAttributes.has(attribute.name)
    ? { ...field, reason: 'service-time' }
    : field;
};

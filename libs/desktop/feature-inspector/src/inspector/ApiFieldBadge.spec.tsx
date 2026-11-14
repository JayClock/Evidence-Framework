import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { ApiFieldBadge } from './ApiFieldBadge';

it('refreshes input, derived and service-time labels using the same classifier as the contract', () => {
  const document = createDesktopFixture();
  const entityRef = 'evidence.contract';
  const attribute = {
    name: 'total',
    label: '总额',
    meaning: '总额',
    valueType: 'decimal' as const,
  };
  const graph = createDomainGraph(document);
  const { rerender } = render(
    <ApiFieldBadge attribute={attribute} entityRef={entityRef} graph={graph} />,
  );
  expect(screen.getByLabelText('total API 字段：Input')).toBeInTheDocument();
  document.entities
    .find((entity) => entity.id === entityRef)!
    .attributes!.push({ ...attribute, derivedByRuleRef: 'rule.total' });
  document.rules.push({
    type: 'rule',
    id: 'rule.total',
    kind: 'derivation',
    label: '总额',
    description: '总额',
    contextRef: 'context.procurement',
    bindings: {},
    target: { entityRef, attribute: 'total' },
    expression: '10 * 2',
    resultType: 'decimal',
  });
  rerender(
    <ApiFieldBadge
      attribute={{ ...attribute, derivedByRuleRef: 'rule.total' }}
      entityRef={entityRef}
      graph={createDomainGraph(document)}
    />,
  );
  expect(screen.getByLabelText('total API 字段：CEL Derived')).toHaveAttribute(
    'title',
    'rule.total：10 * 2',
  );
  rerender(
    <ApiFieldBadge
      attribute={{ ...attribute, name: 'signed_at' }}
      entityRef={entityRef}
      graph={graph}
    />,
  );
  expect(
    screen.getByLabelText('signed_at API 字段：Service Timestamp'),
  ).toBeInTheDocument();
});

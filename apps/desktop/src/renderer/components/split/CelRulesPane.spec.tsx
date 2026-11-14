import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDesktopFixture } from '@evidence-poc/desktop-testing';

import { CelRulesPane } from './CelRulesPane';

const model = createDesktopFixture();

/** The fixture's rule is a completion; give it a target so it derives a field. */
const derived = {
  ...model,
  rules: model.rules.map((rule) => ({
    ...rule,
    target: { entityRef: 'evidence.contract', attribute: 'total' },
  })),
};

describe('CelRulesPane', () => {
  it('lists the rules the model enforces', () => {
    render(<CelRulesPane document={model} />);

    for (const rule of model.rules) {
      expect(screen.getByText(rule.expression)).toBeInTheDocument();
    }
  });

  it('names the object a rule belongs to back to the canvas', () => {
    const onFocusEntity = vi.fn();
    const targeted = derived.rules[0]!;

    render(
      <CelRulesPane document={derived} onFocusEntity={onFocusEntity} />,
    );
    fireEvent.click(screen.getByText(targeted.expression));

    expect(onFocusEntity).toHaveBeenCalledWith(targeted.target?.entityRef);
  });

  it('follows the canvas selection to the rule that computes it', () => {
    render(
      <CelRulesPane
        document={derived}
        focusEntityId="evidence.contract"
      />,
    );

    const rows = window.document.querySelectorAll(
      '[data-rule-id][aria-pressed="true"]',
    );
    expect(rows).toHaveLength(1);
  });

  it('says so when the model has no rules instead of showing an empty editor', () => {
    render(
      <CelRulesPane document={{ ...model, rules: [] }} />,
    );

    expect(screen.getByText('当前模型还没有派生规则。')).toBeInTheDocument();
  });
});

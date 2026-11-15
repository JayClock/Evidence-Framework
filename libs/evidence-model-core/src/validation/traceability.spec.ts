import type { RuleAST } from '@evidence-poc/evidence-schema';
import { extractRuleAttributeAccesses } from './traceability.js';

const extract = (expression: string) =>
  extractRuleAttributeAccesses({
    type: 'rule',
    id: 'rule.trace',
    kind: 'invariant',
    label: 'Trace',
    description: 'Trace',
    contextRef: 'context.trade',
    resultType: 'bool',
    bindings: {
      request: { ref: 'request.payment' },
      confirmations: { ref: 'confirmation.payment', cardinality: 'many' },
      proofs: { ref: 'evidence.proof', cardinality: 'many' },
      key: { type: 'string' },
    },
    expression,
  } satisfies RuleAST);

const access = (entityRef: string, attribute: string, binding: string) => ({
  entityRef,
  attribute,
  binding,
});

describe('native CEL attribute lineage', () => {
  it('traces nested and chained macros, including filtered maps', () => {
    const result = extract(`confirmations.filter(c, c.amount > 0).map(c,
      proofs.exists(p, p.number == c.number), c).all(c, c.amount == request.amount)`);
    expect(result.errors).toEqual([]);
    expect(result.accesses).toEqual([
      access('confirmation.payment', 'amount', 'confirmations'),
      access('confirmation.payment', 'number', 'confirmations'),
      access('evidence.proof', 'number', 'proofs'),
      access('request.payment', 'amount', 'request'),
    ]);
  });

  it('retains each macro scope when local names shadow business aliases', () => {
    const result = extract(`confirmations.exists(request,
      proofs.exists(request, request.proof_number != "") && request.number != "")
      && request.amount > 0`);
    expect(result.errors).toEqual([]);
    expect(result.accesses).toEqual([
      access('confirmation.payment', 'number', 'confirmations'),
      access('evidence.proof', 'proof_number', 'proofs'),
      access('request.payment', 'amount', 'request'),
    ]);
  });

  it('does not mistake unknown collection locals or transformed values for entities', () => {
    expect(extract('[1].exists(request, request.field == 1)').accesses).toEqual(
      [],
    );
    const result = extract(
      'confirmations.map(c, c.amount).all(request, request.imaginary > 0)',
    );
    expect(result.errors).toEqual([]);
    expect(result.accesses).toEqual([
      access('confirmation.payment', 'amount', 'confirmations'),
    ]);
  });

  it('traces static indexes, nested maps, lists, unary and conditional nodes', () => {
    const result = extract(
      '!false ? [{"value": -request["amount"]}][0].value > request.amount : has(request.number)',
    );
    expect(result.errors).toEqual([]);
    expect(result.accesses).toEqual([
      access('request.payment', 'amount', 'request'),
      access('request.payment', 'number', 'request'),
    ]);
  });

  it('keeps collection and dynamic-index modeling checks', () => {
    expect(extract('confirmations.amount > 0').errors).toEqual([
      "rule.trace: many binding 'confirmations' must be accessed through a CEL collection macro",
    ]);
    expect(extract('request.all(r, r.amount > 0)').errors).toEqual([
      "rule.trace: CEL macro 'all' iterates binding 'request', which must declare cardinality: many",
    ]);
    expect(extract('request[key] > 0').errors).toEqual([
      "rule.trace: Entity binding 'request' must use a static string attribute index for traceability",
    ]);
    expect(extract('confirmations[0].amount > 0').errors).toEqual([
      "rule.trace: many binding 'confirmations' must be accessed through a CEL collection macro",
    ]);
  });

  it('does not require many cardinality for a modeled list attribute', () => {
    const result = extract('request.items.all(item, item > 0)');
    expect(result.errors).toEqual([]);
    expect(result.accesses).toEqual([
      access('request.payment', 'items', 'request'),
    ]);
  });

  it('traces cel.bind aliases without treating the binder as a business input', () => {
    const result = extract('cel.bind(r, request, r.amount > 0)');
    expect(result.errors).toEqual([]);
    expect(result.accesses).toEqual([
      access('request.payment', 'amount', 'request'),
    ]);
  });

  it('leaves native parse failures to syntax diagnostics', () => {
    expect(extract('request.')).toEqual({ accesses: [], errors: [] });
    expect(extract('confirmations.exists(1, true)')).toEqual({
      accesses: [],
      errors: [],
    });
  });
});

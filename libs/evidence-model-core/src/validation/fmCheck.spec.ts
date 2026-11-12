import { fileURLToPath } from 'node:url';

import {
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
} from '../adapters/modelRoot.js';
import { buildFmCheckReport, FM_CHECK_VERSION } from './fmCheck.js';
import { digestOf } from './timeline.js';
import { analyzeTraceability } from './traceability.js';
import { loadValidationSuite } from './validationSuite.js';

const fixture = (name: string, models = true): string =>
  fileURLToPath(
    new URL(
      `../../tests/fixtures/${models ? 'models/' : ''}${name}`,
      import.meta.url,
    ),
  );

const check = async (
  name: string,
  options: {
    scopeRefs?: readonly string[];
    currentDigest?: () => string;
    models?: boolean;
  } = {},
) => {
  const root = fixture(name, options.models ?? true);
  const { bundle, files, issues } = await readModelRoot(root);
  const suite = loadValidationSuite(files);
  const bytes = await readModelRootBytes(root);

  return buildFmCheckReport({
    model: bundle,
    suite,
    sourceIssues: issues.map((issue) => `${issue.path}: ${issue.message}`),
    modelDigest: modelDigestOf(
      bytes.map((file) => ({ path: file.path, content: file.bytes })),
    ),
    ...(options.scopeRefs === undefined ? {} : { scopeRefs: options.scopeRefs }),
    ...(options.currentDigest === undefined
      ? {}
      : { currentDigest: options.currentDigest }),
  });
};

describe('buildFmCheckReport', () => {
  it('reports consistency only when no scope is asked for', async () => {
    const { report } = await check('valid-traceable-subscription');

    expect(report).toMatchObject({
      checkVersion: FM_CHECK_VERSION,
      valid: true,
      consistent: true,
      complete: null,
      scopeRefs: [],
      contextRefs: [],
      gaps: [],
      humanConfirmation: 'not-asserted-by-machine',
      inputChanged: false,
      modelValidated: true,
      scenarioRequirement: 'not-checked',
      scenarioCount: 3,
      executedScenarioCount: 3,
      simulationPassed: true,
      errors: [],
    });
    expect(report.modelDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('reports scope completeness against the pinned digest and summary', async () => {
    const { report } = await check('valid-traceable-subscription', {
      scopeRefs: ['context.content-subscription'],
    });

    // Pinned values for `--scope context.content-subscription`: the digest and
    // the summary are report contract, so they must not drift.
    expect(report).toMatchObject({
      valid: true,
      consistent: true,
      complete: true,
      scopeRefs: ['context.content-subscription'],
      contextRefs: ['context.cms', 'context.content-subscription'],
      gaps: [],
      scenarioRequirement: 'required',
      scenarioCount: 3,
      executedScenarioCount: 3,
      simulationPassed: true,
      errors: [],
      modelDigest:
        'sha256:7b002eff09437a82cc90f6b47830633fff1eeb2aa8f7213ba233e22bcdb21b04',
      timelineSummary: {
        laneCount: 1,
        evidenceTypeCount: 6,
        instanceCount: 6,
        dependencyCount: 6,
        unresolvedOrderCount: 6,
        sha256:
          'sha256:361a464e960aced6a173a1d6f4b74fbf8de7e8ee0d99df853c1106940d0e5602',
      },
    });
    expect(report.scenarioResults).toHaveLength(3);
  });

  it('marks the conclusion stale when the sources change during the check', async () => {
    const { report } = await check('valid-traceable-subscription', {
      scopeRefs: ['context.content-subscription'],
      currentDigest: () => 'sha256:changed',
    });

    expect(report.inputChanged).toBe(true);
    expect(report.consistent).toBe(false);
    expect(report.valid).toBe(false);
    expect(report.complete).toBe(false);
    expect(report.errors).toEqual(['Model inputs changed during validation']);
  });

  it('refuses a scope that is not an independent Context', async () => {
    const { report } = await check('valid-traceable-subscription', {
      scopeRefs: ['request.content-payment'],
    });

    expect(report.valid).toBe(false);
    expect(report.errors).toEqual([
      "scope 'request.content-payment' must be an independent Context, not a fulfillment slice",
    ]);
    expect(report.contextRefs).toEqual([]);
  });

  it('keeps a Contract Context without its primary Fulfillment as a gap', async () => {
    const { report } = await check('invalid-missing-confirmation', {
      models: false,
    });

    expect(report.consistent).toBe(true);
    expect(report.gaps).toEqual([
      'request.content-payment: must be associated with at least one Fulfillment Confirmation or Evidence Role',
      "context.content-subscription: primary Fulfillments must cover both Contract Parties; Party Role 'role.subscriber' is not the right holder of any Fulfillment Request",
    ]);
    expect(report.valid).toBe(true);
    expect(report.simulationPassed).toBeNull();
  });
});

describe('modelDigestOf', () => {
  it('is independent of file order and content changes', () => {
    const a = modelDigestOf([
      { path: 'model.json', content: '{"id":"m"}' },
      { path: 'entities/e.json', content: '{"id":"e"}' },
    ]);
    const b = modelDigestOf([
      { path: 'entities/e.json', content: '{"id":"e"}' },
      { path: 'model.json', content: '{"id":"m"}' },
    ]);

    expect(a).toBe(b);
    expect(a).not.toBe(
      modelDigestOf([{ path: 'model.json', content: '{"id":"other"}' }]),
    );
    expect(digestOf(a)).toMatch(/^sha256:/);
  });
});

describe('analyzeTraceability', () => {
  it('builds lineage nodes and constraints for the golden fixture', async () => {
    const { bundle } = await readModelRoot(fixture('valid-traceable-subscription'));
    const { document, errors } = analyzeTraceability(bundle);

    expect(errors).toEqual([]);
    const paths = document.nodes.map((node) => node.path);

    expect(paths).toContain('request.content-payment#expired_at');
    expect(
      document.nodes.find((node) => node.path === 'request.content-payment#expired_at'),
    ).toMatchObject({ origin: 'derived', derivedByRuleRef: 'rule.payment-deadline' });
    expect(document.edges).toEqual(
      expect.arrayContaining([
        {
          source: 'contract.content-subscription#price_minor_units',
          target: 'request.content-payment#requested_minor_units',
          ruleRef: 'rule.payment-request-amount',
        },
      ]),
    );
  });

  it('rejects a collection binding read without a macro', async () => {
    const { bundle } = await readModelRoot(fixture('valid-traceable-subscription'));
    const broken = {
      ...bundle,
      rules: bundle.rules.map((rule) =>
        rule.id === 'rule.content-payment-completed'
          ? { ...rule, expression: 'confirmations.confirmed_at' }
          : rule,
      ),
    };

    expect(analyzeTraceability(broken).errors).toEqual(
      expect.arrayContaining([
        "rule.content-payment-completed: many binding 'confirmations' must be accessed through a CEL collection macro",
      ]),
    );
  });

  it('rejects a read of an attribute the entity does not model', async () => {
    const { bundle } = await readModelRoot(fixture('valid-traceable-subscription'));
    const broken = {
      ...bundle,
      rules: bundle.rules.map((rule) =>
        rule.id === 'rule.payment-matches-request'
          ? {
              ...rule,
              expression: 'payment.unknown_attribute == request.requested_minor_units',
            }
          : rule,
      ),
    };

    expect(analyzeTraceability(broken).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("reads unknown attribute 'confirmation.content-payment#unknown_attribute'"),
      ]),
    );
  });
});

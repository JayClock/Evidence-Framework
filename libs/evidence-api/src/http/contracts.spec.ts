import { buildHttp } from './contracts.js';
import { checkConsumption, navigationGraph } from './consumerCoverage.js';
import { checkJourneys } from './httpJourneys.js';
import { buildRepresentations } from './contractLinks.js';
import { buildResources } from '../projection/resources.js';
import { projectCapabilities } from '../projection/capabilities.js';
import { projectCoverage } from '../projection/coverage.js';

import {
  fullLifecycleDesign,
  fullLifecycleIndex,
} from '../../tests/support/fixtures.js';

type Mutable = Record<string, unknown>;

const project = async (
  mutate?: (design: Mutable) => void,
): Promise<{
  http: ReturnType<typeof buildHttp>;
  design: Mutable;
  capabilities: Map<string, { id: string } & Record<string, unknown>>;
}> => {
  const index = await fullLifecycleIndex();
  const design = structuredClone(fullLifecycleDesign()) as Mutable;

  mutate?.(design);

  const resources = buildResources(design, index);
  const capabilities = projectCapabilities(design, index, resources.resources);
  const coverage = projectCoverage(design, index, capabilities.capabilities);

  return {
    http: buildHttp(
      design['http'] as Mutable,
      {
        capabilities: capabilities.capabilities,
        resources: resources.resources,
        coverage: coverage.coverage,
        diagnostics: [],
      },
      index,
    ),
    design,
    capabilities: new Map(capabilities.capabilities.map((item) => [item.id, item])),
  };
};

const httpOf = (design: Mutable): Mutable => design['http'] as Mutable;

describe('buildHttp', () => {
  it('assembles the complete contract of the fixture', async () => {
    const { http } = await project();

    expect(http.diagnostics).toEqual([]);
    expect(http.complete).toBe(true);
    expect(http.runtimeValidated).toBe(false);
    expect(http.representations).toHaveLength(12);
    expect(http.operations).toHaveLength(13);
    expect(http.journeys).toHaveLength(13);
    expect(http.navigation).toHaveLength(12);
    expect(http.consumerCoverage).toHaveLength(1);
  });

  it('resolves a step from the entry point and the response it returned', async () => {
    const { http } = await project();
    const journey = http.journeys[0];

    expect(journey?.status).toBe('mapped');
    expect(journey?.steps[0]).toMatchObject({
      status: 'mapped',
      entryPointRef: 'entry.inquire-products',
      expectStatus: 201,
    });
    expect(
      (journey?.steps[0]?.request as Record<string, unknown>)['uri'],
    ).toBe('/product-inquiries');
    expect(
      (journey?.steps[0]?.expect as Record<string, unknown>)['headers'],
    ).toMatchObject({ Location: expect.stringContaining('/product-inquiries/') });
  });

  it('fills in the cache headers a representation policy requires', async () => {
    const { http } = await project();
    const operation = http.operations.find(
      (item) => item['capabilityRef'] === 'capability.read-product-as-buyer',
    );
    const responses = operation?.['responses'] as Record<string, unknown>[];
    const headers = responses[0]?.['headers'] as Record<string, string>;

    expect(headers['Cache-Control']).toBe('private, max-age=0');
  });

  it('refuses an interface with no contract', async () => {
    const { http } = await project((design) => {
      const operations = httpOf(design)['operations'] as Record<string, unknown>[];
      httpOf(design)['operations'] = operations.filter(
        (item) => item['capabilityRef'] !== 'capability.inquire-products',
      );
    });

    expect(http.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONTRACT_OPERATION_MISSING',
          severity: 'gap',
          targetRef: 'capability.inquire-products',
        }),
      ]),
    );
    expect(http.complete).toBe(false);
  });

  it('refuses a creation response with no Location', async () => {
    const { http } = await project((design) => {
      const operations = httpOf(design)['operations'] as Record<string, unknown>[];
      const operation = operations.find(
        (item) => item['capabilityRef'] === 'capability.inquire-products',
      ) as Record<string, unknown>;
      const responses = operation['responses'] as Record<string, unknown>[];
      const created = responses.find((item) => item['status'] === 201) as Record<
        string,
        unknown
      >;

      created['headers'] = {};
    });

    expect(http.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONTRACT_LOCATION', severity: 'gap' }),
      ]),
    );
  });

  it('refuses a GET that declares a body', async () => {
    const { http } = await project((design) => {
      const operations = httpOf(design)['operations'] as Record<string, unknown>[];
      const operation = operations.find(
        (item) => item['capabilityRef'] === 'capability.read-product-as-buyer',
      ) as Record<string, unknown>;
      const request = operation['request'] as Record<string, unknown>;
      const fields = request['fields'] as Record<string, unknown>[];

      fields.push({
        name: 'quantity',
        schema: { type: 'integer' },
        required: false,
        origin: 'reference',
        fmAttributeRef: 'contract.product-procurement#quantity',
      });
    });

    expect(http.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONTRACT_GET_BODY' }),
      ]),
    );
  });

  it('refuses a write capability with no retry story', async () => {
    const { http } = await project((design) => {
      const operations = httpOf(design)['operations'] as Record<string, unknown>[];
      const operation = operations.find(
        (item) => item['capabilityRef'] === 'capability.inquire-products',
      ) as Record<string, unknown>;

      operation['idempotency'] = {
        mode: 'not_applicable',
        reason: 'x',
      };
    });

    expect(http.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONTRACT_RETRY_UNRESOLVED' }),
      ]),
    );
  });

  it('reports an interface no journey consumes', async () => {
    const { http } = await project((design) => {
      httpOf(design)['journeys'] = [];
    });

    expect(http.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HTTP_FLOW_NOT_EVALUATED',
          severity: 'gap',
        }),
      ]),
    );
  });
});

describe('checkJourneys', () => {
  const assemble = async () => {
    const index = await fullLifecycleIndex();
    const design = structuredClone(fullLifecycleDesign()) as Mutable;
    const resources = buildResources(design, index);
    const capabilities = projectCapabilities(design, index, resources.resources);
    const coverage = projectCoverage(design, index, capabilities.capabilities);
    const representations = buildRepresentations(
      httpOf(design),
      {
        capabilities: capabilities.capabilities,
        resources: resources.resources,
      },
      index,
    );

    return {
      index,
      design,
      capabilities: new Map(capabilities.capabilities.map((item) => [item.id, item])),
      capabilityList: capabilities.capabilities,
      coverage: coverage.coverage,
      operations: (httpOf(design)['operations'] as Record<string, unknown>[]),
      representations: representations.representations,
    };
  };

  it('refuses a step that is not the first and has no entry point', async () => {
    const assembled = await assemble();
    const journey = (httpOf(assembled.design)['journeys'] as Record<string, unknown>[])[0] as Record<
      string,
      unknown
    >;
    const steps = journey['steps'] as Record<string, unknown>[];

    steps[0]!['entryPointRef'] = undefined;

    const { journeys, diagnostics } = checkJourneys(
      httpOf(assembled.design),
      assembled.capabilities,
      assembled.operations,
      assembled.representations,
      assembled.index,
      new Set(['scenario.product-procurement']),
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'HTTP_FLOW_ENTRY', severity: 'gap' }),
      ]),
    );
    expect(journeys[0]?.status).toBe('gap');
  });

  it('refuses a step whose role does not match the journey', async () => {
    const assembled = await assemble();
    const journey = (httpOf(assembled.design)['journeys'] as Record<string, unknown>[])[0] as Record<
      string,
      unknown
    >;

    journey['actorRoleRef'] = 'role.seller';

    const { diagnostics } = checkJourneys(
      httpOf(assembled.design),
      assembled.capabilities,
      assembled.operations,
      assembled.representations,
      assembled.index,
      new Set(['scenario.product-procurement']),
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'HTTP_FLOW_ROLE', severity: 'gap' }),
      ]),
    );
  });

  it('refuses a response status the contract never declares', async () => {
    const assembled = await assemble();
    const journey = (httpOf(assembled.design)['journeys'] as Record<string, unknown>[])[0] as Record<
      string,
      unknown
    >;
    const steps = journey['steps'] as Record<string, unknown>[];

    steps[0]!['expectStatus'] = 418;

    const { diagnostics } = checkJourneys(
      httpOf(assembled.design),
      assembled.capabilities,
      assembled.operations,
      assembled.representations,
      assembled.index,
      new Set(['scenario.product-procurement']),
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'HTTP_FLOW_RESPONSE', severity: 'gap' }),
      ]),
    );
  });
});

describe('checkConsumption', () => {
  it('marks a business step consumed by a successful mapped HTTP step', async () => {
    const { http } = await project();
    const journey = http.journeys.find(
      (item) => item.id === 'http-journey.procurement-1',
    );

    expect(journey).toBeDefined();
    expect(http.consumerCoverage[0]).toMatchObject({
      status: 'mapped',
      steps: [
        expect.objectContaining({
          sourceStepRef: 'step.procurement-1',
          status: 'mapped',
          httpSteps: [
            {
              journeyRef: 'http-journey.procurement-1',
              stepRef: journey?.steps[0]?.id,
            },
          ],
        }),
      ],
    });
  });

  it('reports a business step no successful HTTP step reaches', async () => {
    const { http, capabilities } = await project();
    const { consumerCoverage, diagnostics } = checkConsumption(
      [
        {
          sourceScenarioRef: 'scenario.product-procurement',
          status: 'mapped',
          steps: [
            {
              sourceStepRef: 'step.procurement-1',
              sequence: 1,
              mapping: 'capability',
              status: 'mapped',
              capabilityRef: 'capability.inquire-products',
              actingRoleRef: 'role.buyer',
            },
            {
              sourceStepRef: 'step.procurement-2',
              sequence: 2,
              mapping: 'capability',
              status: 'mapped',
              capabilityRef: 'capability.quote-products',
              actingRoleRef: 'role.seller',
            },
          ],
        },
      ],
      [http.journeys[0]!],
      capabilities as never,
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HTTP_SCENARIO_STEP_UNCOVERED',
          gapKey: 'step.procurement-2.consumption',
        }),
      ]),
    );
    expect(consumerCoverage[0]?.steps[1]?.status).toBe('gap');
  });
});

describe('navigationGraph', () => {
  it('calls a self link navigation only when a read exists', async () => {
    const { http } = await project();
    const edges = navigationGraph(http.representations, new Map());

    expect(edges.every((edge) => edge.rel === 'self')).toBe(true);
    expect(edges.every((edge) => edge.kind === 'identity')).toBe(true);
  });
});

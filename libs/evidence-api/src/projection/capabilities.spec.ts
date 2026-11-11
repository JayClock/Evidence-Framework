import { projectCapabilities } from './capabilities.js';
import { projectCoverage } from './coverage.js';
import { projectModelCoverage } from './modelCoverage.js';
import { buildResources } from './resources.js';
import type { Diagnostic } from '../diagnostics.js';

import {
  fullLifecycleDesign,
  fullLifecycleIndex,
} from '../../tests/support/fixtures.js';

/** Everything a design projects into, in the order a review reads it. */
const project = async (mutate?: (design: ReturnType<typeof fullLifecycleDesign>) => void) => {
  const index = await fullLifecycleIndex();
  const design = structuredClone(fullLifecycleDesign());

  mutate?.(design);

  const resources = buildResources(design, index);
  const capabilities = projectCapabilities(design, index, resources.resources);
  const coverage = projectCoverage(design, index, capabilities.capabilities);
  const modelCoverage = projectModelCoverage(design, index, capabilities.capabilities);
  const diagnostics: Diagnostic[] = [
    ...resources.diagnostics,
    ...capabilities.diagnostics,
    ...coverage.diagnostics,
    ...modelCoverage.diagnostics,
  ];

  return {
    resources: resources.resources,
    ...capabilities,
    ...coverage,
    ...modelCoverage,
    diagnostics,
  };
};

const withCapability = (
  design: ReturnType<typeof fullLifecycleDesign>,
  id: string,
  change: (capability: Record<string, unknown>) => void,
): void => {
  const target = (design['capabilities'] as Record<string, unknown>[]).find(
    (item) => item['id'] === id,
  );

  change(target as Record<string, unknown>);
};

describe('projectCapabilities', () => {
  it('projects every declared interface of the fixture', async () => {
    const { capabilities, diagnostics } = await project();

    expect(diagnostics).toEqual([]);
    expect(capabilities).toHaveLength(13);
    expect(capabilities.map((item) => item.id).sort()).toEqual(
      [...capabilities.map((item) => item.id)].sort(),
    );
    expect(
      capabilities.find((item) => item.id === 'capability.read-product-as-buyer'),
    ).toMatchObject({
      uri: '/products/{productId}',
      roleLabel: '客户',
      method: 'GET',
      view: 'item',
    });
  });

  it('groups two roles reading the same route into one operation', async () => {
    const { operations } = await project();
    const productRead = operations.find(
      (operation) => operation.id === 'operation.product.item.get',
    );

    expect(productRead).toEqual({
      id: 'operation.product.item.get',
      resourceRef: 'resource.product',
      view: 'item',
      method: 'GET',
      uri: '/products/{productId}',
      capabilityRefs: [
        'capability.read-product-as-buyer',
        'capability.read-product-as-seller',
      ],
      actorRoleRefs: ['role.buyer', 'role.seller'],
      effects: [{ kind: 'read', targetRef: 'thing.product' }],
    });
  });

  it('refuses an actor that is not a Party Role', async () => {
    const { diagnostics, capabilities } = await project((design) => {
      withCapability(design, 'capability.inquire-products', (capability) => {
        capability['actorRoleRef'] = 'role.payment-proof';
      });
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ACTOR_ROLE_INVALID',
          targetRef: 'capability.inquire-products',
        }),
      ]),
    );
    // An interface nobody may call is not projected at all.
    expect(
      capabilities.some((item) => item.id === 'capability.inquire-products'),
    ).toBe(false);
  });

  it('holds back a capability whose Party Role no Participant plays', async () => {
    const { diagnostics, capabilities } = await project((design) => {
      withCapability(design, 'capability.inquire-products', (capability) => {
        capability['actorRoleRef'] = 'role.wechat-user';
      });
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ACTOR_PARTY_PLAYER_MISSING',
          severity: 'gap',
          gapKey: 'capability.inquire-products.party-player',
        }),
      ]),
    );
    // A gap keeps the interface out: an actor nobody can be is not callable.
    expect(
      capabilities.some((item) => item.id === 'capability.inquire-products'),
    ).toBe(false);
  });

  it('refuses a method that contradicts its effect', async () => {
    const { diagnostics } = await project((design) => {
      withCapability(design, 'capability.read-product-as-buyer', (capability) => {
        capability['method'] = 'POST';
      });
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'HTTP_EFFECT_CONFLICT' }),
    ]);
  });

  it('refuses mutating Evidence beyond appending it', async () => {
    const { diagnostics } = await project((design) => {
      withCapability(design, 'capability.record-delivery-note', (capability) => {
        capability['method'] = 'PUT';
        capability['effect'] = {
          kind: 'update_domain_object',
          targetRef: 'evidence.delivery-note',
        };
      });
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EVIDENCE_MUTATION_FORBIDDEN' }),
      ]),
    );
  });

  it('refuses a capability with no scenario behind it', async () => {
    const { diagnostics, capabilities } = await project((design) => {
      withCapability(design, 'capability.inquire-products', (capability) => {
        capability['scenarioRefs'] = [];
      });
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CAPABILITY_BASIS_UNRESOLVED',
          gapKey: 'capability.inquire-products.basis',
        }),
      ]),
    );
    expect(
      capabilities.some((item) => item.id === 'capability.inquire-products'),
    ).toBe(false);
  });

  it('refuses a caller scope that does not cover the resource', async () => {
    const { diagnostics } = await project((design) => {
      withCapability(design, 'capability.confirm-payment', (capability) => {
        capability['bindingRefs'] = ['binding.note-delivery'];
      });
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ACTOR_SCOPE_UNRESOLVED' }),
      ]),
    );
  });
});

describe('projectCoverage', () => {
  it('maps every FM step of the fixture to an interface or an activity', async () => {
    const { coverage, diagnostics } = await project();

    expect(diagnostics).toEqual([]);
    expect(coverage).toHaveLength(1);
    expect(coverage[0]).toMatchObject({
      journeyId: 'journey.product-procurement',
      sourceScenarioRef: 'scenario.product-procurement',
      status: 'mapped',
    });
    expect(coverage[0]?.steps.every((step) => step.status === 'mapped')).toBe(true);
    // A non-interface step says so rather than pretending to be a call.
    expect(coverage[0]?.steps[4]).toMatchObject({
      mapping: 'external',
      capabilityRef: null,
    });
  });

  it('names an unmapped FM step instead of skipping it', async () => {
    const { coverage, diagnostics } = await project((design) => {
      const steps = (design['journeys'] as Record<string, unknown>[])[0]?.[
        'steps'
      ] as Record<string, unknown>[];
      steps.splice(2, 1);
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SCENARIO_UNCOVERED',
          gapKey: 'journey.product-procurement.step-3',
        }),
      ]),
    );
    expect(coverage[0]?.status).toBe('gap');
  });

  it('refuses a call whose role or effect differs from the FM step', async () => {
    const { diagnostics } = await project((design) => {
      const steps = (design['journeys'] as Record<string, unknown>[])[0]?.[
        'steps'
      ] as Record<string, unknown>[];
      const call = steps.find((step) => step['mapping'] === 'capability');

      call!['capabilityRef'] = 'capability.read-product-as-buyer';
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SCENARIO_CAPABILITY_MISMATCH' }),
      ]),
    );
  });

  it('reports a scenario the design never maps', async () => {
    const { diagnostics } = await project((design) => {
      (design['journeys'] as unknown[]).length = 0;
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'SCENARIO_UNCOVERED',
        message: '整体 FM 场景未回映到接口或非接口活动',
      }),
    ]);
  });
});

describe('projectModelCoverage', () => {
  it('accounts for every Evidence, Thing and Participant entity', async () => {
    const { modelCoverage, diagnostics } = await project();

    expect(diagnostics).toEqual([]);
    expect(modelCoverage).toHaveLength(19);
    expect(
      modelCoverage.find((row) => row.entityRef === 'contract.product-procurement'),
    ).toMatchObject({ handling: 'api' });
    expect(
      modelCoverage.find((row) => row.entityRef === 'party.buyer-agent'),
    ).toMatchObject({ handling: 'internal', contextRef: null, capabilityRefs: [] });
  });

  it('refuses an entity nobody accounted for', async () => {
    const { diagnostics } = await project((design) => {
      (design['nonApiActivities'] as unknown[]).length = 0;
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MODEL_ENTITY_UNCOVERED',
          targetRef: 'party.buyer-agent',
        }),
      ]),
    );
  });

  it('refuses an internal activity with no business reason', async () => {
    const { diagnostics } = await project((design) => {
      const activities = design['nonApiActivities'] as Record<string, unknown>[];
      const buyer = activities.find(
        (activity) => activity['entityRef'] === 'party.buyer-agent',
      );

      buyer!['basis'] = { fmRefs: [], reasoning: '', sourceRefs: [] };
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MODEL_HANDLING_BASIS',
          gapKey: 'party.buyer-agent.handling',
        }),
      ]),
    );
  });

  it('refuses declaring an entity internal while it already has an interface', async () => {
    const { diagnostics } = await project((design) => {
      const activities = design['nonApiActivities'] as Record<string, unknown>[];
      const first = activities[0] as Record<string, unknown>;

      first['entityRef'] = 'contract.product-procurement';
      first['handling'] = 'internal';
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MODEL_HANDLING_CONFLICT' }),
      ]),
    );
  });
});

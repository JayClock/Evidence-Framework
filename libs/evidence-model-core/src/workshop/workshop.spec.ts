import { createModelSession } from '../session/createModelSession.js';
import { createProcurementModel } from '../testing/modelFixture.js';
import {
  anchorWorkshopContract,
  addWorkshopFulfillment,
} from './workshopMutators.js';
import { inspectWorkshop } from './workshopProgress.js';

describe('guided workshop', () => {
  it('anchors and pairs atomically with undo/redo and no invented facts', () => {
    const model = createProcurementModel();
    const session = createModelSession({ document: model });
    const anchored = session.mutate((d) =>
      anchorWorkshopContract(d, {
        label: '内容订阅',
        partyA: '读者',
        partyB: '平台',
      }),
    );
    const contract = session.getGraph().getEntity(anchored.contractRef);
    if (contract?.category !== 'evidence') throw new Error('missing contract');
    expect(
      inspectWorkshop(session.getDocument(), anchored.contextRef)[0].status,
    ).toBe('ready');
    expect(
      inspectWorkshop(session.getDocument(), anchored.contextRef)[1].status,
    ).toBe('missing');
    const pair = session.mutate((d) =>
      addWorkshopFulfillment(d, {
        contextRef: anchored.contextRef,
        claimantRef: contract.roleRefs![0]!,
        obligorRef: contract.roleRefs![1]!,
        label: '访问内容',
        confirmationLabel: '交付记录',
        deadlineBasis: '以约定访问期限为准',
      }),
    );
    expect(
      session
        .getGraph()
        .fulfillmentPairs()
        .some((p) => p.request.id === pair.request.id),
    ).toBe(true);
    expect(session.validate().valid).toBe(true);
    expect(
      session.getGraph().getEntity(pair.request.id)?.examples,
    ).toBeUndefined();
    expect(session.undo()).toBe(true);
    expect(session.getGraph().getEntity(pair.request.id)).toBeUndefined();
    expect(session.redo()).toBe(true);
    expect(session.getGraph().getEntity(pair.confirmation.id)).toBeDefined();
  });
  it('rejects bad roles without publishing partial changes and keeps human checks pending', () => {
    const session = createModelSession({ document: createProcurementModel() });
    const before = session.getDocument();
    expect(() =>
      session.mutate((d) =>
        addWorkshopFulfillment(d, {
          contextRef: 'context.procurement',
          claimantRef: 'role.buyer',
          obligorRef: 'missing',
          label: '配送',
          confirmationLabel: '签收',
          deadlineBasis: '合同条款',
        }),
      ),
    ).toThrow();
    expect(session.getDocument()).toBe(before);
    const progress = inspectWorkshop(before, 'context.procurement');
    expect(
      progress
        .filter((s) =>
          ['name-things', 'invert-dependency', 'close-breach'].includes(s.id),
        )
        .every((s) => s.status === 'review'),
    ).toBe(true);
    expect(inspectWorkshop(before, 'absent')[0].status).toBe('missing');
  });
});

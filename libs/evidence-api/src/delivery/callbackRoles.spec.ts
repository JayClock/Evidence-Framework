import { createAcceptanceModel } from '../testing/acceptance.js';
import { loadFmFromDocument } from '../adapter/fmAdapter.js';
import { validateProjection } from '../loader/apiLoader.js';
import { buildDelivery, buildProjection } from '../projector.js';
import { operationFor } from '../testing/contract.js';

const callback = 'role.payment-gateway';
const confirm = 'route.confirm.confirmation.payment';

const model = (played: boolean, delegated: boolean) => {
  const doc = createAcceptanceModel();
  const payment = doc.entities.find(({ id }) => id === 'confirmation.payment');
  if (payment?.category !== 'evidence' || payment.contextRef === undefined)
    throw new Error('Missing payment Context');
  doc.entities.push(
    {
      type: 'entity',
      category: 'participant',
      kind: 'party',
      id: 'party.gateway',
      label: '支付系统',
    },
    {
      type: 'entity',
      category: 'role',
      kind: 'third_party',
      id: callback,
      contextRef: payment.contextRef,
      label: '到账通知方',
    },
  );
  if (played)
    doc.relationships.push({
      type: 'relationship',
      kind: 'plays_role',
      id: 'relation.gateway-callback',
      label: '扮演到账通知方',
      sourceRef: 'party.gateway',
      targetRef: callback,
    });
  if (delegated) payment.callbackRoleRefs = [callback];
  return { doc, payment };
};

it('lets an explicitly bound third-party system record the confirmation, not read it', () => {
  const { doc } = model(true, true);
  const snapshot = buildDelivery(doc);
  expect(snapshot.diagnostics).toEqual([]);
  expect(validateProjection(snapshot)).toEqual([]);
  expect(snapshot.routes.find(({ id }) => id === confirm)).toMatchObject({
    allowedPartyRoleRefs: ['role.buyer'],
    allowedCallbackRoleRefs: [callback],
    exposure: 'external',
  });
  expect(
    snapshot.routes
      .filter((route) => route.id !== confirm)
      .every((route) => route.allowedCallbackRoleRefs === undefined),
  ).toBe(true);
  expect(operationFor(snapshot, confirm)).toMatchObject({
    'x-evidence-allowed-callback-roles': [callback],
  });
  expect(snapshot.journeys).toContainEqual(
    expect.objectContaining({ routeId: confirm, roleRef: callback }),
  );
  const overlay = buildProjection({
    index: loadFmFromDocument(doc).index!,
    design: {
      journeys: [{ id: 'notify', routeId: confirm, roleRef: callback }],
    },
  });
  expect(overlay.diagnostics).toEqual([]);
  expect(overlay.projection.journeys[0]).toMatchObject({ roleRef: callback });
});

it.each([
  [false, true],
  [true, false],
])(
  'does not grant callback access without both play and delegation (%s, %s)',
  (played, delegated) => {
    const { doc } = model(played, delegated);
    expect(
      buildDelivery(doc).routes.find(({ id }) => id === confirm)
        ?.allowedCallbackRoleRefs,
    ).toBeUndefined();
  },
);

it('rejects delegation to an arbitrary role and does not grant it', () => {
  const { doc, payment } = model(true, true);
  payment.callbackRoleRefs = ['role.seller'];
  const snapshot = buildDelivery(doc);
  expect(snapshot.diagnostics).toContainEqual(
    expect.objectContaining({
      code: 'FM_INVALID',
      message: expect.stringContaining('Callback roles'),
    }),
  );
  expect(
    snapshot.routes.find(({ id }) => id === confirm)?.allowedCallbackRoleRefs,
  ).toBeUndefined();
});

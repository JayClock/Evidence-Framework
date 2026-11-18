/**
 * The delivery field contract, without a filesystem behind it.
 *
 * The renderer paints field badges and authors inline scenarios without
 * loader, runner or filesystem adapters. Keep the package root's Node-only
 * exports out of browser bundles.
 */
export { buildDeliveryRoutes } from './delivery/routes.js';
export { allowedCallerRoleRefs } from './delivery/addressing.js';
export { fieldFor } from './delivery/fieldOrigin.js';
export type { DeliveryField, DeliveryFieldReason } from './delivery/routes.js';

export { buildDeliveryContract } from './delivery/modelDelivery.js';
export { componentName } from './delivery/schemaName.js';
export { compareText } from './order.js';
export type { DeliveryRoute } from './delivery/routes.js';

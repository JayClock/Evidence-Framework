/**
 * The delivery field contract, without a filesystem behind it.
 *
 * The renderer paints field badges and authors inline scenarios without
 * loader, runner or filesystem adapters. Keep the package root's Node-only
 * exports out of browser bundles.
 */
export { buildDeliveryRoutes } from './delivery/routes.js';
export { projectAcceptanceTests } from './delivery/scenarioProjector.js';
export { fieldFor } from './delivery/fieldOrigin.js';
export type { DeliveryField, DeliveryFieldReason } from './delivery/routes.js';

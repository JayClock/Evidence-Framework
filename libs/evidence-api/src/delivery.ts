/**
 * The delivery field contract, without a filesystem behind it.
 *
 * The renderer paints field badges from `fieldFor` and names routes with
 * `DeliveryField`; neither needs `loader/`, `adapter/` or `renderer/`, which
 * read, write and hash disk. This entry re-exports only the pure pair so a
 * browser bundle never pulls `node:fs` through the package root.
 */
export { fieldFor } from './delivery/fieldOrigin.js';
export type { DeliveryField, DeliveryFieldReason } from './delivery/routes.js';

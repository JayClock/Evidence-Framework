/**
 * Disk adapters for the FM model source tree.
 *
 * Everything in this package touches `node:fs`, so it is imported by the
 * process-side entry points only (the desktop main process, the sensors, the
 * CLI). The in-memory model itself lives in `@evidence-poc/evidence-model-core`
 * and stays usable from the renderer.
 */
export {};

#!/usr/bin/env node
/**
 * Copy the review page assets the packaged desktop app compiles pages from.
 *
 * The sensors and the page compiler run in-process, so the app needs no
 * interpreter and no skill tree beside `app.asar`. What it does need is the four
 * files the page is assembled from, because they are read with `node:fs` and
 * joined into one script before the HTML is written.
 *
 * They ship as `extraResource` rather than inside the archive — outside is
 * where the resolver looks (`process.resourcesPath/assets`), and a plain file
 * read of a directory unpacked next to the archive cannot go wrong.
 *
 *   node scripts/prepare-desktop-resources.mjs
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESOURCES = path.join(ROOT, 'apps', 'desktop', 'resources');

/** The package that owns the assets, so the installer ships what the code reads. */
const ASSETS_SOURCE = path.join(
  ROOT,
  'libs',
  'evidence-visualization',
  'assets',
);
const ASSETS_DESTINATION = path.join(RESOURCES, 'assets');

/** Only what the page needs; the harnesses under `tests/` stay out. */
const ASSETS = ['workbench.html', 'workbench.css', 'workbench.js', 'business-graph.js'];

const log = (message) => process.stderr.write(`[prepare-resources] ${message}\n`);

rmSync(ASSETS_DESTINATION, { recursive: true, force: true });
mkdirSync(ASSETS_DESTINATION, { recursive: true });

for (const name of ASSETS) {
  cpSync(path.join(ASSETS_SOURCE, name), path.join(ASSETS_DESTINATION, name));
}

log(`bundled ${ASSETS.length} page assets into ${ASSETS_DESTINATION}`);

process.stdout.write(`${RESOURCES}\n`);

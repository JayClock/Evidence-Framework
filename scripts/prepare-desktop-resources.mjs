#!/usr/bin/env node
/**
 * Copy the modeling skills the packaged desktop app carries.
 *
 * The sensors run in-process, so the app needs no interpreter beside
 * `app.asar`; what it does need is the skill tree itself, because Pi reads each
 * `SKILL.md` as the agent's instructions and the guides quote paths inside it.
 *
 * electron-forge copies `apps/desktop/resources/skills` next to `app.asar` (see
 * `forge.config.mjs`) — outside the archive, because Pi lists the directory with
 * `node:fs` and a fixture inside the archive cannot be opened by path.
 *
 *   node scripts/prepare-desktop-resources.mjs
 */
import {
  cpSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESOURCES = path.join(ROOT, 'apps', 'desktop', 'resources');
const SKILLS_SOURCE = path.join(ROOT, '.agents', 'skills');
const SKILLS_DESTINATION = path.join(RESOURCES, 'skills');

/** Only the modeling skills travel with the app; third-party ones stay out. */
const SKILL_PREFIX = 'evidence-';

const IGNORED = new Set(['__pycache__', '.DS_Store', '.git']);

const log = (message) => process.stderr.write(`[prepare-resources] ${message}\n`);

const skipSource = (source) => {
  const name = path.basename(source);

  return IGNORED.has(name) || name.endsWith('.pyc');
};

rmSync(SKILLS_DESTINATION, { recursive: true, force: true });
mkdirSync(SKILLS_DESTINATION, { recursive: true });

const skills = readdirSync(SKILLS_SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX))
  .map((entry) => entry.name)
  .sort();

if (skills.length === 0) {
  process.stderr.write(
    `[prepare-resources] no ${SKILL_PREFIX}* directory under .agents/skills; nothing to bundle\n`,
  );
  process.exit(1);
}

for (const skill of skills) {
  cpSync(path.join(SKILLS_SOURCE, skill), path.join(SKILLS_DESTINATION, skill), {
    recursive: true,
    filter: (source) => !skipSource(source),
  });
}

log(`bundled ${skills.length} skills: ${skills.join(', ')}`);

process.stdout.write(`${RESOURCES}\n`);

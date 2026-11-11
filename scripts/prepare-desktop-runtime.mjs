#!/usr/bin/env node
/**
 * Build the read-only resources a packaged desktop app carries.
 *
 * `electron-forge` copies `apps/desktop/resources/{skills,python-runtime}` next
 * to `app.asar` (see `forge.config.mjs`), because a Python subprocess cannot read
 * a script out of the asar archive. The app then runs the pinned interpreter from
 * `process.resourcesPath`, so a user needs neither this repository nor a system
 * Python.
 *
 *   node scripts/prepare-desktop-runtime.mjs                  # sync both
 *   node scripts/prepare-desktop-runtime.mjs --force          # rebuild runtime
 *   node scripts/prepare-desktop-runtime.mjs --without-python # skills only
 *
 * The Python step downloads a standalone CPython through `uv` (`./init.sh
 * --bootstrap` fetches uv into the project cache) and installs
 * `requirements.lock` into it, so the copy stays relocatable.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESOURCES = path.join(ROOT, 'apps', 'desktop', 'resources');
const SKILLS_SOURCE = path.join(ROOT, '.agents', 'skills');
const SKILLS_DESTINATION = path.join(RESOURCES, 'skills');
const RUNTIME_DESTINATION = path.join(RESOURCES, 'python-runtime');
const RUNTIME_MANIFEST = path.join(RUNTIME_DESTINATION, 'runtime.json');
const PYTHON_CACHE = path.join(ROOT, 'node_modules', '.cache', 'python');

/** Only the modeling skills travel with the app; third-party ones stay out. */
const SKILL_PREFIX = 'evidence-';

const IGNORED = new Set(['__pycache__', '.DS_Store', '.git']);

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const WITHOUT_PYTHON = args.has('--without-python');

const log = (message) => process.stderr.write(`[prepare-runtime] ${message}\n`);

const fail = (message) => {
  process.stderr.write(`[prepare-runtime] ${message}\n`);
  process.exit(1);
};

const digestOf = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

const skipSource = (source) => {
  const name = path.basename(source);

  return IGNORED.has(name) || name.endsWith('.pyc');
};

const syncSkills = () => {
  rmSync(SKILLS_DESTINATION, { recursive: true, force: true });
  mkdirSync(SKILLS_DESTINATION, { recursive: true });

  const skills = readdirSync(SKILLS_SOURCE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX))
    .map((entry) => entry.name)
    .sort();

  if (skills.length === 0) {
    fail(`no ${SKILL_PREFIX}* directory under .agents/skills; nothing to bundle`);
  }

  for (const skill of skills) {
    cpSync(path.join(SKILLS_SOURCE, skill), path.join(SKILLS_DESTINATION, skill), {
      recursive: true,
      filter: (source) => !skipSource(source),
    });
  }

  log(`bundled ${skills.length} skills: ${skills.join(', ')}`);
};

const findUv = () => {
  const cacheTools = path.join(ROOT, 'node_modules', '.cache', 'tools');
  const candidates = [];

  if (existsSync(cacheTools)) {
    for (const entry of readdirSync(cacheTools)) {
      candidates.push(path.join(cacheTools, entry, 'uv'));
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    return execFileSync('command', ['-v', 'uv'], {
      shell: 'bash',
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
};

const pythonPin = () =>
  readFileSync(path.join(ROOT, '.python-version'), 'utf8').trim();

/** Locate the interpreter inside a portable distribution or a virtual environment. */
const interpreterIn = (directory) =>
  [
    path.join(directory, 'bin', 'python'),
    path.join(directory, 'Scripts', 'python.exe'),
    path.join(directory, 'python.exe'),
  ].find((candidate) => existsSync(candidate));

const expectedManifest = () => ({
  python: pythonPin(),
  requirements: digestOf(path.join(ROOT, 'requirements.lock')),
});

const runtimeIsCurrent = () => {
  if (!existsSync(RUNTIME_MANIFEST) || interpreterIn(RUNTIME_DESTINATION) === undefined) {
    return false;
  }

  try {
    const recorded = JSON.parse(readFileSync(RUNTIME_MANIFEST, 'utf8'));

    return (
      recorded.python === pythonPin() &&
      recorded.requirements === digestOf(path.join(ROOT, 'requirements.lock'))
    );
  } catch {
    return false;
  }
};

/** Directory `uv python install` created for the pinned version. */
const installedDistribution = () => {
  if (!existsSync(PYTHON_CACHE)) {
    return null;
  }

  const pin = pythonPin();
  const matches = readdirSync(PYTHON_CACHE)
    .filter((entry) => entry.startsWith(`cpython-${pin}.`))
    .map((entry) => path.join(PYTHON_CACHE, entry))
    .filter((entry) => {
      try {
        return statSync(entry).isDirectory();
      } catch {
        return false;
      }
    })
    .map((entry) => realpathSync(entry));

  return [...new Set(matches)].sort().at(-1) ?? null;
};

const buildRuntime = () => {
  const uv = findUv();

  if (uv === null) {
    fail(
      'no uv found. Run ./init.sh --bootstrap to fetch it into the project cache, then retry.',
    );
  }

  log(`installing python ${pythonPin()} through uv`);
  execFileSync(uv, ['python', 'install', pythonPin()], {
    env: { ...process.env, UV_PYTHON_INSTALL_DIR: PYTHON_CACHE },
    stdio: 'inherit',
  });

  const distribution = installedDistribution();

  if (distribution === null) {
    fail(`uv did not install a ${pythonPin()} distribution into node_modules/.cache/python`);
  }

  log(`copying ${path.relative(ROOT, distribution)} into apps/desktop/resources`);
  rmSync(RUNTIME_DESTINATION, { recursive: true, force: true });
  cpSync(distribution, RUNTIME_DESTINATION, {
    recursive: true,
    dereference: true,
    filter: (source) => !skipSource(source),
  });

  const python = interpreterIn(RUNTIME_DESTINATION);

  if (python === undefined) {
    fail('the copied distribution has no interpreter');
  }

  // uv marks its distributions as externally managed (PEP 668). This copy is the
  // app's private runtime, so installing the locked pins into it is the intent.
  for (const marker of ['lib/python3.12/EXTERNALLY-MANAGED', 'Lib/EXTERNALLY-MANAGED']) {
    rmSync(path.join(RUNTIME_DESTINATION, marker), { force: true });
  }

  log('installing requirements.lock into the bundled interpreter');
  execFileSync(
    python,
    [
      '-m',
      'pip',
      'install',
      '--quiet',
      '--disable-pip-version-check',
      '--no-cache-dir',
      '-r',
      path.join(ROOT, 'requirements.lock'),
    ],
    { stdio: 'inherit' },
  );

  execFileSync(python, ['-c', 'import celpy, jsonschema'], { stdio: 'inherit' });
  writeFileSync(RUNTIME_MANIFEST, `${JSON.stringify(expectedManifest(), null, 2)}\n`);
  log('bundled python runtime is ready');
};

const syncRuntime = () => {
  if (!FORCE && runtimeIsCurrent()) {
    log('bundled python runtime already matches .python-version and requirements.lock');

    return;
  }

  buildRuntime();
};

mkdirSync(RESOURCES, { recursive: true });
syncSkills();

if (WITHOUT_PYTHON) {
  log('skipped the python runtime (--without-python)');
} else {
  syncRuntime();
}

process.stdout.write(`${RESOURCES}\n`);

# Environment

The `evidence-*` skills are the modeling runtime: interview, formal model,
API contract and review page all run as local Python scripts under
`.agents/skills/`. Nothing in this path needs Node, Java or network access; the
app slice uses those separately.

The desktop app does not: every check it runs — consistency, key data, interview
trace, timeline, scenarios, stage gate — is implemented in TypeScript under
`packages/evidence-model-core/src/validation/` and decided in-process. The Python
scripts are the reference implementation and the shadow oracle, and this pinned
environment is what keeps them runnable:

| Consumer                                          | Needs this environment |
| ------------------------------------------------- | ---------------------- |
| `apps/desktop` (default `native` sensors)         | no                     |
| `apps/desktop` with `EVIDENCE_SENSORS_ENGINE=python` or `shadow` | yes    |
| `.agents/skills/*/tests` (the skill suites)       | yes                    |
| `evidence-api` / `evidence-visualization` generators | yes                 |

`nx run-many -t test typecheck lint` therefore passes on a machine with no
Python; the suites above are the ones `./init.sh` exists for.

## What the skills need

| Requirement                                         | Declared in                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Python 3.10+ (`jsonschema`, `celpy` importable)     | each `SKILL.md` `compatibility:` line                                  |
| `jsonschema>=4.22,<5`                               | `evidence-discovery/`, `evidence-fm/`, `evidence-api/requirements.txt` |
| `cel-python==0.5.0` (CEL validation and simulation) | `evidence-fm/requirements.txt`                                         |
| Python standard library only                        | `evidence-visualization/requirements.txt`                              |

`*/requirements.txt` states the supported interface range and stays inside each
independently installable package. `requirements.lock` states the exact versions
actually executed here, including transitive pins.

## Locked files

- `.python-version` — required interpreter, `3.12`.
- `requirements.lock` — full pin list; `./init.sh --refresh-lock` regenerates it
  from the installed set, and the diff is reviewed like code.
- `node_modules/.cache/evidence-fm-runtime` — the venv (already ignored by git);
  `pyrightconfig.json` points at the same path. pnpm manages `node_modules`, so a
  clean `node_modules` takes the venv with it: rerun `./init.sh` after removing it.
- `.evidence/{fm,traces}` — created by `./init.sh` so a session starts from
  a fixed layout instead of whatever the machine happens to have.

## Commands

```bash
./init.sh              # create or repair the pinned environment
./init.sh --check      # verify only; exit 1 on drift
./init.sh --bootstrap  # fetch a project-local uv + Python 3.12 when none exists
```

Run modeling scripts with the interpreter `./init.sh` prints (the venv), never a
bare `python3`. With a system Python 3.9 the scripts still import, but
`celpy` cannot be installed, so CEL rules are reported as missing-dependency
errors and FM checks silently stop proving what they claim.

`scripts/check_env.py` is the same verifier `init.sh` calls. It prints the
interpreter, every locked pin against the installed version, import status,
the skill tree digest and the `.evidence` layout, and exits non-zero when
anything drifted. Use `--json` to record a run next to a model check.

## Changing a dependency

1. Edit the owning skill's `requirements.txt` (the interface range).
2. Add or change the pin in `requirements.lock`.
3. `./init.sh --refresh-lock`, then re-run the skill suites:
   `"$PYTHON" .agents/skills/evidence-modeling/tests/run_skill_tests.py`.
4. Keep a check result from before and after the change when the pin moves.

New third-party skills are copied into `.agents/skills/` and committed with the
repository, pinned to a tag or commit. Global skill directories are not part of
this environment.

## The packaged desktop runtime

A released desktop app must work on a machine that never cloned this repository,
so the installer carries its own copies instead of asking the user to install
Python:

```text
Contents/Resources/            (process.resourcesPath)
├── skills/                    .agents/skills/evidence-* copied verbatim
└── python-runtime/            portable CPython 3.12 + requirements.lock
```

- `node scripts/prepare-desktop-runtime.mjs` writes both trees; `nx build
desktop` runs it first (`prepare-runtime` target). It reuses
  `node_modules/.cache/python`, so a local build only pays the copy and
  `pip install` once. `--force` rebuilds, `--without-python` bundles the skills
  alone.
- `python-runtime/runtime.json` records the pinned version and a digest of
  `requirements.lock`; a mismatch is what triggers a rebuild.
- `apps/desktop/resources/` is build output and stays out of git.

At runtime both resolvers read the same fallback chain, so a project can still
override what the app ships:

| What                 | Order                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Skills               | `<project>/.agents/skills` → `<resources>/skills` → the workspace `.agents/skills` in a dev build |
| Python interpreter   | explicit path → `EVIDENCE_VENV` → `<resources>/python-runtime` → `node_modules/.cache/evidence-fm-runtime` |

Because the scripts run as subprocesses, both trees stay outside `app.asar`
(`extraResource`); only the JS bundles are packed into it. An inherited
`PYTHONHOME`/`PYTHONPATH` is dropped before a script runs, so a system Python
cannot be mixed into the bundled one.

The skill guides write commands as `"$PYTHON" -B "$FM_SKILL_DIR/scripts/…"`, so
the desktop also publishes those names to the agent's shell (`skillEnvironment`
in `evidence-agent-core`): `PYTHON`, `EVIDENCE_SKILLS_ROOT`, `SKILL_DIR`, and one
`*_SKILL_DIR` per package. They are re-asserted before every prompt, because a
window opened later republishes them for its own tree.

Per-project paths (`PROJECT_ROOT`, `MODEL_DIR`, `FM_ROOT`, `TRACE_FILE`) stay out
of the environment on purpose: one process serves every open project window, and
a single global value would silently describe the wrong model. Pi runs bash in
the session's working directory — the project root — so a command derives them
from `$PWD`.

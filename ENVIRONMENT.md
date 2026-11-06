# Environment

The `evidence-*` skills are the modeling runtime: interview, formal model,
API contract and review page all run as local Python scripts under
`.agents/skills/`. Nothing in this path needs Node, Java or network access; the
app slice and OpenWiki use those separately.

## What the skills need

| Requirement | Declared in |
| --- | --- |
| Python 3.10+ (`jsonschema`, `celpy` importable) | each `SKILL.md` `compatibility:` line |
| `jsonschema>=4.22,<5` | `evidence-discovery/`, `evidence-fm/`, `evidence-api/requirements.txt` |
| `cel-python==0.5.0` (CEL validation and simulation) | `evidence-fm/requirements.txt` |
| Python standard library only | `evidence-visualization/requirements.txt` |

`*/requirements.txt` states the supported interface range and stays inside each
independently installable package. `requirements.lock` states the exact versions
actually executed here, including transitive pins.

## Locked files

- `.python-version` — required interpreter, `3.12`.
- `requirements.lock` — full pin list; `./init.sh --refresh-lock` regenerates it
  from the installed set, and the diff is reviewed like code.
- `node_modules/.cache/evidence-fm-runtime` — the venv (already ignored by git);
  `pyrightconfig.json` points at the same path.
- `.evidence/{fm,traces,checks}` — created by `./init.sh` so a session starts from
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


## Environment

Modeling runs on a pinned interpreter, never a bare `python3`:

- `./init.sh` creates or repairs the pinned environment; `./init.sh --check` reports drift without installing.
- Run skill scripts and `scripts/check_env.py` with the `PYTHON` it prints. `.python-version` and `requirements.lock` are the pins and are reviewed like code; see [ENVIRONMENT.md](ENVIRONMENT.md).
- `.agents/skills/` is the only skill source. Global skill directories and unpinned third-party skills are not part of this environment.

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->


## Environment

Modeling runs on a pinned interpreter, never a bare `python3`:

- `./init.sh` creates or repairs the pinned environment; `./init.sh --check` reports drift without installing.
- Run skill scripts and `scripts/check_env.py` with the `PYTHON` it prints. `.python-version` and `requirements.lock` are the pins and are reviewed like code; see [ENVIRONMENT.md](ENVIRONMENT.md).
- `.agents/skills/` is the only skill source. Global skill directories and unpinned third-party skills are not part of this environment.

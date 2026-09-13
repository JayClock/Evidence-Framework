"""Run each skill-owned suite in a separate interpreter to isolate test imports."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]


def test_suites(skills: Path) -> list[Path]:
    suites = []
    for directory in sorted(skills.glob("*/tests")):
        if directory.is_dir():
            suites.append(directory)
            portability = directory / "portability"
            if portability.is_dir():
                suites.append(portability)
    return suites


def main() -> int:
    suites = test_suites(SKILLS)
    if not suites:
        print("No skill test suites found", file=sys.stderr)
        return 1
    failed = False
    for suite in suites:
        print(f"\n=== {suite.relative_to(SKILLS)} ===", flush=True)
        result = subprocess.run(
            [
                sys.executable,
                "-B",
                "-m",
                "unittest",
                "discover",
                "-s",
                str(suite),
                "-v",
            ],
            check=False,
        )
        failed = result.returncode != 0 or failed
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Verify the pinned modeling environment before running any model check.

Runs on any supported interpreter, including ones too old for the skills: the
point is to report drift early and loudly instead of letting the modeling
scripts degrade CEL and schema validation into ordinary check errors.

Exit code 0 means every required condition holds; 1 means drift was detected.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.metadata
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
LOCK_FILE = REPO_ROOT / "requirements.lock"
PYTHON_PIN_FILE = REPO_ROOT / ".python-version"
SKILLS_ROOT = REPO_ROOT / ".agents" / "skills"
PYRIGHT_CONFIG = REPO_ROOT / "pyrightconfig.json"
EVIDENCE_DIRS = (".evidence/fm", ".evidence/traces", ".evidence/checks")
SKILL_PACKAGES = {
    "evidence-discovery": ("SKILL.md", "requirements.txt"),
    "evidence-fm": ("SKILL.md", "requirements.txt"),
    "evidence-api": ("SKILL.md", "requirements.txt"),
    "evidence-visualization": ("SKILL.md", "requirements.txt"),
    "evidence-modeling": ("SKILL.md",),
}
REQUIRED_MODULES = {"jsonschema": "jsonschema", "celpy": "cel-python"}
MINIMUM_PYTHON = (3, 10)

PASS = "pass"
FAIL = "fail"


def read_python_pin(errors: list[str]) -> tuple[int, int] | None:
    """Return the pinned major/minor version, or None when unreadable."""
    try:
        text = PYTHON_PIN_FILE.read_text(encoding="utf-8").strip()
    except OSError as error:
        errors.append(f"{PYTHON_PIN_FILE.name}: cannot read pin: {error}")
        return None
    parts = text.split(".")
    try:
        return int(parts[0]), int(parts[1])
    except (IndexError, ValueError):
        errors.append(f"{PYTHON_PIN_FILE.name}: '{text}' is not a major.minor version")
        return None


def read_lock(errors: list[str]) -> dict[str, str]:
    """Return {distribution name: pinned version} from the lockfile."""
    try:
        lines = LOCK_FILE.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        errors.append(f"{LOCK_FILE.name}: cannot read lock: {error}")
        return {}
    pins: dict[str, str] = {}
    for number, line in enumerate(lines, start=1):
        entry = line.split("#", 1)[0].strip()
        if not entry:
            continue
        name, separator, version = entry.partition("==")
        if not separator or not name.strip() or not version.strip():
            errors.append(
                f"{LOCK_FILE.name}:{number}: '{entry}' is not a name==version pin"
            )
            continue
        pins[name.strip()] = version.strip()
    if not pins:
        errors.append(f"{LOCK_FILE.name}: no pins found")
    return pins


def inspect_python(pin: tuple[int, int] | None, errors: list[str]) -> dict[str, object]:
    """Report the interpreter and whether it can run the skills."""
    version = ".".join(str(part) for part in sys.version_info[:3])
    supported = sys.version_info[:2] >= MINIMUM_PYTHON
    if not supported:
        errors.append(
            "python: %s is below the required %d.%d; run ./init.sh and use the "
            "interpreter it prints" % (version, *MINIMUM_PYTHON)
        )
    if pin is not None and sys.version_info[:2] != pin:
        errors.append(
            "python: running %d.%d but .python-version pins %d.%d"
            % (*sys.version_info[:2], *pin)
        )
    in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    return {
        "version": version,
        "executable": sys.executable,
        "prefix": sys.prefix,
        "virtualEnv": in_venv,
        "supported": supported,
    }


def inspect_dependencies(pins: dict[str, str], errors: list[str]) -> list[dict[str, str]]:
    """Compare every locked pin with the version importable right now."""
    report = []
    for name, pinned in sorted(pins.items()):
        try:
            installed = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            installed = None
        except Exception as error:  # malformed local metadata
            installed = None
            errors.append(f"dependency {name}: cannot read metadata: {error}")
        status = PASS if installed == pinned else FAIL
        if installed is None:
            errors.append(f"dependency {name}=={pinned}: not installed")
        elif installed != pinned:
            errors.append(f"dependency {name}: pinned {pinned}, installed {installed}")
        report.append({"name": name, "pinned": pinned, "installed": installed, "status": status})
    return report


def inspect_modules(errors: list[str]) -> dict[str, str]:
    """Import the modules the modeling scripts call directly."""
    report = {}
    for name, distribution in REQUIRED_MODULES.items():
        try:
            importlib.import_module(name)
        except Exception as error:  # anything else means the check would degrade
            report[name] = f"fail: {type(error).__name__}: {error}"
            errors.append(f"module {name}: cannot import: {error}")
            continue
        try:
            version = importlib.metadata.version(distribution)
        except importlib.metadata.PackageNotFoundError:
            version = "unknown"
        report[name] = f"pass {version}"
    return report


def skill_digest(paths: list[Path]) -> str:
    """Hash the skill tree so a recorded run can be tied to exact sources."""
    digest = hashlib.sha256()
    for root in paths:
        for path in sorted(root.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts:
                continue
            digest.update(str(path.relative_to(REPO_ROOT)).encode("utf-8"))
            digest.update(b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
    return "sha256:" + digest.hexdigest()


def inspect_skills(errors: list[str]) -> tuple[list[dict[str, object]], str]:
    """Check every distributed package is present and complete."""
    report = []
    present = []
    for name, required in SKILL_PACKAGES.items():
        root = SKILLS_ROOT / name
        if not root.is_dir():
            report.append({"name": name, "status": FAIL, "missing": ["."]})
            errors.append(f"skill {name}: package directory is missing")
            continue
        missing = [item for item in required if not (root / item).is_file()]
        present.append(root)
        report.append(
            {
                "name": name,
                "status": PASS if not missing else FAIL,
                "missing": missing,
            }
        )
        for item in missing:
            errors.append(f"skill {name}: missing {item}")
    if not present:
        return report, ""
    return report, skill_digest(present)


def inspect_evidence() -> dict[str, bool]:
    return {path: (REPO_ROOT / path).is_dir() for path in EVIDENCE_DIRS}


def inspect_pyright(warnings: list[str]) -> dict[str, object]:
    """Flag a pyright venv target that no longer matches the created venv."""
    if not PYRIGHT_CONFIG.is_file():
        return {}
    try:
        config = json.loads(PYRIGHT_CONFIG.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        warnings.append(f"pyrightconfig.json: cannot read: {error}")
        return {}
    venv_path = config.get("venvPath")
    venv_name = config.get("venv")
    if not venv_path or not venv_name:
        return {}
    expected = (REPO_ROOT / venv_path / venv_name).resolve()
    exists = expected.is_dir()
    if exists and Path(sys.prefix).resolve() != expected:
        warnings.append(
            f"pyrightconfig.json: configured venv {expected} is not the running one "
            f"({sys.prefix})"
        )
    return {"expected": str(expected), "exists": exists}


def build_report() -> dict[str, object]:
    errors: list[str] = []
    warnings: list[str] = []

    pin = read_python_pin(errors)
    pins = read_lock(errors)
    python = inspect_python(pin, errors)
    dependencies = inspect_dependencies(pins, errors)
    modules = inspect_modules(errors)
    skills, digest = inspect_skills(errors)
    evidence = inspect_evidence()
    missing_evidence = [path for path, exists in evidence.items() if not exists]
    for path in missing_evidence:
        warnings.append(f"{path}: not initialized; run ./init.sh")
    pyright = inspect_pyright(warnings)

    return {
        "ok": not errors,
        "python": python,
        "pythonPin": None if pin is None else "%d.%d" % pin,
        "lock": {
            "path": str(LOCK_FILE.relative_to(REPO_ROOT)),
            "pins": len(pins),
            "sha256": (
                hashlib.sha256(LOCK_FILE.read_bytes()).hexdigest()
                if LOCK_FILE.is_file()
                else None
            ),
        },
        "dependencies": dependencies,
        "modules": modules,
        "skills": skills,
        "skillsDigest": digest,
        "evidence": evidence,
        "pyright": pyright,
        "errors": errors,
        "warnings": warnings,
    }


def print_human(report: dict[str, object]) -> None:
    python = report["python"]
    print("python   %s (%s)" % (python["version"], python["executable"]))
    print("venv     %s" % ("yes" if python["virtualEnv"] else "no (system interpreter)"))
    print("lock     %s (%d pins)" % (report["lock"]["path"], report["lock"]["pins"]))
    for item in report["dependencies"]:
        print(
            "  %-10s pinned=%s installed=%s %s"
            % (item["name"], item["pinned"], item["installed"], item["status"])
        )
    for name, status in report["modules"].items():
        print("module   %-10s %s" % (name, status))
    print("skills   %s" % report["skillsDigest"])
    print("evidence %s" % json.dumps(report["evidence"], ensure_ascii=False))
    sys.stdout.flush()
    for warning in report["warnings"]:
        print("warning  %s" % warning, file=sys.stderr)
    for error in report["errors"]:
        print("error    %s" % error, file=sys.stderr)
    print("result   %s" % ("ok" if report["ok"] else "drift detected"))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Check the pinned modeling environment and report drift."
    )
    parser.add_argument("--json", action="store_true", help="print the full report as JSON")
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="print nothing on success; errors still go to stderr",
    )
    arguments = parser.parse_args(argv)

    report = build_report()
    if arguments.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    elif not (arguments.quiet and report["ok"]):
        print_human(report)
    if arguments.quiet:
        for error in report["errors"]:
            print("error    %s" % error, file=sys.stderr)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

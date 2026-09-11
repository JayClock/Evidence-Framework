#!/usr/bin/env python3
"""Inspect FM or validate and project a single api.yaml document."""

from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

api_loader = importlib.import_module("fm_api_core.api_loader")
fm_adapter = importlib.import_module("fm_api_core.fm_adapter")
projector = importlib.import_module("fm_api_core.projector")
renderer = importlib.import_module("fm_api_core.renderer")


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    subcommands = value.add_subparsers(dest="command", required=True)
    for name in ("inspect", "check", "project"):
        command = subcommands.add_parser(name, allow_abbrev=False)
        command.add_argument("--project-root", required=True, type=Path)
        command.add_argument("--fm", required=True, type=Path)
        command.add_argument("--fm-skill", required=True, type=Path)
        if name != "inspect":
            command.add_argument("--api", required=True, type=Path)
            command.add_argument("--require-complete", action="store_true")
        if name == "project":
            command.add_argument("--out", required=True, type=Path)
    return value


def _print(value: Any) -> None:
    sys.stdout.write(renderer.canonical_json(value))


def _within(child: Path, parent: Path) -> bool:
    return child.is_relative_to(parent)


def _validate_paths(args: argparse.Namespace, api: dict | None = None) -> str | None:
    names = ["project_root", "fm", "fm_skill"]
    if args.command != "inspect":
        names.append("api")
    if args.command == "project":
        names.append("out")
    for name in names:
        if not getattr(args, name).is_absolute():
            return f"PATH_NOT_ABSOLUTE: --{name.replace('_', '-')} 必须使用绝对路径"
    project_root = args.project_root.resolve()
    if not project_root.is_dir():
        return "PROJECT_ROOT_INVALID: --project-root 必须是现有目录"
    if args.command != "inspect" and _within(args.api.resolve(), args.fm.resolve()):
        return "API_INPUT_CONFLICT: api.yaml 必须位于 FM 根目录之外"
    if args.command != "project":
        return None
    out = args.out.resolve()
    if not _within(out, project_root):
        return "OUTPUT_OUTSIDE_PROJECT: 输出目录必须位于项目根内"
    protected = [args.fm.resolve(), args.api.resolve()]
    if api is not None:
        protected.extend(
            (project_root / item["path"]).resolve() for item in api["sources"]
        )
    if any(_within(out, path) or _within(path, out) for path in protected):
        return "OUTPUT_INPUT_CONFLICT: 输出不能与 FM、API 输入或来源重叠"
    if out.exists():
        return f"OUTPUT_EXISTS: {out}"
    if not out.parent.is_dir():
        return "OUTPUT_PARENT_INVALID: 输出父目录必须已存在"
    return None


def _inputs_unchanged(
    args: argparse.Namespace, api: dict, projection: dict, index: Any
) -> bool:
    root = args.project_root.resolve()
    try:
        if fm_adapter.snapshot_tree(args.fm.resolve()) != index.files:
            return False
        api_digest = fm_adapter.digest_bytes(args.api.read_bytes())
        if api_digest != projection["inputDigests"]["api"]:
            return False
        sources = {}
        for source in api["sources"]:
            path = (root / source["path"]).resolve()
            if not _within(path, root):
                return False
            sources[source["path"]] = fm_adapter.digest_bytes(path.read_bytes())
        return sources == projection["inputDigests"]["sources"]
    except OSError:
        return False


def _finish(args: argparse.Namespace, projection: dict) -> int:
    diagnostics = projection["diagnostics"]
    has_errors = any(item["severity"] == "error" for item in diagnostics)
    has_gaps = any(item["severity"] == "gap" for item in diagnostics)
    complete = not has_errors and not has_gaps
    if projection["http"] is not None:
        projection["http"]["complete"] = complete
    report = {
        "valid": not has_errors,
        "complete": complete,
        "candidateCount": len(projection["capabilities"]),
        "gapCount": sum(item["severity"] == "gap" for item in diagnostics),
        "diagnostics": diagnostics,
    }
    if args.command == "check":
        _print({**report, "projection": projection})
    elif has_errors or (args.require_complete and has_gaps):
        _print(report)
    else:
        try:
            renderer.write_new_output(
                args.out.resolve(), renderer.render_outputs(projection)
            )
        except (OSError, ValueError, KeyError) as exc:
            print(str(exc), file=sys.stderr)
            return 1
        _print({**report, "out": str(args.out.resolve())})
    if has_errors:
        return 1
    return 3 if args.require_complete and has_gaps else 0


def run(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    path_error = _validate_paths(args)
    if path_error:
        print(path_error, file=sys.stderr)
        return 1
    index, diagnostics = fm_adapter.load_fm(args.fm, args.fm_skill)
    if index is None:
        _print(
            {"valid": False, "diagnostics": [item.to_dict() for item in diagnostics]}
        )
        return 4 if any(item.code.startswith("FM_TOOL") for item in diagnostics) else 1
    if args.command == "inspect":
        _print(fm_adapter.inspect_summary(index))
        return 0
    try:
        content = args.api.read_bytes()
    except OSError as exc:
        _print(
            {
                "valid": False,
                "diagnostics": [
                    {"code": "DESIGN_INVALID", "severity": "error", "message": str(exc)}
                ],
            }
        )
        return 1
    api, diagnostics = api_loader.load_api(args.api, content=content)
    if api is None or diagnostics:
        _print(
            {"valid": False, "diagnostics": [item.to_dict() for item in diagnostics]}
        )
        return 1
    path_error = _validate_paths(args, api)
    if path_error:
        print(path_error, file=sys.stderr)
        return 1
    projection = projector.build_projection(
        api, index, args.project_root.resolve(), fm_adapter.digest_bytes(content)
    )
    if not _inputs_unchanged(args, api, projection, index):
        projection["diagnostics"].append(
            {
                "code": "SOURCE_CHANGED",
                "severity": "error",
                "targetRef": None,
                "location": None,
                "relatedRefs": [],
                "message": "输入在投影期间发生变化",
            }
        )
    diagnostics = api_loader.validate_json(
        projection, SCRIPT_DIR.parent / "schemas/api-projection.schema.json"
    )
    projection["diagnostics"].extend(item.to_dict() for item in diagnostics)
    return _finish(args, projection)


if __name__ == "__main__":
    raise SystemExit(run())

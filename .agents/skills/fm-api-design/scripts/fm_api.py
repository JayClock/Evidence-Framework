#!/usr/bin/env python3
"""Inspect a validated FM model and check or project an explicit API design."""

from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

design_loader = importlib.import_module("fm_api_core.design_loader")
fm_adapter = importlib.import_module("fm_api_core.fm_adapter")
projector = importlib.import_module("fm_api_core.projector")
renderer = importlib.import_module("fm_api_core.renderer")


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    subcommands = value.add_subparsers(dest="command", required=True)
    for name in ("inspect", "check", "project"):
        command = subcommands.add_parser(name)
        command.add_argument("--project-root", required=True, type=Path)
        command.add_argument("--fm", required=True, type=Path)
        command.add_argument("--fm-skill", required=True, type=Path)
        if name != "inspect":
            command.add_argument("--design", required=True, type=Path)
            command.add_argument("--require-complete", action="store_true")
        if name == "project":
            command.add_argument("--out", required=True, type=Path)
    return value


def _print(value: Any) -> None:
    sys.stdout.write(renderer.canonical_json(value))


def _within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def _validate_paths(
    args: argparse.Namespace, design: dict[str, Any] | None = None
) -> str | None:
    project_root = args.project_root.resolve()
    if not project_root.is_dir():
        return "PROJECT_ROOT_INVALID: --project-root 必须是现有目录"
    for name in ("fm", "fm_skill"):
        if not Path(getattr(args, name)).is_absolute():
            return f"PATH_NOT_ABSOLUTE: --{name.replace('_', '-')} 必须使用绝对路径"
    if hasattr(args, "design") and not args.design.is_absolute():
        return "PATH_NOT_ABSOLUTE: --design 必须使用绝对路径"
    if hasattr(args, "out"):
        if not args.out.is_absolute():
            return "PATH_NOT_ABSOLUTE: --out 必须使用绝对路径"
        out = args.out.resolve()
        if not _within(out, project_root):
            return "OUTPUT_OUTSIDE_PROJECT: 输出目录必须位于项目根内"
        protected = [args.fm.resolve(), args.design.resolve()]
        if design:
            protected.extend(
                (project_root / item["path"]).resolve()
                for item in design.get("sources", [])
            )
        if any(
            out == path or _within(out, path) or _within(path, out)
            for path in protected
        ):
            return "OUTPUT_INPUT_CONFLICT: 输出不能与 FM、设计或来源重叠"
        if out.exists():
            return f"OUTPUT_EXISTS: {out}"
        if not out.parent.resolve().is_dir():
            return "OUTPUT_PARENT_INVALID: 输出父目录必须已存在"
    return None


def run(argv: list[str] | None = None) -> int:
    if tuple(sys.version_info[:2]) < (3, 10):
        print("ENVIRONMENT_ERROR: fm-api-design 需要 Python 3.10+", file=sys.stderr)
        return 4
    args = parser().parse_args(argv)
    path_error = _validate_paths(args)
    if path_error:
        print(path_error, file=sys.stderr)
        return 1
    index, fm_diagnostics = fm_adapter.load_fm(args.fm, args.fm_skill)
    if index is None:
        _print(
            {"valid": False, "diagnostics": [item.to_dict() for item in fm_diagnostics]}
        )
        return (
            4 if any(item.code.startswith("FM_TOOL") for item in fm_diagnostics) else 1
        )
    if args.command == "inspect":
        _print(fm_adapter.inspect_summary(index))
        return 0
    design_path = args.design.resolve()
    try:
        design_content = design_path.read_bytes()
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
    design, design_diagnostics = design_loader.load_design(
        design_path, SCRIPT_DIR.parent / "schemas" / "api-design.schema.json"
    )
    if design is None or design_diagnostics:
        _print(
            {
                "valid": False,
                "diagnostics": [item.to_dict() for item in design_diagnostics],
            }
        )
        return 1
    path_error = _validate_paths(args, design)
    if path_error:
        print(path_error, file=sys.stderr)
        return 1
    projection = projector.build_projection(
        design,
        index,
        args.project_root.resolve(),
        fm_adapter.digest_bytes(design_content),
    )
    try:
        inputs_unchanged = (
            fm_adapter.snapshot_tree(args.fm.resolve()) == index.files
            and fm_adapter.digest_bytes(design_path.read_bytes())
            == projection["inputDigests"]["design"]
        )
        current_sources = {
            source["path"]: fm_adapter.digest_bytes(
                (args.project_root.resolve() / source["path"]).resolve().read_bytes()
            )
            for source in design.get("sources", [])
        }
    except OSError:
        inputs_unchanged = False
        current_sources = {}
    inputs_unchanged = (
        inputs_unchanged and current_sources == projection["inputDigests"]["sources"]
    )
    if not inputs_unchanged:
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
    projection_diagnostics = design_loader.validate_json(
        projection, SCRIPT_DIR.parent / "schemas" / "api-projection.schema.json"
    )
    projection["diagnostics"].extend(item.to_dict() for item in projection_diagnostics)
    has_errors = any(item["severity"] == "error" for item in projection["diagnostics"])
    has_gaps = any(item["severity"] == "gap" for item in projection["diagnostics"])
    if args.command == "check":
        _print(
            {
                "valid": not has_errors,
                "complete": not has_errors and not has_gaps,
                "candidateCount": len(projection["capabilities"]),
                "gapCount": sum(
                    item["severity"] == "gap" for item in projection["diagnostics"]
                ),
                "diagnostics": projection["diagnostics"],
                "projection": projection,
            }
        )
    elif args.require_complete and has_gaps:
        _print(
            {
                "valid": True,
                "complete": False,
                "diagnostics": projection["diagnostics"],
            }
        )
    elif not has_errors:
        try:
            renderer.write_new_output(
                args.out.resolve(), renderer.render_outputs(projection)
            )
        except (OSError, KeyError) as exc:
            print(str(exc), file=sys.stderr)
            return 1
        _print(
            {
                "valid": True,
                "complete": not has_gaps,
                "out": str(args.out.resolve()),
                "candidateCount": len(projection["capabilities"]),
                "gapCount": sum(
                    item["severity"] == "gap" for item in projection["diagnostics"]
                ),
            }
        )
    else:
        _print({"valid": False, "diagnostics": projection["diagnostics"]})
    if has_errors:
        return 1
    if args.require_complete and has_gaps:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(run())

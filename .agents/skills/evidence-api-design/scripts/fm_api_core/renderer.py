from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

from . import __version__

openapi_module = importlib.import_module("fm_api_core.openapi")
e2e_vectors_module = importlib.import_module("fm_api_core.e2e_vectors")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def _sha(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def render_outputs(projection: dict[str, Any]) -> dict[str, str]:
    outputs = {
        "projection.json": canonical_json(projection),
    }
    http = projection["http"]
    outputs["http-journeys.json"] = canonical_json(
        {
            "runtimeValidated": False,
            "journeys": http["journeys"],
        }
    )
    outputs["representation-examples.json"] = canonical_json(
        {item["id"]: item["example"] for item in http["representations"]}
    )
    outputs["e2e-test-vectors.json"] = canonical_json(
        e2e_vectors_module.build_vectors(projection)
    )
    outputs["openapi.json"] = openapi_module.render_openapi(projection)
    dependencies: dict[str, str] = {}
    for package in ("jsonschema",):
        try:
            dependencies[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            dependencies[package] = "missing"
    schema_root = Path(__file__).resolve().parents[2] / "schemas"
    schema_digests = {
        name: _sha((schema_root / name).read_text(encoding="utf-8"))
        for name in ("api.schema.json", "api-projection.schema.json")
    }
    manifest = {
        "schemaVersion": "4.0",
        "apiId": projection["apiId"],
        "tool": {
            "name": "evidence-api-design",
            "version": __version__,
            "schemas": schema_digests,
        },
        "runtime": {
            "python": ".".join(map(str, sys.version_info[:3])),
            "dependencies": dependencies,
        },
        "inputs": projection["inputDigests"],
        "outputs": {
            name: {"sha256": _sha(content), "bytes": len(content.encode("utf-8"))}
            for name, content in sorted(outputs.items())
        },
    }
    outputs["manifest.json"] = canonical_json(manifest)
    return outputs


def _write_directory(out: Path, outputs: dict[str, str]) -> None:
    for name in [*sorted(set(outputs) - {"manifest.json"}), "manifest.json"]:
        if Path(name).name != name or name in (".", ".."):
            raise ValueError("OUTPUT_NAME_INVALID: 输出只允许直接文件名")
        path = out / name
        with path.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(outputs[name])
            stream.flush()
            os.fsync(stream.fileno())


def _restore_output(backup: Path | None, out: Path) -> None:
    if backup is None or not backup.exists() or out.exists():
        return
    os.replace(backup, out)


def write_output(out: Path, outputs: dict[str, str]) -> None:
    """Replace the complete generated directory while retaining the old one on failure."""
    parent = out.parent
    stage = Path(tempfile.mkdtemp(prefix=f".{out.name}.stage-", dir=parent))
    backup: Path | None = None
    try:
        _write_directory(stage, outputs)
        if out.exists():
            backup = Path(tempfile.mkdtemp(prefix=f".{out.name}.backup-", dir=parent))
            backup.rmdir()
            os.replace(out, backup)
        try:
            os.replace(stage, out)
        except Exception:
            _restore_output(backup, out)
            raise
        if backup is not None:
            shutil.rmtree(backup)
    finally:
        shutil.rmtree(stage, ignore_errors=True)

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

TOOL_VERSION = "1.0.0"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def capabilities_markdown(projection: dict[str, Any]) -> str:
    lines = [
        "# API 能力候选",
        "",
        "| Role | URI | Method | Business Capability |",
        "| --- | --- | --- | --- |",
    ]
    for item in projection["capabilities"]:
        lines.append(
            f"| {item['roleLabel']} | `{item['uri']}` | {item['method']} | {item['businessCapability']} |"
        )
    if not projection["capabilities"]:
        lines.append("| — | — | — | 当前没有满足依据与约束的候选 |")
    lines.extend(
        [
            "",
            "> 本表是有来源的 API 候选，不是业务批准、完整 REST 契约或运行时授权配置。",
            "",
        ]
    )
    return "\n".join(lines)


def design_report(projection: dict[str, Any]) -> str:
    lines = [
        "# FM → API 设计报告",
        "",
        f"- 设计：`{projection['designId']}`",
        f"- FM 状态：`{projection['fmReviewState'].get('modelStatus')}`",
        f"- 候选数：{len(projection['capabilities'])}",
        f"- 探索项：{len(projection['exploration'])}",
        "",
        "## 资源",
        "",
    ]
    for resource in projection["resources"]:
        lines.append(
            f"- `{resource['id']}`：`{resource['collectionUri']}` / `{resource['itemUri']}` → `{resource['entityRef']}`"
        )
    lines.extend(["", "## HTTP 操作", ""])
    for operation in projection["operations"]:
        lines.append(
            f"- `{operation['method']} {operation['uri']}`：{', '.join(operation['capabilityRefs'])}"
        )
    lines.extend(["", "## 表示与链接", ""])
    if projection["representations"]:
        for representation in projection["representations"]:
            lines.append(
                f"- `{representation['id']}`：{representation['format']}，字段 {len(representation['fields'])}，链接 {len(representation['links'])}"
            )
    else:
        lines.append("- 尚未设计表示。")
    lines.extend(["", "## 流程回映", ""])
    for coverage in projection["coverage"]:
        lines.append(
            f"- `{coverage.get('journeyId', '—')}`：{coverage['status']}（{coverage.get('reason', coverage.get('sourceScenarioRef', ''))}）"
        )
    lines.extend(["", "## 诊断与未决项", ""])
    if projection["diagnostics"]:
        for diagnostic in projection["diagnostics"]:
            suffix = (
                f"；gapKey=`{diagnostic['gapKey']}`" if diagnostic.get("gapKey") else ""
            )
            lines.append(
                f"- **{diagnostic['severity']} / {diagnostic['code']}** `{diagnostic.get('targetRef', '—')}`：{diagnostic['message']}{suffix}"
            )
    else:
        lines.append(
            "- 本次静态投影未发现错误或范围内缺口；这不表示运行验证或业务批准已经完成。"
        )
    lines.extend(
        [
            "",
            "## 检查边界",
            "",
            "静态结果不证明接口已实现、授权已生效、业务场景已运行，也不把 FM 时间字段解释为入库或回调时间。",
            "",
        ]
    )
    return "\n".join(lines)


def _sha(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def render_outputs(projection: dict[str, Any]) -> dict[str, str]:
    outputs = {
        "projection.json": canonical_json(projection),
        "api-capabilities.md": capabilities_markdown(projection),
        "design-report.md": design_report(projection),
    }
    dependencies: dict[str, str] = {}
    for package in ("jsonschema", "PyYAML"):
        try:
            dependencies[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            dependencies[package] = "missing"
    schema_root = Path(__file__).resolve().parents[2] / "schemas"
    schema_digests = {
        name: _sha((schema_root / name).read_text(encoding="utf-8"))
        for name in ("api-design.schema.json", "api-projection.schema.json")
    }
    manifest = {
        "schemaVersion": "1.0",
        "designId": projection["designId"],
        "tool": {
            "name": "fm-api-design",
            "version": TOOL_VERSION,
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


def write_new_output(out: Path, outputs: dict[str, str]) -> None:
    try:
        os.mkdir(out)
    except FileExistsError as exc:
        raise FileExistsError(f"OUTPUT_EXISTS: {out}") from exc
    try:
        for name in (
            "projection.json",
            "api-capabilities.md",
            "design-report.md",
            "manifest.json",
        ):
            temporary = out / f".{name}.tmp"
            with temporary.open("x", encoding="utf-8", newline="\n") as stream:
                stream.write(outputs[name])
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(out / name)
    except Exception:
        shutil.rmtree(out, ignore_errors=True)
        raise

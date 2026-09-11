from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import os
import shutil
import sys
import unicodedata
from pathlib import Path
from typing import Any

from . import __version__

http_report = importlib.import_module("fm_api_core.http_report")
openapi_module = importlib.import_module("fm_api_core.openapi")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def _display_width(value: str) -> int:
    return sum(
        0
        if unicodedata.combining(character)
        else 2
        if unicodedata.east_asian_width(character) in {"F", "W"}
        else 1
        for character in value
    )


def _markdown_table(rows: list[list[str]]) -> list[str]:
    widths = [max(_display_width(row[index]) for row in rows) for index in range(4)]

    def line(row: list[str]) -> str:
        cells = [
            value + " " * (width - _display_width(value))
            for value, width in zip(row, widths, strict=True)
        ]
        return "| " + " | ".join(cells) + " |"

    return [
        line(rows[0]),
        line(["-" * width for width in widths]),
        *map(line, rows[1:]),
    ]


def capabilities_markdown(projection: dict[str, Any]) -> str:
    rows = [["Role", "URI", "Method", "Business Capability"]]
    rows.extend(
        [
            item["roleLabel"],
            f"`{item['uri']}`",
            item["method"],
            item["businessCapability"],
        ]
        for item in projection["capabilities"]
    )
    if not projection["capabilities"]:
        rows.append(["—", "—", "—", "当前模型没有对外业务接口"])
    return "\n".join(
        [
            "# API 接口清单",
            "",
            *_markdown_table(rows),
            "",
            "> 本表是整体 FM 的接口索引；完整 HTTP 契约见 api-contracts.md 与 openapi.yaml，运行时授权仍由服务端执行。",
            "",
        ]
    )


def design_report(projection: dict[str, Any]) -> str:
    lines = [
        "# FM → API 设计报告",
        "",
        f"- 设计：`{projection['apiId']}`",
        f"- FM 状态：`{projection['fmReviewState'].get('modelStatus')}`",
        f"- 接口数（含角色变体）：{len(projection['capabilities'])}",
        f"- 整体 Context 数：{len(projection['contextRefs'])}",
        "",
        "## 资源",
        "",
    ]
    for resource in projection["resources"]:
        lines.append(
            f"- {resource['businessName']}（{resource['shape']}）："
            + " / ".join(f"`{uri}`" for uri in resource["uris"].values())
            + f" → `{resource['entityRef']}`"
        )
    lines.extend(["", "## 整体模型覆盖", ""])
    for item in projection["modelCoverage"]:
        lines.append(
            f"- `{item['entityRef']}`：{item['handling']}；接口：{', '.join(item['capabilityRefs']) or '—'}"
        )
        if item.get("basis"):
            lines.append(f"  - 依据：{item['basis']['reasoning']}")
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
            "- 整体模型与接口静态检查未发现错误或缺口；不代表服务端实现或运行验收已经完成。"
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
    http = projection["http"]
    outputs["api-contracts.md"] = http_report.http_markdown(http)
    outputs["http-journeys.json"] = canonical_json(
        {
            "runtimeValidated": False,
            "journeys": http["journeys"],
        }
    )
    outputs["representation-examples.json"] = canonical_json(
        {item["id"]: item["example"] for item in http["representations"]}
    )
    outputs["openapi.yaml"] = openapi_module.render_openapi(projection)
    dependencies: dict[str, str] = {}
    for package in ("jsonschema", "PyYAML"):
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
            "name": "fm-api-design",
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


def write_new_output(out: Path, outputs: dict[str, str]) -> None:
    try:
        os.mkdir(out)
    except FileExistsError as exc:
        raise FileExistsError(f"OUTPUT_EXISTS: {out}") from exc
    try:
        for name in [*sorted(set(outputs) - {"manifest.json"}), "manifest.json"]:
            if Path(name).name != name or name in (".", ".."):
                raise ValueError("OUTPUT_NAME_INVALID: 输出只允许直接文件名")
            temporary = out / f".{name}.tmp"
            with temporary.open("x", encoding="utf-8", newline="\n") as stream:
                stream.write(outputs[name])
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(out / name)
    except Exception:
        shutil.rmtree(out, ignore_errors=True)
        raise

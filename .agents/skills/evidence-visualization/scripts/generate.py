#!/usr/bin/env python3
"""Build an offline read-only review snapshot using the public FM/API CLIs."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import yaml

ASSETS = Path(__file__).resolve().parents[1] / "assets"
MARKER = "<!-- evidence-review-generated:v1 -->"
DATA_PATTERN = re.compile(
    r'<script type="application/json" id="review-data">\s*(.*?)\s*</script>',
    re.DOTALL,
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def embedded_json(value: object) -> str:
    """A JSON script element must not interpret business text as HTML."""
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    for char in ("<", ">", "&", "\u2028", "\u2029"):
        text = text.replace(char, f"\\u{ord(char):04x}")
    return text


def review_snapshot(data: dict) -> dict:
    """Keep only stable review objects needed for the next semantic comparison."""
    model = data.get("model") or {}
    api = data.get("api") or {}
    groups = {
        "business object": model.get("entities", []),
        "relationship": model.get("relationships", []),
        "rule": model.get("rules", []),
        "scenario": data.get("scenarios", []),
        "API resource": api.get("resources", []),
        "API capability": api.get("capabilities", []),
        "HTTP operation": (api.get("http") or {}).get("operations", []),
    }
    items = {}
    for kind, values in groups.items():
        for value in values:
            item_id = value.get("id")
            if item_id:
                items[f"{kind}:{item_id}"] = {
                    "id": item_id,
                    "kind": kind,
                    "label": value.get("label")
                    or value.get("businessCapability")
                    or value.get("businessName")
                    or item_id,
                    "value": value,
                }
    meta = data.get("meta") or {}
    return {
        "generatedAt": meta.get("generatedAt"),
        "modelDigest": meta.get("modelDigest"),
        "apiDigest": ((data.get("apiManifest") or {}).get("inputs") or {}).get("api"),
        "items": items,
    }


def snapshot_from_page(text: str) -> dict | None:
    if not text.startswith(MARKER):
        return None
    match = DATA_PATTERN.search(text)
    if not match:
        return None
    try:
        return review_snapshot(parse_json(match.group(1)))
    except ValueError:
        return None


def load_previous_snapshot(page: Path) -> dict | None:
    if not page.is_file() or page.is_symlink():
        return None
    return snapshot_from_page(page.read_text(encoding="utf-8"))


def load_git_snapshot(root: Path, page: Path) -> dict | None:
    relative = page.relative_to(root).as_posix()
    result = subprocess.run(
        ["git", "-C", str(root), "show", f"HEAD:{relative}"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    return snapshot_from_page(result.stdout) if result.returncode == 0 else None


def semantic_changes(
    previous: dict | None, current: dict, source: str = "previous-review"
) -> dict:
    now = review_snapshot(current)
    if previous is None:
        return {"available": False, "baseline": None, "items": []}
    before, after = previous["items"], now["items"]
    changes = []
    for key in sorted(set(before) | set(after)):
        old, new = before.get(key), after.get(key)
        if old is None:
            change = "added"
            item = new
        elif new is None:
            change = "removed"
            item = old
        elif json.dumps(old["value"], ensure_ascii=False, sort_keys=True) != json.dumps(
            new["value"], ensure_ascii=False, sort_keys=True
        ):
            change = "changed"
            item = new
        else:
            continue
        needle = item["id"]
        impacts = []
        for scenario in current.get("scenarios", []):
            if needle in json.dumps(scenario, ensure_ascii=False):
                impacts.append(scenario["id"])
        for capability in (current.get("api") or {}).get("capabilities", []):
            if needle != capability.get("id") and needle in json.dumps(
                capability, ensure_ascii=False
            ):
                impacts.append(capability["id"])
        changes.append(
            {
                "change": change,
                "id": item["id"],
                "kind": item["kind"],
                "label": item["label"],
                "impactRefs": sorted(set(impacts)),
            }
        )
    return {
        "available": True,
        "baseline": {
            "source": source,
            "generatedAt": previous.get("generatedAt"),
            "modelDigest": previous.get("modelDigest"),
            "apiDigest": previous.get("apiDigest"),
        },
        "items": changes,
    }


def evidence_files(root: Path) -> list[dict]:
    evidence = root / ".evidence"
    files = []
    for path in sorted(evidence.rglob("*")):
        relative = path.relative_to(evidence)
        if relative.parts[0] in {"views", "checks"}:
            continue
        if path.suffix.lower() not in {".json", ".yaml", ".yml"}:
            continue
        if path.is_symlink() or not path.resolve().is_relative_to(evidence.resolve()):
            raise ValueError(f"拒绝读取链接到其他目录的源文件: {path}")
        if path.is_file():
            data = path.read_bytes()
            files.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "text": data.decode("utf-8"),
                    "sha256": sha(data),
                    "generated": "generated" in relative.parts,
                }
            )
    return files


def file_signature(files: list[dict]) -> dict[str, str]:
    return {file["path"]: file["sha256"] for file in files}


def object_index(files: list[dict]) -> tuple[dict, dict, list, list]:
    locations, objects, scenarios, instances = {}, {}, [], []

    def visit(value: object, path: str) -> None:
        if isinstance(value, dict):
            if isinstance(value.get("id"), str):
                locations.setdefault(value["id"], path)
                objects.setdefault(value["id"], value)
            for child in value.values():
                visit(child, path)
        elif isinstance(value, list):
            for child in value:
                visit(child, path)

    for file in files:
        if file["generated"]:
            continue
        if file["path"].lower().endswith(".json"):
            try:
                value = json.loads(file["text"])
            except json.JSONDecodeError as error:
                raise ValueError(f"无效 JSON {file['path']}: {error}") from error
        else:
            value = yaml.safe_load(file["text"])
        visit(value, file["path"])
        if isinstance(value, dict) and value.get("type") == "fm_scenario":
            scenarios.append(value)
        if isinstance(value, dict) and value.get("type") == "evidence_instance":
            instances.append(value)
    return locations, objects, scenarios, instances


def parse_json(text: str) -> dict:
    try:
        value = json.loads(text)
    except json.JSONDecodeError as error:
        raise ValueError(f"工具返回了无效 JSON: {error}") from error
    if not isinstance(value, dict):
        raise ValueError("工具结果必须是 JSON 对象")
    return value


def read_json(path: Path) -> dict:
    try:
        return parse_json(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise ValueError(f"无法读取工具结果 {path.name}: {error}") from error


def run_json(command: list[str], executions: list[dict]) -> dict:
    result = subprocess.run(command, capture_output=True, text=True, timeout=180)
    executions.append({"command": command, "exitCode": result.returncode})
    if result.returncode:
        raise RuntimeError(
            f"校验或编译失败，保留原视图：\n{result.stdout[-5000:]}\n{result.stderr[-2000:]}"
        )
    return parse_json(result.stdout)


def compile_json(script: Path, fm: Path, output: Path, executions: list[dict]) -> dict:
    command = [sys.executable, "-B", str(script), str(fm), "--output", str(output)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=180)
    executions.append({"command": command, "exitCode": result.returncode})
    if result.returncode:
        raise RuntimeError(result.stdout[-5000:] + result.stderr[-2000:])
    return read_json(output)


def collect(root: Path, fm_skill: Path, api_skill: Path, work: Path) -> dict:
    fm, api = root / ".evidence/fm", root / ".evidence/api/api.yaml"
    files = evidence_files(root)
    executions: list[dict] = []
    command = [sys.executable, "-B", str(fm_skill / "scripts/check_fm.py"), str(fm)]
    check = run_json(command, executions)
    if not check.get("valid") or check.get("inputChanged"):
        raise ValueError("当前 FM 未通过校验，不生成成功审核页")
    data = {}
    for key, script in {
        "model": "compile_fm_model.py",
        "lineage": "build_fm_lineage.py",
        "timeline": "build_fm_timeline.py",
    }.items():
        data[key] = compile_json(
            fm_skill / "scripts" / script, fm, work / f"{key}.json", executions
        )
    data["simulation"] = {"scenarioResults": [], "simulationPassed": None}
    if check.get("executedScenarioCount", 0):
        data["simulation"] = compile_json(
            fm_skill / "scripts/simulate_fm_model.py",
            fm,
            work / "simulation.json",
            executions,
        )
    data["api"] = None
    if api.exists():
        common = [
            sys.executable,
            "-B",
            str(api_skill / "scripts/fm_api.py"),
            "project",
            "--project-root",
            str(root),
            "--fm",
            str(fm),
            "--fm-skill",
            str(fm_skill),
            "--api",
            str(api),
            "--out",
            str(work / "api"),
        ]
        run_json(common, executions)
        data["api"] = read_json(work / "api/projection.json")
        if data["api"]["fmCheckSummary"]["modelDigest"] != check["modelDigest"]:
            raise ValueError("FM 在生成过程中发生变化，请重新生成")
        data["openapi"] = (work / "api/openapi.yaml").read_text()
        data["apiManifest"] = read_json(work / "api/manifest.json")
    final_check = run_json(command, executions)
    if (
        not final_check.get("valid")
        or final_check.get("inputChanged")
        or check["modelDigest"] != final_check["modelDigest"]
        or file_signature(files) != file_signature(evidence_files(root))
    ):
        raise ValueError("输入在生成期间变化，未覆盖原视图")
    locations, objects, scenarios, instances = object_index(files)
    data.update(
        files=files,
        locations=locations,
        objects=objects,
        scenarios=scenarios,
        instances=instances,
        check=final_check,
    )
    data["meta"] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelDigest": final_check["modelDigest"],
        "executions": executions,
        "inputFiles": file_signature(files),
        "generatorVersion": 1,
    }
    return data


def render(data: dict) -> str:
    vendor = (ASSETS / "vendor/cytoscape.min.js").read_text(encoding="utf-8")
    app = (ASSETS / "review.js").read_text(encoding="utf-8")
    style = (ASSETS / "style.css").read_text(encoding="utf-8")
    if "</script" in vendor.lower() or "</script" in app.lower():
        raise ValueError("脚本包含 HTML 结束标签，拒绝直接嵌入")
    page = (ASSETS / "page.html").read_text(encoding="utf-8")
    # Hash exactly what the HTML parser receives, including template whitespace.
    # Both passes expand the original template, never the interpolated business data.
    parts = {
        "CSP": "",
        "STYLE": style,
        "DATA": embedded_json(data),
        "VENDOR": vendor,
        "APP": app,
    }

    def expand() -> str:
        return re.sub(r"@@(CSP|STYLE|DATA|VENDOR|APP)@@", lambda m: parts[m[1]], page)

    scripts = re.findall(r"<script>(.*?)</script>", expand(), re.DOTALL)
    if len(scripts) != 2 or page.count("@@CSP@@") != 1:
        raise ValueError("模板必须包含两个内联脚本和一个 CSP 占位符")
    hashes = [
        base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() for s in scripts
    ]
    csp = (
        "default-src 'none'; script-src "
        + " ".join(f"'sha256-{h}'" for h in hashes)
        + "; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; "
        "object-src 'none'; base-uri 'none'; form-action 'none'"
    )
    parts["CSP"] = csp
    return MARKER + "\n" + expand()


def publish(output: Path, html: str) -> None:
    if output.is_symlink():
        raise ValueError("不覆盖符号链接")
    if output.exists() and not output.read_text(encoding="utf-8").startswith(MARKER):
        raise ValueError(f"{output} 不是本生成器的视图，拒绝覆盖")
    fd, name = tempfile.mkstemp(prefix=".index-", suffix=".html", dir=output.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            file.write(html)
        os.replace(name, output)
    finally:
        Path(name).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="生成离线 FM/API 只读可视化审核页")
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--fm-skill", type=Path)
    parser.add_argument("--api-skill", type=Path)
    args = parser.parse_args()
    root = args.project_root.resolve()
    fm_skill = (args.fm_skill or root / ".agents/skills/evidence-fm").resolve()
    api_skill = (
        args.api_skill or root / ".agents/skills/evidence-api-design"
    ).resolve()
    views = root / ".evidence/views"
    if views.is_symlink() or not views.resolve().is_relative_to(root):
        parser.error("视图目录必须位于当前项目内，且不能是符号链接")
    try:
        views.mkdir(parents=True, exist_ok=True)
        output = views / "index.html"
        previous = load_git_snapshot(root, output)
        baseline_source = "git-head"
        if previous is None:
            previous = load_previous_snapshot(output)
            baseline_source = "previous-review"
        with tempfile.TemporaryDirectory(prefix=".review-", dir=views) as directory:
            data = collect(root, fm_skill, api_skill, Path(directory))
            data["changes"] = semantic_changes(previous, data, baseline_source)
            html = render(data)
            if data["meta"]["inputFiles"] != file_signature(evidence_files(root)):
                raise ValueError("渲染期间输入变化，未覆盖原视图")
            publish(output, html)
        print(
            json.dumps(
                {
                    "output": str(views / "index.html"),
                    "sourceFileCount": len(data["files"]),
                    "modelDigest": data["meta"]["modelDigest"],
                },
                ensure_ascii=False,
            )
        )
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

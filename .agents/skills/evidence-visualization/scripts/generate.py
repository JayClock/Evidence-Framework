#!/usr/bin/env python3
"""Compile a source-free, offline business object workbench."""
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

ASSETS = Path(__file__).resolve().parents[1] / "assets"
MARKER = "<!-- evidence-object-workbench -->"


def read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ValueError(f"无法读取 JSON: {path}") from error
    if not isinstance(value, dict):
        raise ValueError("JSON 根必须是对象")
    return value


def fingerprint(root: Path) -> str:
    """Keep paths and input hashes in process memory, never in the page."""
    root = root.resolve()
    fm = root / ".evidence/fm"
    paths = [p for p in fm.rglob("*") if not any(
        part in {"generated", "__pycache__", "discovery"} or part.startswith(".")
        for part in p.relative_to(fm).parts
    ) and p.suffix in {".json", ".yaml", ".yml"}]
    api = root / ".evidence/api/api.json"
    if api.exists() or api.is_symlink():
        paths.append(api)
    digest = hashlib.sha256()
    for path in sorted(paths):
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError("输入不能链接到项目外部或使用符号链接")
        if path.is_file():
            digest.update(str(path.relative_to(root)).encode())
            digest.update(b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
    return digest.hexdigest()


def run(command: list[str], output: Path | None = None) -> dict:
    result = subprocess.run(command, capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise RuntimeError(f"校验或编译失败：\n{result.stdout}\n{result.stderr}")
    if output is not None:
        return read_json(output)
    try:
        value = json.loads(result.stdout)
    except ValueError as error:
        raise ValueError(f"工具未返回 JSON：{result.stdout}") from error
    if not isinstance(value, dict):
        raise ValueError("工具结果必须是 JSON 对象")
    return value


def select(value: dict, keys: str) -> dict:
    return {key: value[key] for key in keys.split() if key in value}


def scalar_values(value: dict) -> dict:
    return {k: v for k, v in value.items() if isinstance(v, (str, int, float, bool)) or v is None}


def project(model: dict, scenarios: list, instances: list, simulation: dict, api: dict | None) -> dict:
    """Explicit display projection: no raw documents, basis, notes or provenance."""
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    edge_keys = set()

    def add(value: dict, group: str, title: str = "") -> dict:
        identity = value["id"]
        if identity in nodes:
            raise ValueError(f"重复对象 ID: {identity}")
        node = {"id": identity, "label": title or value.get("label") or identity,
                "group": group, "kind": value.get("kind", group),
                "parent": value.get("fulfillmentRef") or value.get("contextRef") or value.get("parentContextRef") or ""}
        if value.get("contextRef"):
            node["contextRef"] = value["contextRef"]
        if value.get("fulfillmentRef"):
            node["fulfillmentRef"] = value["fulfillmentRef"]
        nodes[identity] = node
        return node

    def link(start: str, target: str | None, label: str) -> None:
        if not target:
            return
        key = (start, target, label)
        if key not in edge_keys:
            edge_keys.add(key)
            edges.append({"from": start, "to": target, "label": label})

    for entity in model.get("entities", []):
        node = add(entity, entity["category"])
        link(node["id"], entity.get("contextRef") or entity.get("parentContextRef"), "所属上下文")
        link(node["id"], entity.get("fulfillmentRef"), "所属履约")
        for ref in entity.get("roleRefs", []):
            link(node["id"], ref, "合同责任角色")
        link(node["id"], entity.get("responsibleRoleRef"), "凭证责任方")
        for ref in entity.get("rootRefs", []):
            link(node["id"], ref, "边界根对象")
        for attr in entity.get("attributes", []):
            identity = f'{node["id"]}#{attr["name"]}'
            field = add({"id": identity, "label": attr.get("label", attr["name"])}, "attribute")
            field.update(select(attr, "name valueType required keyData meaning"))
            field["parent"] = node["id"]
            link(node["id"], identity, "业务属性")
            link(identity, attr.get("derivedByRuleRef"), "由规则计算")

    for relation in model.get("relationships", []):
        node = add(relation, "relationship")
        node.update(select(relation, "sourceRef targetRef sourceCardinality targetCardinality"))
        link(node["id"], relation["sourceRef"], "关系起点")
        link(node["id"], relation["targetRef"], "关系终点")
        link(relation["sourceRef"], relation["targetRef"], relation.get("label") or relation["kind"])

    for rule in model.get("rules", []):
        node = add(rule, "rule")
        node.update(select(rule, "description expression resultType"))
        node["bindings"] = [{"alias": alias, **select(binding, "ref cardinality type")} for alias, binding in rule.get("bindings", {}).items()]
        link(node["id"], rule.get("contextRef"), "适用上下文")
        link(node["id"], rule.get("fulfillmentRef"), "适用履约")
        for binding in node["bindings"]:
            link(node["id"], binding.get("ref"), f'读取 · {binding["alias"]}')
        target = rule.get("target")
        if target:
            link(node["id"], f'{target["entityRef"]}#{target["attribute"]}', "计算结果")

    for pattern in model.get("businessPatterns", []):
        node = add(pattern, "pattern")
        node["description"] = pattern.get("operationInvariant", "")
        for key, label in {
            "businessSpineRefs": "业务主线", "invariantRefs": "不变规则",
            "variationPointRefs": "变化点", "domainInputRefs": "领域输入",
            "supportedByContractContextRefs": "适用合同边界",
            "domainExampleContextRefs": "领域示例",
        }.items():
            for ref in pattern.get(key, []):
                link(node["id"], ref, label)

    for instance in instances:
        node = add(instance, "instance")
        node["values"] = scalar_values(instance.get("values", {}))
        node["parent"] = instance["entityRef"]
        link(node["id"], instance["entityRef"], "凭证类型")
        for ref in instance.get("basedOn", []):
            if isinstance(ref, str):
                link(node["id"], ref, "已有凭证依赖")

    results = {r["scenarioId"]: r for r in simulation.get("scenarioResults", [])}
    for scenario in scenarios:
        node = add(scenario, "scenario")
        result = results.get(node["id"], {})
        node["asOf"] = scenario.get("asOf")
        node["passed"] = result.get("simulationPassed")
        node["steps"] = [select(step, "sequence actingRoleRef issueInstanceRef availableInstanceRefs") for step in scenario.get("steps", [])]
        node["evaluations"] = []
        actuals = result.get("evaluations", [])
        for index, evaluation in enumerate(scenario.get("evaluations", [])):
            actual = actuals[index] if index < len(actuals) else {}
            if actual.get("ruleRef") != evaluation["ruleRef"]:
                actual = {}
            node["evaluations"].append({"ruleRef": evaluation["ruleRef"], "expected": evaluation.get("expectedResult"), "actual": actual.get("result"), "passed": actual.get("passed")})
            link(node["id"], evaluation["ruleRef"], "验证规则")
        node["statuses"] = [select(s, "fulfillmentRef requestInstanceRef expectedStatus status passed") for s in result.get("fulfillmentStatuses", [])]
        node["events"] = [{"instanceRef": v["instanceRef"], "entityRef": v["entityRef"], "values": scalar_values(v.get("values", {}))} for v in result.get("instanceValues", [])]
        for step in node["steps"]:
            link(node["id"], step.get("actingRoleRef"), "场景参与角色")
            link(node["id"], step.get("issueInstanceRef"), "场景形成凭证")
        for ref in scenario.get("givenInstanceRefs", []):
            link(node["id"], ref, "场景已有凭证")

    if api:
        http = api.get("http", {})
        for resource in api.get("resources", []):
            node = add(resource, "resource", resource.get("businessName", ""))
            node["shape"] = resource.get("shape")
            link(node["id"], resource.get("entityRef"), "业务对象")
            link(node["id"], resource.get("parentRef"), "父资源")
        for binding in api.get("bindings", []):
            node = add(binding, "binding")
            node["kind"] = binding.get("kind", "binding")
            for key, label in {
                "entityRef": "业务对象", "roleRef": "绑定角色", "resourceRef": "绑定资源",
                "relationshipRef": "业务关系", "scopeResourceRef": "实例范围",
                "parentResourceRef": "父资源", "childResourceRef": "子资源",
            }.items():
                link(node["id"], binding.get(key), label)
        for representation in http.get("representations", []):
            node = add(representation, "representation")
            node["fields"] = [select(f, "name required fmAttributeRef origin") | {"valueType": f.get("schema", {}).get("type", "")} for f in representation.get("fields", [])]
            link(node["id"], representation.get("resourceRef"), "表示资源")
            for field in node["fields"]:
                link(node["id"], field.get("fmAttributeRef"), "表示字段")
        operations = {o["capabilityRef"]: o for o in http.get("operations", [])}
        for capability in api.get("capabilities", []):
            node = add(capability, "capability", capability.get("businessCapability", ""))
            node.update(select(capability, "method uri"))
            link(node["id"], capability.get("actorRoleRef"), "调用角色（不代表已授权）")
            link(node["id"], capability.get("resourceRef"), "操作资源")
            link(node["id"], capability.get("effect", {}).get("targetRef"), "作用对象")
            for ref in capability.get("bindingRefs", []):
                link(node["id"], ref, "实例绑定")
            for binding in capability.get("ruleBindings", []):
                link(node["id"], binding.get("ruleRef"), "应用规则")
            operation = operations.get(node["id"], {})
            node["fields"] = [select(f, "name required fmAttributeRef origin") | {"valueType": f.get("schema", {}).get("type", "")} for f in operation.get("request", {}).get("fields", [])]
            for field in node["fields"]:
                link(node["id"], field.get("fmAttributeRef"), "请求字段")
            node["responses"] = [select(r, "status description representationRef") for r in operation.get("responses", [])]
            for response in node["responses"]:
                link(node["id"], response.get("representationRef"), "响应表示")
            node["idempotency"] = operation.get("idempotency", {}).get("mode")
            node["concurrency"] = operation.get("concurrency", {}).get("mode")
        for journey in http.get("journeys", []):
            node = add(journey, "journey")
            node["steps"] = [select(step, "id capabilityRef expectStatus status") for step in journey.get("steps", [])]
            link(node["id"], journey.get("actorRoleRef"), "旅程调用角色")
            for step in node["steps"]:
                link(node["id"], step.get("capabilityRef"), "HTTP 步骤（静态）")

    relations = model.get("relationships", [])
    for node in list(nodes.values()):
        if node["group"] == "fulfillment":
            members = [n for n in nodes.values() if n["parent"] == node["id"]]
            node["requests"] = [n["id"] for n in members if n["kind"] == "fulfillment_request"]
            node["confirmations"] = [n["id"] for n in members if n["kind"] == "fulfillment_confirmation"]
            node["proofRoles"] = sorted({r["targetRef"] for r in relations if r["kind"] == "uses_role" and r["sourceRef"] in node["requests"] and nodes.get(r["targetRef"], {}).get("kind") == "evidence"})
            node["proofPlayers"] = sorted({r["sourceRef"] for r in relations if r["kind"] == "plays_role" and r["targetRef"] in node["proofRoles"]})
            for relation in relations:
                if relation["kind"] == "precedes" and relation["sourceRef"] in node["requests"]:
                    target = nodes.get(relation["targetRef"], {})
                    if target.get("kind") == "fulfillment_confirmation" and target["id"] not in node["confirmations"]:
                        node["confirmations"].append(target["id"])

    return {
        "title": model.get("model", {}).get("name", "业务模型"),
        "nodes": list(nodes.values()), "edges": edges,
        "unresolved": sorted({e["to"] for e in edges if e["to"] not in nodes}),
        "counts": {"contracts": sum(n["group"] == "context" and n["kind"] == "contract" for n in nodes.values()),
                   "entities": len(model.get("entities", [])), "rules": len(model.get("rules", [])),
                   "scenarios": len(scenarios), "capabilities": len((api or {}).get("capabilities", []))},
    }


def collect(root: Path, fm_skill: Path, api_skill: Path, work: Path) -> dict:
    fm = root / ".evidence/fm"
    initial = fingerprint(root)
    command = [sys.executable, "-B", str(fm_skill / "scripts/check_fm.py"), str(fm)]
    check = run(command)
    if not check.get("valid") or check.get("inputChanged"):
        raise ValueError("FM 未通过，不生成视图")

    def compile_model(script: str, name: str) -> dict:
        output = work / name
        return run([sys.executable, "-B", str(fm_skill / "scripts" / script), str(fm), "--output", str(output)], output)

    model = compile_model("compile_fm_model.py", "model.json")
    simulation = compile_model("simulate_fm_model.py", "simulation.json") if check.get("executedScenarioCount") else {}
    scenarios, instances = [], []
    for path in sorted((fm / "validation").rglob("*.json")):
        value = read_json(path)
        if value.get("type") == "fm_scenario":
            scenarios.append(value)
        elif value.get("type") == "evidence_instance":
            instances.append(value)
    api = None
    api_path = root / ".evidence/api/api.json"
    if api_path.exists():
        run([sys.executable, "-B", str(api_skill / "scripts/fm_api.py"), "project",
             "--project-root", str(root), "--fm", str(fm), "--fm-skill", str(fm_skill),
             "--api", str(api_path), "--out", str(work / "api")])
        api = read_json(work / "api/projection.json")
        if api["fmCheckSummary"]["modelDigest"] != check["modelDigest"]:
            raise ValueError("FM 在投影期间变化")
        api["bindings"] = read_json(api_path).get("bindings", [])
    final = run(command)
    if not final.get("valid") or final.get("inputChanged") or final["modelDigest"] != check["modelDigest"] or initial != fingerprint(root):
        raise ValueError("输入在生成期间变化，保留已有视图")
    data = project(model, scenarios, instances, simulation, api)
    data["validation"] = {"fm": True, "simulation": check.get("simulationPassed"),
                          "api": api.get("http", {}).get("complete") if api else None,
                          "runtime": False, "unresolvedOrderCount": check.get("timelineSummary", {}).get("unresolvedOrderCount", 0)}
    data["generatedAt"] = datetime.now(timezone.utc).isoformat()  # noqa: UP017 -- Python 3.10
    return data


def embedded_json(value: object) -> str:
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    for char in ("<", ">", "&", "\u2028", "\u2029"):
        text = text.replace(char, f"\\u{ord(char):04x}")
    return text


def render(data: dict) -> str:
    app = "\n".join((ASSETS / name).read_text(encoding="utf-8")
                    for name in ("business-graph.js", "workbench.js"))
    style = (ASSETS / "workbench.css").read_text(encoding="utf-8")
    template = (ASSETS / "workbench.html").read_text(encoding="utf-8")
    if "</script" in app.lower() or "</style" in style.lower():
        raise ValueError("资源含有非法结束标签")
    parts = {"APP": app, "STYLE": style, "DATA": embedded_json(data), "CSP": ""}

    def expand() -> str:
        return re.sub(r"@@(APP|STYLE|DATA|CSP)@@", lambda m: parts[m[1]], template)

    scripts = re.findall(r"<script>(.*?)</script>", expand(), re.S)
    if len(scripts) != 1:
        raise ValueError("工作台只允许一个内联脚本")
    digest = base64.b64encode(hashlib.sha256(scripts[0].encode()).digest()).decode()
    parts["CSP"] = f"default-src 'none'; script-src 'sha256-{digest}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
    return MARKER + "\n" + expand()


def publish(output: Path, html: str) -> None:
    if output.is_symlink() or (output.exists() and not output.read_text(encoding="utf-8").startswith(MARKER)):
        raise ValueError("拒绝覆盖非工作台文件或符号链接")
    fd, temporary = tempfile.mkstemp(prefix=".workbench-", suffix=".html", dir=output.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(html)
        os.replace(temporary, output)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="生成离线业务对象工作台")
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--fm-skill", type=Path)
    parser.add_argument("--api-skill", type=Path)
    args = parser.parse_args()
    root = args.project_root.resolve()
    fm_skill = (args.fm_skill or root / ".agents/skills/evidence-fm").resolve()
    api_skill = (args.api_skill or root / ".agents/skills/evidence-api-design").resolve()
    views = root / ".evidence/views"
    try:
        if views.is_symlink() or not views.resolve().is_relative_to(root):
            raise ValueError("输出目录必须在项目内且不是符号链接")
        before = fingerprint(root)
        views.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".workbench-", dir=views) as temporary:
            data = collect(root, fm_skill, api_skill, Path(temporary))
            html = render(data)
            if before != fingerprint(root):
                raise ValueError("发布前输入变化，保留已有视图")
            publish(views / "index.html", html)
        print(json.dumps({"output": str(views / "index.html"), "counts": data["counts"], "validation": data["validation"]}, ensure_ascii=False))
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

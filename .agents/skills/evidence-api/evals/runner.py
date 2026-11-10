#!/usr/bin/env python3
"""Evidence API eval runner.

Loop: prompt -> agent turn in an isolated workspace -> deterministic check ->
rubric judge -> compare with the previous baseline. The synthetic full-lifecycle
fixture lives under tests/ and is only read by tests.

Environment overrides:
  EVIDENCE_EVAL_AGENT   command used to run the skill (default: pi -p --mode json --no-session)
  EVIDENCE_EVAL_JUDGE   command used to score output (default: pi ... --no-tools)
  EVIDENCE_EVAL_TIMEOUT per-turn timeout in seconds
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from harness import (
    AGENT_DEFAULT,
    JUDGE_DEFAULT,
    compare_with_baseline,
    judge_output,
    load_baseline,
    prepare_sandbox,
    run_command,
    skill_was_loaded,
    skill_routing,
    summarize,
)
from judge_prompts import format_judge_prompt, parse_judge_response

SKILL_DIR = Path(__file__).resolve().parents[1]
SKILL_NAME = SKILL_DIR.name
CASES_FILE = SKILL_DIR / "evals" / "cases.json"
RESULTS_FILE = SKILL_DIR / "evals" / "eval_results.json"
FIXTURE = SKILL_DIR / "tests" / "fixtures" / "full-lifecycle"

MOCK_OUTPUTS = {
    "API-C1": (
        "支付请求与支付确认各有角色接口：请求由买方发起，确认由卖方记录；"
        "每个接口都有 mapped 的 2xx 消费步骤，读取入口不替代连续消费证据。"
    ),
    "API-C2": "已从既有 api.json 生成 OpenAPI 投影，未重新设计接口，也未重复运行 FM 检查。",
    "API-C3": "出库申请与收货确认为 POST 接口，历史查询为 GET；数量更正通过追加红冲出库凭证实现，无 PUT/DELETE。",
    "API-C4": "会员签约购买（冷服务）与视频实时播放鉴权（热服务）划为独立资源和消费流程，保障高并发弹性与幂等。",
    "API-C5": "出库接口前置消费步骤严格绑定银行付款确认（Confirmation）时刻事件，拒绝依赖未决的支付请求。",
    "API-C6": "营运收入确认单统一为单一 POST 契约，支持携带月度/季度不同来源引用，在权责层等价映射完成消费闭环。",
    "API-T1": "REST 以资源和统一接口为中心，RPC 以远程调用为中心，二者是风格差异。",
    "API-T2": "Schema 校验通过，只输出报告，未修改任何文件。",
}
MOCK_LOADED = {"API-C1", "API-C2", "API-C3", "API-C4", "API-C5", "API-C6", "API-T2"}


def snapshot(workspace: Path) -> dict[str, str]:
    """Hash workspace files (excluding the installed skill) to detect writes."""
    digest: dict[str, str] = {}
    for path in workspace.rglob("*"):
        relative = path.relative_to(workspace)
        if not path.is_file() or relative.parts[:1] == (".agents",):
            continue
        digest[str(relative)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest


def seed_workspace(workspace: Path, seed: str | None) -> None:
    """Give content cases the input they legitimately start from."""
    if seed is None:
        return
    if seed == "fm":
        shutil.copytree(FIXTURE / "fm", workspace / ".evidence" / "fm")
    elif seed == "api":
        shutil.copytree(FIXTURE / "fm", workspace / ".evidence" / "fm")
        api_dir = workspace / ".evidence" / "api"
        api_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(FIXTURE / "api.json", api_dir / "api.json")


def validate_api(workspace: Path) -> tuple[bool, str]:
    target = workspace / ".evidence" / "api" / "api.json"
    if not target.is_file():
        return False, "未产出 .evidence/api/api.json"
    try:
        import jsonschema
    except ImportError:
        return False, "缺少 jsonschema，无法执行设计 Schema 校验"
    schema = json.loads((SKILL_DIR / "schemas" / "api.schema.json").read_text(encoding="utf-8"))
    document = json.loads(target.read_text(encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(document), key=lambda error: list(error.path))
    if errors:
        first = errors[0]
        return False, f"api.json 不符合设计 Schema: {first.message[:200]}"
    return True, "api.json 通过设计 Schema 校验"


def run_deterministic_rule(
    rule: str, workspace: Path, mode: str, seeded: dict[str, str]
) -> tuple[bool, str]:
    if rule == "no_file_write":
        current = snapshot(workspace)
        changed = sorted(
            path
            for path, digest in current.items()
            if seeded.get(path) != digest
        )
        if changed:
            return False, f"只读分支产生未授权写入: {changed}"
        return True, "seeded 输入未被改写，未产生新文件"

    if rule == "check_api_schema":
        if mode != "mock":
            return validate_api(workspace)
        candidate = FIXTURE / "api.json"
        if not candidate.is_file():
            return False, f"API 回归夹具不存在: {candidate}"
        return validate_api_path(candidate)

    return True, f"规则 {rule} 放行"


def validate_api_path(path: Path) -> tuple[bool, str]:
    try:
        import jsonschema
    except ImportError:
        return False, "缺少 jsonschema，无法执行设计 Schema 校验"
    schema = json.loads((SKILL_DIR / "schemas" / "api.schema.json").read_text(encoding="utf-8"))
    document = json.loads(path.read_text(encoding="utf-8"))
    errors = list(jsonschema.Draft202012Validator(schema).iter_errors(document))
    if errors:
        return False, f"夹具不符合设计 Schema: {errors[0].message[:200]}"
    return True, "内置夹具通过设计 Schema 校验"


def evaluate_case(
    case: dict[str, Any],
    *,
    mode: str,
    agent_cmd: str,
    judge_cmd: str,
) -> dict[str, Any]:
    started = time.time()
    with tempfile.TemporaryDirectory(prefix="api_eval_") as directory:
        workspace = Path(directory)
        prepare_sandbox(SKILL_DIR, workspace)
        seed_workspace(workspace, case.get("seed"))
        seeded = snapshot(workspace)

        if mode == "mock":
            output = MOCK_OUTPUTS.get(case["id"], "执行完成")
            loaded = case["id"] in MOCK_LOADED
            error = ""
            tool_calls: list[dict[str, Any]] = []
        else:
            effective_prompt = skill_routing(SKILL_DIR) + case["prompt"]
            result = run_command(agent_cmd, effective_prompt, workspace)
            output = result["output"]
            tool_calls = result["tool_calls"]
            error = result["error"]
            loaded = skill_was_loaded(SKILL_NAME, tool_calls, output)

        expected_trigger = bool(case.get("expect_trigger", True))
        trigger_ok = loaded == expected_trigger
        deterministic_pass, deterministic_msg = run_deterministic_rule(
            case.get("deterministic_rule", ""), workspace, mode, seeded
        )

        if mode == "mock":
            rubric_score: int | None = None
            rubric_reason = "mock 模式不调用裁判"
        else:
            system_prompt, user_prompt = format_judge_prompt(case.get("rubric", ""), output)
            rubric_score, rubric_reason = judge_output(
                system_prompt, user_prompt, workspace, judge_cmd, parse_judge_response
            )

        rubric_ok = True if mode == "mock" else rubric_score == 1
        passed = trigger_ok and deterministic_pass and rubric_ok

    return {
        "id": case["id"],
        "category": case.get("category"),
        "dimension": case.get("dimension"),
        "prompt": case["prompt"],
        "expect_trigger": expected_trigger,
        "actually_triggered": loaded,
        "trigger_pass": trigger_ok,
        "deterministic_pass": deterministic_pass,
        "deterministic_msg": deterministic_msg,
        "rubric_score": rubric_score,
        "rubric_reason": rubric_reason,
        "pass": passed,
        "elapsed_s": round(time.time() - started, 2),
        "output": output,
        "error": error,
        "tool_calls": tool_calls,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Evidence API eval runner")
    parser.add_argument("--cases", type=Path, default=CASES_FILE)
    parser.add_argument("--output", type=Path, default=RESULTS_FILE)
    parser.add_argument("--agent-cmd", default=AGENT_DEFAULT)
    parser.add_argument("--judge-cmd", default=JUDGE_DEFAULT)
    parser.add_argument("--mock", "--dry-run", dest="mock", action="store_true",
                        help="offline self-check; results are marked mock and never count as evidence")
    args = parser.parse_args()

    if not args.cases.is_file():
        print(f"Error: cases file not found: {args.cases}", file=sys.stderr)
        return 1

    mode = "mock" if args.mock else "agent"
    cases = json.loads(args.cases.read_text(encoding="utf-8"))
    baseline = load_baseline(args.output)
    results = []
    print(f"=== [{SKILL_NAME}] {len(cases)} 个用例（mode={mode}）===")
    for case in cases:
        result = evaluate_case(
            case, mode=mode, agent_cmd=args.agent_cmd, judge_cmd=args.judge_cmd
        )
        results.append(result)
        verdict = "✓" if result["pass"] else "✗"
        print(
            f"[{verdict}] {result['id']} ({result['dimension']}): "
            f"触发={'通过' if result['trigger_pass'] else '失败'}, "
            f"确定性={'通过' if result['deterministic_pass'] else '失败'}, "
            f"裁判={result['rubric_score'] if result['rubric_score'] is not None else '未评分'}"
        )

    summary = summarize(SKILL_NAME, results, mode)
    summary["baseline"] = compare_with_baseline(baseline, results)
    if mode == "mock" and args.output == RESULTS_FILE:
        print("mock 结果未写入基线文件；显式传 --output 才会保存")
    else:
        args.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    comparison = summary["baseline"]
    print(
        f"\n[{SKILL_NAME}] 通过率 {summary['overall_pass_rate']}% "
        f"({summary['overall_passed']}/{summary['total_cases']})，"
        f"触发精度 {summary['trigger_accuracy']}%"
    )
    if comparison["available"]:
        print(
            f"对比基线（{comparison['baseline_mode']}）："
            f"退化 {comparison['regressions'] or '无'}，"
            f"改善 {comparison['improvements'] or '无'}"
        )
    else:
        print("无历史基线：本次结果将作为下次对比的基线")
    if mode == "mock":
        print("警告：mock 结果只验证运行链路，不能作为提示词改进证据")
    return 0 if summary["overall_passed"] == summary["total_cases"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Evidence FM eval runner.

Loop: prompt -> agent turn in an isolated workspace -> deterministic check ->
rubric judge -> compare with the previous baseline. This is how FM prompt
changes are judged; synthetic models live under tests/ and are never read here.

Environment overrides:
  EVIDENCE_EVAL_AGENT   command used to run the skill (default: pi -p --mode json --no-session)
  EVIDENCE_EVAL_JUDGE   command used to score output (default: pi ... --no-tools)
  EVIDENCE_EVAL_TIMEOUT per-turn timeout in seconds
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
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
MODELS = SKILL_DIR / "tests" / "fixtures" / "models"

PAIRING_EXAMPLE = "valid-traceable-subscription"
PAIRING_CONTEXT = "context.content-subscription"
PAIRING_DROPPED = (
    "entities/*content-access*.json",
    "rules/rule--content-access-completed.json",
    "relationships/relation--content-subscription-precedes-content-access-request.json",
    "validation/instances/instance--content-access-*.json",
    "validation/scenarios/scenario--content-access-after-payment.json",
)

MOCK_OUTPUTS = {
    "FM-C1": "退款申请与争议裁决成对包裹，平台仲裁员调取物流轨迹凭证后生成原路退款确认。",
    "FM-C2": "基础配送费挂接合同；天气补贴与超时扣费隔离为费率规则，超时阶梯扣至 0 元并判定责任终点。",
    "FM-C3": "仅更新供应商 Entity 及新增属性，保留既有合同引用，一致性检查通过。",
    "FM-C4": "先找到成对主要履约项，再落地上下文、角色与凭证；双方各自承担一项主要履约。",
    "FM-C5": "只落地一侧方向属于范围完整性缺口，不补造对侧履约项或角色，缺口保留并继续澄清。",
    "FM-T1": "履约建模法以现金权责与履约凭证为核心，关注请求与确认的对偶闭环。（只读讨论）",
    "FM-T2": "已执行只读一致性检查并输出报告，本次未修改任何文件。",
}
MOCK_LOADED = {"FM-C1", "FM-C2", "FM-C3", "FM-C4", "FM-C5", "FM-T1", "FM-T2"}


def run_check_fm(workspace: Path, model_dir: Path, scope: str | None = None) -> dict[str, Any]:
    command = [sys.executable, str(SKILL_DIR / "scripts" / "check_fm.py"), str(model_dir)]
    if scope is not None:
        command += ["--scope", scope]
    proc = subprocess.run(command, capture_output=True, text=True, cwd=str(workspace))
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"errors": [f"check_fm 未返回 JSON，退出码 {proc.returncode}"], "gaps": []}


def run_pairing_rule(workspace: Path) -> tuple[bool, str]:
    """Both Contract Parties must each hold a main Fulfillment in the current scope."""
    source = MODELS / PAIRING_EXAMPLE
    if not source.exists():
        return False, f"FM 回归夹具不存在: {source}"

    complete_copy = workspace / "fm_pairing_complete"
    shutil.copytree(source, complete_copy)
    complete = run_check_fm(workspace, complete_copy, PAIRING_CONTEXT)
    complete_errors = set(complete.get("errors") or [])
    cel_missing = any("cel-python is required" in error for error in complete_errors)
    if not cel_missing and complete_errors:
        return False, f"成对夹具存在结构错误: {sorted(complete_errors)}"
    if not cel_missing and complete.get("complete") is not True:
        return False, f"双向履约夹具应判完整: gaps={complete.get('gaps')}"

    one_sided = workspace / "fm_pairing_one_sided"
    shutil.copytree(source, one_sided)
    for pattern in PAIRING_DROPPED:
        for path in one_sided.glob(pattern):
            path.unlink()
    dropped = run_check_fm(workspace, one_sided, PAIRING_CONTEXT)
    dropped_gaps = dropped.get("gaps") or []
    introduced = set(dropped.get("errors") or []) - complete_errors
    if introduced:
        return False, f"单侧方向不应新增一致性错误: {sorted(introduced)}"
    if not any("Contract Parties" in gap for gap in dropped_gaps):
        return False, f"缺少双方义务方向成对缺口: {dropped_gaps}"
    if not any("role.subscriber" in gap for gap in dropped_gaps):
        return False, f"缺口应点名缺少请求责任方的一方: {dropped_gaps}"
    if dropped.get("complete") is not False:
        return False, "单侧方向的范围不应判为完整"

    note = "（缺 cel-python，仅比对缺口与新增错误）" if cel_missing else ""
    return True, f"双向判完整、单侧报缺口且无新增一致性错误{note}"


def run_check(workspace: Path, model_dir: Path) -> tuple[bool, str]:
    proc = subprocess.run(
        [sys.executable, str(SKILL_DIR / "scripts" / "check_fm.py"), str(model_dir)],
        capture_output=True,
        text=True,
        cwd=str(workspace),
    )
    try:
        report = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return proc.returncode == 0, f"check_fm 退出码: {proc.returncode}"
    errors = report.get("errors") or []
    structural = [error for error in errors if "cel-python is required" not in error]
    if structural:
        return False, f"check_fm 发现结构错误: {structural}"
    note = "（缺 cel-python）" if errors else ""
    gaps = report.get("gaps") or []
    suffix = f"，缺口 {len(gaps)} 项" if gaps else ""
    return True, f"check_fm 未发现结构错误{note}{suffix}"


def run_deterministic_rule(rule: str, workspace: Path, mode: str) -> tuple[bool, str]:
    written = workspace / ".evidence" / "fm"

    if rule == "no_file_write":
        created = [
            str(path.relative_to(workspace))
            for path in workspace.rglob("*")
            if path.is_file() and ".agents" not in path.relative_to(workspace).parts
        ]
        if created:
            return False, f"只读分支产生未授权写文件: {created}"
        return True, "隔离工作区未产生业务写操作"

    if rule in {"check_fm_consistent", "check_fm_pairing_gap"}:
        if mode != "mock" and (written / "model.json").is_file():
            return run_check(workspace, written)
        if mode != "mock":
            return False, "被测 Agent 未在 .evidence/fm/ 写出可检查模型"
        if rule == "check_fm_pairing_gap":
            return run_pairing_rule(workspace)
        domain = MODELS / "domain"
        if not domain.exists():
            return False, f"FM 回归夹具不存在: {domain}"
        model_copy = workspace / "fm_model"
        shutil.copytree(domain, model_copy)
        return run_check(workspace, model_copy)

    return True, f"规则 {rule} 放行"


def evaluate_case(
    case: dict[str, Any],
    *,
    mode: str,
    agent_cmd: str,
    judge_cmd: str,
) -> dict[str, Any]:
    started = time.time()
    with tempfile.TemporaryDirectory(prefix="fm_eval_") as directory:
        workspace = Path(directory)
        prepare_sandbox(SKILL_DIR, workspace)

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
            case.get("deterministic_rule", ""), workspace, mode
        )

        if mode == "mock":
            rubric_score: int | None = None
            rubric_reason = "mock 模式不调用裁判"
        else:
            system_prompt, user_prompt = format_judge_prompt(
                case.get("rubric", ""), output
            )
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
    parser = argparse.ArgumentParser(description="Evidence FM eval runner")
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

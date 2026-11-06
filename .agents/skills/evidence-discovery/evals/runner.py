#!/usr/bin/env python3
"""Evidence Discovery eval runner.

Loop: prompt -> agent turn in an isolated workspace -> deterministic check ->
rubric judge -> compare with the previous baseline. Conversation samples live
under tests/ and are only read by tests, never by the prompt.

Environment overrides:
  EVIDENCE_EVAL_AGENT   command used to run the skill (default: pi -p --mode json --no-session)
  EVIDENCE_EVAL_JUDGE   command used to score output (default: pi ... --no-tools)
  EVIDENCE_EVAL_TIMEOUT per-turn timeout in seconds
"""

from __future__ import annotations

import argparse
import json
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

MOCK_OUTPUTS = {
    "DISCOVERY-C1": (
        "责任双方为需求部门（承担预算支出义务）与财务部（承担对公结算责任）。"
        "确认到货的验收凭证来源是什么？供应商发票以何种方式递交？"
    ),
    "DISCOVERY-C2": (
        "主管审批未通过时，采购需求是否有补充或废止路径？"
        "供应商发票由税控接口自动核验还是财务人工验真？"
        "付款起算点以收到合格发票为准还是以审批归档时间为准？"
    ),
    "DISCOVERY-T1": "已记录会议备忘事实至追溯日志，未推进下游模型生成，保持等待状态。",
    "DISCOVERY-T2": "Python 3.10 的 match-case 支持结构化模式匹配，可用于类型解构与守卫语句。",
}
MOCK_LOADED = {"DISCOVERY-C1", "DISCOVERY-C2", "DISCOVERY-T1"}


def run_deterministic_rule(rule: str, workspace: Path, mode: str) -> tuple[bool, str]:
    evidence = workspace / ".evidence"

    if rule == "no_file_write":
        created = [
            str(path.relative_to(workspace))
            for path in workspace.rglob("*")
            if path.is_file() and ".agents" not in path.relative_to(workspace).parts
        ]
        if created:
            return False, f"负面控制分支产生未授权写文件: {created}"
        return True, "负面控制分支未写文件"

    if rule == "no_downstream_advance":
        forbidden = [path for path in (evidence / "api", evidence / "views") if path.exists()]
        if forbidden:
            return False, f"控制分支推进了下游产物: {forbidden}"
        return True, "控制分支保持等待，未推进下游"

    if rule == "check_interview_trace":
        trace = evidence / "traces" / "interview-trace.json"
        if mode != "mock":
            if not trace.is_file():
                return False, "未写出 .evidence/traces/interview-trace.json"
            check_script = SKILL_DIR / "scripts" / "check_interview_trace.py"
            proc = subprocess.run(
                [sys.executable, str(check_script), str(trace)],
                capture_output=True,
                text=True,
                cwd=str(workspace),
            )
            if proc.returncode != 0:
                return False, (proc.stderr or proc.stdout).strip()[-800:]
            return True, "追溯日志通过 check_interview_trace"
        trace.parent.mkdir(parents=True, exist_ok=True)
        trace.write_text(
            json.dumps(
                [
                    {
                        "session_id": "eval-session",
                        "question_id": "q1",
                        "question": "确认到货的凭证来源是什么？",
                        "answer": "纸质签收单扫描件",
                        "extracted_facts": ["签收单作为履约凭证"],
                    }
                ],
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        check_script = SKILL_DIR / "scripts" / "check_interview_trace.py"
        proc = subprocess.run(
            [sys.executable, str(check_script), str(trace)],
            capture_output=True,
            text=True,
            cwd=str(workspace),
        )
        return True, f"内置追溯日志校验器执行完成（退出码 {proc.returncode}）"

    return True, f"规则 {rule} 放行"


def evaluate_case(
    case: dict[str, Any],
    *,
    mode: str,
    agent_cmd: str,
    judge_cmd: str,
) -> dict[str, Any]:
    started = time.time()
    with tempfile.TemporaryDirectory(prefix="discovery_eval_") as directory:
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
    parser = argparse.ArgumentParser(description="Evidence Discovery eval runner")
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

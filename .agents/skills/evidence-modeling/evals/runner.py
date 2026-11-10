#!/usr/bin/env python3
"""Evidence Modeling eval runner and cross-skill dispatcher.

Loop: prompt -> agent turn in an isolated workspace -> deterministic check ->
rubric judge -> compare with the previous baseline. It also dispatches sibling
skill runners so one command can show the whole harness scoreboard.

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
SKILLS_DIR = SKILL_DIR.parent

MOCK_OUTPUTS = {
    "MODELING-T1": "进入证据建模端到端入口，委派 evidence-fm 开始增量模型构建。",
    "MODELING-T2": "尚未取得人类范围结束确认，阶段门禁拦截，拒绝委派 API 与页面生成。",
    "MODELING-T3": "违约金关键依据不足，停止委派下游阶段，在交接处挂起并汇报缺口。",
    "MODELING-C1": "严格按照七步法编排执行：完成协议解析、双向权责提取、凭证对偶追溯、参与元素与角色抽象、业务与领域上下文隔离，并提炼宏流程沉淀核心业务模式。",
    "MODELING-C2": "成功复用基础会员核心业务模式宏流程主干，增量扩展体育赛事观赛券与赛事计算器角色插槽，完成变体演进。",
}
MOCK_LOADED = {"MODELING-T1", "MODELING-T2", "MODELING-T3", "MODELING-C1", "MODELING-C2"}

DOWNSTREAM = (".evidence/api/api.json", ".evidence/views/index.html")


def run_deterministic_rule(rule: str, workspace: Path, mode: str) -> tuple[bool, str]:
    if rule == "no_file_write":
        created = [
            str(path.relative_to(workspace))
            for path in workspace.rglob("*")
            if path.is_file() and ".agents" not in path.relative_to(workspace).parts
        ]
        if created:
            return False, f"只读分支产生未授权写文件: {created}"
        return True, "隔离工作区未产生业务写操作"

    if rule == "check_stage_gate_blocked":
        leaked = [name for name in DOWNSTREAM if (workspace / name).exists()]
        if leaked:
            return False, f"缺少人类结束确认却产出下游文件: {leaked}"
        gate_script = SKILL_DIR / "scripts" / "check_stage_gate.py"
        if not gate_script.is_file():
            return False, f"缺少门禁脚本: {gate_script}"
        report = workspace / "fm_check.json"
        report.write_text(
            json.dumps(
                {
                    "checkVersion": 5,
                    "consistent": True,
                    "complete": True,
                    "valid": True,
                    "inputChanged": False,
                    "errors": [],
                    "gaps": [],
                }
            ),
            encoding="utf-8",
        )
        proc = subprocess.run(
            [sys.executable, str(gate_script), "--target", "api", "--fm-check", str(report)],
            capture_output=True,
            text=True,
            cwd=str(workspace),
        )
        if proc.returncode != 0:
            return True, "缺少人类结束确认时门禁成功拦截"
        return False, "门禁失效：缺少人类确认却放行下游"

    if rule == "check_fm_consistent":
        written = workspace / ".evidence" / "fm"
        if mode != "mock":
            if not (written / "model.json").is_file():
                return False, "被测 Agent 未在 .evidence/fm/ 写出可检查模型"
            proc = subprocess.run(
                [
                    sys.executable,
                    str(SKILLS_DIR / "evidence-fm" / "scripts" / "check_fm.py"),
                    str(written),
                ],
                capture_output=True,
                text=True,
                cwd=str(workspace),
            )
            try:
                report = json.loads(proc.stdout)
            except json.JSONDecodeError:
                return proc.returncode == 0, f"check_fm 退出码: {proc.returncode}"
            errors = [
                error
                for error in report.get("errors") or []
                if "cel-python is required" not in error
            ]
            return (not errors), (
                "被测模型结构一致" if not errors else f"被测模型结构错误: {errors[:3]}"
            )
        return True, "mock 模式跳过模型结构检查"

    return True, f"规则 {rule} 放行"


def evaluate_case(
    case: dict[str, Any],
    *,
    mode: str,
    agent_cmd: str,
    judge_cmd: str,
) -> dict[str, Any]:
    started = time.time()
    with tempfile.TemporaryDirectory(prefix="modeling_eval_") as directory:
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


def run_self_eval(
    *, mode: str, agent_cmd: str, judge_cmd: str, output: Path
) -> dict[str, Any]:
    cases = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    baseline = load_baseline(output)
    results = []
    print(f"=== [{SKILL_NAME}] {len(cases)} 个用例（mode={mode}）===")
    for case in cases:
        result = evaluate_case(case, mode=mode, agent_cmd=agent_cmd, judge_cmd=judge_cmd)
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
    if mode == "mock" and output == RESULTS_FILE:
        print("mock 结果未写入基线文件；显式传 --output 才会保存")
    else:
        output.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

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
    return summary


def dispatch_siblings(*, mode: str, agent_cmd: str, judge_cmd: str) -> int:
    names = ["evidence-discovery", "evidence-fm", "evidence-api", "evidence-modeling"]
    print("=" * 50)
    print("     Evidence Skills 评测调度 - 聚合看板")
    print("=" * 50)
    summaries: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="modeling_eval_all_") as directory:
        for name in names:
            runner = SKILLS_DIR / name / "evals" / "runner.py"
            if not runner.is_file():
                continue
            result_file = (
                Path(directory) / f"{name}.json"
                if mode == "mock"
                else SKILLS_DIR / name / "evals" / "eval_results.json"
            )
            command = [
                sys.executable,
                str(runner),
                "--agent-cmd",
                agent_cmd,
                "--judge-cmd",
                judge_cmd,
                "--output",
                str(result_file),
            ]
            if mode == "mock":
                command.append("--mock")
            print(f"\n>>> 调度执行 Skill: {name}")
            subprocess.run(command, check=False)
            if result_file.is_file():
                summaries.append(json.loads(result_file.read_text(encoding="utf-8")))

    total = sum(summary.get("total_cases", 0) for summary in summaries)
    passed = sum(summary.get("overall_passed", 0) for summary in summaries)
    print("\n================ 整体评估看板 ================")
    for summary in summaries:
        print(
            f"• {summary['skill']:<20} 通过率 {summary['overall_pass_rate']:>5}% "
            f"({summary['overall_passed']}/{summary['total_cases']})  "
            f"触发精度 {summary['trigger_accuracy']:>5}%  mode={summary['mode']}"
        )
    print("-" * 50)
    rate = round(passed / total * 100, 1) if total else 0.0
    print(f"总计通过率 {rate}% ({passed}/{total})")
    return 0 if total and passed == total else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Evidence Modeling eval runner")
    parser.add_argument("--cases", type=Path, default=CASES_FILE)
    parser.add_argument("--output", type=Path, default=RESULTS_FILE)
    parser.add_argument("--agent-cmd", default=AGENT_DEFAULT)
    parser.add_argument("--judge-cmd", default=JUDGE_DEFAULT)
    parser.add_argument("--mock", "--dry-run", dest="mock", action="store_true",
                        help="offline self-check; results are marked mock and never count as evidence")
    parser.add_argument("--all", action="store_true", help="dispatch every sibling skill runner")
    parser.add_argument("--skill", choices=["evidence-discovery", "evidence-fm", "evidence-api", "evidence-modeling"],
                        help="run one sibling skill runner instead of this one")
    args = parser.parse_args()

    mode = "mock" if args.mock else "agent"
    if args.all:
        return dispatch_siblings(mode=mode, agent_cmd=args.agent_cmd, judge_cmd=args.judge_cmd)
    if args.skill and args.skill != SKILL_NAME:
        runner = SKILLS_DIR / args.skill / "evals" / "runner.py"
        if not runner.is_file():
            print(f"Error: runner not found: {runner}", file=sys.stderr)
            return 1
        command = [
            sys.executable,
            str(runner),
            "--agent-cmd",
            args.agent_cmd,
            "--judge-cmd",
            args.judge_cmd,
        ]
        if mode == "mock":
            command.append("--mock")
        return subprocess.run(command, check=False).returncode

    summary = run_self_eval(
        mode=mode,
        agent_cmd=args.agent_cmd,
        judge_cmd=args.judge_cmd,
        output=args.output,
    )
    return 0 if summary["overall_passed"] == summary["total_cases"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

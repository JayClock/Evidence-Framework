"""Eval harness shared by a skill's own runner.

Purpose: make prompt changes measurable. A case is a real prompt plus a
deterministic check and a rubric; the runner executes the skill in an isolated
workspace, scores the result, and compares it with the previous baseline.

This module deliberately depends only on the standard library so every skill
package keeps running standalone.
"""

from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Any, Iterable

AGENT_DEFAULT = os.environ.get("EVIDENCE_EVAL_AGENT") or "pi -p --mode json --no-session"
JUDGE_DEFAULT = os.environ.get("EVIDENCE_EVAL_JUDGE") or "pi -p --mode json --no-session --no-tools"
AGENT_TIMEOUT = int(os.environ.get("EVIDENCE_EVAL_TIMEOUT", "600"))


def run_command(
    command: str, prompt: str, cwd: Path, timeout: int = AGENT_TIMEOUT
) -> dict[str, Any]:
    """Run one non-interactive agent turn and extract its trace."""
    argv = shlex.split(command)
    if not argv:
        return {"ok": False, "output": "", "tool_calls": [], "error": "empty command", "raw": ""}
    try:
        proc = subprocess.run(
            [*argv, prompt],
            capture_output=True,
            text=True,
            cwd=str(cwd),
            timeout=timeout,
        )
    except FileNotFoundError:
        return {
            "ok": False,
            "output": "",
            "tool_calls": [],
            "error": f"command not found: {argv[0]}",
            "raw": "",
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "output": "",
            "tool_calls": [],
            "error": f"timed out after {timeout}s",
            "raw": "",
        }
    text, tool_calls = parse_trace(proc.stdout)
    if not text and not tool_calls:
        # Plain-text output mode is still a usable trace, just without tool calls.
        text = proc.stdout.strip()
    error = ""
    if proc.returncode != 0:
        error = (proc.stderr or proc.stdout).strip()[-2000:] or f"exit {proc.returncode}"
    return {
        "ok": proc.returncode == 0,
        "output": text.strip(),
        "tool_calls": tool_calls,
        "error": error,
        "raw": proc.stdout,
    }


def parse_trace(raw: str) -> tuple[str, list[dict[str, Any]]]:
    """Read newline-delimited JSON events; return assistant text and tool calls."""
    texts: list[str] = []
    calls: list[dict[str, Any]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") != "message_end":
            continue
        message = event.get("message") or {}
        if message.get("role") != "assistant":
            continue
        content = message.get("content")
        if isinstance(content, str):
            texts.append(content)
            continue
        for item in content or []:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text":
                texts.append(item.get("text") or "")
            elif item.get("type") == "toolCall":
                calls.append(
                    {
                        "name": item.get("name") or "",
                        "arguments": item.get("arguments") or {},
                    }
                )
    return "\n".join(text for text in texts if text), calls


def skill_was_loaded(skill: str, tool_calls: Iterable[dict[str, Any]], output: str) -> bool:
    """Detect a skill load from the trace: reading its entrypoint counts as loading."""
    needles = (
        f".agents/skills/{skill}",
        f"skills/{skill}/SKILL.md",
        f"{skill}/SKILL.md",
    )
    for call in tool_calls:
        blob = json.dumps(call, ensure_ascii=False)
        if any(needle in blob for needle in needles):
            return True
    return False


def prepare_sandbox(skill_dir: Path, workspace: Path) -> Path:
    """Install the skill under test so the agent can discover it, without tests."""
    target = workspace / ".agents" / "skills" / skill_dir.name
    shutil.copytree(
        skill_dir,
        target,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "tests", "evals"),
    )
    return target


def judge_output(
    system_prompt: str,
    user_prompt: str,
    workspace: Path,
    command: str = JUDGE_DEFAULT,
    parser=None,
) -> tuple[int | None, str]:
    """Score one output with a separate, tool-less judge call.

    Returns (None, reason) when the judge cannot run: an unavailable judge must
    never be reported as a pass.
    """
    prompt = f"{system_prompt}\n\n{user_prompt}"
    result = run_command(command, prompt, workspace, timeout=AGENT_TIMEOUT)
    if not result["ok"]:
        return None, f"裁判不可用：{result['error'][:200]}"
    if parser is None:
        lines = [line.strip() for line in result["output"].splitlines() if line.strip()]
        return (1 if lines and lines[0].startswith("1") else 0), (
            lines[1] if len(lines) > 1 else "裁判未给出理由"
        )
    verdict = parser(result["output"])
    if verdict.reason.startswith("裁判未返回有效输出") or verdict.reason.startswith(
        "裁判首行未输出有效"
    ):
        return None, verdict.reason
    return verdict.score, verdict.reason


def load_baseline(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def compare_with_baseline(
    baseline: dict[str, Any] | None, cases: list[dict[str, Any]]
) -> dict[str, Any]:
    """Diff current case outcomes against the previous run."""
    if not baseline:
        return {"available": False, "regressions": [], "improvements": [], "unchanged": 0}
    previous = {
        case.get("id"): case for case in baseline.get("cases", []) if isinstance(case, dict)
    }
    regressions: list[str] = []
    improvements: list[str] = []
    unchanged = 0
    for case in cases:
        before = previous.get(case["id"])
        if before is None:
            continue
        was = bool(before.get("pass"))
        now = bool(case.get("pass"))
        if was and not now:
            regressions.append(case["id"])
        elif now and not was:
            improvements.append(case["id"])
        else:
            unchanged += 1
    return {
        "available": True,
        "baseline_mode": baseline.get("mode"),
        "baseline_pass_rate": baseline.get("overall_pass_rate"),
        "regressions": regressions,
        "improvements": improvements,
        "unchanged": unchanged,
    }


def summarize(skill: str, cases: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    passed = sum(1 for case in cases if case.get("pass"))
    triggers = sum(1 for case in cases if case.get("trigger_pass"))
    total = len(cases)
    return {
        "skill": skill,
        "mode": mode,
        "total_cases": total,
        "overall_passed": passed,
        "overall_pass_rate": round(passed / total * 100, 1) if total else 0.0,
        "trigger_accuracy": round(triggers / total * 100, 1) if total else 0.0,
        "cases": cases,
    }

def skill_routing(skill_dir: Path) -> str:
    """Present the skill the way a host advertises it: name, description, path.

    Project skill discovery depends on host trust settings, so evals state the
    routing block explicitly. The model still has to read SKILL.md itself, which
    is what the trigger check measures.
    """
    entry = skill_dir / "SKILL.md"
    text = entry.read_text(encoding="utf-8") if entry.is_file() else ""
    name = skill_dir.name
    description = ""
    for line in text.splitlines():
        if line.startswith("description:"):
            description = line.split(":", 1)[1].strip()
            break
    return (
        "可用技能（按描述判断是否适用；仅当任务匹配时先读取入口文件）：\n"
        f"- {name}: {description}\n"
        f"  入口：{entry}\n\n"
    )

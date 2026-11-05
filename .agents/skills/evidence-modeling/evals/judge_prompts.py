"""Judge prompt builder and output parser for Eval rubric scoring."""

from __future__ import annotations

import re
from typing import NamedTuple


class JudgeVerdict(NamedTuple):
    passed: bool
    score: int
    reason: str


JUDGE_SYSTEM_PROMPT = """你是 Evidence 建模流程的质检裁判。你的唯一任务是：对照给定的评分标准，判断被测 Agent 的建模/访谈输出是否达标。你只做这一件事，不评价文笔流畅度、不写改进建议。

判断规则：
1. 评分标准是唯一依据。内容写得再丰富、格式再花哨，只要未满足标准中的核心要素，就给 0。
2. 有疑问时判不通过。标准没明确要求的不算加分项，也不拿它来放行。
3. 只有 0 和 1 两个档位，不存在「基本达标」或小数分。

输出格式（严格遵守，只输出两行）：
第一行：0 或 1
第二行：一句不超过 30 字的理由，直接指出哪里达标、哪里没达标
"""

JUDGE_USER_TEMPLATE = """评分标准：
{rubric}

待评内容：
{output}
"""


def format_judge_prompt(rubric: str, output: str) -> tuple[str, str]:
    """Return (system_prompt, user_prompt)."""
    return JUDGE_SYSTEM_PROMPT, JUDGE_USER_TEMPLATE.format(rubric=rubric.strip(), output=output.strip())


def parse_judge_response(raw_response: str) -> JudgeVerdict:
    """Parse strictly formatted 2-line response from the judge."""
    lines = [ln.strip() for ln in raw_response.strip().splitlines() if ln.strip()]
    if not lines:
        return JudgeVerdict(passed=False, score=0, reason="裁判未返回有效输出")

    first_line = lines[0]
    match = re.search(r"\b([01])\b", first_line)
    if not match:
        return JudgeVerdict(passed=False, score=0, reason=f"裁判首行未输出有效 0/1 分数: {first_line[:40]}")

    score = int(match.group(1))
    reason = lines[1] if len(lines) > 1 else ("评分通过" if score == 1 else "评分未通过")
    return JudgeVerdict(passed=(score == 1), score=score, reason=reason)

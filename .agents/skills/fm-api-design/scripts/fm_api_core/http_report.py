"""Render the HTTP section of an API projection."""

from __future__ import annotations

import json


def _json_block(value) -> list[str]:
    return [
        "```json",
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2),
        "```",
        "",
    ]


def http_markdown(http: dict | None) -> str:
    lines = [
        "# HTTP 资源与交互契约",
        "",
        "> 合成样例与静态消费流程检查，不是运行时授权或端到端验收。",
        "",
    ]
    if http is None:
        return "\n".join([*lines, "未选择 HTTP 设计范围。", ""])
    for operation in http["operations"]:
        lines.extend(
            [
                f"## {operation['method']} {operation['uri']}",
                "",
                f"- 能力：`{operation['capabilityRef']}`；角色：`{operation['actorRoleRef']}`",
                f"- 实例约束：`{', '.join(operation['bindingRefs'])}`",
                f"- 幂等：`{operation['idempotency']['mode']}`；并发：`{operation['concurrency']['mode']}`",
                "",
                "### 请求",
                "",
                *_json_block(operation["request"]),
                "### 响应",
                "",
                *_json_block(operation["responses"]),
            ]
        )
    lines.extend(["## 表示与超媒体", ""])
    for representation in http["representations"]:
        lines.extend([f"### {representation['id']}", "", *_json_block(representation)])
    lines.extend(["## HTTP 消费流程", "", *_json_block(http["journeys"])])
    return "\n".join(lines)

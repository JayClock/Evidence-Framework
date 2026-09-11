"""Source-explicit synthetic samples for scope regression tests, not production facts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def entity(
    entity_id: str, category: str, kind: str, label: str, **fields: Any
) -> dict[str, Any]:
    return {
        "type": "entity",
        "id": entity_id,
        "category": category,
        "kind": kind,
        "label": label,
        **fields,
    }


def attribute(
    name: str, value_type: str, meaning: str, *, keyData: bool = False, **fields: Any
) -> dict[str, Any]:
    return {
        "name": name,
        "label": meaning,
        "valueType": value_type,
        "required": True,
        "keyData": keyData,
        "meaning": meaning,
        **fields,
    }


def domain_documents() -> list[dict[str, Any]]:
    """Profiles have identities, owned references, edit conditions, and derived contactability."""
    context = "context.customer-information"
    return [
        entity(
            context,
            "context",
            "domain",
            "客户信息领域",
            rootRefs=["thing.customer-profile"],
        ),
        entity("party.customer", "participant", "party", "客户"),
        entity(
            "role.profile-owner", "role", "party", "档案所属客户", contextRef=context
        ),
        entity(
            "thing.customer-profile",
            "participant",
            "thing",
            "客户档案",
            contextRef=context,
            attributes=[
                attribute("profile_id", "string", "在客户信息领域内区分档案的标识"),
                attribute("archived", "bool", "档案已归档"),
            ],
        ),
        entity(
            "thing.contact-method",
            "participant",
            "thing",
            "有独立标识的联系方式",
            contextRef=context,
            attributes=[
                attribute("contact_id", "string", "联系方式标识"),
                attribute("enabled", "bool", "联系方式已启用", keyData=True),
                attribute("verified", "bool", "联系方式已核验", keyData=True),
                attribute(
                    "usable",
                    "bool",
                    "联系方式可使用",
                    keyData=True,
                    derivedByRuleRef="rule.contact-usable",
                ),
            ],
        ),
        {
            "type": "relationship",
            "id": "relation.customer-owns-profile",
            "kind": "plays_role",
            "sourceRef": "party.customer",
            "targetRef": "role.profile-owner",
            "label": "客户扮演档案所属客户",
        },
        {
            "type": "relationship",
            "id": "relation.profile-owner",
            "kind": "references",
            "sourceRef": "thing.customer-profile",
            "targetRef": "role.profile-owner",
            "label": "档案引用所属客户身份",
        },
        {
            "type": "relationship",
            "id": "relation.profile-contact",
            "kind": "references",
            "sourceRef": "thing.customer-profile",
            "targetRef": "thing.contact-method",
            "label": "档案引用联系方式",
        },
        {
            "type": "rule",
            "id": "rule.contact-usable",
            "kind": "derivation",
            "label": "联系方式可用性计算",
            "contextRef": context,
            "bindings": {"contact": {"ref": "thing.contact-method"}},
            "expression": "contact.enabled && contact.verified",
            "resultType": "bool",
            "target": {"entityRef": "thing.contact-method", "attribute": "usable"},
        },
        {
            "type": "rule",
            "id": "rule.profile-editable",
            "kind": "precondition",
            "label": "归档档案不可编辑",
            "contextRef": context,
            "bindings": {"profile": {"ref": "thing.customer-profile"}},
            "expression": "!profile.archived",
            "resultType": "bool",
        },
        {
            "type": "rule",
            "id": "rule.profile-identity",
            "kind": "invariant",
            "label": "档案标识不为空",
            "contextRef": context,
            "bindings": {"profile": {"ref": "thing.customer-profile"}},
            "expression": "profile.profile_id.size() > 0",
            "resultType": "bool",
        },
    ]


def channel_documents() -> list[dict[str, Any]]:
    """An inquiry and proposal exist, but no agreement has been signed."""
    context = "context.sales-channel"
    return [
        entity(context, "context", "channel", "询价渠道"),
        entity("role.prospect", "role", "party", "询价方", contextRef=context),
        entity("role.quote-provider", "role", "party", "报价方", contextRef=context),
        entity(
            "rfp.customer-inquiry",
            "evidence",
            "rfp",
            "客户询价",
            contextRef=context,
            responsibleRoleRef="role.prospect",
            attributes=[
                attribute("started_at", "timestamp", "询价形成时间", keyData=True),
                attribute("expired_at", "timestamp", "询价回应截止时间", keyData=True),
            ],
        ),
        entity(
            "proposal.customer-quote",
            "evidence",
            "proposal",
            "客户报价",
            contextRef=context,
            responsibleRoleRef="role.quote-provider",
            attributes=[
                attribute("started_at", "timestamp", "报价形成时间", keyData=True),
                attribute(
                    "expired_at", "timestamp", "报价有效期截止时间", keyData=True
                ),
            ],
        ),
        {
            "type": "relationship",
            "id": "relation.inquiry-quote",
            "kind": "precedes",
            "sourceRef": "rfp.customer-inquiry",
            "targetRef": "proposal.customer-quote",
            "label": "询价获得报价回应",
        },
    ]


def performance_fulfillment(
    name: str, label: str, request_role: str, confirmation_role: str
) -> list[dict[str, Any]]:
    fulfillment = f"fulfillment.{name}"
    request = f"request.{name}"
    confirmation = f"confirmation.{name}"
    result = (
        attribute("approved", "bool", "是否批准目标变更")
        if name == "target-change"
        else attribute("actual_count", "int", "本周实际联系数量")
    )
    return [
        entity(
            fulfillment,
            "context",
            "fulfillment",
            label,
            parentContextRef="context.performance",
            notes=(
                "目标变更责任仅要求按时答复，approved=false 不改变旧目标。"
                if name == "target-change"
                else "管理方要求执行方提交周进度结果。"
            ),
        ),
        entity(
            request,
            "evidence",
            "fulfillment_request",
            label + "请求",
            contextRef=fulfillment,
            responsibleRoleRef=request_role,
            attributes=[
                attribute("started_at", "timestamp", "请求开始时间", keyData=True),
                attribute(
                    "expired_at", "timestamp", "请求中明确记录的截止时间", keyData=True
                ),
            ],
        ),
        entity(
            confirmation,
            "evidence",
            "fulfillment_confirmation",
            label + "结果确认",
            contextRef=fulfillment,
            responsibleRoleRef=confirmation_role,
            attributes=[
                attribute(
                    "confirmed_at", "timestamp", "结果确认形成时间", keyData=True
                ),
                result,
            ],
        ),
        {
            "type": "rule",
            "id": f"rule.{name}-overdue",
            "kind": "breach",
            "label": label + "逾期未答复",
            "contextRef": fulfillment,
            "resultType": "bool",
            "bindings": {
                "request": {"ref": request},
                "results": {"ref": confirmation, "cardinality": "many"},
                "now": {"type": "timestamp"},
            },
            "expression": "now > request.expired_at && results.size() == 0",
        },
    ]


def performance_documents(
    target_change: bool,
    employee_initiates: bool = True,
    negotiate_before_signing: bool = True,
) -> list[dict[str, Any]]:
    context = "context.performance"
    documents = [
        entity(
            context,
            "context",
            "contract",
            "绩效协议上下文",
            rootRefs=["contract.performance"],
        ),
        entity("role.manager", "role", "party", "管理方", contextRef=context),
        entity("role.employee", "role", "party", "电话销售", contextRef=context),
        entity(
            "contract.performance",
            "evidence",
            "contract",
            "绩效协议",
            contextRef=context,
            roleRefs=["role.manager", "role.employee"],
            attributes=[
                attribute("signed_at", "timestamp", "协议签署时间", keyData=True)
            ],
        ),
        *performance_fulfillment(
            "progress-review", "周进度检查", "role.manager", "role.employee"
        ),
    ]
    if target_change:
        request_role, confirmation_role = (
            ("role.employee", "role.manager")
            if employee_initiates
            else ("role.manager", "role.employee")
        )
        documents.extend(
            performance_fulfillment(
                "target-change",
                "目标变更答复",
                request_role,
                confirmation_role,
            )
        )
    elif negotiate_before_signing:
        channel = "context.goal-negotiation"
        documents.extend(
            [
                entity(channel, "context", "pre_contract", "绩效目标签约前协商"),
                entity(
                    "role.goal-requester",
                    "role",
                    "party",
                    "管理方邀请目标方案",
                    contextRef=channel,
                ),
                entity(
                    "role.goal-proposer",
                    "role",
                    "party",
                    "电话销售提出目标方案",
                    contextRef=channel,
                ),
                entity(
                    "rfp.goal-invitation",
                    "evidence",
                    "rfp",
                    "目标方案邀请",
                    contextRef=channel,
                    responsibleRoleRef="role.goal-requester",
                    attributes=[
                        attribute(
                            "started_at", "timestamp", "邀请发出时间", keyData=True
                        ),
                        attribute(
                            "expired_at", "timestamp", "邀请回应截止时间", keyData=True
                        ),
                    ],
                ),
                entity(
                    "proposal.goals",
                    "evidence",
                    "proposal",
                    "目标方案",
                    contextRef=channel,
                    responsibleRoleRef="role.goal-proposer",
                    attributes=[
                        attribute(
                            "started_at", "timestamp", "方案提出时间", keyData=True
                        ),
                        attribute(
                            "expired_at",
                            "timestamp",
                            "方案有效期截止时间",
                            keyData=True,
                        ),
                    ],
                ),
                {
                    "type": "relationship",
                    "id": "relation.goal-invitation",
                    "kind": "precedes",
                    "sourceRef": "rfp.goal-invitation",
                    "targetRef": "proposal.goals",
                    "label": "邀请后提出方案",
                },
                {
                    "type": "relationship",
                    "id": "relation.goals-agreement",
                    "kind": "precedes",
                    "sourceRef": "proposal.goals",
                    "targetRef": "contract.performance",
                    "label": "目标方案经同意后形成协议",
                },
            ]
        )
    return documents


def write_document(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(document, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )


def write_documents(root: Path, documents: list[dict[str, Any]]) -> None:
    directories = {
        "entity": "entities",
        "relationship": "relationships",
        "rule": "rules",
    }
    for document in documents:
        filename = document["id"].replace(".", "--") + ".yaml"
        write_document(root / directories[document["type"]] / filename, document)


def write_model(root: Path, documents: list[dict[str, Any]], entry: str) -> Path:
    write_document(
        root / "model.yaml",
        {
            "type": "fm_model",
            "schemaVersion": "3.0",
            "id": "context-sample",
            "name": "上下文范围测试模型",
            "version": "1.0.0",
            "ruleLanguage": "CEL",
            "modelStatus": "draft",
            "stakeholderReview": {"status": "pending"},
            "entryContextRefs": [entry],
        },
    )
    write_documents(root, documents)
    return root

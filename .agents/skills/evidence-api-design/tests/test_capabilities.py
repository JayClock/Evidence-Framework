from __future__ import annotations

import copy
import importlib
import unittest

from test_support import design, index

resources_module = importlib.import_module("fm_api_core.resources")
capabilities_module = importlib.import_module("fm_api_core.capabilities")


class CapabilitiesTest(unittest.TestCase):
    def project(self, value):
        resources, _ = resources_module.build_resources(value, index())
        return capabilities_module.project_capabilities(value, index(), resources)

    def test_supported_append_is_an_interface(self) -> None:
        interfaces, operations, diagnostics = self.project(design())
        self.assertEqual(
            [item["id"] for item in interfaces],
            ["capability.request-payment", "capability.submit-confirmation"],
        )
        self.assertEqual(operations[0]["method"], "POST")
        self.assertTrue(all("status" not in item for item in interfaces))
        self.assertFalse([item for item in diagnostics if item.severity == "error"])

    def test_evidence_put_is_rejected(self) -> None:
        value = design()
        value["capabilities"][0]["method"] = "PUT"
        interfaces, _, diagnostics = self.project(value)
        self.assertNotIn(
            "capability.request-payment", {item["id"] for item in interfaces}
        )
        self.assertIn(
            "EVIDENCE_MUTATION_FORBIDDEN", {item.code for item in diagnostics}
        )

    def test_missing_actor_scope_remains_a_gap(self) -> None:
        value = design()
        value["capabilities"][0]["bindingRefs"] = ["binding.request-subscription"]
        interfaces, _, diagnostics = self.project(value)
        self.assertNotIn(
            "capability.request-payment", {item["id"] for item in interfaces}
        )
        self.assertIn("ACTOR_SCOPE_UNRESOLVED", {item.code for item in diagnostics})

    def test_unplayed_party_role_is_not_projected(self) -> None:
        value = design()
        model = copy.deepcopy(index())
        model.relationships = {
            key: item
            for key, item in model.relationships.items()
            if item.get("targetRef") != "role.platform-subscription"
        }
        resources, _ = resources_module.build_resources(value, model)
        interfaces, _, diagnostics = capabilities_module.project_capabilities(
            value, model, resources
        )
        self.assertNotIn(
            "capability.request-payment", {item["id"] for item in interfaces}
        )
        self.assertIn("ACTOR_PARTY_PLAYER_MISSING", {item.code for item in diagnostics})

    def test_contract_collection_get_must_be_party_scoped(self) -> None:
        value = design()
        value["bindings"].append(
            {
                "id": "binding.caller-subscription-subscriber",
                "kind": "caller_role",
                "roleRef": "role.subscriber",
                "scopeResourceRef": "resource.subscription",
                "basis": {
                    "fmRefs": ["role.subscriber", "contract.content-subscription"],
                    "reasoning": "订阅者按自身参与范围读取订阅列表",
                },
            }
        )
        value["capabilities"] = [
            {
                "id": "capability.list-subscriptions-subscriber",
                "actorRoleRef": "role.subscriber",
                "resourceRef": "resource.subscription",
                "view": "collection",
                "method": "GET",
                "effect": {
                    "kind": "read",
                    "targetRef": "contract.content-subscription",
                },
                "businessCapability": "列出本人内容订阅",
                "scenarioRefs": ["scenario.api-payment"],
                "bindingRefs": ["binding.caller-subscription-subscriber"],
                "basis": {
                    "fmRefs": [
                        "party.customer",
                        "relation.customer-plays-subscriber",
                        "contract.content-subscription",
                    ],
                    "reasoning": "合同列表必须先按具体 Participant Party 收敛",
                },
            }
        ]
        projected, _ = resources_module.build_resources(value, index())
        interfaces, _, diagnostics = capabilities_module.project_capabilities(
            value, index(), projected
        )
        self.assertEqual([], interfaces)
        self.assertIn(
            "CONTRACT_LIST_PARTY_SCOPE_MISSING", {item.code for item in diagnostics}
        )

    def _party_scoped_contract_list_design(
        self, party_segment: str, party_parameter: str
    ) -> dict:
        value = design()
        value["resources"].extend(
            [
                {
                    "id": "resource.party-customer",
                    "entityRef": "party.customer",
                    "segment": party_segment,
                    "identity": {
                        "kind": "api_resource_id",
                        "parameter": party_parameter,
                        "decisionRef": "decision.resource-identity",
                    },
                    "basis": {
                        "fmRefs": ["party.customer"],
                        "reasoning": "具体客户主体是合同列表作用域根",
                    },
                    "shape": "collection",
                    "businessName": "客户主体",
                },
                {
                    "id": "resource.party-subscriptions",
                    "entityRef": "contract.content-subscription",
                    "segment": "subscriptions",
                    "parentRef": "resource.party-customer",
                    "parentBindingRef": "binding.party-subscriptions",
                    "identity": {
                        "kind": "api_resource_id",
                        "parameter": "subscriptionId",
                        "decisionRef": "decision.resource-identity",
                    },
                    "basis": {
                        "fmRefs": [
                            "party.customer",
                            "relation.customer-plays-subscriber",
                            "contract.content-subscription",
                        ],
                        "sourceRefs": ["source.successful-payment"],
                        "reasoning": "合同列表按具体主体过滤，不把合同双方混为一个根集合",
                    },
                    "shape": "collection",
                    "businessName": "客户内容订阅列表",
                    "cardinality": {
                        "max": "many",
                        "sourceRefs": ["source.successful-payment"],
                        "reasoning": "列表返回该主体参与的内容订阅集合",
                    },
                },
            ]
        )
        value["bindings"].extend(
            [
                {
                    "id": "binding.party-subscriptions",
                    "kind": "parent_child",
                    "parentResourceRef": "resource.party-customer",
                    "childResourceRef": "resource.party-subscriptions",
                    "basis": {
                        "fmRefs": [
                            "party.customer",
                            "relation.customer-plays-subscriber",
                            "contract.content-subscription",
                        ],
                        "reasoning": "合同列表由参与主体收敛",
                    },
                },
                {
                    "id": "binding.caller-party-subscription-subscriber",
                    "kind": "caller_role",
                    "roleRef": "role.subscriber",
                    "scopeResourceRef": "resource.party-customer",
                    "basis": {
                        "fmRefs": [
                            "party.customer",
                            "relation.customer-plays-subscriber",
                            "role.subscriber",
                        ],
                        "reasoning": "订阅者只能读取自身主体范围下的订阅列表",
                    },
                },
            ]
        )
        value["capabilities"] = [
            {
                "id": "capability.list-subscriptions-subscriber",
                "actorRoleRef": "role.subscriber",
                "resourceRef": "resource.party-subscriptions",
                "view": "collection",
                "method": "GET",
                "effect": {
                    "kind": "read",
                    "targetRef": "contract.content-subscription",
                },
                "businessCapability": "列出本人内容订阅",
                "scenarioRefs": ["scenario.api-payment"],
                "bindingRefs": [
                    "binding.caller-party-subscription-subscriber",
                    "binding.party-subscriptions",
                ],
                "basis": {
                    "fmRefs": [
                        "party.customer",
                        "relation.customer-plays-subscriber",
                        "contract.content-subscription",
                    ],
                    "reasoning": "合同列表读取以具体客户主体为 URL 根",
                },
            }
        ]
        return value

    def test_generic_party_root_contract_collection_get_remains_gap(self) -> None:
        value = self._party_scoped_contract_list_design("parties", "partyId")
        projected, _ = resources_module.build_resources(value, index())
        interfaces, _, diagnostics = capabilities_module.project_capabilities(
            value, index(), projected
        )
        self.assertEqual([], interfaces)
        self.assertIn(
            "CONTRACT_LIST_PARTY_SCOPE_MISSING", {item.code for item in diagnostics}
        )

    def test_party_scoped_contract_collection_get_is_projected(self) -> None:
        value = self._party_scoped_contract_list_design("customers", "customerId")
        projected, resource_diagnostics = resources_module.build_resources(
            value, index()
        )
        interfaces, _, diagnostics = capabilities_module.project_capabilities(
            value, index(), projected
        )
        self.assertNotIn(
            "RESOURCE_CONTEXT_ROOT_MISMATCH",
            {item.code for item in resource_diagnostics},
        )
        self.assertEqual(
            "/customers/{customerId}/subscriptions",
            next(
                item
                for item in interfaces
                if item["id"] == "capability.list-subscriptions-subscriber"
            )["uri"],
        )
        self.assertNotIn(
            "CONTRACT_LIST_PARTY_SCOPE_MISSING", {item.code for item in diagnostics}
        )


if __name__ == "__main__":
    unittest.main()

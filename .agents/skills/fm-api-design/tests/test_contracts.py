"""Synthetic transport examples; not additional business permissions or FM facts."""

from __future__ import annotations

import copy
import importlib
import json
import unittest

from test_support import API_ROOT, REPO_ROOT, design, index

projector = importlib.import_module("fm_api_core.projector")


def fixture():
    projection = projector.build_projection(design(), index(), REPO_ROOT, "fixture")
    # HTTP component fixture; whole-model coverage is exercised separately.
    projection["capabilities"] = [
        item
        for item in projection["capabilities"]
        if item["id"] == "capability.request-payment"
    ]
    contract = {
        "representations": [
            {
                "id": "representation.payment",
                "resourceRef": "resource.payment",
                "view": "item",
                "actorRoleRefs": ["role.platform-subscription"],
                "mediaType": "application/hal+json",
                "fields": [
                    {
                        "name": "id",
                        "schema": {"type": "string"},
                        "required": True,
                        "origin": "server",
                        "decision": "Synthetic API identity, not a business attribute",
                    },
                    {
                        "name": "amount",
                        "schema": {"type": "integer"},
                        "required": True,
                        "origin": "derived",
                        "fmAttributeRef": "request.content-payment#requested_minor_units",
                    },
                ],
                "example": {"id": "pay-1", "amount": 100},
                "exampleParameters": {"subscriptionId": "sub-1", "paymentId": "pay-1"},
                "links": [],
                "cache": {
                    "mode": "no-store",
                    "reason": "Synthetic private payment representation",
                },
            }
        ],
        "operations": [
            {
                "capabilityRef": "capability.request-payment",
                "request": {
                    "mediaType": "application/json",
                    "fields": [],
                    "example": {},
                },
                "responses": [
                    {
                        "status": 201,
                        "description": "Request resource created, fulfillment still pending",
                        "representationRef": "representation.payment",
                        "headers": {"Location": "/subscriptions/sub-1/payments/pay-1"},
                    },
                    {
                        "status": 403,
                        "description": "Caller outside subscription scope",
                        "headers": {},
                    },
                ],
                "idempotency": {
                    "mode": "key",
                    "reason": "Retry must not append a second request",
                    "header": "Idempotency-Key",
                    "samePayload": "replay",
                    "differentPayload": "reject",
                },
                "concurrency": {
                    "mode": "none",
                    "reason": "No mutable evidence replacement",
                },
            }
        ],
        "journeys": [
            {
                "id": "http.request-payment",
                "actorRoleRef": "role.platform-subscription",
                "steps": [
                    {
                        "id": "http.create",
                        "capabilityRef": "capability.request-payment",
                        "expectStatus": 201,
                        "entry": "Explicitly configured entry and subscription from existing context",
                        "inputs": [
                            {
                                "target": "path",
                                "name": "subscriptionId",
                                "source": {
                                    "kind": "literal",
                                    "value": "sub-1",
                                    "reason": "Synthetic entry input",
                                },
                            },
                            {
                                "target": "header",
                                "name": "Idempotency-Key",
                                "source": {
                                    "kind": "literal",
                                    "value": "retry-1",
                                    "reason": "Synthetic retry key",
                                },
                            },
                        ],
                    }
                ],
            }
        ],
    }
    return projection, contract


class ContractTest(unittest.TestCase):
    def build(self, contract=None, projection=None):
        original, default = fixture()
        engine = importlib.import_module("fm_api_core.contracts")
        return engine.build_http(contract or default, projection or original, index())

    def codes(self, result):
        return {item["code"] for item in result["diagnostics"]}

    def test_valid_contract_and_static_journey(self):
        result = self.build()
        self.assertEqual(result["diagnostics"], [])
        self.assertTrue(result["complete"])
        self.assertEqual(result["journeys"][0]["status"], "mapped")
        self.assertFalse(result["runtimeValidated"])
        self.assertEqual(
            result["representations"][0]["example"]["_links"]["self"]["href"],
            "/subscriptions/sub-1/payments/pay-1",
        )

    def test_derived_field_cannot_be_client_input(self):
        _, contract = fixture()
        field = copy.deepcopy(contract["representations"][0]["fields"][1])
        field["origin"] = "client"
        contract["operations"][0]["request"]["fields"] = [field]
        contract["operations"][0]["request"]["example"] = {"amount": 100}
        self.assertIn("CONTRACT_FIELD_ORIGIN", self.codes(self.build(contract)))

    def test_examples_and_local_schema_are_validated(self):
        _, contract = fixture()
        contract["representations"][0]["example"]["amount"] = "not-an-integer"
        self.assertIn("CONTRACT_EXAMPLE_INVALID", self.codes(self.build(contract)))
        contract["representations"][0]["fields"][0]["schema"] = {
            "$ref": "https://invalid.example/schema"
        }
        self.assertIn("CONTRACT_SCHEMA_UNSUPPORTED", self.codes(self.build(contract)))

    def test_wrong_model_field_and_unknown_interface_fail(self):
        _, contract = fixture()
        contract["representations"][0]["fields"][1]["fmAttributeRef"] = (
            "request.content-payment#missing"
        )
        contract["operations"][0]["capabilityRef"] = "capability.invented"
        codes = self.codes(self.build(contract))
        self.assertIn("CONTRACT_FM_REF", codes)
        self.assertIn("CONTRACT_CAPABILITY_REF", codes)

    def test_public_cache_requires_explicit_partition_decision(self):
        _, contract = fixture()
        contract["representations"][0]["cache"] = {
            "mode": "public",
            "reason": "Unjustified shared data",
            "maxAge": 60,
            "validator": "etag",
        }
        self.assertIn("CONTRACT_CACHE_SCOPE", self.codes(self.build(contract)))

    def test_cache_policy_materializes_http_headers(self):
        result = self.build()
        self.assertEqual(
            result["operations"][0]["responses"][0]["headers"]["Cache-Control"],
            "no-store",
        )
        _, contract = fixture()
        contract["operations"][0]["responses"][0]["headers"]["Cache-Control"] = (
            "public, max-age=86400"
        )
        self.assertIn("CONTRACT_CACHE_HEADERS", self.codes(self.build(contract)))

    def test_202_requires_authorized_result_discovery(self):
        _, contract = fixture()
        contract["operations"][0]["responses"][0]["status"] = 202
        self.assertIn("CONTRACT_ASYNC_RESULT", self.codes(self.build(contract)))

    def test_missing_and_forward_flow_inputs_remain_gaps(self):
        _, contract = fixture()
        contract["journeys"][0]["steps"][0]["inputs"][0]["source"] = {
            "kind": "response_field",
            "stepRef": "future",
            "name": "id",
        }
        codes = self.codes(self.build(contract))
        self.assertIn("HTTP_FLOW_SOURCE", codes)
        self.assertIn("HTTP_FLOW_INPUT", codes)

    def test_201_requires_resource_location_and_retries_require_key(self):
        _, contract = fixture()
        contract["operations"][0]["responses"][0]["headers"] = {}
        contract["journeys"][0]["steps"][0]["inputs"] = contract["journeys"][0][
            "steps"
        ][0]["inputs"][:1]
        codes = self.codes(self.build(contract))
        self.assertIn("CONTRACT_LOCATION", codes)
        self.assertIn("HTTP_FLOW_INPUT", codes)

    def test_missing_operation_and_empty_journeys_not_complete(self):
        _, contract = fixture()
        contract["operations"] = []
        contract["journeys"] = []
        result = self.build(contract)
        self.assertFalse(result["complete"])
        self.assertIn("CONTRACT_OPERATION_MISSING", self.codes(result))
        self.assertEqual(result["journeys"][0]["status"], "not_evaluated")

    def navigation_fixture(self):
        projection, contract = fixture()
        read = copy.deepcopy(projection["capabilities"][0])
        read.update(
            id="capability.read-payment",
            method="GET",
            view="item",
            uri="/subscriptions/{subscriptionId}/payments/{paymentId}",
            effect={"kind": "read", "targetRef": "request.content-payment"},
        )
        projection["capabilities"].append(read)
        operation = copy.deepcopy(contract["operations"][0])
        operation.update(
            capabilityRef=read["id"],
            idempotency={"mode": "not_applicable", "reason": "Read only"},
        )
        operation["responses"][0].update(status=200, headers={})
        contract["operations"].append(operation)
        contract["representations"][0]["links"] = [
            {
                "rel": "details",
                "kind": "navigation",
                "capabilityRef": read["id"],
                "parameterBindings": {
                    "subscriptionId": {"kind": "path", "name": "subscriptionId"},
                    "paymentId": {"kind": "field", "name": "id"},
                },
            }
        ]
        contract["journeys"][0]["steps"].append(
            {
                "id": "http.read",
                "capabilityRef": read["id"],
                "expectStatus": 200,
                "via": {"stepRef": "http.create", "rel": "details"},
                "inputs": [],
            }
        )
        return projection, contract

    def test_navigation_uses_returned_identity_not_guessed_uri(self):
        projection, contract = self.navigation_fixture()
        self.assertEqual(self.build(contract, projection)["diagnostics"], [])
        contract["representations"][0]["links"][0]["parameterBindings"]["paymentId"][
            "name"
        ] = "missing"
        self.assertIn(
            "CONTRACT_LINK_PARAMETER", self.codes(self.build(contract, projection))
        )

    def test_location_header_can_drive_async_discovery(self):
        projection, contract = self.navigation_fixture()
        contract["operations"][0]["responses"][0].update(
            status=202, resultCapabilityRef="capability.read-payment"
        )
        contract["journeys"][0]["steps"][0]["expectStatus"] = 202
        contract["journeys"][0]["steps"][1]["via"] = {
            "stepRef": "http.create",
            "header": "Location",
        }
        self.assertEqual(self.build(contract, projection)["diagnostics"], [])

    def test_conditional_links_not_assumed_available(self):
        projection, contract = self.navigation_fixture()
        contract["representations"][0]["links"][0]["whenRuleRef"] = (
            "rule.content-payment-completed"
        )
        self.assertIn(
            "HTTP_FLOW_CONDITION", self.codes(self.build(contract, projection))
        )

    def test_response_location_cannot_switch_parent_instance(self):
        _, contract = fixture()
        contract["operations"][0]["responses"][0]["headers"]["Location"] = (
            "/subscriptions/another-customer/payments/pay-1"
        )
        self.assertIn("HTTP_FLOW_INSTANCE", self.codes(self.build(contract)))

    def test_response_field_and_header_data_flow(self):
        projection, contract = self.navigation_fixture()
        step = contract["journeys"][0]["steps"][1]
        step.pop("via")
        step["entry"] = "Explicit entry with response-derived identity"
        step["inputs"] = [
            {
                "target": "path",
                "name": "subscriptionId",
                "source": {
                    "kind": "literal",
                    "value": "sub-1",
                    "reason": "Known context",
                },
            },
            {
                "target": "path",
                "name": "paymentId",
                "source": {
                    "kind": "response_field",
                    "stepRef": "http.create",
                    "name": "id",
                },
            },
            {
                "target": "header",
                "name": "If-Match",
                "source": {
                    "kind": "response_header",
                    "stepRef": "http.create",
                    "name": "ETag",
                },
            },
        ]
        contract["operations"][0]["responses"][0]["headers"]["ETag"] = '"v1"'
        self.assertEqual(self.build(contract, projection)["diagnostics"], [])

    def test_pagination_requires_collection_get_and_preserves_cursor(self):
        projection, contract = self.navigation_fixture()
        read = projection["capabilities"][-1]
        read.update(view="collection", uri="/subscriptions/{subscriptionId}/payments")
        representation = contract["representations"][0]
        representation.update(
            view="collection",
            exampleParameters={"subscriptionId": "sub-1"},
            links=[],
            pagination={
                "mode": "cursor",
                "parameter": "after",
                "nextExample": "a+b",
                "reason": "Synthetic cursor",
            },
        )
        result = self.build(contract, projection)
        self.assertNotIn("CONTRACT_PAGINATION", self.codes(result))
        self.assertTrue(
            result["representations"][0]["example"]["_links"]["next"]["href"].endswith(
                "after=a%2Bb"
            )
        )
        projection["capabilities"] = [
            item
            for item in projection["capabilities"]
            if item["id"] != "capability.read-payment"
        ]
        self.assertIn(
            "CONTRACT_PAGINATION", self.codes(self.build(contract, projection))
        )

    def test_collection_embeds_explicit_item_representation(self):
        projection, contract = self.navigation_fixture()
        item = contract["representations"][0]
        collection = copy.deepcopy(item)
        collection.update(
            id="representation.collection",
            view="collection",
            fields=[],
            example={},
            exampleParameters={"subscriptionId": "sub-1"},
            links=[],
            embedded=[{"rel": "payments", "representationRefs": [item["id"]]}],
        )
        contract["representations"].append(collection)
        result = self.build(contract, projection)
        body = next(
            rep["example"]
            for rep in result["representations"]
            if rep["id"] == collection["id"]
        )
        self.assertEqual(
            body["_embedded"]["payments"][0]["_links"]["self"]["href"],
            "/subscriptions/sub-1/payments/pay-1",
        )
        collection["embedded"][0]["representationRefs"] = ["representation.missing"]
        self.assertIn("CONTRACT_EMBEDDED", self.codes(self.build(contract, projection)))

    def test_conditional_response_requires_conditional_request(self):
        projection, contract = self.navigation_fixture()
        contract["operations"][1]["responses"].append(
            {"status": 304, "description": "Not modified", "headers": {}}
        )
        contract["journeys"][0]["steps"][1]["expectStatus"] = 304
        self.assertIn(
            "HTTP_FLOW_CONDITIONAL", self.codes(self.build(contract, projection))
        )

    def test_get_cannot_return_another_instance_example(self):
        projection, contract = self.navigation_fixture()
        contract["representations"][0]["example"]["id"] = "pay-2"
        # The link now requests pay-2; the declared response still represents pay-1.
        self.assertIn(
            "HTTP_FLOW_INSTANCE", self.codes(self.build(contract, projection))
        )

    def test_failure_only_journey_does_not_cover_successful_consumption(self):
        _, contract = fixture()
        contract["journeys"][0]["steps"][0]["expectStatus"] = 403
        result = self.build(contract)
        self.assertEqual(result["journeys"][0]["status"], "mapped")
        self.assertIn("HTTP_FLOW_UNCOVERED", self.codes(result))
        self.assertFalse(result["complete"])

    def test_schema_is_strict_and_fixture_matches(self):
        import jsonschema

        _, contract = fixture()
        api = design()
        api["http"] = contract
        schema = json.loads((API_ROOT / "schemas/api.schema.json").read_text())
        jsonschema.Draft202012Validator.check_schema(schema)
        validator = jsonschema.Draft202012Validator(schema)
        self.assertEqual(list(validator.iter_errors(api)), [])
        api["http"]["operations"][0]["approve"] = True
        self.assertTrue(list(validator.iter_errors(api)))


if __name__ == "__main__":
    unittest.main()

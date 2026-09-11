from __future__ import annotations

import importlib
import unittest

from test_support import API_ROOT


class OpenApiProjectionTest(unittest.TestCase):
    def module(self):
        self.assertTrue(API_ROOT.is_dir())
        return importlib.import_module("fm_api_core.openapi")

    def test_model_without_interfaces_has_an_explicit_empty_contract(self):
        document = self.module().build_openapi(
            {
                "apiId": "api.subscription",
                "schemaVersion": "4.0",
                "capabilities": [],
                "http": {
                    "operations": [],
                    "representations": [],
                    "runtimeValidated": False,
                },
            }
        )
        self.assertEqual(document["openapi"], "3.1.0")
        self.assertEqual(
            document["info"], {"title": "api.subscription", "version": "generated"}
        )
        self.assertEqual(document["x-fm-api-design-schema-version"], "4.0")
        self.assertEqual(document["paths"], {})
        self.assertEqual(document["components"]["schemas"], {})
        self.assertFalse(document["x-runtime-validated"])

    def test_shared_route_preserves_role_variants_and_http_contract(self):
        projection = {
            "apiId": "api.products",
            "schemaVersion": "4.0",
            "capabilities": [
                {"id": "capability.read-buyer", "businessCapability": "买方查看商品"},
                {"id": "capability.read-seller", "businessCapability": "卖方查看商品"},
            ],
            "http": {
                "runtimeValidated": False,
                "representations": [
                    {
                        "id": "representation.product",
                        "mediaType": "application/hal+json",
                        "fields": [
                            {
                                "name": "productCode",
                                "schema": {"type": "string"},
                                "required": True,
                                "origin": "reference",
                            }
                        ],
                        "example": {
                            "productCode": "product-1",
                            "_links": {"self": {"href": "/products/product-1"}},
                        },
                        "links": [],
                        "cache": {
                            "mode": "private",
                            "maxAge": 0,
                            "validator": "etag",
                            "reason": "test",
                        },
                    }
                ],
                "operations": [
                    self.operation("capability.read-buyer", "role.buyer"),
                    self.operation("capability.read-seller", "role.seller"),
                ],
            },
        }
        document = self.module().build_openapi(projection)
        operation = document["paths"]["/products/{productId}"]["get"]
        self.assertEqual(
            operation["x-fm-capability-refs"],
            ["capability.read-buyer", "capability.read-seller"],
        )
        self.assertEqual(operation["x-actor-role-refs"], ["role.buyer", "role.seller"])
        self.assertEqual(
            {item["name"] for item in operation["parameters"]},
            {"productId", "If-None-Match"},
        )
        response = operation["responses"]["200"]
        self.assertEqual(response["headers"]["ETag"]["example"], '"product-v1"')
        self.assertEqual(
            response["content"]["application/hal+json"]["schema"],
            {"$ref": "#/components/schemas/representation_product"},
        )
        schema = document["components"]["schemas"]["representation_product"]
        self.assertIn("_links", schema["required"])
        self.assertFalse(document["x-runtime-validated"])

    def test_hal_link_is_also_an_openapi_response_link(self):
        source = self.operation("capability.read-quote", "role.buyer")
        source["responses"][0]["representationRef"] = "representation.quote"
        target = self.operation("capability.create-procurement", "role.buyer")
        target.update(
            {
                "method": "POST",
                "uri": "/quotes/{quotationId}/procurements",
            }
        )
        target["request"] = {
            "mediaType": "application/json",
            "fields": [
                {
                    "name": "quotationId",
                    "schema": {"type": "string"},
                    "required": True,
                    "origin": "reference",
                }
            ],
            "example": {"quotationId": "quote-1"},
        }
        representation = {
            "id": "representation.quote",
            "mediaType": "application/hal+json",
            "fields": [
                {
                    "name": "quotationId",
                    "schema": {"type": "string"},
                    "required": True,
                    "origin": "reference",
                }
            ],
            "example": {
                "quotationId": "quote-1",
                "_links": {
                    "self": {"href": "/quotes/quote-1"},
                    "create-procurement": {"href": "/quotes/quote-1/procurements"},
                },
            },
            "links": [
                {
                    "rel": "create-procurement",
                    "kind": "action",
                    "capabilityRef": "capability.create-procurement",
                    "parameterBindings": {
                        "quotationId": {"kind": "field", "name": "quotationId"}
                    },
                    "whenRuleRef": "rule.quotation-open",
                }
            ],
            "cache": {"mode": "no-store", "reason": "test"},
        }
        projection = {
            "apiId": "api.procurement",
            "schemaVersion": "4.0",
            "capabilities": [
                {"id": "capability.read-quote", "businessCapability": "查看报价"},
                {
                    "id": "capability.create-procurement",
                    "businessCapability": "登记采购协议",
                },
            ],
            "http": {
                "runtimeValidated": False,
                "representations": [representation],
                "operations": [source, target],
            },
        }
        document = self.module().build_openapi(projection)
        link = document["paths"]["/quotes/{quoteId}"]["get"]["responses"]["200"][
            "links"
        ]["create-procurement"]
        self.assertEqual(link["operationId"], "capability.create-procurement")
        self.assertEqual(
            link["parameters"],
            {"quotationId": "$response.body#/quotationId"},
        )
        self.assertEqual(link["x-fm-when-rule-ref"], "rule.quotation-open")
        self.assertEqual(
            document["paths"]["/quotes/{quotationId}/procurements"]["post"][
                "requestBody"
            ]["content"]["application/json"]["schema"]["required"],
            ["quotationId"],
        )

    @staticmethod
    def operation(capability: str, role: str) -> dict:
        return {
            "capabilityRef": capability,
            "method": "GET",
            "uri": (
                "/products/{productId}"
                if "quote" not in capability
                else "/quotes/{quoteId}"
            ),
            "actorRoleRef": role,
            "bindingRefs": ["binding.instance"],
            "ruleBindings": [],
            "request": {"mediaType": "application/json", "fields": [], "example": {}},
            "responses": [
                {
                    "status": 200,
                    "description": "成功",
                    "representationRef": "representation.product",
                    "headers": {"ETag": '"product-v1"'},
                },
                {"status": 403, "description": "拒绝", "headers": {}},
            ],
            "idempotency": {"mode": "not_applicable", "reason": "read"},
            "concurrency": {"mode": "none", "reason": "read"},
        }


if __name__ == "__main__":
    unittest.main()

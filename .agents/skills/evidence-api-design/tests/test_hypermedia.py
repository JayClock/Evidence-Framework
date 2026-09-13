from __future__ import annotations

import importlib
import unittest

from test_support import design, index

resources_module = importlib.import_module("fm_api_core.resources")
hypermedia_module = importlib.import_module("fm_api_core.hypermedia")


class HypermediaTest(unittest.TestCase):
        def test_navigation_does_not_auto_create_get(self) -> None:
                value = design()
                value["representations"] = [
                        {
                                "id": "representation.subscription",
                                "resourceRef": "resource.subscription",
                                "view": "item",
                                "format": "hal",
                                "fields": [
                                        {
                                                "name": "signedAt",
                                                "fmAttributeRef": "contract.content-subscription#signed_at",
                                        }
                                ],
                                "links": [
                                        {
                                                "rel": "payments",
                                                "targetResourceRef": "resource.payment",
                                                "targetView": "collection",
                                                "parameterBindings": [
                                                        {
                                                                "parameter": "subscriptionId",
                                                                "fromParameter": "subscriptionId",
                                                        }
                                                ],
                                                "visibleToRoleRefs": [
                                                        "role.platform-subscription"
                                                ],
                                        }
                                ],
                                "basis": {
                                        "fmRefs": [
                                                "contract.content-subscription#signed_at"
                                        ],
                                        "reasoning": "仅公开签约业务时间并提供受限导航",
                                },
                        }
                ]
                resources, _ = resources_module.build_resources(value, index())
                _, diagnostics = hypermedia_module.validate_representations(
                        value, index(), resources, []
                )
                self.assertIn("LINK_GET_MISSING", {item.code for item in diagnostics})


if __name__ == "__main__":
        unittest.main()

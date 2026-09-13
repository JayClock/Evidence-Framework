from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator
from test_support import API_ROOT, design


class DesignSchemaTest(unittest.TestCase):
    def test_business_resource_shape_is_required(self) -> None:
        schema = json.loads((API_ROOT / "schemas/api.schema.json").read_text())
        validator = Draft202012Validator(schema)
        for field in ("businessName", "shape"):
            value = design()
            del value["resources"][0][field]
            self.assertTrue(list(validator.iter_errors(value)), field)
        value = design()
        value["resources"][0]["businessName"] = "   "
        self.assertTrue(list(validator.iter_errors(value)))

    def test_identity_must_match_singleton_or_collection(self) -> None:
        schema = json.loads((API_ROOT / "schemas/api.schema.json").read_text())
        validator = Draft202012Validator(schema)
        value = design()
        child = value["resources"][1]
        child["shape"] = "singleton"
        self.assertTrue(list(validator.iter_errors(value)))
        child["identity"] = {"kind": "parent_scoped"}
        self.assertEqual(list(validator.iter_errors(value)), [])
        child["identity"]["parameter"] = "paymentId"
        self.assertTrue(list(validator.iter_errors(value)))
        child["identity"].pop("parameter")
        child["shape"] = "collection"
        self.assertTrue(list(validator.iter_errors(value)))
        child["shape"] = "singleton"
        child.pop("parentRef")
        self.assertTrue(list(validator.iter_errors(value)))

    def test_projection_uris_must_match_resource_shape(self) -> None:
        schema = json.loads(
            (API_ROOT / "schemas/api-projection.schema.json").read_text()
        )
        validator = Draft202012Validator(schema["properties"]["resources"]["items"])
        resource = copy.deepcopy(design()["resources"][1])
        resource.update(
            shape="singleton",
            identity={"kind": "parent_scoped"},
            uris={"singleton": "/subscriptions/{subscriptionId}/payment"},
            parameters=["subscriptionId"],
        )
        self.assertEqual(list(validator.iter_errors(resource)), [])
        resource["uris"] = {"collection": "/payments", "item": "/payments/{id}"}
        self.assertTrue(list(validator.iter_errors(resource)))

    def test_duplicate_yaml_key_is_rejected(self) -> None:
        from test_support import api_loader

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "api.yaml"
            path.write_text(
                "schemaVersion: '4.0'\nschemaVersion: '4.0'\n", encoding="utf-8"
            )
            value, diagnostics = api_loader.load_api(path)
        self.assertIsNone(value)
        self.assertEqual(diagnostics[0].code, "DESIGN_INVALID")


if __name__ == "__main__":
    unittest.main()

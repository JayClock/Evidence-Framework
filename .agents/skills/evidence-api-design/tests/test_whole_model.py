"""Whole-model delivery must not silently omit interfaces or HTTP contracts."""

from __future__ import annotations

import copy
import importlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml
from test_support import API_ROOT, FM_SKILL, REPO_ROOT

adapter = importlib.import_module("fm_api_core.fm_adapter")
projector = importlib.import_module("fm_api_core.projector")
loader = importlib.import_module("fm_api_core.api_loader")
EXAMPLE = API_ROOT / "assets/examples/full-lifecycle"


class WholeModelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index, diagnostics = adapter.load_fm(EXAMPLE / "fm", FM_SKILL)
        if diagnostics:
            raise AssertionError(diagnostics)
        cls.design = yaml.safe_load((EXAMPLE / "api.yaml").read_text())

    def project(self, design=None, index=None):
        return projector.build_projection(
            design if design is not None else copy.deepcopy(self.design),
            index if index is not None else self.index,
            REPO_ROOT,
            "test",
        )

    def codes(self, projection):
        return {item["code"] for item in projection["diagnostics"]}

    def test_full_example_has_contracts_and_success_flows_for_every_interface(self):
        result = self.project()
        self.assertEqual([], result["diagnostics"])
        refs = {item["id"] for item in result["capabilities"]}
        self.assertEqual(13, len(refs))
        self.assertEqual(
            refs, {item["capabilityRef"] for item in result["http"]["operations"]}
        )
        self.assertEqual(
            refs,
            {
                step["capabilityRef"]
                for journey in result["http"]["journeys"]
                for step in journey["steps"]
                if step["status"] == "mapped" and 200 <= step["expectStatus"] < 300
            },
        )
        self.assertEqual(
            {
                item["id"]
                for item in self.index.entities.values()
                if item["category"] in {"evidence", "thing", "participant"}
            },
            {item["entityRef"] for item in result["modelCoverage"]},
        )

    def test_missing_http_operation_is_a_gap(self):
        value = copy.deepcopy(self.design)
        value["http"]["operations"] = value["http"]["operations"][1:]
        self.assertIn("CONTRACT_OPERATION_MISSING", self.codes(self.project(value)))

    def test_omitted_model_entity_is_not_silently_ignored(self):
        model = copy.deepcopy(self.index)
        model.entities["thing.unmapped"] = {
            "id": "thing.unmapped",
            "category": "thing",
            "kind": "generic",
            "label": "新增业务标的",
            "attributes": [],
        }
        self.assertIn("MODEL_ENTITY_UNCOVERED", self.codes(self.project(index=model)))

    def test_entire_scenario_cannot_be_omitted(self):
        value = copy.deepcopy(self.design)
        value["journeys"] = []
        self.assertIn("SCENARIO_UNCOVERED", self.codes(self.project(value)))

    def test_mapping_to_an_unrelated_interface_fails(self):
        value = copy.deepcopy(self.design)
        step = next(
            step
            for journey in value["journeys"]
            for step in journey["steps"]
            if step["mapping"] == "capability"
        )
        step["capabilityRef"] = "capability.read-product-as-buyer"
        self.assertIn("SCENARIO_CAPABILITY_MISMATCH", self.codes(self.project(value)))

    def test_non_api_disposition_cannot_hide_an_exposed_interface(self):
        value = copy.deepcopy(self.design)
        value.setdefault("nonApiActivities", []).append(
            {
                "entityRef": "request.payment",
                "handling": "internal",
                "basis": {"fmRefs": ["request.payment"], "reasoning": "冲突测试"},
            }
        )
        self.assertIn("MODEL_HANDLING_CONFLICT", self.codes(self.project(value)))

    def test_non_api_handling_requires_business_basis_and_consistent_steps(self):
        value = copy.deepcopy(self.design)
        activity = next(
            item
            for item in value["nonApiActivities"]
            if item["entityRef"] == "confirmation.wechat-payment"
        )
        activity["basis"] = {
            "decisionRefs": ["decision.api-identities"],
            "reasoning": "仅有技术决定不能排除接口",
        }
        self.assertIn("MODEL_HANDLING_BASIS", self.codes(self.project(value)))
        activity["handling"] = "internal"
        self.assertIn("SCENARIO_HANDLING_MISMATCH", self.codes(self.project(value)))

    def test_evidence_read_does_not_replace_formation(self):
        value = copy.deepcopy(self.design)
        capability = next(
            item
            for item in value["capabilities"]
            if item["id"] == "capability.request-payment"
        )
        capability["method"] = "GET"
        capability["effect"]["kind"] = "read"
        self.assertIn("MODEL_EVIDENCE_WRITE_MISSING", self.codes(self.project(value)))

    def test_context_accounting_includes_external_and_fulfillment_contexts(self):
        result = self.project()
        self.assertEqual(
            {
                ref
                for ref, entity in self.index.entities.items()
                if entity["category"] == "context"
            },
            set(result["contextRefs"]),
        )
        self.assertIn("context.wechat-payment", result["contextRefs"])
        self.assertIn("fulfillment.invoice", result["contextRefs"])

    def test_superseded_format_and_unknown_selection_fields_are_rejected(self):
        value = copy.deepcopy(self.design)
        value["schemaVersion"] = "3.0"
        self.assertTrue(
            loader.validate_json(value, API_ROOT / "schemas/api.schema.json")
        )
        value["schemaVersion"] = "4.0"
        value["scope"] = {"contextRefs": ["context.product-catalog"]}
        self.assertTrue(
            loader.validate_json(value, API_ROOT / "schemas/api.schema.json")
        )

    def test_http_document_is_mandatory(self):
        value = copy.deepcopy(self.design)
        value["http"] = None
        self.assertTrue(
            loader.validate_json(value, API_ROOT / "schemas/api.schema.json")
        )

    def test_incomplete_delivery_fails_without_opt_in_and_writes_no_output(self):
        value = copy.deepcopy(self.design)
        value["http"]["operations"] = []
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "api.yaml"
            path.write_text(yaml.safe_dump(value, allow_unicode=True))
            out = Path(directory) / "output"
            for action in ("check", "project"):
                args = [
                    sys.executable,
                    str(API_ROOT / "scripts/fm_api.py"),
                    action,
                    "--project-root",
                    str(REPO_ROOT),
                    "--fm",
                    str(EXAMPLE / "fm"),
                    "--fm-skill",
                    str(FM_SKILL),
                    "--api",
                    str(path),
                ]
                if action == "project":
                    args += ["--out", str(out)]
                result = subprocess.run(
                    args, text=True, capture_output=True, timeout=120
                )
                self.assertEqual(3, result.returncode, result.stdout + result.stderr)
                self.assertFalse(json.loads(result.stdout)["complete"])
                self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()

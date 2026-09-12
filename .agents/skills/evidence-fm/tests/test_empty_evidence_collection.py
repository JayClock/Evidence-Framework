"""An absent confirmation is an empty typed collection, not a fake document."""

import copy
import json
import sys
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

SKILL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_DIR / "scripts"))

# Runtime imports use the bundled scripts path above, as in other FM tests.
from fm_model import load_model  # type: ignore[import-not-found]  # noqa: E402
from fm_simulation import (  # type: ignore[import-not-found]  # noqa: E402
    load_validation_suite,
    simulate_validation_suite,
    validate_validation_suite,
)


class EmptyEvidenceCollectionTests(unittest.TestCase):
    def test_overdue_request_can_bind_no_confirmation_instances(self):
        root = SKILL_DIR / "tests/fixtures/valid-traceable-subscription"
        model = copy.deepcopy(load_model(root))
        suite = copy.deepcopy(load_validation_suite(root))
        suite.scenarios[:] = [suite.scenarios_by_id["scenario.overdue-payment"]]
        rule = next(r for r in model.rules if r["id"] == "rule.payment-expired")
        rule["bindings"].pop("paymentConfirmed")
        rule["bindings"]["confirmations"] = {
            "ref": "confirmation.content-payment",
            "cardinality": "many",
        }
        rule["expression"] = "now > request.expired_at && confirmations.size() == 0"
        evaluation = next(
            e
            for e in suite.scenarios[0]["evaluations"]
            if e["ruleRef"] == "rule.payment-expired"
        )
        evaluation["bindings"].pop("paymentConfirmed")
        evaluation["bindings"]["confirmations"] = {"instanceRefs": []}
        schema = json.loads((SKILL_DIR / "schemas/scenario.schema.json").read_text())
        schema_errors = list(
            Draft202012Validator(schema).iter_errors(suite.scenarios[0])
        )
        self.assertEqual([], [error.message for error in schema_errors])
        self.assertEqual([], validate_validation_suite(model, suite))
        report, errors = simulate_validation_suite(model, suite)
        self.assertEqual([], errors)
        result = report["scenarioResults"][0]
        self.assertTrue(result["simulationPassed"])
        self.assertEqual("breached", result["fulfillmentStatuses"][0]["status"])
        rule["bindings"]["confirmations"]["cardinality"] = "one"
        errors = validate_validation_suite(model, suite)
        self.assertTrue(any("expects cardinality 'one'" in e for e in errors), errors)


if __name__ == "__main__":
    unittest.main()

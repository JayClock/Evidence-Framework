from __future__ import annotations

import json
import subprocess
import sys
import unittest

from test_support import API_ROOT, FM_SKILL, REPO_ROOT


class FullLifecycleExampleTest(unittest.TestCase):
    def test_product_procurement_lifecycle_is_valid_and_complete(self) -> None:
        example = API_ROOT / "assets" / "examples" / "full-lifecycle"
        fm_check = subprocess.run(
            [
                sys.executable,
                str(FM_SKILL / "scripts" / "check_fm.py"),
                str(example / "fm"),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
        self.assertEqual(fm_check.returncode, 0, fm_check.stderr)
        fm_report = json.loads(fm_check.stdout)
        self.assertTrue(fm_report["simulationPassed"])
        api_check = subprocess.run(
            [
                sys.executable,
                str(API_ROOT / "scripts" / "fm_api.py"),
                "check",
                "--project-root",
                str(REPO_ROOT),
                "--fm",
                str(example / "fm"),
                "--fm-skill",
                str(FM_SKILL),
                "--api",
                str(example / "api.yaml"),
                "--require-complete",
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
        self.assertEqual(api_check.returncode, 0, api_check.stderr)
        report = json.loads(api_check.stdout)
        self.assertTrue(report["complete"])
        self.assertEqual(report["candidateCount"], 13)
        self.assertEqual(report["projection"]["inputDigests"]["sources"], {})
        uris = {
            item["id"]: item["uri"] for item in report["projection"]["capabilities"]
        }
        self.assertEqual(uris["capability.inquire-products"], "/product-inquiries")
        self.assertEqual(
            uris["capability.quote-products"],
            "/product-inquiries/{inquiryId}/quotation",
        )
        self.assertEqual(
            uris["capability.register-procurement"], "/product-procurements"
        )
        self.assertEqual(
            uris["capability.request-payment"],
            "/product-procurements/{procurementId}/payment",
        )
        self.assertEqual(
            uris["capability.record-delivery-note"],
            "/product-procurements/{procurementId}/delivery/delivery-note",
        )
        self.assertEqual(
            uris["capability.issue-invoice"],
            "/product-procurements/{procurementId}/invoicing/invoice",
        )
        self.assertEqual(fm_report["timelineSummary"]["unresolvedOrderCount"], 0)
        kinds = {
            item["effect"]["targetRef"] for item in report["projection"]["capabilities"]
        }
        self.assertEqual(
            kinds,
            {
                "rfp.product-inquiry",
                "proposal.product-quotation",
                "contract.product-procurement",
                "request.payment",
                "confirmation.payment",
                "request.invoice",
                "confirmation.invoice",
                "evidence.invoice",
                "request.delivery",
                "confirmation.delivery",
                "evidence.delivery-note",
                "thing.product",
            },
        )


if __name__ == "__main__":
    unittest.main()

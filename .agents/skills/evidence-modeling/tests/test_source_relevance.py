"""Reference routing and decision topology, not live-agent behavior evidence."""

import json
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
FM = SKILLS / "evidence-fm"
DISCOVERY = SKILLS / "evidence-discovery"


def decision_edges(path):
    graph = re.search(r"```mermaid\n(.*?)```", path.read_text(), re.S)
    if graph is None:
        raise AssertionError(f"Missing decision graph: {path}")
    return set(re.findall(
        r"(?m)^\s*(\w+) -->\s*(?:\|([^|]+)\|\s*)?(\w+)", graph[1]
    ))


class SourceRelevanceTests(unittest.TestCase):
    def test_provenance_uses_a_relevance_gate_before_opening_a_source_gap(self):
        edges = decision_edges(FM / "references/provenance.md")
        self.assertLessEqual({
            ("judgment", "", "reuse"),
            ("reuse", "", "impact"),
            ("impact", "没有", "apply"),
            ("impact", "有", "source"),
            ("source", "", "known"),
            ("known", "能", "apply"),
            ("known", "不能", "gap"),
        }, edges)
        self.assertFalse(any(start in {"apply", "gap"} for start, _, _ in edges))

    def test_interview_consumes_known_basis_before_building_a_question_group(self):
        edges = decision_edges(DISCOVERY / "references/interview.md")
        self.assertLessEqual({
            ("focus", "", "reuse"),
            ("reuse", "", "needed"),
            ("needed", "有", "group"),
            ("needed", "没有", "handoff"),
            ("group", "", "question"),
            ("question", "", "wait"),
        }, edges)

    def test_fulfillment_entry_cases_have_local_sources_and_observable_criteria(self):
        path = DISCOVERY / "evals/fulfillment-entry.json"
        catalog = json.loads(path.read_text())
        self.assertEqual("evidence-discovery", catalog["skill_name"])
        cases = {case["category"]: case for case in catalog["evals"]}
        self.assertEqual({
            "signed-contract-current-fulfillment",
            "accepted-version-dispute",
            "template-is-not-an-executed-transaction",
        }, cases.keys())
        for case in cases.values():
            with self.subTest(case=case["id"]):
                self.assertEqual(["evidence-fm"], case["knowledgeSkills"])
                self.assertTrue(case["prompt"])
                self.assertTrue(case["expectations"])
                self.assertTrue(case["forbiddenActions"])
                for relative in case["files"]:
                    source = (path.parent / relative).resolve()
                    self.assertTrue(source.is_relative_to(path.parent.resolve()))
                    self.assertTrue(source.is_file())
        self.assertIn("../references/provenance.md", json.loads(
            (FM / "evals/behavior.json").read_text()
        )["contract_refs"])


if __name__ == "__main__":
    unittest.main()

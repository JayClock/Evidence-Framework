"""Reference routing and decision topology, not live-agent behavior evidence."""

import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
FM = SKILLS / "evidence-fm"


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


if __name__ == "__main__":
    unittest.main()

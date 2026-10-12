"""Catalog freshness and resource contracts, not live agent behavior evaluation."""

from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

SKILLS = Path(__file__).resolve().parents[2]


def catalog_errors(path: Path, document: dict[str, Any], skills: Path) -> list[str]:
    owner = path.parent.parent.resolve()
    errors: list[str] = []
    known = {entry.name for entry in skills.glob("evidence-*")
             if (entry / "SKILL.md").is_file()}
    if document.get("skill_name") != owner.name:
        errors.append("skill_name must identify the owning package")

    def references(values: Any, base: Path, label: str) -> None:
        if not isinstance(values, list) or not values:
            errors.append(f"{label}: expected nonempty resource list")
            return
        for relative in values:
            if not isinstance(relative, str) or not relative:
                errors.append(f"{label}: invalid resource path")
                continue
            target = (base / relative).resolve()
            if not target.is_relative_to(owner):
                errors.append(f"{label}: resource escapes owning package: {relative}")
            elif not target.exists():
                errors.append(f"{label}: missing resource: {relative}")

    references(document.get("contract_refs"), path.parent, "contract_refs")
    base_value = document.get("files_base", ".")
    if base_value not in (".", ".."):
        errors.append("files_base must be . (evals) or .. (Skill root)")
        base_value = "."
    files_base = path.parent / base_value
    cases = document.get("evals")
    if not isinstance(cases, list) or not cases:
        return [*errors, "evals must be a nonempty list"]
    ids: set[int | str] = set()
    for case in cases:
        if not isinstance(case, dict):
            errors.append("case must be an object")
            continue
        identity = case.get("id")
        label = f"case {identity}"
        if not isinstance(identity, (int, str)) or isinstance(identity, bool) or identity == "":
            errors.append(f"{label}: invalid ID")
        elif identity in ids:
            errors.append(f"{label}: duplicate ID")
        else:
            ids.add(identity)
        prompt = case.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            errors.append(f"{label}: missing prompt")
        elif any(alias in prompt for alias in ("$modeling", "$evidence-api-design")):
            errors.append(f"{label}: retired Skill call name")
        if not any(case.get(key) for key in ("expected_output", "expectations", "assertions")):
            errors.append(f"{label}: missing evaluation criteria")
        for name in [case.get("skill", owner.name), *case.get("knowledgeSkills", [])]:
            if name not in known:
                errors.append(f"{label}: unknown Skill: {name}")
        if case.get("primarySkill") is not None and case["primarySkill"] not in known:
            errors.append(f"{label}: unknown primary Skill")
        if "contract_refs" in case:
            references(case["contract_refs"], path.parent, f"{label} contract_refs")
        if case.get("files"):
            references(case["files"], files_base, f"{label} files")
        if (owner.name == "evidence-fm" and path.name == "evals.json"
                and case.get("outcome") not in {"model", "blocked", "not-applicable"}):
            errors.append(f"{label}: unknown or missing FM outcome")
    for name in document.get("availableSkills", []):
        if name not in known:
            errors.append(f"unknown available Skill: {name}")
    return errors


class EvalCatalogTests(unittest.TestCase):
    def test_every_owned_catalog_targets_current_contracts_and_resources(self):
        for package in sorted(SKILLS.glob("evidence-*")):
            catalogs = sorted((package / "evals").glob("*.json"))
            self.assertTrue(catalogs, package)
            for path in catalogs:
                with self.subTest(catalog=str(path.relative_to(SKILLS))):
                    document = json.loads(path.read_text(encoding="utf-8"))
                    self.assertEqual([], catalog_errors(path, document, SKILLS))

    def test_guard_rejects_stale_resources_ids_names_and_outcomes(self):
        with tempfile.TemporaryDirectory() as directory:
            skills = Path(directory)
            package = skills / "evidence-fm"
            (package / "evals").mkdir(parents=True)
            (package / "SKILL.md").write_text("current contract")
            path = package / "evals/evals.json"
            document = {
                "skill_name": "evidence-fm", "contract_refs": ["../SKILL.md"],
                "evals": [{"id": 13, "prompt": "Explain missing admission.",
                           "expected_output": "No formal model.", "outcome": "blocked"}],
            }
            self.assertEqual([], catalog_errors(path, document, skills))
            mutations = [
                ("missing resource", {"contract_refs": ["../references/deleted.md"]}),
                ("escapes owning package", {"contract_refs": ["../../elsewhere.md"]}),
                ("duplicate ID", {"evals": document["evals"] * 2}),
                ("unknown available Skill", {"availableSkills": ["evidence-api-design"]}),
            ]
            for expected, updates in mutations:
                with self.subTest(expected=expected):
                    changed = {**copy.deepcopy(document), **updates}
                    self.assertTrue(any(expected in error
                                        for error in catalog_errors(path, changed, skills)))
            for field, value, expected in (
                ("prompt", "Use $modeling", "retired Skill call name"),
                ("outcome", "draft", "unknown or missing FM outcome"),
                ("files", ["deleted-fixture.json"], "missing resource"),
                ("skill", "evidence-api-design", "unknown Skill"),
            ):
                with self.subTest(field=field):
                    changed = copy.deepcopy(document)
                    changed["evals"][0][field] = value
                    self.assertTrue(any(expected in error
                                        for error in catalog_errors(path, changed, skills)))

    def test_ids_are_local_and_need_not_be_contiguous(self):
        with tempfile.TemporaryDirectory() as directory:
            skills = Path(directory)
            package = skills / "evidence-fm"
            (package / "evals").mkdir(parents=True)
            (package / "SKILL.md").write_text("current contract")
            document = {
                "skill_name": "evidence-fm", "contract_refs": ["../SKILL.md"],
                "evals": [{"id": 29, "prompt": "Explain admission.",
                           "expected_output": "No model.", "outcome": "blocked"}],
            }
            for name in ("evals.json", "behavior.json"):
                self.assertEqual([], catalog_errors(package / "evals" / name, document, skills))
            document["evals"].append({**document["evals"][0], "id": 71})
            self.assertEqual([], catalog_errors(package / "evals/evals.json", document, skills))


if __name__ == "__main__":
    unittest.main()

"""Deterministic planning regression tests; no business code is generated."""

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "task_compiler.py"
spec = importlib.util.spec_from_file_location("task_compiler", SCRIPT)
assert spec and spec.loader
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)


class CompilerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.fm = self.root / "fm"
        self.fm.mkdir()
        self.put(
            "model.json",
            {
                "type": "fm_model",
                "schemaVersion": "3.0",
                "id": "sample",
                "entryContextRefs": ["context.content"],
            },
        )
        self.put(
            "contexts/content.json",
            {
                "type": "entity",
                "id": "context.content",
                "category": "context",
                "kind": "domain",
                "rootRefs": ["thing.book"],
            },
        )
        self.put(
            "things/book.json",
            {
                "type": "entity",
                "id": "thing.book",
                "category": "participant",
                "kind": "thing",
                "contextRef": "context.content",
                "attributes": [{"name": "title", "valueType": "string"}],
            },
        )
        self.put(
            "rules/title.json",
            {
                "type": "rule",
                "id": "rule.title",
                "kind": "precondition",
                "contextRef": "context.content",
                "bindings": {"book": {"ref": "thing.book"}},
                "expression": "book.title != ''",
            },
        )

    def put(self, name, data):
        path = self.fm / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return path

    def mapping(self, inventory):
        return {
            "designItems": [],
            "groups": [
                {
                    "concern": "domain",
                    "ownerRef": "thing.book",
                    "operationRef": "rule.title",
                    "unitKeys": [u["key"] for u in inventory["units"]],
                    "dependsOn": [],
                }
            ],
            "dispositions": [],
        }

    def test_generic_backend_organization_is_mandatory_platform_work(self):
        inv = compiler.inventory(self.fm)
        self.assertEqual(
            inv["profile"]["codeOrganization"], "composition-root-and-libraries"
        )
        self.assertEqual(inv["profile"]["mybatisMapping"], "xml-domain-resultmap")
        self.assertEqual(inv["profile"]["resourceNavigation"], "jersey-subresources")
        module_key = compiler.key("platform", "profile.backend-modules")
        self.assertEqual(sum(u["key"] == module_key for u in inv["units"]), 1)
        mapping = self.mapping(inv)
        mapping["groups"][0]["unitKeys"].remove(module_key)
        self.assertIn(
            module_key, compiler.compile_tasks(inv, mapping)["unassignedUnitKeys"]
        )
        mapping["dispositions"] = [
            {
                "unitKey": module_key,
                "kind": "not-applicable",
                "sourceRefs": ["profile.backend-modules"],
                "reason": "skip modules",
            }
        ]
        with self.assertRaises(ValueError):
            compiler.compile_tasks(inv, mapping)

    def test_modular_monolith_profile_and_platform_are_consistent(self):
        inv = compiler.inventory(self.fm)
        self.assertEqual(inv["policyVersion"], "sd-modular-monolith-mybatis-1")
        self.assertEqual(
            inv["profile"],
            {
                "architecture": "modular-monolith",
                "deploymentUnit": "single-backend-application",
                "moduleInteraction": "in-process-contracts",
                "persistence": "mybatis",
                "http": "jersey-hal-forms",
                "springBoot": "3.5.x",
                "codeOrganization": "composition-root-and-libraries",
                "mybatisMapping": "xml-domain-resultmap",
                "resourceNavigation": "jersey-subresources",
                "databaseEngine": None,
            },
        )
        expected = {
            "profile.modular-monolith",
            "profile.backend-modules",
            "profile.smart-domain",
            "profile.mybatis",
            "profile.jersey",
        }
        platform = [u for u in inv["units"] if u["kind"] == "platform"]
        self.assertEqual({u["sourceRef"] for u in platform}, expected)
        self.assertEqual(len(platform), len(expected))
        for source in inv["sources"]:
            if source["id"] in expected:
                self.assertEqual(source["data"]["profile"], inv["profile"])
        plan = compiler.compile_tasks(inv, self.mapping(inv))
        self.assertEqual(plan["profile"], inv["profile"])
        self.assertEqual(plan["policyVersion"], inv["policyVersion"])
        self.assertTrue(plan["coverageComplete"])

    def test_modular_architecture_work_cannot_be_excluded(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        unit = compiler.key("platform", "profile.modular-monolith")
        mapping["groups"][0]["unitKeys"].remove(unit)
        self.assertIn(unit, compiler.compile_tasks(inv, mapping)["unassignedUnitKeys"])
        for kind in ["external", "not-applicable"]:
            mapping["dispositions"] = [
                {
                    "unitKey": unit,
                    "kind": kind,
                    "sourceRefs": ["profile.modular-monolith"],
                    "reason": "omit architecture work",
                }
            ]
            with (
                self.subTest(kind=kind),
                self.assertRaisesRegex(ValueError, "mandatory unit"),
            ):
                compiler.compile_tasks(inv, mapping)

    def test_multiple_contexts_do_not_create_deployment_or_remote_units(self):
        self.put(
            "contexts/external.json",
            {
                "type": "entity",
                "id": "context.reference",
                "category": "context",
                "kind": "external",
                "rootRefs": [],
            },
        )
        inv = compiler.inventory(self.fm)
        self.assertEqual(
            {u["sourceRef"] for u in inv["units"] if u["kind"] == "context-design"},
            {"context.content", "context.reference"},
        )
        self.assertEqual(
            {u["kind"] for u in inv["units"]},
            {"platform", "context-design", "root-collection", "entity", "rule"},
        )
        self.assertEqual(
            sum(u["sourceRef"] == "profile.modular-monolith" for u in inv["units"]), 1
        )
        plan = compiler.compile_tasks(inv, self.mapping(inv))
        self.assertEqual(len(plan["tasks"]), 1)  # Only the explicitly mapped task.
        self.assertEqual(
            plan["profile"]["deploymentUnit"], "single-backend-application"
        )

    def test_architecture_override_is_rejected(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        mapping["profile"] = {"architecture": "microservices"}
        with self.assertRaisesRegex(ValueError, "profile is fixed"):
            compiler.compile_tasks(inv, mapping)

    def test_inventory_stable_and_read_only(self):
        before = {str(p): p.read_bytes() for p in self.fm.rglob("*.json")}
        a = compiler.inventory(self.fm)
        b = compiler.inventory(self.fm)
        self.assertEqual(a, b)
        self.assertEqual(
            before, {str(p): p.read_bytes() for p in self.fm.rglob("*.json")}
        )
        self.assertEqual(a["profile"]["architecture"], "modular-monolith")
        self.assertEqual(a["profile"]["persistence"], "mybatis")
        self.assertIsNone(a["profile"]["databaseEngine"])
        self.assertIn(
            "root-collection::context.content::thing.book",
            {u["key"] for u in a["units"]},
        )
        self.assertFalse(any("mybatis-association" in u["key"] for u in a["units"]))

    def test_file_move_and_label_change_keep_keys(self):
        a = compiler.inventory(self.fm)
        path = self.fm / "things/book.json"
        body = json.loads(path.read_text())
        body["label"] = "改名"
        path.unlink()
        self.put("moved/book.json", body)
        b = compiler.inventory(self.fm)
        self.assertEqual([u["key"] for u in a["units"]], [u["key"] for u in b["units"]])
        self.assertNotEqual(a["inputDigest"], b["inputDigest"])

    def test_generated_files_are_not_sources(self):
        a = compiler.inventory(self.fm)
        self.put("generated/broken.json", {"id": "thing.book", "bad": True})
        self.assertEqual(a, compiler.inventory(self.fm))

    def test_duplicate_json_key_and_duplicate_id_rejected(self):
        (self.fm / "bad.json").write_text('{"type": "entity", "id": "a", "id": "b"}')
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            compiler.inventory(self.fm)
        (self.fm / "bad.json").unlink()
        self.put("other.json", {"type": "entity", "id": "thing.book"})
        with self.assertRaisesRegex(ValueError, "duplicate source ID"):
            compiler.inventory(self.fm)

    def test_missing_fm_reference_rejected(self):
        self.put(
            "bad.json",
            {
                "type": "relationship",
                "id": "relation.bad",
                "kind": "precedes",
                "sourceRef": "thing.book",
                "targetRef": "missing",
            },
        )
        with self.assertRaisesRegex(ValueError, "unresolved FM reference"):
            compiler.inventory(self.fm)

    def test_source_cycles_are_not_execution_cycles(self):
        self.put(
            "cycle.json",
            {
                "type": "relationship",
                "id": "relation.cycle",
                "kind": "precedes",
                "sourceRef": "thing.book",
                "targetRef": "thing.book",
            },
        )
        inv = compiler.inventory(self.fm)
        plan = compiler.compile_tasks(inv, self.mapping(inv))
        self.assertEqual(len(plan["executionOrder"]), 1)
        self.assertTrue(inv["sourceEdges"])

    def test_keys_do_not_depend_on_members_order(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        a = compiler.compile_tasks(inv, mapping)
        mapping["groups"][0]["unitKeys"].reverse()
        b = compiler.compile_tasks(inv, mapping)
        self.assertEqual(a, b)
        task = a["tasks"][0]
        self.assertEqual(task["taskKey"], "domain::thing.book::rule.title")
        self.assertNotIn("path", task)
        self.assertNotIn("title", task)
        self.assertNotIn("status", task)

    def test_key_encoding_unambiguous(self):
        self.assertNotEqual(
            compiler.key("domain", "a::b", "c"), compiler.key("domain", "a", "b::c")
        )

    def test_duplicate_group_and_unit_ownership_rejected(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        mapping["groups"].append(copy.deepcopy(mapping["groups"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate task key"):
            compiler.compile_tasks(inv, mapping)
        mapping["groups"][1]["concern"] = "api"
        with self.assertRaisesRegex(ValueError, "unit already assigned"):
            compiler.compile_tasks(inv, mapping)

    def test_partial_mapping_reports_gaps_not_completion(self):
        inv = compiler.inventory(self.fm)
        plan = compiler.compile_tasks(
            inv, {"groups": [], "designItems": [], "dispositions": []}
        )
        self.assertFalse(plan["coverageComplete"])
        self.assertEqual(plan["unassignedUnitKeys"], [u["key"] for u in inv["units"]])

    def test_design_item_requires_known_sources(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        mapping["designItems"] = [
            {"id": "design.book.read", "sourceRefs": ["missing"], "reason": "design"}
        ]
        with self.assertRaisesRegex(ValueError, "unknown design source"):
            compiler.compile_tasks(inv, mapping)

    def test_deterministic_dag_and_cycle_rejection(self):
        inv = compiler.inventory(self.fm)
        keys = [u["key"] for u in inv["units"]]
        first = {
            "concern": "foundation",
            "ownerRef": "thing.book",
            "operationRef": "thing.book",
            "unitKeys": keys[:1],
            "dependsOn": [],
        }
        second = {
            "concern": "mybatis",
            "ownerRef": "thing.book",
            "operationRef": "thing.book",
            "unitKeys": keys[1:],
            "dependsOn": ["foundation::thing.book::thing.book"],
        }
        mapping = {"groups": [second, first]}
        plan = compiler.compile_tasks(inv, mapping)
        self.assertEqual(
            plan["executionOrder"][0],
            "foundation::thing.book::thing.book",
        )
        first["dependsOn"] = ["mybatis::thing.book::thing.book"]
        with self.assertRaisesRegex(ValueError, "execution dependency cycle"):
            compiler.compile_tasks(inv, mapping)

    def test_profile_override_and_unknown_units_rejected(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        mapping["profile"] = {"persistence": "jpa"}
        with self.assertRaisesRegex(ValueError, "profile is fixed"):
            compiler.compile_tasks(inv, mapping)
        del mapping["profile"]
        mapping["groups"][0]["unitKeys"].append("invented")
        with self.assertRaisesRegex(ValueError, "unknown unit"):
            compiler.compile_tasks(inv, mapping)

    def test_procedure_fanout_owns_rules_once_and_joins_at_acceptance(self):
        """Explicit procedure slicing, not automatic procedure inference."""
        api = self.root / "api.json"
        api.write_text(
            json.dumps(
                {
                    "schemaVersion": "4.0",
                    "resources": [{"id": "resource.book", "entityRef": "thing.book"}],
                    "capabilities": [
                        {
                            "id": "api.book.read",
                            "resourceRef": "resource.book",
                            "method": "GET",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        inv = compiler.inventory(self.fm, api)
        platform_units = [u["key"] for u in inv["units"] if u["kind"] == "platform"]
        api_units = [u["key"] for u in inv["units"] if u["kind"].startswith("api-")]
        domain_units = [
            u["key"] for u in inv["units"] if u["key"] not in platform_units + api_units
        ]
        refs = {
            "platform": ("platform", "context.content", "profile.backend-modules"),
            "domain": ("domain", "thing.book", "rule.title"),
            "sql": ("mybatis", "thing.book", "design.book.storage"),
            "http": ("api", "thing.book", "api.book.read"),
            "acceptance": ("acceptance", "thing.book", "design.book.acceptance"),
        }
        keys = {name: compiler.key(*ref) for name, ref in refs.items()}

        def group(name, units, dependencies):
            concern, owner, operation = refs[name]
            return {
                "concern": concern,
                "ownerRef": owner,
                "operationRef": operation,
                "unitKeys": units,
                "dependsOn": [keys[dependency] for dependency in dependencies],
            }

        mapping = {
            "designItems": [
                {
                    "id": "design.book.storage",
                    "sourceRefs": ["thing.book"],
                    "reason": "Map the book contract with XML without re-owning its rule.",
                },
                {
                    "id": "design.book.acceptance",
                    "sourceRefs": ["api.book.read"],
                    "reason": "Verify the actual HTTP and SQL composition.",
                },
            ],
            "groups": [
                group("platform", platform_units, []),
                group("domain", domain_units, ["platform"]),
                group(
                    "sql", [compiler.key("design", "design.book.storage")], ["domain"]
                ),
                group("http", api_units, ["domain"]),
                group(
                    "acceptance",
                    [compiler.key("design", "design.book.acceptance")],
                    ["sql", "http"],
                ),
            ],
        }
        plan = compiler.compile_tasks(inv, mapping)
        self.assertTrue(plan["coverageComplete"])
        tasks = {task["taskKey"]: task for task in plan["tasks"]}
        self.assertEqual(tasks[keys["sql"]]["dependsOn"], [keys["domain"]])
        self.assertEqual(tasks[keys["http"]]["dependsOn"], [keys["domain"]])
        rule = compiler.key("rule", "rule.title")
        self.assertEqual(
            [task["taskKey"] for task in plan["tasks"] if rule in task["unitKeys"]],
            [keys["domain"]],
        )
        self.assertEqual(plan["executionOrder"][-1], keys["acceptance"])
        coverage = plan["apiCoverage"][0]
        self.assertEqual(coverage["deliveryTaskRef"], keys["http"])
        self.assertIn(keys["domain"], coverage["supportingTaskRefs"])
        self.assertNotIn(keys["sql"], coverage["supportingTaskRefs"])
        self.assertNotIn(keys["acceptance"], coverage["supportingTaskRefs"])
        reversed_mapping = copy.deepcopy(mapping)
        reversed_mapping["groups"].reverse()
        self.assertEqual(plan, compiler.compile_tasks(inv, reversed_mapping))

    def test_api_role_variants_share_delivery_not_domain_duplicates(self):
        api = self.root / "api.json"
        body = {
            "schemaVersion": "4.0",
            "resources": [{"id": "resource.book", "entityRef": "thing.book"}],
            "capabilities": [
                {"id": "api.reader", "resourceRef": "resource.book", "method": "GET"},
                {"id": "api.operator", "resourceRef": "resource.book", "method": "GET"},
            ],
        }
        api.write_text(json.dumps(body))
        inv = compiler.inventory(self.fm, api)
        mapping = self.mapping(inv)
        plan = compiler.compile_tasks(inv, mapping)
        self.assertEqual(len(plan["tasks"]), 1)
        self.assertEqual(len(plan["apiCoverage"]), 2)
        body["resources"][0]["segment"] = "renamed"
        api.write_text(json.dumps(body))
        renamed = compiler.compile_tasks(compiler.inventory(self.fm, api), mapping)
        self.assertEqual(plan["tasks"][0]["taskKey"], renamed["tasks"][0]["taskKey"])

    def test_external_disposition_needs_reason_and_does_not_erase_unit(self):
        inv = compiler.inventory(self.fm)
        k = inv["units"][0]["key"]
        mapping = {
            "groups": [],
            "dispositions": [
                {
                    "unitKey": k,
                    "kind": "external",
                    "sourceRefs": ["thing.book"],
                    "reason": "source-defined external activity",
                }
            ],
        }
        plan = compiler.compile_tasks(inv, mapping)
        self.assertIn(k, [d["unitKey"] for d in plan["dispositions"]])
        self.assertNotIn(k, plan["unassignedUnitKeys"])
        mapping["dispositions"][0]["reason"] = ""
        with self.assertRaisesRegex(ValueError, "reason"):
            compiler.compile_tasks(inv, mapping)

    def test_generic_second_domain_without_contracts(self):
        other = self.root / "laboratory"
        other.mkdir()
        docs = [
            {
                "type": "fm_model",
                "schemaVersion": "3.0",
                "id": "laboratory",
                "entryContextRefs": ["context.lab"],
            },
            {
                "type": "entity",
                "id": "context.lab",
                "category": "context",
                "kind": "domain",
                "rootRefs": ["thing.specimen"],
            },
            {
                "type": "entity",
                "id": "thing.specimen",
                "category": "participant",
                "kind": "thing",
                "contextRef": "context.lab",
            },
        ]
        for i, doc in enumerate(docs):
            (other / f"{i}.json").write_text(
                json.dumps(doc, ensure_ascii=False, indent=2)
            )
        inv = compiler.inventory(other)
        self.assertEqual(inv["modelId"], "laboratory")
        self.assertIn("entity::thing.specimen", {u["key"] for u in inv["units"]})
        self.assertFalse(any(u["kind"] == "evidence" for u in inv["units"]))
        self.assertNotIn("thing.book", {s["id"] for s in inv["sources"]})

    def test_actor_and_proof_roles_are_distinct_units(self):
        for ref, kind in [("role.member", "party"), ("role.proof", "evidence")]:
            self.put(
                f"{ref}.json",
                {
                    "type": "entity",
                    "id": ref,
                    "category": "role",
                    "kind": kind,
                    "contextRef": "context.content",
                },
            )
        keys = {u["key"] for u in compiler.inventory(self.fm)["units"]}
        self.assertIn("actor-role::role.member", keys)
        self.assertIn("proof-role::role.proof", keys)

    def test_safe_yaml_rejects_python_tags(self):
        unsafe = self.root / "unsafe.yaml"
        unsafe.write_text("!!python/object:builtins.object {}")
        with self.assertRaises(yaml.constructor.ConstructorError):
            compiler.load(unsafe)

    def test_profile_work_cannot_be_disposed(self):
        inv = compiler.inventory(self.fm)
        mapping = {
            "groups": [],
            "dispositions": [
                {
                    "unitKey": "platform::profile.mybatis",
                    "kind": "not-applicable",
                    "sourceRefs": ["thing.book"],
                    "reason": "cannot remove fixed integration",
                }
            ],
        }
        with self.assertRaisesRegex(ValueError, "mandatory unit"):
            compiler.compile_tasks(inv, mapping)

    def test_free_task_key_cannot_override_computed_identity(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        mapping["groups"][0]["taskKey"] = "invented"
        with self.assertRaisesRegex(ValueError, "unknown group fields"):
            compiler.compile_tasks(inv, mapping)

    def test_compiler_rejects_presentation_fields(self):
        inv = compiler.inventory(self.fm)
        for field in ["fileName", "title", "path"]:
            mapping = self.mapping(inv)
            mapping["groups"][0][field] = "presentation belongs in plan.tasks"
            with (
                self.subTest(field=field),
                self.assertRaisesRegex(ValueError, "unknown group fields"),
            ):
                compiler.compile_tasks(inv, mapping)

    def test_task_identity_and_api_coverage_are_presentation_independent(self):
        api = self.root / "api.json"
        api.write_text(
            json.dumps(
                {
                    "schemaVersion": "4.0",
                    "resources": [{"id": "resource.book", "entityRef": "thing.book"}],
                    "capabilities": [
                        {
                            "id": "api.read",
                            "resourceRef": "resource.book",
                            "method": "GET",
                        }
                    ],
                }
            )
        )
        inv = compiler.inventory(self.fm, api)
        mapping = self.mapping(inv)
        domain = mapping["groups"][0]
        cap = compiler.key("api-capability", "api.read")
        domain["unitKeys"].remove(cap)
        domain_key = compiler.key("domain", "thing.book", "rule.title")
        api_key = compiler.key("api", "thing.book", "api.read")
        mapping["groups"].append(
            {
                "concern": "api",
                "ownerRef": "thing.book",
                "operationRef": "api.read",
                "unitKeys": [cap],
                "dependsOn": [domain_key],
            }
        )
        a = compiler.compile_tasks(inv, mapping)
        self.assertEqual(a["executionOrder"], [domain_key, api_key])
        self.assertEqual(
            a["apiCoverage"],
            [
                {
                    "apiRef": "api.read",
                    "deliveryTaskRef": api_key,
                    "supportingTaskRefs": [domain_key],
                }
            ],
        )
        api_task = next(t for t in a["tasks"] if t["taskKey"] == api_key)
        self.assertEqual(api_task["dependsOn"], [domain_key])
        mapping["groups"].reverse()
        b = compiler.compile_tasks(inv, mapping)
        self.assertEqual(a, b)
        snapshot = copy.deepcopy(mapping)
        self.assertEqual(b, compiler.compile_tasks(inv, mapping))
        self.assertEqual(snapshot, mapping)

    def test_group_schema_rejects_unrecognized_fields(self):
        inv = compiler.inventory(self.fm)
        for field in ["id", "path", "apiRefs", "taskKey", "filename", "fileName"]:
            mapping = self.mapping(inv)
            mapping["groups"][0][field] = "arbitrary"
            with (
                self.subTest(field=field),
                self.assertRaisesRegex(ValueError, "unknown group fields"),
            ):
                compiler.compile_tasks(inv, mapping)

    def test_cli_reads_yaml_slicing_and_fails_incomplete_coverage(self):
        plan = self.root / "plan.yaml"
        plan.write_text(
            yaml.safe_dump(
                {"slicing": {"groups": []}, "compiled": {"coverageComplete": True}}
            ),
            encoding="utf-8",
        )
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "compile",
                "--fm",
                str(self.fm),
                "--mapping",
                str(plan),
                "--require-complete",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        output = json.loads(result.stdout)
        self.assertFalse(output["coverageComplete"])
        self.assertTrue(output["unassignedUnitKeys"])
        markdown = self.root / "index.md"
        markdown.write_text("```yaml\nslicing: {}\n```\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "YAML file"):
            compiler.load(markdown)

    def test_cli_compiles_machine_plan_without_writing_outputs(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        plan = self.root / "plan.yaml"
        plan.write_text(
            yaml.safe_dump({"slicing": mapping}, allow_unicode=True),
            encoding="utf-8",
        )
        before = {str(p): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "compile",
                "--fm",
                str(self.fm),
                "--mapping",
                str(plan),
                "--require-complete",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        output = json.loads(result.stdout)
        task = output["tasks"][0]
        self.assertNotIn("path", task)
        self.assertNotIn("title", task)
        self.assertEqual(output["executionOrder"], [task["taskKey"]])
        self.assertTrue(output["coverageComplete"])
        self.assertEqual(
            before,
            {str(p): p.read_bytes() for p in self.root.rglob("*") if p.is_file()},
        )

    def test_cli_emits_json_without_writing_plan(self):
        before = sorted(str(p) for p in self.root.rglob("*"))
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "inventory", "--fm", str(self.fm)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(result.stdout)["policyVersion"], compiler.POLICY_VERSION
        )
        self.assertEqual(before, sorted(str(p) for p in self.root.rglob("*")))


if __name__ == "__main__":
    unittest.main()

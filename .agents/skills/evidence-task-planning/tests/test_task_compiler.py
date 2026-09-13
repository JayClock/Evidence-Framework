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
            "model.yaml",
            {
                "type": "fm_model",
                "schemaVersion": "3.0",
                "id": "sample",
                "modelStatus": "draft",
                "entryContextRefs": ["context.content"],
            },
        )
        self.put(
            "contexts/content.yaml",
            {
                "type": "entity",
                "id": "context.content",
                "category": "context",
                "kind": "domain",
                "rootRefs": ["thing.book"],
            },
        )
        self.put(
            "things/book.yaml",
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
            "rules/title.yaml",
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
        path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")
        return path

    def mapping(self, inventory):
        return {
            "designItems": [],
            "groups": [
                {
                    "concern": "domain",
                    "fileName": "图书标题规则.md",
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
            "contexts/external.yaml",
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
        before = {str(p): p.read_bytes() for p in self.fm.rglob("*.yaml")}
        a = compiler.inventory(self.fm)
        b = compiler.inventory(self.fm)
        self.assertEqual(a, b)
        self.assertEqual(
            before, {str(p): p.read_bytes() for p in self.fm.rglob("*.yaml")}
        )
        self.assertEqual(a["profile"]["architecture"], "modular-monolith")
        self.assertEqual(a["profile"]["persistence"], "mybatis")
        self.assertIsNone(a["profile"]["databaseEngine"])
        self.assertEqual(a["modelStatus"], "draft")
        self.assertIn(
            "root-collection::context.content::thing.book",
            {u["key"] for u in a["units"]},
        )
        self.assertFalse(any("mybatis-association" in u["key"] for u in a["units"]))

    def test_file_move_and_label_change_keep_keys(self):
        a = compiler.inventory(self.fm)
        path = self.fm / "things/book.yaml"
        body = yaml.safe_load(path.read_text())
        body["label"] = "改名"
        path.unlink()
        self.put("moved/book.yaml", body)
        b = compiler.inventory(self.fm)
        self.assertEqual([u["key"] for u in a["units"]], [u["key"] for u in b["units"]])
        self.assertNotEqual(a["inputDigest"], b["inputDigest"])

    def test_generated_files_are_not_sources(self):
        a = compiler.inventory(self.fm)
        self.put("generated/broken.yaml", {"id": "thing.book", "bad": True})
        self.assertEqual(a, compiler.inventory(self.fm))

    def test_duplicate_yaml_key_and_duplicate_id_rejected(self):
        (self.fm / "bad.yaml").write_text("type: entity\nid: a\nid: b\n")
        with self.assertRaisesRegex(ValueError, "duplicate YAML key"):
            compiler.inventory(self.fm)
        (self.fm / "bad.yaml").unlink()
        self.put("other.yaml", {"type": "entity", "id": "thing.book"})
        with self.assertRaisesRegex(ValueError, "duplicate source ID"):
            compiler.inventory(self.fm)

    def test_missing_fm_reference_rejected(self):
        self.put(
            "bad.yaml",
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
            "cycle.yaml",
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

    def test_keys_and_paths_do_not_depend_on_members_order(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        a = compiler.compile_tasks(inv, mapping)
        mapping["groups"][0]["unitKeys"].reverse()
        b = compiler.compile_tasks(inv, mapping)
        self.assertEqual(a, b)
        t = a["tasks"][0]
        self.assertEqual(t["taskKey"], "domain::thing.book::rule.title")
        self.assertEqual(t["fileName"], "图书标题规则.md")
        self.assertEqual(t["path"], "tasks/图书标题规则.md")
        self.assertNotIn("id", t)
        self.assertNotIn("status", t)  # Execution state is not a computed fact.

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
        mapping["groups"][1]["fileName"] = "图书接口.md"
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
            "fileName": "图书基础模型.md",
            "ownerRef": "thing.book",
            "operationRef": "thing.book",
            "unitKeys": keys[:1],
            "dependsOn": [],
        }
        second = {
            "concern": "mybatis",
            "fileName": "图书持久化.md",
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

    def test_api_role_variants_share_delivery_not_domain_duplicates(self):
        api = self.root / "api.yaml"
        body = {
            "schemaVersion": "4.0",
            "resources": [{"id": "resource.book", "entityRef": "thing.book"}],
            "capabilities": [
                {"id": "api.reader", "resourceRef": "resource.book", "method": "GET"},
                {"id": "api.operator", "resourceRef": "resource.book", "method": "GET"},
            ],
        }
        api.write_text(yaml.safe_dump(body))
        inv = compiler.inventory(self.fm, api)
        mapping = self.mapping(inv)
        plan = compiler.compile_tasks(inv, mapping)
        self.assertEqual(len(plan["tasks"]), 1)
        self.assertEqual(len(plan["apiCoverage"]), 2)
        body["resources"][0]["segment"] = "renamed"
        api.write_text(yaml.safe_dump(body))
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
            (other / f"{i}.yaml").write_text(yaml.safe_dump(doc))
        inv = compiler.inventory(other)
        self.assertEqual(inv["modelId"], "laboratory")
        self.assertIn("entity::thing.specimen", {u["key"] for u in inv["units"]})
        self.assertFalse(any(u["kind"] == "evidence" for u in inv["units"]))
        self.assertNotIn("thing.book", {s["id"] for s in inv["sources"]})

    def test_actor_and_proof_roles_are_distinct_units(self):
        for ref, kind in [("role.member", "party"), ("role.proof", "evidence")]:
            self.put(
                f"{ref}.yaml",
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

    def test_file_name_is_required_and_has_no_automatic_fallback(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        del mapping["groups"][0]["fileName"]
        with self.assertRaisesRegex(ValueError, "fileName"):
            compiler.compile_tasks(inv, mapping)

    def test_file_name_rejects_unsafe_or_nonportable_values(self):
        inv = compiler.inventory(self.fm)
        invalid = [
            None,
            42,
            "",
            ".md",
            "../任务.md",
            "/任务.md",
            "a/b.md",
            "a\\b.md",
            "C:任务.md",
            "任务?.md",
            "任务#.md",
            "a%2fb.md",
            " 任务.md",
            "任务 .md",
            "任务..md",
            "任务.MD",
            "任务.txt",
            ".隐藏.md",
            "任务\n名称.md",
            "任务\u202e名称.md",
            "任务\u200b名称.md",
            "任务\x00.md",
            "CON.md",
            "con.any.md",
            "LPT1.md",
            "COM¹.md",
            "ＣＯＮ.md",
            "e\u0301.md",
            "长" * 67 + ".md",
        ]
        for name in invalid:
            with self.subTest(name=name):
                mapping = self.mapping(inv)
                mapping["groups"][0]["fileName"] = name
                with self.assertRaisesRegex(ValueError, "fileName"):
                    compiler.compile_tasks(inv, mapping)

    def test_readable_file_names_and_exact_byte_limit_are_accepted(self):
        for name in [
            "图书查询接口与测试.md",
            "图书 API 实现.md",
            "Café.md",
            "a" * 197 + ".md",
        ]:
            with self.subTest(name=name):
                self.assertEqual(compiler.file_name(name), name)
        with self.assertRaisesRegex(ValueError, "fileName"):
            compiler.file_name("a" * 198 + ".md")
        with self.assertRaisesRegex(ValueError, "fileName"):
            compiler.file_name(r"a\b.md")

    def test_file_names_are_unique_across_tasks_and_portable_equivalents(self):
        inv = compiler.inventory(self.fm)
        for first, second in [
            ("图书模型.md", "图书模型.md"),
            ("API.md", "api.md"),
            ("API.md", "ＡＰＩ.md"),
            ("Café.md", "CAFÉ.md"),
        ]:
            with self.subTest(first=first, second=second):
                mapping = self.mapping(inv)
                group = mapping["groups"][0]
                group["fileName"] = first
                mapping["groups"].append(dict(group, concern="api", fileName=second))
                with self.assertRaisesRegex(ValueError, "duplicate fileName"):
                    compiler.compile_tasks(inv, mapping)

    def test_renaming_files_preserves_dependency_and_api_identity(self):
        api = self.root / "api.yaml"
        api.write_text(
            yaml.safe_dump(
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
                "fileName": "图书查询接口.md",
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
        domain["fileName"] = "内容域-图书标题规则.md"
        mapping["groups"].reverse()
        b = compiler.compile_tasks(inv, mapping)
        self.assertEqual(a["executionOrder"], b["executionOrder"])
        self.assertEqual(a["apiCoverage"], b["apiCoverage"])
        self.assertEqual(a["inputDigest"], b["inputDigest"])
        self.assertEqual(len(a["tasks"]), len(b["tasks"]))
        for index, before in enumerate(a["tasks"]):
            after = b["tasks"][index]
            self.assertEqual(
                {k: v for k, v in before.items() if k not in {"fileName", "path"}},
                {k: v for k, v in after.items() if k not in {"fileName", "path"}},
            )
        self.assertIn("tasks/内容域-图书标题规则.md", [t["path"] for t in b["tasks"]])
        # Neither compilation creates plan files nor mutates the input mapping.
        snapshot = copy.deepcopy(mapping)
        self.assertEqual(b, compiler.compile_tasks(inv, mapping))
        self.assertEqual(snapshot, mapping)
        self.assertFalse((self.root / "tasks").exists())

    def test_group_schema_rejects_unrecognized_fields(self):
        inv = compiler.inventory(self.fm)
        for field in ["id", "path", "apiRefs", "taskKey", "filename"]:
            mapping = self.mapping(inv)
            mapping["groups"][0][field] = "arbitrary"
            with (
                self.subTest(field=field),
                self.assertRaisesRegex(ValueError, "unknown group fields"),
            ):
                compiler.compile_tasks(inv, mapping)

    def test_cli_reads_index_slicing_and_fails_incomplete_coverage(self):
        index = self.root / "index.md"
        index.write_text(
            "# Index\n\n```yaml\nslicing:\n  groups: []\ncompiled:\n  coverageComplete: true\n```\n"
        )
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "compile",
                "--fm",
                str(self.fm),
                "--mapping",
                str(index),
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
        index.write_text(index.read_text() + "\n```yaml\nother: value\n```\n")
        with self.assertRaisesRegex(ValueError, "exactly one YAML"):
            compiler.load(index)

    def test_cli_compiles_readable_paths_without_writing_plan_files(self):
        inv = compiler.inventory(self.fm)
        mapping = self.mapping(inv)
        mapping["groups"][0]["fileName"] = "图书 API 实现.md"
        index = self.root / "index.md"
        index.write_text(
            "# Index\n\n```yaml\n"
            + yaml.safe_dump({"slicing": mapping}, allow_unicode=True)
            + "```\n",
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
                str(index),
                "--require-complete",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        output = json.loads(result.stdout)
        task = output["tasks"][0]
        self.assertEqual(task["path"], "tasks/图书 API 实现.md")
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

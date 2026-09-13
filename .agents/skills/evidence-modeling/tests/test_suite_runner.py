"""Contracts for discovering every skill-owned suite without recursive installs."""

import importlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

runner = importlib.import_module("run_skill_tests")


class SuiteRunnerTests(unittest.TestCase):
    def test_owned_suites_and_portability_are_all_scheduled(self):
        suites = runner.test_suites(runner.SKILLS)
        self.assertEqual(
            {
                "evidence-fm/tests",
                "evidence-fm/tests/portability",
                "evidence-visualization/tests",
                "evidence-visualization/tests/portability",
                "evidence-api-design/tests",
                "evidence-modeling/tests",
                "evidence-delivery/tests",
                "evidence-task-planning/tests",
            },
            {path.relative_to(runner.SKILLS).as_posix() for path in suites},
        )
        for suite in suites:
            if suite.name == "portability":
                self.assertFalse((suite / "__init__.py").exists())

    def test_each_suite_uses_the_same_python_and_failure_is_not_hidden(self):
        suites = [runner.SKILLS / "one/tests", runner.SKILLS / "two/tests"]
        results = [
            subprocess.CompletedProcess([], 1),
            subprocess.CompletedProcess([], 0),
        ]
        with (
            patch.object(runner, "test_suites", return_value=suites),
            patch.object(runner.subprocess, "run", side_effect=results) as execute,
        ):
            self.assertEqual(1, runner.main())
        self.assertEqual(2, execute.call_count)
        for call, suite in zip(execute.call_args_list, suites, strict=True):
            self.assertEqual(
                [
                    sys.executable,
                    "-B",
                    "-m",
                    "unittest",
                    "discover",
                    "-s",
                    str(suite),
                    "-v",
                ],
                call.args[0],
            )

    def test_no_suites_is_not_a_success(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(runner, "SKILLS", Path(directory)),
        ):
            self.assertEqual(1, runner.main())

    def test_success_requires_all_suites_to_pass(self):
        with (
            patch.object(
                runner, "test_suites", return_value=[runner.SKILLS / "one/tests"]
            ),
            patch.object(
                runner.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 0),
            ),
        ):
            self.assertEqual(0, runner.main())

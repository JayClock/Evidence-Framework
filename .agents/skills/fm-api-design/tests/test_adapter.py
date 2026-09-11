from __future__ import annotations

import unittest

from test_support import index


class AdapterTest(unittest.TestCase):
    def test_real_checker_and_compiler_are_used(self) -> None:
        model = index()
        self.assertTrue(model.check["valid"])
        self.assertEqual(model.compiled["schemaVersion"], "3.0")
        self.assertEqual(model.check["scenarioCount"], 2)
        self.assertTrue(model.check["simulationPassed"])
        self.assertFalse(any(path.startswith("generated/") for path in model.files))


if __name__ == "__main__":
    unittest.main()

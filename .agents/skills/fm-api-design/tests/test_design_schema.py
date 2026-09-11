from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from test_support import API_ROOT


class DesignSchemaTest(unittest.TestCase):
    def test_duplicate_yaml_key_is_rejected(self) -> None:
        from test_support import design_loader

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "design.yaml"
            path.write_text(
                "schemaVersion: '1.0'\nschemaVersion: '1.0'\n", encoding="utf-8"
            )
            value, diagnostics = design_loader.load_design(
                path, API_ROOT / "schemas" / "api-design.schema.json"
            )
        self.assertIsNone(value)
        self.assertEqual(diagnostics[0].code, "DESIGN_INVALID")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import copy
import importlib
import json
import os
import shutil
import sys
import tempfile
from functools import cache, lru_cache
from pathlib import Path

TESTS = Path(__file__).resolve().parent
API_ROOT = TESTS.parent
# Project outputs stay outside both installed Skills, including in regression tests.
_PROJECT = tempfile.TemporaryDirectory(prefix="api-test-project-")
REPO_ROOT = Path(_PROJECT.name).resolve()
shutil.copytree(TESTS / "fixtures", REPO_ROOT, dirs_exist_ok=True)
SCRIPTS = API_ROOT / "scripts"
FM_SKILL = Path(os.environ.get("EVIDENCE_FM_SKILL", API_ROOT.parent / "evidence-fm")).resolve()
os.environ["EVIDENCE_FM_SKILL"] = str(FM_SKILL)
sys.path.insert(0, str(FM_SKILL / "scripts"))
FM_ROOT = FM_SKILL / "examples" / "valid-traceable-subscription"
API_PATH = TESTS / "fixtures" / "subscription-api.json"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

api_loader = importlib.import_module("fm_api_core.api_loader")
fm_adapter = importlib.import_module("fm_api_core.fm_adapter")
check_fm = importlib.import_module("check_fm")
_CHECKS = tempfile.TemporaryDirectory(prefix="fm-api-test-checks-")


@cache
def check_path(root=FM_ROOT):
    """Run the FM stage once per fixture, then reuse its exact result."""
    path = Path(_CHECKS.name) / (str(len(list(Path(_CHECKS.name).iterdir()))) + ".json")
    path.write_text(json.dumps(check_fm.check_model(root)), encoding="utf-8")
    return path


def checked(root=FM_ROOT):
    return json.loads(check_path(root).read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def index():
    value, diagnostics = fm_adapter.load_fm(FM_ROOT, checked())
    if diagnostics or value is None:
        raise AssertionError(diagnostics)
    return value


def design():
    value, diagnostics = api_loader.load_api(API_PATH)
    if diagnostics or value is None:
        raise AssertionError(diagnostics)
    return copy.deepcopy(value)

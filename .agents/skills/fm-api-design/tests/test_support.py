from __future__ import annotations

import copy
import importlib
import sys
from functools import lru_cache
from pathlib import Path

TESTS = Path(__file__).resolve().parent
API_ROOT = TESTS.parent
REPO_ROOT = TESTS.parents[3]
SCRIPTS = API_ROOT / "scripts"
FM_SKILL = REPO_ROOT / ".agents" / "skills" / "evidence-fm"
FM_ROOT = FM_SKILL / "tests" / "fixtures" / "valid-traceable-subscription"
API_PATH = TESTS / "fixtures" / "subscription-api.yaml"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

api_loader = importlib.import_module("fm_api_core.api_loader")
fm_adapter = importlib.import_module("fm_api_core.fm_adapter")


@lru_cache(maxsize=1)
def index():
    value, diagnostics = fm_adapter.load_fm(FM_ROOT, FM_SKILL)
    if diagnostics or value is None:
        raise AssertionError(diagnostics)
    return value


def design():
    value, diagnostics = api_loader.load_api(API_PATH)
    if diagnostics or value is None:
        raise AssertionError(diagnostics)
    return copy.deepcopy(value)

"""Import path kept for the hook directory: the shell-write heuristic lives once, in scripts/mb_team_guard_shell.py."""

import importlib.util
import sys
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    __name__, Path(__file__).resolve().parent.parent / "scripts" / "mb_team_guard_shell.py"
)
_MODULE = importlib.util.module_from_spec(_SPEC)
sys.modules[__name__] = _MODULE
_SPEC.loader.exec_module(_MODULE)

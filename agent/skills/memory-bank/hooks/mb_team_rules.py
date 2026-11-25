"""Claude Code form of the MB Team orchestrator rules: the text and its once-per-session logic live in
scripts/mb_team_guard_core.py (`rules_text`); this wraps it as PreToolUse `additionalContext`."""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from mb_team_guard_core import RULES, rules_text  # noqa: E402


def context_output(text: str) -> str:
    return json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": text}})


def rules_output(once: Callable[[str, str], bool], sid: str, path: Path = RULES) -> str:
    text = rules_text(once, sid, path)
    return context_output(text) if text else ""

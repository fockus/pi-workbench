#!/usr/bin/env python3
"""SCRIPT_SHA of the mb-team-track Workflow script: a stale cached script refuses to run.

Usage: mb_team_script_sha.py [--refresh] [<script>]   (default: workflows/mb-team-track.js)
  prints the digest; --refresh writes it into the script's `const SCRIPT_SHA = '<hex>'` line.
Normalization: sha256 of the UTF-8 text with that one line's value blanked (`const SCRIPT_SHA = ''`).
`mb-team.sh workflow-args` emits the digest of the skill tree's script as `script_sha`; the script
compares it with its constant before any agent. Exit: 0 ok · 2 no SCRIPT_SHA line.
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "workflows" / "mb-team-track.js"
LINE = re.compile(r"^const SCRIPT_SHA = '[0-9a-f]*'$", re.M)


def digest(text: str) -> str:
    return hashlib.sha256(
        LINE.sub("const SCRIPT_SHA = ''", text, count=1).encode("utf-8")
    ).hexdigest()


def main(argv: list[str]) -> int:
    refresh = "--refresh" in argv
    path = Path(next((a for a in argv if a != "--refresh"), SCRIPT))
    text = path.read_text(encoding="utf-8")
    if not LINE.search(text):
        print(f"no `const SCRIPT_SHA = '<hex>'` line in {path}", file=sys.stderr)
        return 2
    value = digest(text)
    if refresh:
        path.write_text(LINE.sub(f"const SCRIPT_SHA = '{value}'", text, count=1), encoding="utf-8")
    print(value)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

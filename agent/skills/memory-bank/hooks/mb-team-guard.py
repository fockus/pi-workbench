#!/usr/bin/env python3
"""MB Team orchestrator guard — Claude Code PreToolUse (Edit|Write|NotebookEdit|Bash) and Stop hook.

A thin wrapper over the host-neutral core (scripts/mb_team_guard_core.py, `decide(event)`): it maps the hook
payload to an event (`agent_id` -> is_subagent), turns the decision into hookSpecificOutput (deny, or the rules
as additionalContext) and owns the Stop reminder. The core decides, for an orchestrator session (a shell command
running `mb-team.sh` / `team ...`, or MB_ORCHESTRATOR=1), main thread only:
  - Edit/Write/NotebookEdit of a file inside the project tree but outside the bank is denied: the orchestrator
    delegates code as a track (`team track add <id> --followup …` after close).
  - A Bash command that writes there (see scripts/mb_team_guard_shell.py) is denied the same way.
  - `git commit` is denied once per distinct command with the board and a pointer to `team commit`.
  - The first allowed tool call carries references/team-orchestrator-rules.md as additionalContext (once per
    session); an ordinary session gets nothing.
Stop (here): blocks once per change when orchestrator-console.md is older than the newest team.json or the board
(with an open team), or is over its line cap.
Opt-out: MB_TEAM_GUARD=off, or `team_guard=off` in <bank>/.mb-config. Any error fails open.
State: $MB_LOCK_DIR (default /tmp/mb-locks-<uid>)/team-guard/<session>.json — host-local, never in git.
"""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILL / "scripts"))
from mb_team_guard_core import (  # noqa: E402
    OFF,
    decide,
    once,
    orchestrator,
    save,  # noqa: E402,F401  (kept importable from the hook: tests patch it here)
)
from mb_team_rules import context_output  # noqa: E402

TOOLS = {
    "Edit": "edit",
    "MultiEdit": "edit",
    "NotebookEdit": "edit",
    "Write": "write",
    "Bash": "shell",
}


def to_event(payload: dict) -> dict:
    ti = payload.get("tool_input") or {}
    return {
        "tool": TOOLS.get(str(payload.get("tool_name")), "none"),
        "path": ti.get("file_path") or ti.get("notebook_path") or "",
        "command": ti.get("command") or "",
        "cwd": str(payload.get("cwd") or os.getcwd()),
        "session_id": str(payload.get("session_id") or ""),
        "is_subagent": bool(payload.get("agent_id")),
        "phase": "pre_tool",
    }


def on_pre_tool(payload: dict) -> None:
    out = decide(to_event(payload))
    if out["decision"] == "deny":
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": out["message"],
                    }
                }
            )
        )
    elif out["decision"] == "context":
        print(context_output(out["message"]))


def on_stop(payload: dict, sid: str, st: dict) -> None:
    if payload.get("stop_hook_active"):
        return
    bank = Path(st["bank"])
    teams = list((bank / "reports").glob("*/team.json"))
    if not teams:
        return
    changes = [p.stat().st_mtime for p in teams]
    if (
        any(not json.loads(p.read_text()).get("closed") for p in teams)
        and (bank / "COORDINATION.md").exists()
    ):
        changes.append((bank / "COORDINATION.md").stat().st_mtime)
    console = bank / "orchestrator-console.md"
    newest = max(changes)
    why = []
    if not console.exists() or console.stat().st_mtime < newest:
        why.append(
            "orchestrator-console.md is older than the last team.json / board change: update Open "
            "questions, Running, Next and Unrecorded decisions (track lines are written by `track set`)"
        )
    cap = subprocess.run(
        ["bash", str(SKILL / "scripts" / "mb-console.sh"), "check", "--mb", str(bank)],
        capture_output=True,
        text=True,
        timeout=10,
    )
    if cap.returncode == 1:
        why.append(cap.stderr.strip())
    if why and once(sid, f"stop:{int(newest)}:{cap.returncode}"):
        print(json.dumps({"decision": "block", "reason": "MB Team console: " + "; ".join(why)}))


def main() -> None:
    if os.environ.get("MB_TEAM_GUARD", "on").lower() in OFF:
        return
    payload = json.loads(sys.stdin.read() or "{}")
    if not isinstance(payload, dict):
        return
    event, sid = payload.get("hook_event_name"), str(payload.get("session_id") or "")
    if event == "PreToolUse":
        on_pre_tool(payload)
    elif event == "Stop" and sid and not payload.get("agent_id"):
        st = orchestrator(sid, str(payload.get("cwd") or os.getcwd()))
        if st:
            on_stop(payload, sid, st)


if __name__ == "__main__":
    with contextlib.suppress(Exception):  # a guard must never break the host session
        main()
    sys.exit(0)

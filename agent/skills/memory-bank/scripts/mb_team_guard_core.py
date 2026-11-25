#!/usr/bin/env python3
"""MB Team orchestrator guard, host-neutral core (stdlib only, no host imports).

    decide(event) -> {"decision": "allow" | "deny" | "context", "message": str}

event: tool (edit | write | shell | none), path, command, cwd, session_id, is_subagent (bool, set by the
host adapter), phase (pre_tool | prompt). Hosts: Claude Code (hooks/mb-team-guard.py), Hermes, pi, OpenCode
(spawn `python3 scripts/mb_team_guard_core.py`: one JSON event on stdin, one JSON decision on stdout, exit 0).

A session becomes an orchestrator when one of its shell commands runs `mb-team.sh` (or the `team` helper of
commands/team.md), or always with MB_ORCHESTRATOR=1. For such a session (a subagent always passes):
  - edit/write of a file inside the project tree but outside the bank -> deny (delegate it as a track);
  - a shell command that writes there (mb_team_guard_shell.py, heuristic) -> deny the same way;
  - `git commit` -> deny once per distinct command, with the board and a pointer to `team commit`;
  - otherwise the first allowed call (or the first `prompt` phase) returns references/team-orchestrator-rules.md
    as a `context` message, once per session.
Opt-out: MB_TEAM_GUARD=off, or `team_guard=off` in <bank>/.mb-config. Any error fails open (allow, "").
State: $MB_LOCK_DIR (default /tmp/mb-locks-<uid>)/team-guard/<session>.json, host-local, never in git.
"""

from __future__ import annotations

import contextlib
import fcntl
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
if str(HERE) not in sys.path:  # siblings (mb_team_config, mb_team_guard_shell) import by name
    sys.path.insert(0, str(HERE))
RULES = SKILL / "references" / "team-orchestrator-rules.md"
ALLOW = {"decision": "allow", "message": ""}
CMD_START = r"(^|[\n;&|(]\s*)(\w+=\S*\s+)*"  # a command position, after optional VAR=x prefixes
TEAM_CMD = re.compile(
    CMD_START + r"(((ba|z)?sh\s+(-\S+\s+)*)?(\S*/)?[\"']?mb-team\.sh(?=[\"'\s;&|)]|$)"
    r"|team\s+(init|track|next|status|plan|collect|commit|close|prompt)\b)"
)
MB_ARG = re.compile(r"--mb(?:\s+|=)(\"[^\"]*\"|'[^']*'|\S+)")
GIT_COMMIT = re.compile(
    r"(^|[\n;&|(]\s*)(\S*/)?git((\s+-[Cc]\s+\S+)|(\s+--?[\w-]+(=\S+)?))*\s+commit\b"
)
OFF = ("off", "0", "false", "no")


def state_dir() -> Path:
    """Private per-user dir; a symlink or a foreign owner raises (and the guard fails open)."""
    from mb_team_config import host_lock_root  # validates the root the same way for mb-lock.sh

    path = Path(host_lock_root()) / "team-guard"
    if not path.is_symlink():
        path.mkdir(mode=0o700, exist_ok=True)
    info = os.lstat(path)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
        raise OSError(f"{path} is a symlink or not owned by this user")
    return path


def save(path: Path, data: dict) -> None:
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(json.dumps(data))
    os.replace(tmp, path)


def state_file(sid: str) -> Path:
    return state_dir() / (re.sub(r"[^A-Za-z0-9_.-]", "_", sid) + ".json")


@contextlib.contextmanager
def locked(sid: str):
    """Per-session lock: parallel calls of one session read-modify-write the state one at a time."""
    fd = os.open(
        state_file(sid).with_suffix(".lock"), os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600
    )
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def resolve_bank(cwd: str) -> str:
    out = subprocess.run(
        ["bash", "-c", '. "$1"; mb_resolve_path ""', "_", str(HERE / "_lib.sh")],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=10,
    )
    bank = os.path.join(cwd, out.stdout.strip())  # the resolver may answer relative to cwd
    return (
        os.path.realpath(bank)
        if out.returncode == 0 and out.stdout.strip() and os.path.isdir(bank)
        else ""
    )


def explicit_bank(cmd: str, cwd: str) -> str:
    """The bank named by `--mb <path>` in the command, when it is an existing directory, else ''."""
    m = MB_ARG.search(cmd)
    path = os.path.join(cwd, m.group(1).strip("\"'")) if m else ""
    return os.path.realpath(path) if path and os.path.isdir(path) else ""


def project_tree(cwd: str, bank: str) -> str:
    """The git root of cwd; without one the bank's parent (an external bank must not make its parent the tree)."""
    top = subprocess.run(
        ["git", "-C", cwd, "rev-parse", "--show-toplevel"], capture_output=True, text=True
    )
    return os.path.realpath(top.stdout.strip() if top.returncode == 0 else os.path.dirname(bank))


def register(sid: str, cwd: str, bank: str = "") -> None:
    bank = bank or resolve_bank(cwd)
    if not bank:
        return
    tree = project_tree(cwd, bank)
    path = state_file(sid)
    with locked(sid):
        old = json.loads(path.read_text()) if path.exists() else {}
        if old.get("bank") != bank or old.get("tree") != tree:
            save(path, {**old, "bank": bank, "tree": tree})


def orchestrator(sid: str, cwd: str) -> dict | None:
    """{"bank", "tree"} of an orchestrator session, None for any other or an opted-out one."""
    path = state_file(sid) if sid else None
    st = json.loads(path.read_text()) if path and path.exists() else None
    if (
        st is not None and "bank" not in st
    ):  # a state file that only holds `seen` marks, not a registration
        st = None
    if st is None and os.environ.get("MB_ORCHESTRATOR") == "1":
        bank = resolve_bank(cwd)
        st = {"bank": bank, "tree": project_tree(cwd, bank)} if bank else None
    if not st:
        return None
    cfg = Path(st["bank"]) / ".mb-config"
    if cfg.is_file() and re.search(
        r"^\s*team_guard\s*=\s*(off|0|false|no)\s*$", cfg.read_text(), re.M | re.I
    ):
        return None
    return st


def once(sid: str, key: str) -> bool:
    """True the first time `key` is seen for this session (and remembers it)."""
    path = state_file(sid)
    with locked(sid):
        st = json.loads(path.read_text()) if path.exists() else {}
        seen = st.setdefault("seen", [])
        if key in seen:
            return False
        st["seen"] = (seen + [key])[-200:]
        save(path, st)
        return True


def rules_text(once_: Callable[[str, str], bool], sid: str, path: Path = RULES) -> str:
    """The orchestrator rules the first time they are asked for a session, else ''; a missing file gives ''."""
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""
    return text if text and once_(sid, "rules") else ""


def delegate(subject: str, st: dict) -> str:
    return (
        f"MB Team orchestrator: you do not edit code yourself ({subject}) — delegate this as a track "
        f"(`team track add <id> --followup --task … --dod … --files …` reopens a closed team; run it through "
        f"the mb-team-track Workflow). Bank files stay editable. Off only on the user's explicit request: "
        f"team_guard=off in {st['bank']}/.mb-config or MB_TEAM_GUARD=off."
    )


def commit_pointer(st: dict) -> str:
    board = subprocess.run(
        ["bash", str(HERE / "mb-coord.sh"), "active", "--mb", st["bank"]],
        capture_output=True,
        text=True,
        timeout=10,
    ).stdout.strip()
    return (
        "MB Team orchestrator: track work is committed with `team commit --tracks <ids> -m <msg>` (scoped to "
        "the tracks' globs, rules gate, board COMMIT entry; only after the user's yes). Board "
        f"(mb-coord.sh active):\n{board[:3000]}\nIf this commit is not track work (bank, docs the user asked "
        "for) and the board allows it, run the same command again."
    )


def violation(ev: dict, cwd: str, sid: str, st: dict) -> str:
    """The deny message for an edit/write/shell event of an orchestrator session, '' when it may go on."""
    from mb_team_guard_shell import inside, tree_write

    if ev.get("tool") in ("edit", "write"):
        target = str(ev.get("path") or "")
        full = os.path.realpath(os.path.join(cwd, target)) if target else ""
        return (
            delegate(target, st)
            if full and inside(full, st["tree"]) and not inside(full, st["bank"])
            else ""
        )
    cmd = str(ev.get("command") or "")
    if hit := tree_write(cmd, cwd, st["tree"], st["bank"]):
        return delegate(f"shell write to {hit}", st)
    if GIT_COMMIT.search(cmd) and once(
        sid or "env", "commit:" + hashlib.sha1(cmd.encode()).hexdigest()[:12]
    ):
        return commit_pointer(st)
    return ""


def _decide(ev: dict) -> dict:
    tool, phase = ev.get("tool") or "none", ev.get("phase") or "pre_tool"
    if ev.get("is_subagent") or os.environ.get("MB_TEAM_GUARD", "on").lower() in OFF:
        return ALLOW
    if phase != "prompt" and tool not in ("edit", "write", "shell"):
        return ALLOW
    sid, cwd = str(ev.get("session_id") or ""), str(ev.get("cwd") or os.getcwd())
    cmd = str(ev.get("command") or "") if tool == "shell" else ""
    if sid and TEAM_CMD.search(cmd):
        register(sid, cwd, explicit_bank(cmd, cwd))
    st = orchestrator(sid, cwd)
    if not st:
        return ALLOW
    if phase != "prompt" and (message := violation(ev, cwd, sid, st)):
        return {"decision": "deny", "message": message}
    text = rules_text(once, sid or "env")
    return {"decision": "context", "message": text} if text else ALLOW


def decide(event: object) -> dict:
    """The guard decision for one host event; never raises (any error is allow with an empty message)."""
    try:
        return _decide(event) if isinstance(event, dict) else dict(ALLOW)
    except Exception:
        return dict(ALLOW)


def main() -> None:
    try:
        out = decide(json.loads(sys.stdin.read() or "{}"))
    except Exception:
        out = dict(ALLOW)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
    sys.exit(0)

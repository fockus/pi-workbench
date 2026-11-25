#!/usr/bin/env python3
"""Judge verdict bound to a track's diff: `mb-team.sh verdict`, checked by `team commit`.

Usage (through mb-team.sh, which adds --mb <bank>):
  mb_team_verdict.py verdict --tracks A[,B] --begin | --decision GO|GO_WITH_BACKLOG|NO_GO [--paths a,b] [--topic T]

Stores {decision, digest, at, paths} as the track's `verdict` in team.json. The digest is sha256 over the
track's commit paths as `commit-check` resolves them (changed vs HEAD plus untracked, owned by the
track) plus the judge's `--paths` (its commit path list; tree-relative); path + content, a deleted file
as deleted, sorted, without `.memory-bank/**` (bank bookkeeping, ticking tasks.md, is the orchestrator's
and happens after the judge). Widening the track with exactly the judged paths (`track set --add-files`)
keeps the digest; any other change to the set or to a file invalidates it. `team commit` refuses a track
with no verdict, a NO_GO verdict or a digest that no longer matches. Only this command writes it.
--begin (the judge's first step) drops the verdict and records the digest the judge reviews; a GO is
recorded only when the diff still has that digest, so a file saved during the judge is never approved.
Exit: 0 ok · 1 GO refused · 2 bad input.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import stat
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mb_team_state as st  # noqa: E402
from mb_team_state import TeamError  # noqa: E402

ALLOW = ("GO", "GO_WITH_BACKLOG")
DECISIONS = (*ALLOW, "NO_GO")
BANK_PREFIX = ".memory-bank/"


def _entry(path: Path) -> str:
    """What git commits for path: a symlink's target, else the file mode git keeps and the content."""
    if path.is_symlink():
        return "120000 " + hashlib.sha256(os.fsencode(os.readlink(path))).hexdigest()
    if not path.is_file():
        return "deleted"
    mode = "100755" if path.stat().st_mode & stat.S_IXUSR else "100644"
    return f"{mode} {hashlib.sha256(path.read_bytes()).hexdigest()}"


def digest(team: dict, track: dict, changed: list[str], paths: tuple[str, ...] | list[str] = ()) -> str:
    h = hashlib.sha256()
    owned = {p for p in changed if st.owns(track, p)}
    for p in sorted(p for p in owned | set(paths) if not p.startswith(BANK_PREFIX)):
        h.update(f"{p}\0{_entry(Path(team['tree']) / p)}\0".encode())
    return h.hexdigest()


def problems(team: dict, ids: list[str], changed: list[str]) -> list[str]:
    """One refusal line per selected track whose verdict does not allow the commit."""
    out = []
    for t in (t for t in team["tracks"] if t["id"] in ids):
        v = t.get("verdict")
        if not v:
            out.append(f"{t['id']}: no judge verdict: run the judge (start: judge)")
        elif v.get("decision") == "NO_GO":
            out.append(f"{t['id']}: judge verdict is NO_GO")
        elif v.get("decision") not in ALLOW:
            out.append(f"{t['id']}: judge verdict {v.get('decision')} is not GO or GO_WITH_BACKLOG")
        elif v.get("digest") != digest(team, t, changed, v.get("paths") or ()):
            out.append(f"{t['id']}: diff changed after the judge: re-run the judge (start: judge)")
    return out


def _judged_paths(csv: str) -> list[str]:
    """The judge's --paths: tree-relative, normalized, sorted; an absolute or escaping path is bad input."""
    out = set()
    for raw in csv.split(","):
        p = os.path.normpath(raw.strip()) if raw.strip() else ""
        if p.startswith("/") or p == ".." or p.startswith("../"):
            raise TeamError(f"--paths: {raw.strip()!r} is not a path inside the tree", 2)
        if p:
            out.add(p)
    return sorted(out)


def cmd_verdict(bank: str, topic: str, ids: list[str], decision: str, paths: list[str] = ()) -> int:
    """decision "" = --begin. Raises before anything is written, so team.json changes all or nothing."""
    with st.locked(bank, topic) as team:
        by_id = {t["id"]: t for t in team["tracks"]}
        unknown = [i for i in ids if i not in by_id]
        if unknown or not ids:
            raise TeamError(f"--tracks: unknown {unknown or 'empty'}; tracks {list(by_id)}")
        changed = st.changed(team)
        now = {tid: digest(team, by_id[tid], changed) for tid in ids}  # what the judge started on: no --paths
        final = {tid: digest(team, by_id[tid], changed, paths) for tid in ids}
        if decision in ALLOW:
            refused = [
                f"{tid}: no judge start: run `verdict --tracks {tid} --begin` when the judge starts"
                if not by_id[tid].get("judge_start")
                else f"{tid}: diff changed during the judge: re-run the judge (start: judge)"
                for tid in ids
                if by_id[tid].get("judge_start", {}).get("digest") != now[tid]
            ]
            if refused:
                raise TeamError("verdict refused:\n  " + "\n  ".join(refused), 1)
        for tid in ids:
            t = by_id[tid]
            t.pop("verdict", None)
            if not decision:
                t["judge_start"] = {"digest": now[tid], "at": st.now()}
                print(f"judge start {tid}: {now[tid][:12]}")
                continue
            t.pop("judge_start", None)
            t["verdict"] = {"decision": decision, "digest": final[tid], "at": st.now(), "paths": list(paths)}
            print(f"verdict {tid}: {decision} {final[tid][:12]}")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="mb_team_verdict.py")
    parser.add_argument("cmd", choices=("verdict",))
    parser.add_argument("--mb", required=True)
    parser.add_argument("--topic", default="")
    parser.add_argument("--tracks", required=True)
    step = parser.add_mutually_exclusive_group(required=True)
    step.add_argument("--begin", action="store_true")
    step.add_argument("--decision", choices=DECISIONS)
    parser.add_argument("--paths", default="", help="the judge's commit path list, csv (with --decision)")
    args = parser.parse_args(argv)
    bank = os.path.abspath(args.mb)
    try:
        ids = [x.strip() for x in args.tracks.split(",") if x.strip()]
        if args.paths and not args.decision:
            raise TeamError("--paths goes with --decision, not --begin", 2)
        return cmd_verdict(
            bank, st.find_topic(bank, args.topic, closed_too=True), ids, args.decision or "",
            _judged_paths(args.paths),
        )
    except TeamError as exc:
        print(f"[team] {exc}", file=sys.stderr)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

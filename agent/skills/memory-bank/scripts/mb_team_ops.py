#!/usr/bin/env python3
"""/mb team operations with side effects: collect, commit, checkpoint, close, review gate.

Usage (through mb-team.sh, which adds --mb <bank>):
  mb_team_ops.py collect [--dry-run] [--json]
  mb_team_ops.py commit --tracks A,B -m MSG [--yes]
  mb_team_ops.py commit-check --tracks A,B
  mb_team_ops.py checkpoint [label] [--verify <id>]
  mb_team_ops.py close [--pause]
  mb_team_ops.py review-gate --cycle N
Every command takes --mb <bank> and --topic T.

collect: mb_team_collect.py (progress entries, goal criteria, questions, cross-track duplicates).
commit: changed (vs HEAD) and untracked files owned by the selected finished tracks only, through
mb_vcs.sh; refuses unfinished tracks, tracks without a GO verdict bound to their current diff
(mb_team_verdict.py), open BLOCKED/HANDOVER for them and files co-owned by an
unfinished unselected track; runs the rules gate (mb_team_gate.py: team.rules_gate + mb-rules-check.sh),
a failing track goes back to `fixing`; asks y/N (no TTY and no --yes: does nothing); posts COMMIT. No push.
commit-check: the same refusals (but the verdict) and rules gate, read-only and for unfinished tracks too (the Workflow verifier
and judge run it, so a GO is never refused at commit); exit 1 when `commit` would refuse.
checkpoint: mb-team-checkpoint.sh into team.checkpoint.dir (bank-relative, default backups/team),
then team.checkpoint.extra in the tree. review-gate: mb-team-review.sh gate, recorded in reviews[].
Exit codes: 0 ok · 1 refused or a step failed · 2 bad input · gate code for review-gate.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mb_team_collect as collect  # noqa: E402
import mb_team_gate as gate  # noqa: E402
import mb_team_state as st  # noqa: E402
import mb_team_verdict as verdict  # noqa: E402
from mb_team_state import TeamError  # noqa: E402


def _planned_dependents(team: dict, ids: list[str]) -> set[str]:
    """Never-dispatched planned tracks that depend, directly or through other such tracks, on one of ids.

    None of them can start before ids finish, so none of their edits is in the tree yet: refusing the
    commit over their globs would only deadlock them on their own dependency. A track back in planned
    after it ran (dispatched_at set) may have edits in the tree, so it still counts."""
    found: set[str] = set()
    while new := {t["id"] for t in team["tracks"] if t["status"] == "planned" and not t.get("dispatched_at")
                  and t["id"] not in found
                  and set(t.get("deps") or []) & {*ids, *found}}:
        found |= new
    return found


def commit_plan(team: dict, board: dict, ids: list[str], finished: bool = True) -> tuple[list[str], list[str]]:
    """(owned files to stage, foreign changed files); TeamError(1) when the commit must be refused.

    finished=False (commit-check) skips the "track is finished" check only."""
    by_id = {t["id"]: t for t in team["tracks"]}
    unknown = [i for i in ids if i not in by_id]
    if unknown or not ids:
        raise TeamError(f"--tracks: unknown {unknown or 'empty'}; tracks {list(by_id)}")
    problems = [f"track {i} is {by_id[i]['status']}, not finished" for i in ids
                if finished and by_id[i]["status"] not in st.FINISHED]
    for kind in ("blocked", "handover"):
        problems += [f"open {kind.upper()} for {e['track']}: {e['title']}" for e in board.get(f"open_{kind}", [])
                     if e.get("track") in ids]
    changed = st.changed(team)
    if finished:  # the judge runs commit-check before its verdict exists
        problems += verdict.problems(team, ids, changed)
    owned = [p for p in changed if any(st.owns(by_id[i], p) for i in ids)]
    waiting = _planned_dependents(team, ids)
    for p in owned:
        problems += [f"{p} is also owned by unfinished track {t['id']}" for t in team["tracks"]
                     if t["id"] not in (*ids, *waiting) and t["status"] not in st.TERMINAL and st.owns(t, p)]
    if problems:
        raise TeamError("commit refused:\n  " + "\n  ".join(problems), 1)
    if not owned:
        raise TeamError(f"nothing to commit for tracks {ids}", 1)
    return owned, [p for p in changed if p not in owned]


def _plan(args, finished: bool) -> tuple[str, str, dict, list[str], list[str], list[str]]:
    """(bank, topic, team, ids, owned, foreign) of `commit` / `commit-check`; prints the file list."""
    bank, topic = args.mb, st.find_topic(args.mb, args.topic, closed_too=not finished)
    team = st.load(bank, topic)
    ids = [x.strip() for x in args.tracks.split(",") if x.strip()]
    r = st.run(["bash", st.script("mb-coord.sh"), "tracks", "--json", "--mb", bank])
    try:
        board = json.loads(r.stdout) if r.returncode == 0 else None
    except ValueError:
        board = None
    if not isinstance(board, dict):  # no board read = unknown BLOCKED/HANDOVER entries: refuse, never pass
        raise TeamError(f"commit refused: cannot read the board (mb-coord.sh tracks rc {r.returncode}): "
                        f"{(r.stderr or r.stdout).strip()[:200] or 'empty output'}", 1)
    owned, foreign = commit_plan(team, board, ids, finished)
    print(f"to commit ({len(owned)}):\n" + "".join(f"  {p}\n" for p in owned), end="")
    return bank, topic, team, ids, owned, foreign


def _gate(team: dict, bank: str, ids: list[str], owned: list[str]) -> tuple[dict, str]:
    """(failures per track, refusal text or "") of the rules gate; warnings go to stderr."""
    by_id = {t["id"]: t for t in team["tracks"]}
    failures, refusal, warnings = gate.check(team, bank, {i: [p for p in owned if st.owns(by_id[i], p)] for i in ids})
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    if not (failures or refusal):
        return failures, ""
    return failures, ("".join(f"  {tid}:\n" + "".join(f"    {line}\n" for line in lines)
                              for tid, lines in failures.items()) + "".join(f"  {line}\n" for line in refusal))


def cmd_commit_check(args) -> int:
    bank, _topic, team, ids, owned, _foreign = _plan(args, finished=False)
    _failures, text = _gate(team, bank, ids, owned)
    if text:
        raise TeamError("commit would be refused by the rules gate:\n" + text, 1)
    print("commit-check: ok")
    return 0


def cmd_commit(args) -> int:
    bank, topic, team, ids, owned, foreign = _plan(args, finished=True)
    if foreign:
        print(f"foreign, not staged ({len(foreign)}):\n" + "".join(f"  {p}\n" for p in foreign), end="")
    if not args.yes:
        if not sys.stdin.isatty():
            raise TeamError("no TTY to confirm: rerun with --yes to commit; nothing was staged", 1)
        if input(f"Commit {len(owned)} files? [y/N] ").strip().lower() not in ("y", "yes"):
            raise TeamError("aborted; nothing was staged", 1)
    failures, text = _gate(team, bank, ids, owned)
    if failures:
        gate.send_back(bank, topic, list(failures))
    if text:
        raise TeamError("commit refused by the rules gate" + ("; back to fixing:\n" if failures else ":\n") + text, 1)
    # Re-checked after the prompt and the gate: a track file saved meanwhile was never judged.
    # ponytail: a save in the ms between this check and `git commit --only` still slips through; closing
    # it needs a commit from a private index (mb_vcs.sh) built from the digested blobs.
    late = verdict.problems(st.load(bank, topic), ids, st.changed(team))
    if late:
        raise TeamError("commit refused:\n  " + "\n  ".join(late), 1)
    snapshot = None
    with contextlib.suppress(TeamError):  # no index snapshot: commit without rollback
        snapshot = st.vcs(team, "index-save", "--", *owned)
    try:
        st.vcs(team, "add", "--", *owned)
        st.vcs(team, "commit", "-m", args.m, "--", *owned)
    except TeamError as exc:
        if snapshot is None:
            raise TeamError(f"{exc}; staged, not restored (arc): " + " ".join(owned), 1) from exc
        st.vcs(team, "index-restore", "--", *owned, stdin=snapshot)
        raise TeamError(f"{exc}; index restored", 1) from exc
    rev = st.vcs(team, "head").strip()
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as body:
        body.write(f"{args.m}\n\n" + "".join(f"- {p}\n" for p in owned))
    r = st.run(["bash", st.script("mb-coord.sh"), "append", "--type", "COMMIT", "--title",
                f"team {topic}: {rev[:8]} {','.join(ids)}", "--body-file", body.name, "--mb", bank])
    os.unlink(body.name)
    with st.locked(bank, topic) as fresh:
        fresh["commits"].append({"hash": rev, "tracks": ids, "files": len(owned)})
    print(f"committed {rev[:8]} ({len(owned)} files)")
    if r.returncode != 0:
        raise TeamError(f"COMMIT entry not posted: {r.stderr.strip()}", 1)
    return 0


def cmd_checkpoint(args) -> int:
    bank, topic = args.mb, st.find_topic(args.mb, args.topic)
    team, cfg = st.load(bank, topic), st.configs(bank)[2]["checkpoint"]
    default = os.path.normpath(os.path.join(bank, "backups/team"))
    out = os.path.normpath(os.path.join(bank, cfg.get("dir") or "backups/team"))
    # The default dir is ours; another one must prove it. A symlink at backups/ or backups/team resolves
    # to some other dir, which is not the default any more (a symlinked bank itself is fine).
    adopt = out == default and os.path.realpath(out) == os.path.join(os.path.realpath(bank), "backups", "team")
    tool = ["bash", st.script("mb-team-checkpoint.sh")]
    if args.verify:
        r = st.run([*tool, "verify", "--dir", out, args.verify])
        print(f"{args.verify}: {'ok' if r.returncode == 0 else 'MISMATCH'}{r.stderr.strip() and chr(10) + r.stderr.strip()}")
        return r.returncode
    r = st.run([*tool, "create", "--tree", team["tree"], "--baseline", team["baseline"], "--topic", topic,
                "--dir", out, "--label", args.label or "cp", "--max-untracked-mb", str(cfg.get("max_untracked_mb", 512)),
                *(["--adopt"] if adopt else [])])
    sys.stderr.write(r.stderr)
    if r.returncode != 0:
        raise TeamError("checkpoint failed", 2 if r.returncode == 2 else 1)
    cid = r.stdout.strip().splitlines()[-1]

    def rel(name: str) -> str:
        return os.path.relpath(os.path.join(out, name), bank)

    with st.locked(bank, topic) as fresh:
        fresh["checkpoints"].append({"id": cid, "label": args.label or "cp", "manifest": rel(f"{cid}-manifest.json"),
                                     "sha256": rel(f"{cid}.sha256")})
    print(cid)
    if cfg.get("extra"):
        x = st.run(["bash", "-c", cfg["extra"]], cwd=team["tree"])
        if x.returncode != 0:
            raise TeamError(f"checkpoint.extra failed ({x.returncode}): {x.stderr.strip()}", 1)
    return 0


def cmd_close(args) -> int:
    bank, topic = args.mb, st.find_topic(args.mb, args.topic)
    with st.locked(bank, topic) as team:
        team["closed"] = not args.pause
    coord = ["bash", st.script("mb-coord.sh"), "append", "--mb", bank]
    st.run([*coord, "--type", "STATUS", "--title", f"team {topic}: {'paused' if args.pause else 'closed'}"])
    if not args.pause:
        st.run([*coord, "--type", "LIFT", "--title", f"contract:{topic}"])
    return 0


def cmd_review_gate(args) -> int:
    bank, topic = args.mb, st.find_topic(args.mb, args.topic)
    r = st.run(["bash", st.script("mb-team-review.sh"), "gate", "--team", str(st.team_file(bank, topic)),
                "--mb", bank, "--cycle", str(args.cycle)])
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    if r.returncode in (0, 1):
        try:
            gate = json.loads(r.stdout)
            if not isinstance(gate, dict):
                raise ValueError
        except ValueError:
            print("[team] review gate: output is not a JSON verdict", file=sys.stderr)
            return 2
        entry = {"cycle": args.cycle, "scope": "team", "master": f"reports/{topic}/review/cycle-{args.cycle}/master.json",
                 "verdict": gate.get("verdict"), "counts": gate.get("counts"), "actions": gate.get("actions", []),
                 "at": st.now()}
        with st.locked(bank, topic) as team:
            entry["fix_cycles"] = {t["id"]: t.get("fix_cycle", 0) for t in team["tracks"]}
            team["reviews"] = [x for x in team["reviews"] if x.get("cycle") != args.cycle] + [entry]
    return r.returncode


def main(argv: list[str]) -> int:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--mb", required=True)
    common.add_argument("--topic", default="")
    parser = argparse.ArgumentParser(prog="mb_team_ops.py")
    sub = parser.add_subparsers(dest="cmd", required=True)
    col = sub.add_parser("collect", parents=[common])
    col.add_argument("--dry-run", action="store_true")
    col.add_argument("--json", action="store_true")
    com = sub.add_parser("commit", parents=[common])
    com.add_argument("--tracks", required=True)
    com.add_argument("-m", required=True)
    com.add_argument("--yes", action="store_true")
    sub.add_parser("commit-check", parents=[common]).add_argument("--tracks", required=True)
    cp = sub.add_parser("checkpoint", parents=[common])
    cp.add_argument("label", nargs="?", default="")
    cp.add_argument("--verify", default="")
    sub.add_parser("close", parents=[common]).add_argument("--pause", action="store_true")
    sub.add_parser("review-gate", parents=[common]).add_argument("--cycle", type=int, required=True)
    args = parser.parse_args(argv)
    args.mb = os.path.abspath(args.mb)
    handler = {"collect": collect.cmd_collect, "commit": cmd_commit, "commit-check": cmd_commit_check,
               "checkpoint": cmd_checkpoint,
               "close": cmd_close, "review-gate": cmd_review_gate}[args.cmd]
    try:
        return handler(args)
    except TeamError as exc:
        print(f"[team] {exc}", file=sys.stderr)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

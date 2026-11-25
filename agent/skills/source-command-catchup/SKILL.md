---
name: "source-command-catchup"
description: "Reload the current context after a reset or compaction"
---

# source-command-catchup

Use this skill when the user asks to run the migrated source command `catchup`.

## Command Template

1. Read `~/.Codex/AGENTS.md`
2. If `./.memory-bank/` exists:
   - Read `status.md`, `checklist.md`, `roadmap.md`, and the latest note from `notes/`
   - If `.memory-bank/codebase/*.md` is populated, include a one-line summary per doc (via `bash ~/.Codex/skills/memory-bank/scripts/mb-context.sh` or `head -3` on each file)
3. Run `git diff` and `git diff --staged` — show what is currently in progress
4. Run `git log --oneline -5` — show the latest commits
5. Summarize in 3-5 sentences: what is done, what is in progress, and what comes next

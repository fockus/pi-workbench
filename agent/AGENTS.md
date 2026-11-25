<!-- mb-key-rules:start -->
## Key rules

- SOLID: SRP — >300 lines or >3 unrelated public methods = split; ISP ≤5 methods; DIP — constructors take abstractions
- DRY: the same logic in 3+ places → extract; three identical lines beat a premature abstraction
- KISS: the simplest working solution wins
- YAGNI: no code, flags or config for imagined needs
- Fail Fast: ask only when readings of the task lead to materially different work; else decide and state the assumption
- No placeholders: no TODO, `...` or pseudocode; code is copy-paste ready (stubs only behind a feature flag)
- Fix the root cause, not the symptom: check every caller and fix once in the shared path
- Before writing code: does it need to exist → already in the codebase → stdlib → native platform → installed dependency → one line → minimal code
- No unrequested abstractions: no single-implementation interface, one-product factory or config for a constant
- Deletion over addition, boring over clever
- Shortest working diff wins — but only after you understand the problem and the code it touches
- Comments only for the non-obvious why; never restate the code
- Mark a deliberate shortcut with a `ponytail:` comment naming its ceiling and upgrade path
- Never simplify away trust-boundary validation, security, or error handling that prevents data loss
- Non-trivial logic (branch, loop, parser, money/security path) leaves one runnable check behind
- Clean Architecture: Infra → App → Domain, never backward; Domain has 0 external deps
- FSD (frontend): app→pages→widgets→features→entities→shared; imports only downward
- DDD folders: group by bounded context in every layer; no flat dump, no single-file folders
- TDD: new logic → failing test first, then code (standard+ tier; small: one test per behavior)
- Contract-First: Protocol/ABC → contract tests → implementation; tests pass for ANY correct implementation
- Testing Trophy: integration > unit > e2e; mock only external boundaries; >5 mocks → integration test
- Tests check behavior, not lines: test_<what>_<condition>_<result>, AAA; no mock-tests of glue, config or external SDK calls
- Size the task first (trivial/small/standard/large/extra); plan, tests, docs and checks follow the tier — SKILL.md § Task routing
- Evidence before "done": targeted tests + lint of changed files while working; full suite in /mb verify and before commit; don't re-run what was shown
- No new documents unless asked; README/CHANGELOG get 1–2 lines
- Protected files (.env, CI, Docker/K8s/Terraform) — touch only on explicit request
- Scoped `git add` only; no destructive git (reset --hard, force-push, mass delete) without an explicit request
- Do not expand scope without a request; report unrelated findings as follow-ups
- Static analysis (lint, type checks) — always

Details: `~/.pi/agent/skills/memory-bank/rules/RULES.md`.
<!-- mb-key-rules:end -->

<!-- memory-bank-pi:start -->

# Memory Bank — Pi Global Entry Point

Pi loads this file at startup and injects it into the agent prompt. Skill: `~/.pi/agent/skills/memory-bank/SKILL.md`; prompts (`/mb`, `/start`, …): `~/.pi/agent/prompts/`.

### `/mb work` gate

The gate applies when the request refers to an existing plan or spec in the bank. Without one, size the task (SKILL.md § Task routing); small tasks run inline. Otherwise:
1. Workflow: `mb-workflow.sh` on `<bank>/pipeline.yaml`; target: `mb-work-resolve.sh` + `mb-work-plan.sh`. Spec tasks `<!-- mb-task:N -->` are the source of truth; fix a wrapper plan without `linked_spec`/`mb-stage` first.
2. Run the resolved steps exactly; complete only after the gates pass.
3. Dispatch roles by name: `mb_dispatch_subagent(role=<agent>, task=…)`; set `model`/`thinking` only if the JSON line does.

Persistence: inside an approved plan keep calling tools until a gate or blocker; no status-note turn endings. Retry a transient dispatch failure once.

Planned work runs inline only when the user asks to skip `/mb work`; tests and verification still apply.

## Memory Bank status line

Open your first reply to the user in a project session with one line that says whether project memory is in play: `[MEMORY BANK: ACTIVE]` when a bank resolves for this project, `[MEMORY BANK: ABSENT]` when none does, and `[MEMORY BANK: INITIALIZED]` right after the user asked you to create one. A bank may be local (`.memory-bank/`), global (`/mb init --storage=global`) or legacy (`.claude-workspace`); `scripts/_lib.sh::mb_resolve_path` resolves all three. The line is for the human: leave it out of later replies, subagent reports, and output that a script parses.

A globally installed skill never means this project has a bank; only an explicit `/mb init` creates one. Do not silently initialize Memory Bank for meta/install/debug questions.

### Rules-only mode

`[MEMORY BANK: ABSENT]` is a valid steady state: the Key rules and the rules below still apply; only the `/mb` lifecycle commands stay inactive.

# Engineering rules

The `## Key rules` section at the top of this file is the active rule set — change it with `/mb rules`. Details: `~/.pi/agent/skills/memory-bank/rules/RULES.md`; project overrides in `<project-root>/RULES.md` or `.memory-bank/RULES.md` add to it.

> **Language** — respond in Russian; technical terms may remain in English.

- No new libraries/frameworks without an explicit request; destructive actions → confirm first; a significant decision → ADR.
- Trivial and small tasks need no plan; standard+ gets a `/mb plan` with SMART DoD for the plan (per stage only at a real boundary); coverage gates only when the profile enables them — `SKILL.md` § Task routing.

## Memory Bank
- Start project work with `/mb context` (alias `/mb`); `/mb start` also reads the active plan in.
- Code questions (who calls / impact / tests / concept search) → the code graph first: `mb-graph.sh who-calls|impact|tests <Symbol>`, `mb-graph.sh search "<query>"`.
- `progress.md` is append-only; IDs (I-/EXP-/ADR-NNN) are monotonic and never reused; tick `checklist.md` as soon as an item is done; `notes/` hold patterns, not chronology.
- Parallel sessions in one working tree share `.memory-bank/COORDINATION.md`: read it with `scripts/mb-coord.sh active` at session start, before each stage/commit and before editing shared files; freezes, handovers and commit-order agreements need an ACK entry — `references/coordination.md`.
- Orchestrating background agents: keep `<bank>/orchestrator-console.md` (≤40 lines: questions, tracks, next step, unrecorded decisions) — `references/orchestrator-console.md`. Update it at every milestone, before replying. After compaction, before any action: console, `mb-agree.sh list` tail, `mb-coord.sh active`, `mb-team.sh status`. At a natural boundary offer a manual `/compact` and say what to keep.
- Agreements: an explicit user decision → `mb-agree.sh add "<statement>"`, then announce `→ AGR-NNN записано: <statement>`; an unconfirmed idea → `mb-agree.sh question "<text>"`; a changed decision → `add "<new>" --supersedes N` — `references/agreements.md`.

<!-- memory-bank-pi:end -->

---
name: code-factory
version: 2.0.0
description: "Autonomous multi-agent development system with deterministic sprint pipeline and quality gates"
author: "Code Factory Team"
requires-python: ">=3.12"
---

# Code Factory v2

> Deterministic pipeline + creative agents. One command launches autonomous development with quality gates at every step.

## Architecture

```
Orchestrator (Opus)
|-- Tech Lead (Opus, scope M/L)       coordination, pre-review
|   |-- dev-1..N (Sonnet)             TDD implementation
|-- QA Lead (Sonnet, scope L)         test coordination, coverage
|   |-- tester-1..N (Sonnet)          unit + integration tests
|-- Reviewer (Opus)                   architecture review
|-- Judge (Opus)                      numerical scoring 1-5
|-- Supervisor (Sonnet, scope M/L)    reactive monitoring, health checks
|-- PM Agent (Sonnet, one-shot)       backlog, sprints, tracking
'-- Architect (Opus, one-shot)        design, ADR, interfaces

Scope S (1-3 tasks):  flat -- Orchestrator -> workers directly
Scope M (4-8 tasks):  +Tech Lead (Opus) coordinates devs
Scope L (9+ tasks):   +Tech Lead +QA Lead -- full hierarchy
```

## Core Principles

1. **Disposable Agents + Persistent State** -- agents are ephemeral, SQLite is the source of truth
2. **Single Writer** -- each file owned by exactly one agent (file_ownership table)
3. **Generator != Evaluator** -- who writes code never evaluates it
4. **Hard Thresholds** -- Sprint Contract: pass/fail, not soft guidance
5. **Prompt-Driven Orchestration** -- agents are controlled by prompts, not hardcode
6. **Budget Enforcement** -- hard stop on limits exceeded

## Sprint Execution Loop (9 transactional steps)

```
for each Sprint:
  1. init              -- emit sprint_started event
  2. pm_analysis       -- backlog prioritization, feature-based planning
  3. contract          -- negotiate sprint contract (propose -> review -> agree)
  4. team              -- assemble team by scope (S/M/L topology)
  5. implementation    -- parallel TDD, file ownership, Ralph Loop
  6. evaluation        -- aggregate verdicts, quality scores
  7. reflexion         -- self-improvement, prompt revision
  8. checkpoint        -- budget check, git commit, DB backup
  9. synced            -- sync results, update status
```

## Mechanisms

| # | Mechanism | Implementation |
|---|-----------|---------------|
| 1 | Sprint Contracts | contract_negotiation.py |
| 2 | Task DAG | task_dag.py (topo sort, cycle/deadlock detection) |
| 3 | Scope Topologies S/M/L | team.py (TeamAssembler) |
| 4 | File Ownership | ownership.py + ownership_hook.py |
| 5 | TDD Pipeline | Enforced via agent prompts + test_autorun_hook |
| 6 | Generator != Evaluator | gates.py (JudgeGate) |
| 7 | Ralph Loop | loop.py (effort-based iterations) |
| 8 | Cost Tracking | budget.py + cost_hook.py |
| 9 | Circuit Breaker | circuit_breaker.py (CLOSED/HALF_OPEN/OPEN FSM) |
| 10 | Meta-Supervisor | meta_supervisor.py (event-driven monitoring) |
| 11 | Reflexion | reflexion.py + context_engine.py |
| 12 | Heartbeat | heartbeat.py + stuck_detector.py |
| 13 | Rate Limiting | rate_limiter.py (adaptive backoff) |
| 14 | Pause/Resume | pause_resume.py + state_serializer.py |
| 15 | Git Integration | git_integration.py (atomic commits) |
| 16 | DB Backup | db_backup.py (SQLite .backup) |
| 17 | Continuous Scheduler | scheduler.py (asyncio event loop) |
| 18 | Status Dashboard | status_collector.py + status_dashboard.py |
| 19 | Memory Bank Sync | mb_sync.py |
| 20 | Stack Detection | stack_detector.py |
| 21 | Agent Runtime | agent_runtime.py (Codex/Codex/OpenCode) |

## State Storage (v2: SQLite)

```
.factory/
|-- factory.db               SQLite database (14 tables, WAL mode)
|-- config.json              Pipeline configuration
|-- backups/                 DB backups per sprint
```

### SQLite Tables (14)
sprints, goals, epics, costs, gate_rounds, file_ownership,
factory_state, circuit_breaker_events, factory_snapshots,
git_commits, heartbeats, rate_limit_events, tasks, features

## Commands

| Command | Description |
|---------|-------------|
| `/factory:init` | Initialize factory in current project |
| `/factory:goal` | Set a development goal |
| `/factory:start` | Start sprint execution |
| `/factory:status` | Show status dashboard |
| `/factory:pause` | Pause with state preservation |
| `/factory:resume` | Resume paused execution |
| `/factory:migrate` | Migrate v1 .factory/ to v2 SQLite |
| `/factory:plan` | Interactive interview → EARS spec → sprints (--auto for agent trio) |
| `/factory:plan-and-start` | Plan goal and start sprint execution |
| `/factory:limits` | View and update factory limits |
| `/factory:projects` | List factory projects, switch context |
| `/factory:help` | Show how Code Factory works |

## Dependencies

### Required
- **memory-bank** -- Project state persistence across sessions
- **get-shit-done** -- GSD planning and execution (50+ commands)
- **context-engineering-kit** -- 66 skills: SDD, Reflexion, Kaizen, SADD

### Recommended
- **Codex-harness** -- Harness review and release workflows
- **backend-development** -- Backend specialist agents (10 roles)
- **python-development** -- Python specialist agents (3 roles)
- **tdd-workflows** -- TDD orchestration and code review
- **ui-design** -- UI design specialists (3 roles)

### Optional
- **find-skill** -- Dynamic skill discovery at runtime

Install: `bash skill/install.sh` (handles all dependencies)

## Agent Roles (18 bundled)

| Role | Responsibility |
|------|---------------|
| analyst | Business analysis, requirements, specifications |
| architect | System design, decomposition, code review |
| critic | Devil's advocate, weakness analysis, alternatives |
| debugger | Root cause analysis, 4-phase debug process |
| designer | UI/UX design, wireframes, design systems |
| developer | TDD implementation, Clean Architecture code |
| documentor | API reference, architecture docs, guides |
| explorer | Codebase exploration and documentation |
| frontend | React/Vue/Angular, responsive UI, accessibility |
| integrator | Branch merging, conflict resolution, final checks |
| judge | Numerical scoring 1-5, calibrated quality evaluation |
| mobile | iOS/Android native, React Native, Flutter |
| planner | Task decomposition, SMART DoD, dependencies |
| researcher | Research approaches, best practices, solutions |
| reviewer | Code review, security, performance, reliability |
| security | OWASP Top 10, auth flaws, dependency risks |
| tester | Test writing, coverage verification, TDD red phase |
| verifier | DoD verification, lint, types, architecture boundaries |

## Hooks (8 registered + 7 command-invoked)

### Registered (settings-fragment.json)

| Hook | Type | Enforcement |
|------|------|-------------|
| ownership-check | PreToolUse | Block Write/Edit if file not owned |
| budget-check | PreToolUse | Block if budget exceeded |
| cb-check | PreToolUse | Block if circuit breaker OPEN |
| prompt-guard | PreToolUse | Prompt injection detection |
| cost-record | PostToolUse | Log token usage to costs table |
| quality-gate | PostToolUse | AI residuals + test tampering detection |
| context-monitor | PostToolUse | Context tracking + warnings at 35%/25% |
| test-autorun | PostToolUse | Auto-run tests on source changes |

### Command-invoked (called from skill commands/bundled workflows)

| Hook | Used by | Purpose |
|------|---------|---------|
| active-test.sh | build:review --active | Playwright-based browser assertions |
| arch-review.sh | build:review | Architecture compliance checks |
| build-deps-check.sh | build:* | Verify GSD + MB dependencies |
| build-install-deps.sh | build:* | Install missing dependencies |
| judge-findings-gate.sh | factory:start | Block commit on unresolved findings |
| py-quality.sh | build:* | Python format + lint + test |
| spec-verify.sh | factory:start | Spec compliance verification |

## Skill Integration

| Stage | Skills Used |
|-------|-------------|
| Requirements | `/sdd-brainstorm`, analyst agent |
| Planning | `/gsd:plan-phase`, `/sdd-plan`, PM agent |
| Implementation | `/build:phase`, `/pipeline`, developer agents |
| Testing | TDD workflow, tester agents |
| Review | `/harness-review`, `/reflexion-critique`, reviewer + judge |
| Self-improvement | `/reflexion-reflect`, `/kaizen-why`, supervisor |
| Skill discovery | `/find-skill` |
| Memory | `/mb` |

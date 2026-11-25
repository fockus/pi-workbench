---
name: factory:start
description: "Start factory sprint execution (Claude Code — Smart Pipeline)"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - TeamCreate
  - TeamDelete
  - SendMessage
---

# /factory:start

Автономный Sprint Execution Loop с Smart Pipeline.
Принципы: Generator != Evaluator. Quality gates обязательны. Lean execution.

## Arguments
$ARGUMENTS

Parse arguments:
- `--sprint N` -- execute sprint N only
- `--from N --to M` -- execute sprints N..M
- `--dry-run` -- show execution plan without running
- `--flat` -- force flat mode even for L scope
- no arguments -- continue from current sprint

## Step 0: Bootstrap

0.1 Verify `.factory/` exists. No -> "Run /factory:init"
0.2 `git log --oneline -10` -> recent commits context
0.3 Read `.factory/STATE.md` -> current position
0.4 Parse arguments -> determine SPRINT_QUEUE
0.5 Read project rules and lessons:
    - `.factory/RULES.md` -> {FACTORY_RULES} (project-specific rules for dev agents)
    - `CLAUDE.md` or `RULES.md` in project root -> {PROJECT_RULES}
    - `.factory/reports/` -> scan for lessons from previous sprints
    - `.factory/PROGRESS.md` -> what was done before, avoid repeating mistakes
    These rules are injected into dev agent prompts via AgentPromptBuilder (Python handles this).
    Lessons from reports inform PM analysis and Judge criteria.

### Validate
- `.factory/` exists? No -> "Run /factory:init"
- `.factory/goals/` or DB goals not empty? No -> "Run /factory:goal"
- `.factory/sprints/` or DB sprints not empty? No -> "Run /factory:goal"

## Step 1: Context Assembly (Python)

```bash
PLAN_JSON=$(uv run python -c "
from pathlib import Path
from code_factory.context_assembly import SprintContextAssembler
from code_factory.orchestration_strategy import HostOrchestrationStrategy
from code_factory.agent_prompt_builder import AgentPromptBuilder
import json
assembler = SprintContextAssembler(Path('.'))
ctx = assembler.assemble('SPRINT-{NNN}')
plan = HostOrchestrationStrategy().generate_execution_plan(ctx, AgentPromptBuilder())
print(json.dumps(plan.to_dict()))
")
```

Parse PLAN_JSON: topology, waves, agents, judge_prompt_template, scope.

If `--dry-run` -> print PLAN_JSON formatted and exit.

## Step 1.5: Load Deferred Tools (L scope only)

**Only for L scope (9+ tasks):** Load TeamCreate/SendMessage/TeamDelete.

```
if plan.scope == "L" and not --flat:
    ToolSearch(query: "select:TeamCreate,TeamDelete,SendMessage", max_results: 3)
    # Verify TeamCreate is callable. If not -> fall back to flat mode.
```

S and M scope -> skip this step, always flat mode.

## Step 2: Pre-Flight Check

```
2.1 Git status clean? -> No: commit or stash
2.2 Tests pass? -> uv run pytest tests/ -x -q --tb=no -> No: STOP
2.3 Python lifecycle hook:
    -> uv run code-factory pre-sprint {NNN} --factory-root .factory
    -> If exit code != 0: STOP
```

## Step 3: Sprint Execution Loop

```
for SPRINT in SPRINT_QUEUE:
    execute_sprint(SPRINT)
```

### execute_sprint(SPRINT):

#### 3.1 Contract Loading

Contract items from PLAN_JSON. Verify dependencies — all previous sprints completed?

#### 3.2 Smart Team Assembly

**S scope (1-3 tasks) and M scope (4-8 tasks) — FLAT mode:**
Orchestrator spawns dev agents directly via Agent(). No TeamCreate.

**L scope (9+ tasks) — TEAM mode (unless --flat):**
```
TeamCreate(name: "sprint-{NNN}")
```
Then spawn Tech Lead + dev agents into team. Tech Lead coordinates waves.
After sprint: `SendMessage(shutdown)` → `TeamDelete()`.

#### 3.3 Implementation (Flat Mode — S/M scope)

Spawn ALL dev agents in parallel:
```
for agent in plan.agents where agent.role == "developer":
    Agent(
      name: agent.agent_id,
      subagent_type: "developer",
      run_in_background: true,
      prompt: agent.prompt
    )
```

Wait for ALL agents to complete.

#### 3.3-alt Implementation (Team Mode — L scope)

Send wave instructions to Tech Lead via SendMessage.
Wait for wave completion. Run regression between waves.

#### 3.4 Full Regression

**HARD GATE — must pass before Judge.**
```bash
uv run pytest tests/ -x -q --tb=short
uv run ruff check src/ tests/
```
If fail -> spawn fix agent(s). Re-run regression. Max 2 fix attempts.

#### 3.5 Quality Gate (Smart Pipeline)

**HARD GATE — Judge score blocks or allows commit.**

```
ITERATION = 0
MAX_ITERATIONS = 3
JUDGE_THRESHOLD = 4.0
REVIEW_THRESHOLD = 4.0  # trigger review when Judge score below this

while ITERATION < MAX_ITERATIONS:
    ITERATION += 1

    # --- Judge (MANDATORY every iteration) ---
    JUDGE_RESULT = Agent(
      name: "judge-{NNN}-iter-{ITERATION}",
      subagent_type: "judge",
      prompt: plan.judge_prompt_template
      # Contains ONLY contract + deliverables. No dev history.
    )

    Parse JUDGE_RESULT -> SCORE, VERDICT, FINDINGS

    # --- Persist judge score in DB (MANDATORY) ---
    uv run code-factory record-judge {NNN} --score {SCORE} --verdict {VERDICT} --iteration {ITERATION} --factory-root .factory

    if VERDICT == "PASS" and SCORE >= JUDGE_THRESHOLD:
        # --- PASS path ---
        if FINDINGS has SERIOUS or WARNING items:
            # Fix remaining findings even on PASS
            Spawn fix agent(s) for SERIOUS/WARNING findings
            Run regression: uv run pytest tests/ -x -q --tb=no
            # Do NOT re-judge for minor fixes on PASS
        break  # Exit quality gate loop -> proceed to checkpoint

    # --- FAIL path (SCORE < JUDGE_THRESHOLD) ---
    if ITERATION == MAX_ITERATIONS:
        # Exhausted iterations -> STOP, report to user
        print("Judge FAIL after {MAX_ITERATIONS} iterations. Score: {SCORE}")
        print("Manual intervention required.")
        STOP  # Do NOT commit. Do NOT proceed.

    # --- Review agent (triggered on FAIL only) ---
    REVIEW_RESULT = Agent(
      name: "reviewer-{NNN}-iter-{ITERATION}",
      subagent_type: "reviewer",
      prompt: "Review Sprint {NNN} implementation.
        Judge scored {SCORE}/5 (FAIL). Judge findings: {FINDINGS}
        Focus on: what specifically needs fixing to reach {JUDGE_THRESHOLD}.
        Read the changed files. Report actionable fix list."
    )

    # --- Fix based on Judge findings + Review ---
    Spawn fix agent(s) with combined Judge + Review findings
    Run regression: uv run pytest tests/ -x -q --tb=short
    if regression fails -> fix regression first

    # Loop back -> re-judge
```

**CRITICAL RULES:**
1. Judge FAIL (< 4.0) = NO COMMIT. Period.
2. Review agent runs ONLY on FAIL — saves tokens on PASS sprints.
3. After fix, MUST re-judge — never assume fixes resolved the issue.
4. Max 3 iterations total (judge + review + fix + re-judge = 1 iteration).
5. After iteration 3 exhaust: STOP and ask user. Do NOT auto-commit.

#### 3.6 Team Shutdown (L scope only)

If team mode was used:
```
SendMessage(to: "tech-lead-{NNN}", message: {type: "shutdown_request"})
TeamDelete()
```

#### 3.7 Reflexion

Write to `.factory/reports/sprint-{NNN}.md`:
- Tasks completed, Judge score and dimensions
- Iterations used (1-3), Review triggered (yes/no)
- Mode used (flat/team), Findings fixed
- Lessons learned

#### 3.8 Checkpoint

```
1. uv run code-factory post-sprint {NNN} --factory-root .factory
2. Update sprint status in DB:
   uv run python -c "
   from code_factory.factory_engine import EngineConfig, FactoryEngine
   engine = FactoryEngine.create(EngineConfig())
   engine.sprint_repo.update_status('SPRINT-{NNN}', 'completed')
   engine.sprint_repo.update_step('SPRINT-{NNN}', 'synced')
   engine.close()
   "
3. **HARD GATE — Python verify before commit:**
   uv run code-factory verify-sprint {NNN} --factory-root .factory
   If exit code != 0 -> STOP. Do NOT commit. Fix compliance issues first.
4. Git commit (only after verify-sprint passes):
   git add -A && git commit -m 'feat(factory-sprint-{NNN}): {sprint_title}'
5. Update .factory/STATE.md
```

#### 3.9 Sync

```bash
uv run python -c "
from pathlib import Path
from code_factory.sync_protocol import SyncProtocol
from code_factory.pipeline import SprintResult
from code_factory.context_assembly import SprintContextAssembler
assembler = SprintContextAssembler(Path('.'))
ctx = assembler.assemble('SPRINT-{NNN}')
result = SprintResult(
    sprint_id='SPRINT-{NNN}',
    status='completed',
    score={JUDGE_SCORE},
    tasks_completed={TASKS_OK},
    tasks_failed={TASKS_FAIL},
    total_cost={COST},
)
sync = SyncProtocol(Path('.'))
report = sync.sync_after_sprint('SPRINT-{NNN}', result, ctx)
print(f'Sync: {len(report.actions_taken)} actions, {len(report.errors)} errors')
"
```

Show result:
```
Sprint {NNN}: COMPLETE
Tasks: X/Y | Tests: +N new | Judge: Z/5 (iterations: I)
Mode: flat/team | Review: yes/no
```

### After All Sprints

```
=======================================
  SPRINT EXECUTION COMPLETE
=======================================
  Sprints completed: N/M
  Total new tests:   X
  Judge avg score:   Y/5
  Full suite:        Z passed
  Coverage:          W%

  If backlog remains -> suggest /factory:start
=======================================
```

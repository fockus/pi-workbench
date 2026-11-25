---
name: factory:plan
description: "Interactive interview → EARS spec → decompose → sprint files"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
---

# /factory:plan

Generate a full SDD specification from a goal via interactive interview or autonomous agent trio.

## Usage
`/factory:plan GOAL-007` — interactive interview (default)
`/factory:plan GOAL-007 --auto` — autonomous mode (agent trio: interviewer + responder + critic)

## Arguments
- `goal_id` — Goal identifier (required)
- `--auto` — Skip user interview, use agent trio for autonomous spec generation
- `--mode auto|interactive` — Explicit mode selection (default: interactive)

## How It Works

### Interactive Mode (default)
1. **Interview Phase** — InterviewAgent asks adaptive questions based on 6 completeness dimensions:
   - scope, acceptance_criteria, dependencies, constraints, nfr, edge_cases
   - Questions prefer multiple-choice format
   - Adapts depth by complexity: simple (3-5 Qs), medium (5-8), complex (8-12)
   - Hard cap: 15 questions max
2. **Synthesis Phase** — Scratchpad entries → verified CONTEXT.md
3. **Spec Generation** — SpecWriter generates:
   - `requirements.md` — EARS format (AC-XX.YY, WHEN/THEN/SHALL)
   - `design.md` — Architecture, Components, Data Flow, DD-XX
4. **Decompose + Sprint** — Tasks extracted, grouped into sprint files

### Auto Mode (--auto)
Same pipeline but with agent trio instead of user:
- **InterviewAgent** asks questions
- **ResponderAgent** answers from codebase analysis
- **CriticAgent** evaluates quality (PASS/NEEDS_IMPROVEMENT, max 2 retries)
- Budget cap: 30 LLM calls

## Workflow

### Step 1: Verify Init
```bash
ls .factory/config.json || echo "Run /factory:init first"
```

### Step 2: Execute Plan
```bash
uv run code-factory plan <goal_id> [--auto] --factory-root .factory
```

### Step 3: Review Output
Output files:
- `.factory/specs/<goal_id>/CONTEXT.md` — interview results
- `.factory/specs/<goal_id>/requirements.md` — EARS specification
- `.factory/specs/<goal_id>/design.md` — architecture design
- `.factory/sprints/SPRINT-NNN.md` — generated sprint files (if decomposition succeeds)

### Step 4: Next Steps
```
Ready for execution:
  /factory:start --from <first_sprint> --to <last_sprint>
```

## Output Format
```json
{
  "goal_id": "GOAL-007",
  "mode": "interactive",
  "context_path": ".factory/specs/GOAL-007/CONTEXT.md",
  "requirements_path": ".factory/specs/GOAL-007/requirements.md",
  "design_path": ".factory/specs/GOAL-007/design.md",
  "sprints_created": 3,
  "tasks_total": 12
}
```

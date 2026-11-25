---
name: factory:plan-and-start
description: "Plan and execute a factory goal in one step"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
---

# /factory:plan-and-start

Composite command: SDD planning → GSD decomposition → sprint execution.
Combines `/factory:goal` and `/factory:start` into a single workflow.

## Usage
`/factory:plan-and-start "Build REST API for user management"`

## Arguments
- First argument: goal description (required)
- `--dry-run` — show plan without execution
- `--max-sprints N` — limit sprint iterations (default: unlimited)

## Workflow

### Step 1: Verify Factory Init
Read `.factory/config.json` — if missing, run `/factory:init` first.

### Step 2: Create Goal
```bash
uv run python -c "
from code_factory.factory_engine import EngineConfig, FactoryEngine
from code_factory.repos.protocols import Goal
import uuid

engine = FactoryEngine.create(EngineConfig())
goal = Goal(id=str(uuid.uuid4()), title='<USER_GOAL>', status='pending')
engine.backlog_repo.add_goal(goal)
print(f'Goal created: {goal.id}')
engine.close()
"
```

### Step 3: SDD Planning
Use Agent to run SDD planning for the goal:
- Analyze requirements from goal description
- Identify features and technical components
- Create epics in backlog via `backlog_repo.add_epic()`

### Step 4: GSD Decomposition
Decompose epics into sprint-sized work items:
- Each epic → 1+ sprints with clear scope
- Define acceptance criteria per sprint

### Step 5: Sprint Execution
Execute sprints via code-factory CLI:
```bash
uv run code-factory daemon --max-sprints 1 --factory-root .factory
```
Or for full autonomous execution:
```bash
uv run code-factory daemon --factory-root .factory
```

### Step 6: Results
- Show sprint results and scores
- Update Memory Bank with progress
- If backlog remains: suggest continuing with `/factory:start`

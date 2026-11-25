---
name: factory:goal
description: "Set a development goal for the factory"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
---

# /factory:goal

Set a development goal and decompose it into epics, tasks, and sprints.

## Arguments
$ARGUMENTS

## Workflow

### Step 1: Verify Init
Check `.factory/config.yaml` exists. If missing → "Запусти /factory:init".

### Step 2: Create Goal
```bash
uv run python -c "
from code_factory.factory_engine import EngineConfig, FactoryEngine
from code_factory.execution.domain import Goal

engine = FactoryEngine.create(EngineConfig())
goal = Goal.create(
    title='<USER_GOAL>',
    description='<description>',
    acceptance='<acceptance criteria>'
)
engine.backlog_repo.add_goal(goal)
print(f'Goal created: {goal.id}')
engine.close()
"
```

### Step 3: Research & Decompose

Используй Agent(subagent_type="Explore") для исследования кодовой базы.
Декомпозируй goal в epics (5-7 штук).

```python
from code_factory.execution.domain import Epic
from code_factory.shared.types import EpicId, GoalId

epic = Epic(id=EpicId('EPIC-NNN'), goal_id=GoalId(goal.id), title='...', priority=N)
engine.backlog_repo.add_epic(epic)
```

### Step 4: Create Sprint Files

Для каждого epic создай sprint файл `.factory/sprints/SPRINT-{NNN}.md`:
- Tasks table (ID, Name, Priority, Estimate, Layer, Status)
- Sprint Contract (pass/fail criteria)
- Team Composition (scope S/M/L)
- Dependencies
- Epics reference

Зарегистрируй sprints в DB:
```python
from code_factory.execution.domain import Sprint
from code_factory.shared.types import SprintId, GoalId
from code_factory.shared.enums import SprintStatus, StepName

sprint = Sprint(id=SprintId('SPRINT-NNN'), name='...', goal_id=GoalId(goal.id))
engine.sprint_repo.create(sprint)
```

### Step 5: Summary
```
Goal: {title}
Epics: {count}
Sprints: {count}
Tasks: {count}
Next steps:
  /factory:plan {goal_id}           — interactive interview → EARS spec → sprints
  /factory:plan {goal_id} --auto    — autonomous spec generation (agent trio)
  /factory:start --from N --to M    — execute sprints
```

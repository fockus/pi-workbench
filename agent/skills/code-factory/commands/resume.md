---
name: factory:resume
description: "Resume paused factory execution"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
---

# /factory:resume

Resume a previously paused factory from the saved state.

## Workflow

### Step 1: Load Snapshot via CLI
```bash
uv run python -c "
import asyncio
from code_factory.factory_engine import EngineConfig, FactoryEngine
from code_factory.state_serializer import StateSerializer
from code_factory.pause_resume import PauseResumeController
from code_factory.db_backup import DBBackup

engine = FactoryEngine.create(EngineConfig())
serializer = StateSerializer()
controller = PauseResumeController(
    serializer, engine.snapshot_repo, DBBackup(), engine.sprint_repo,
)
state = asyncio.run(controller.resume())
print(f'Resumed: {state.sprint_id} from step {state.current_step}')
engine.close()
"
```

If no snapshot found, inform user that no paused sprint exists.

### Step 2: Resume Pipeline
Continue pipeline execution from the saved step.
The pipeline skips already-completed steps and resumes from `state.current_step`.

### Step 3: Confirmation
Print:
- Resumed sprint: {state.sprint_id}
- From step: {state.current_step}
- Completed steps: {state.steps_completed}
- Pipeline continues automatically

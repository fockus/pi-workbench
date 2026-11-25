---
name: factory:pause
description: "Pause running factory with state preservation"
allowed-tools:
  - Read
  - Write
  - Bash
---

# /factory:pause

Pause the running factory and preserve full state for later resume.

## Workflow

### Step 1: Capture State via CLI
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
asyncio.run(controller.pause('<SPRINT_ID>'))
engine.close()
"
```

### Step 2: Confirmation
Print:
- State saved to `.factory/factory.db` (snapshot table)
- DB backup: `.factory/backups/{timestamp}.db`
- To resume: `/factory:resume`

State includes: current step, completed steps, team agent IDs, scores, cost.

---
name: factory:status
description: "Show factory status dashboard"
allowed-tools:
  - Read
  - Bash
---

# /factory:status

Show the factory status dashboard with sprint progress, agent activity, quality scores, and budget.

## Workflow

### Step 1: Collect and Display Status via CLI
```bash
uv run python -c "
from code_factory.factory_engine import EngineConfig, FactoryEngine
from code_factory.status_collector import StatusCollector
from code_factory.status_dashboard import StatusDashboard

engine = FactoryEngine.create(EngineConfig())
collector = StatusCollector(
    engine.sprint_repo, engine.cost_repo,
    engine.gate_repo, engine.backlog_repo,
)
dashboard = StatusDashboard(collector)
print(dashboard.render())

planned = engine.sprint_repo.list_by_status('planned')
if planned:
    print(f'\n## Planned Sprints ({len(planned)})')
    for s in planned:
        print(f'  {s.id}: {s.name}')

engine.close()
"
```

Dashboard shows:
- Sprint progress (step, tasks completed/total)
- Agent activity (active, stuck, dead)
- Quality scores (avg score, gate pass rate)
- Budget (used/cap in USD)
- Backlog (goals, epics remaining)
- Planned sprints queue
- Uptime

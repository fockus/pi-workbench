---
name: factory:decompose
description: "Generate structured task artifacts from a goal spec"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:decompose

Thin wrapper over the canonical public CLI command.
Reads an existing SDD spec artifact and persists structured task decomposition in `.factory/tasks/`.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Required Artifacts Exist
- Ensure `.factory/specs/{GOAL_ID}.yaml` exists and is approved
- Ensure `.factory/research/{GOAL_ID}.md` exists
- Ensure `.factory/plans/{GOAL_ID}.phase.json` exists
- Ensure `.factory/specs/{GOAL_ID}.exec.yaml` exists

### Step 2: Run canonical CLI
```bash
uv run code-factory decompose {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show generated tasks path and task count.

---
name: factory:generate-exec-spec
description: "Generate the persisted executable spec contract for a goal"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:generate-exec-spec

Thin wrapper over the canonical public CLI command.
Builds `.factory/specs/{GOAL_ID}.exec.yaml` for goal-aware test generation and verification.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Phase Artifacts Exist
- Ensure the spec is approved
- Ensure `.factory/research/{GOAL_ID}.md` exists
- Ensure `.factory/plans/{GOAL_ID}.phase.json` exists

### Step 2: Run canonical CLI
```bash
uv run code-factory generate-exec-spec {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show executable spec path and criteria count.

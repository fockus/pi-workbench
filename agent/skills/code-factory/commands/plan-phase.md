---
name: factory:plan-phase
description: "Create a structured phase plan artifact from an approved spec"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:plan-phase

Thin wrapper over the canonical public CLI command.
Builds `.factory/plans/{GOAL_ID}.phase.json` from the approved SDD spec.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Approved Spec Exists
- Ensure `.factory/specs/{GOAL_ID}.yaml` exists
- Ensure `.factory/specs/{GOAL_ID}.meta.json` reports `approved`

### Step 2: Run canonical CLI
```bash
uv run code-factory plan-phase {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show plan artifact path and phase count.

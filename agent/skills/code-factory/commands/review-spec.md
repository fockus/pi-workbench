---
name: factory:review-spec
description: "Review a persisted SDD spec and record notes"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:review-spec

Thin wrapper over the canonical public CLI command.
Moves a generated spec into review and stores review notes in spec metadata.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Spec Exists
- Ensure `.factory/specs/{GOAL_ID}.yaml` exists
- If missing, run `/factory:spec {GOAL_ID}` first

### Step 2: Run canonical CLI
```bash
uv run code-factory review-spec {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show review status and review notes from metadata.

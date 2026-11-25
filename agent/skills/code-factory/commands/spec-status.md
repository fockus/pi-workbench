---
name: factory:spec-status
description: "Show the current review state of an SDD spec"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

# /factory:spec-status

Thin wrapper over the canonical public CLI command.
Displays the persisted review status, reviewer, reason, and notes for a spec.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Metadata Exists
- Ensure `.factory/specs/{GOAL_ID}.meta.json` exists
- If missing, run `/factory:spec {GOAL_ID}` first

### Step 2: Run canonical CLI
```bash
uv run code-factory spec-status {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show current review state and any stored notes or decision reason.

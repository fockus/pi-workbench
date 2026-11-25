---
name: factory:research
description: "Create a persisted research artifact from an approved spec"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:research

Thin wrapper over the canonical public CLI command.
Builds `.factory/research/{GOAL_ID}.md` from the approved SDD spec.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Approved Spec Exists
- Ensure `.factory/specs/{GOAL_ID}.yaml` exists
- Ensure `.factory/specs/{GOAL_ID}.meta.json` reports `approved`

### Step 2: Run canonical CLI
```bash
uv run code-factory research {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show research artifact path and summarized requirements.

---
name: factory:verification
description: "Aggregate executable spec compliance into a persisted verification artifact"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:verification

Thin wrapper over the canonical public CLI command.
Builds `.factory/verification/{GOAL_ID}.json` from executable spec verification and traceability analysis.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Goal-Aware Artifacts Exist
- Ensure `.factory/specs/{GOAL_ID}.exec.yaml` exists
- Ensure generated tests exist under `.factory/generated-tests/{GOAL_ID}/`

### Step 2: Run canonical CLI
```bash
uv run code-factory verification {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show verification artifact path, compliance summary, and traceability gap count.

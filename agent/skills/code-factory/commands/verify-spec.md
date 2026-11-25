---
name: factory:verify-spec
description: "Verify code compliance against the current goal spec"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:verify-spec

Thin wrapper over the canonical public CLI command.
Verifies the current codebase against the persisted executable spec and reports compliance.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Executable Spec Exists
- Ensure `.factory/specs/{GOAL_ID}.exec.yaml` exists
- If missing, run `/factory:generate-exec-spec {GOAL_ID}` first

### Step 2: Run canonical CLI
```bash
uv run code-factory verify-spec {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show compliance percentage, pass/fail result, and criterion evidence.

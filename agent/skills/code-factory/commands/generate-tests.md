---
name: factory:generate-tests
description: "Generate tests from the current goal spec"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:generate-tests

Thin wrapper over the canonical public CLI command.
Generates test artifacts from the persisted executable spec and stores them under `.factory/generated-tests/`.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Executable Spec Exists
- Ensure `.factory/specs/{GOAL_ID}.exec.yaml` exists
- If missing, run `/factory:generate-exec-spec {GOAL_ID}` first

### Step 2: Run canonical CLI
```bash
uv run code-factory generate-tests {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show generated test path and criteria count.

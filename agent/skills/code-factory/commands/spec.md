---
name: factory:spec
description: "Generate and persist an SDD spec for a goal"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:spec

Thin wrapper over the canonical public CLI command.
Generates an SDD spec artifact for an existing goal and stores it in `.factory/specs/`.

## Arguments
- First argument: `GOAL_ID` (required)

## Workflow

### Step 1: Verify Goal Exists
- Read `.factory/factory.db` state through the CLI flow
- Ensure the goal id exists before generating the spec

### Step 2: Run canonical CLI
```bash
uv run code-factory spec {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show generated spec path, criteria count, and requirement summary.

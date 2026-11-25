---
name: factory:approve-spec
description: "Approve a reviewed SDD spec"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:approve-spec

Thin wrapper over the canonical public CLI command.
Marks a reviewed spec as approved so decomposition and guided execution can continue.

## Arguments
- First argument: `GOAL_ID` (required)
- `--reviewer NAME` — reviewer identity
- `--reason TEXT` — optional approval reason

## Workflow

### Step 1: Verify Review State
- Ensure the spec metadata exists
- Review the spec first when needed with `/factory:review-spec {GOAL_ID}`

### Step 2: Run canonical CLI
```bash
uv run code-factory approve-spec {GOAL_ID} --factory-root .factory
```

### Step 3: Results
Show updated review status and approval metadata.

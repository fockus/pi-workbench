---
name: factory:reject-spec
description: "Reject a reviewed SDD spec with an explicit reason"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# /factory:reject-spec

Thin wrapper over the canonical public CLI command.
Marks a reviewed spec as rejected and stores the rejection reason in metadata.

## Arguments
- First argument: `GOAL_ID` (required)
- `--reviewer NAME` — reviewer identity
- `--reason TEXT` — rejection reason (required)

## Workflow

### Step 1: Verify Review State
- Ensure the spec metadata exists
- Review the spec first when needed with `/factory:review-spec {GOAL_ID}`

### Step 2: Run canonical CLI
```bash
uv run code-factory reject-spec {GOAL_ID} --factory-root .factory --reason "Need revision"
```

### Step 3: Results
Show rejection status and stored reason.

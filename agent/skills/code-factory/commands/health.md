---
name: factory:health
description: "Pre-flight health check for configured runtimes"
allowed-tools:
  - Read
  - Bash
---

# /factory:health

Runtime pre-flight health check — verifies binary availability and API key presence.

## Workflow

### Step 1: Run canonical CLI
```bash
uv run code-factory health --factory-root .factory
```

### Step 2: Show result
Display the health check table showing each runtime's availability status.

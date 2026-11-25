---
name: factory:init
description: "Initialize Code Factory in current project"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

# /factory:init

Initialize Code Factory in the current project directory.

## Workflow

### Step 1: Detect Stack
```python
from code_factory.stack_detector import StackDetector
from pathlib import Path

detector = StackDetector()
profile = detector.detect(Path.cwd())
```

Print detected languages, frameworks, and suggested plugins.

### Step 2: Generate Configuration
```python
from code_factory.factory_config import generate_config, save_config

config = generate_config(Path.cwd(), profile)
save_config(config, Path.cwd() / ".factory" / "config.json")
```

### Step 3: Initialize Database via CLI
```bash
uv run code-factory pre-sprint 0 --factory-root .factory
```
This creates the database and runs schema initialization.

### Step 4: Summary
Print:
- Project: {config.project_name}
- Stack: {profile.languages}
- Frameworks: {profile.frameworks}
- Suggested plugins: {profile.suggested_plugins}
- Config: `.factory/config.json`
- Database: `.factory/factory.db`
- Next: `/factory:goal "your development goal"`

---
name: factory:migrate
description: "Migrate v1 .factory/ files to v2 SQLite database"
argument-hint: "[--dry-run] [--no-backup] [--force]"
allowed-tools:
  - Read
  - Bash
---

# /factory:migrate

Migrate a v1 `.factory/` directory (markdown files) to the v2 `factory.db` SQLite database.

## Step 1: Verify v1 .factory/ exists

Check that `.factory/` exists and contains v1 markers (at least one of: `STATE.md`, `goals/`, `config.yaml`).

```bash
ls .factory/
```

If `.factory/` is missing or has no v1 markers → abort with:
> Error: No v1 .factory/ found. Run `/factory:init` to create a new v2 project.

## Step 2: Check if v2 already exists

Check for `.factory/factory.db`:

```bash
ls .factory/factory.db 2>/dev/null && echo EXISTS || echo MISSING
```

If `factory.db` EXISTS and `--force` was **not** passed → abort with:
> Error: factory.db already exists. Pass --force to overwrite, or delete it manually.

## Step 3: Dry-run — preview what will be migrated

```python
import sys
sys.path.insert(0, "src")
from pathlib import Path
from code_factory.migration import migrate_v1_to_v2

result = migrate_v1_to_v2(
    v1_path=Path(".factory"),
    v2_db_path=Path(".factory/factory.db"),
    dry_run=True,
    backup=False,
)

print("=== Migration Preview (dry-run) ===")
print(f"  Goals    : {result.goals_migrated}")
print(f"  Epics    : {result.epics_migrated}")
print(f"  Sprints  : {result.sprints_migrated}")
print(f"  Costs    : {result.costs_migrated}")
if result.unmapped_fields:
    print(f"  Unmapped : {', '.join(result.unmapped_fields)}")
if result.warnings:
    for w in result.warnings:
        print(f"  WARN: {w}")
if result.errors:
    for e in result.errors:
        print(f"  ERROR: {e}")
```

Show the report to the user.

## Step 4: Confirm

If `--dry-run` was passed → stop here, do not proceed.

Otherwise, ask the user:

> Proceed with migration? Backup will be created at `.factory.bak.<timestamp>` unless `--no-backup` was passed. (y/n)

If the user answers anything other than `y` / `yes` → abort: "Migration cancelled."

## Step 5: Execute migration

```python
from pathlib import Path
from code_factory.migration import migrate_v1_to_v2

do_backup = "--no-backup" not in args  # args = user-supplied arguments

result = migrate_v1_to_v2(
    v1_path=Path(".factory"),
    v2_db_path=Path(".factory/factory.db"),
    dry_run=False,
    backup=do_backup,
)

print("=== Migration Complete ===")
print(f"  Goals    : {result.goals_migrated}")
print(f"  Epics    : {result.epics_migrated}")
print(f"  Sprints  : {result.sprints_migrated}")
print(f"  Costs    : {result.costs_migrated}")
if result.warnings:
    for w in result.warnings:
        print(f"  WARN: {w}")
if result.errors:
    for e in result.errors:
        print(f"  ERROR: {e}")
```

## Step 6: Verify

Connect to the new `factory.db` and count rows in each migrated table:

```python
import sqlite3
conn = sqlite3.connect(".factory/factory.db")
for table in ("goals", "epics", "sprints", "costs", "factory_state", "circuit_breaker"):
    count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"  {table}: {count} rows")
conn.close()
```

Print summary and suggest next steps:
> Migration verified. Run `/factory:status` to view the current project state.

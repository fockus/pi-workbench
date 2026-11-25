#!/usr/bin/env bash
# Hook: test-autorun (HOOK-08)
# Type: PostToolUse
# Purpose: Auto-suggest test runs when source files change
set -euo pipefail

DB_PATH=".factory/factory.db"
[ -f "$DB_PATH" ] || exit 0

EVENT=$(cat)
python3 -c "
import sys, json
from pathlib import Path
try:
    from code_factory.hooks import HookContext
    from code_factory.hooks.test_autorun_hook import test_autorun
except ImportError:
    sys.exit(0)

event = json.loads(sys.argv[1])
ctx = HookContext(
    tool_name=event.get('tool_name', ''),
    file_path=event.get('file_path'),
    command=event.get('command'),
    agent_id=event.get('agent_id'),
    db_path=Path('$DB_PATH'),
    sprint_id=event.get('sprint_id'),
    task_id=event.get('task_id'),
)
changed = event.get('changed_files', [])
if event.get('file_path'):
    changed.append(event['file_path'])
result = test_autorun(ctx, changed, event.get('test_command', 'uv run pytest'))
if result.reason:
    print(result.reason, file=sys.stderr)
" "$EVENT"

#!/usr/bin/env bash
# Hook: context-monitor (HOOK-06)
# Type: PostToolUse
# Purpose: Context window tracking + warnings at 35%/25%
set -euo pipefail

DB_PATH=".factory/factory.db"
[ -f "$DB_PATH" ] || exit 0

EVENT=$(cat)
python3 -c "
import sys, json
from pathlib import Path
try:
    from code_factory.hooks import HookContext
    from code_factory.hooks.context_hook import context_monitor
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
result = context_monitor(
    ctx,
    tokens_used=event.get('tokens_used', 0),
    tokens_total=event.get('tokens_total', 200000),
)
if result.reason:
    print(result.reason, file=sys.stderr)
" "$EVENT"

#!/usr/bin/env bash
# Hook: cost-record (HOOK-04)
# Type: PostToolUse
# Purpose: Log token usage and cost per tool call
set -euo pipefail

DB_PATH=".factory/factory.db"
[ -f "$DB_PATH" ] || exit 0

EVENT=$(cat)
python3 -c "
import sys, json
from pathlib import Path
try:
    from code_factory.hooks import HookContext
    from code_factory.hooks.cost_hook import cost_record
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
cost_record(
    ctx,
    tokens_in=event.get('tokens_in', 0),
    tokens_out=event.get('tokens_out', 0),
    model=event.get('model', 'unknown'),
    cost_usd=event.get('cost_usd', 0.0),
)
" "$EVENT"

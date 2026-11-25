#!/usr/bin/env bash
# Hook: quality-gate (HOOK-05)
# Type: PostToolUse
# Purpose: AI residuals + test tampering detection
set -euo pipefail

DB_PATH=".factory/factory.db"
[ -f "$DB_PATH" ] || exit 0

EVENT=$(cat)
python3 -c "
import sys, json
from pathlib import Path
try:
    from code_factory.hooks import HookContext
    from code_factory.hooks.quality_hook import quality_gate_check
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
content = event.get('content', '')
result = quality_gate_check(ctx, content)
if not result.allowed:
    print(result.reason, file=sys.stderr)
    sys.exit(2)
if result.reason:
    print(result.reason, file=sys.stderr)
" "$EVENT"

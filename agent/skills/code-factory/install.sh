#!/usr/bin/env bash
# Code Factory v2 — Skill Installer
# Usage: bash skill/install.sh [--dry-run]
# Idempotent — safe to re-run
set -euo pipefail

DRY_RUN=false
CI_MODE=false
MINIMAL=false
FORCE=false
HOST_OVERRIDE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)  DRY_RUN=true; shift ;;
        --ci)       CI_MODE=true; shift ;;
        --minimal)  MINIMAL=true; shift ;;
        --force)    FORCE=true; shift ;;
        --host)
            if [[ $# -lt 2 ]]; then
                echo "Error: --host requires a value (claude-code, cursor, opencode)"
                exit 1
            fi
            HOST_OVERRIDE="$2"; shift 2
            ;;
        --host=*)   HOST_OVERRIDE="${1#*=}"; shift ;;
        -h|--help)
            echo "Usage: bash install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --host HOST Force host adapter (claude-code, cursor, opencode)"
            echo "  --dry-run   Show what would be installed without making changes"
            echo "  --ci        Non-interactive mode (skip recommended skills)"
            echo "  --minimal   Install required dependencies only"
            echo "  --force     Reinstall existing components"
            echo "  -h, --help  Show this help message"
            exit 0
            ;;
        *)          echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Auto-detect CI environment
if [[ -n "${CI:-}" ]]; then
    CI_MODE=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_ok()   { echo -e "  ${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
log_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; }
log_info() { echo -e "       $1"; }
step()     { echo -e "\n${BLUE}${BOLD}[$1]${NC} $2"; }

# Interactive prompt for recommended skills
ask_install() {
    local name="$1"
    local desc="$2"
    local default="${3:-N}"

    if [ "$CI_MODE" = true ]; then
        return 1
    fi
    if [ "$MINIMAL" = true ]; then
        return 1
    fi

    local prompt
    if [ "$default" = "Y" ]; then
        prompt="  Install ${BOLD}$name${NC} ($desc)? [Y/n] "
    else
        prompt="  Install ${BOLD}$name${NC} ($desc)? [y/N] "
    fi

    read -r -p "$(echo -e "$prompt")" response
    response="${response:-$default}"
    [[ "$response" =~ ^[Yy] ]]
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$SCRIPT_DIR"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLAUDE_DIR="$HOME/.claude"
COMMANDS_DIR="$CLAUDE_DIR/commands/factory"
SKILLS_DIR="$CLAUDE_DIR/skills"
FACTORY_SKILLS="$SKILLS_DIR/code-factory"
SETTINGS="$CLAUDE_DIR/settings.json"

ERRORS=0
INSTALLED=0

echo ""
echo -e "${BOLD}=== Code Factory v2 — Installation ===${NC}"
# Display version from SKILL.md
if [ -f "$SKILL_DIR/SKILL.md" ]; then
    SKILL_VERSION=$(grep '^version:' "$SKILL_DIR/SKILL.md" | head -1 | sed 's/version:[[:space:]]*//')
    echo -e "  Version: ${BOLD}${SKILL_VERSION}${NC}"
fi
if [ "$CI_MODE" = true ]; then
    echo -e "  Mode: ${YELLOW}CI (non-interactive)${NC}"
elif [ "$MINIMAL" = true ]; then
    echo -e "  Mode: ${YELLOW}Minimal (required only)${NC}"
fi
echo ""

# ═══════════════════════════════════════
step "1/10" "Pre-flight checks"
# ═══════════════════════════════════════

# Python 3.12+
if command -v python3 &>/dev/null; then
    PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    if python3 -c "import sys; exit(0 if sys.version_info >= (3,12) else 1)" 2>/dev/null; then
        log_ok "Python $PY_VER"
    else
        log_fail "Python $PY_VER (need >=3.12)"
        ERRORS=$((ERRORS + 1))
    fi
else
    log_fail "Python not found"
    ERRORS=$((ERRORS + 1))
fi

# Host detection (auto-detect or --host override)
DETECTED_HOST=""
RUNTIME="none"

detect_host() {
    # 1. --host flag override
    if [ -n "$HOST_OVERRIDE" ]; then
        case "$HOST_OVERRIDE" in
            claude-code|cursor|opencode)
                DETECTED_HOST="$HOST_OVERRIDE"
                ;;
            *)
                log_fail "Unknown host: $HOST_OVERRIDE (supported: claude-code, cursor, opencode)"
                ERRORS=$((ERRORS + 1))
                return
                ;;
        esac
        log_ok "Host override: $DETECTED_HOST"
        return
    fi

    # 2. CODE_FACTORY_HOST env var
    if [ -n "${CODE_FACTORY_HOST:-}" ]; then
        DETECTED_HOST="$CODE_FACTORY_HOST"
        log_ok "Host from env: $DETECTED_HOST"
        return
    fi

    # 3. Auto-detect by directory markers and binaries
    if [ -d ".cursor" ]; then
        DETECTED_HOST="cursor"
    elif [ -d ".opencode" ]; then
        DETECTED_HOST="opencode"
    elif command -v opencode &>/dev/null; then
        DETECTED_HOST="opencode"
    elif command -v claude &>/dev/null; then
        DETECTED_HOST="claude-code"
    fi

    if [ -n "$DETECTED_HOST" ]; then
        log_ok "Host detected: $DETECTED_HOST"
    fi
}

detect_host

# Agent CLI — verify binary for detected host
case "$DETECTED_HOST" in
    claude-code)
        if command -v claude &>/dev/null; then
            RUNTIME="claude"
            log_ok "Claude Code CLI"
        else
            log_fail "Host is claude-code but claude binary not found"
            ERRORS=$((ERRORS + 1))
        fi
        ;;
    cursor)
        RUNTIME="cursor"
        log_ok "Cursor IDE"
        # Cursor works via IDE, claude binary optional
        if command -v claude &>/dev/null; then
            log_ok "Claude Code CLI (available in Cursor)"
        fi
        ;;
    opencode)
        if command -v opencode &>/dev/null; then
            RUNTIME="opencode"
            log_ok "OpenCode CLI"
        else
            log_warn "Host is opencode but opencode binary not found (detected by .opencode/ dir)"
            RUNTIME="opencode"
        fi
        ;;
    *)
        log_fail "No supported host detected (need claude, cursor, or opencode)"
        ERRORS=$((ERRORS + 1))
        ;;
esac

# uv
if command -v uv &>/dev/null; then
    log_ok "uv package manager"
else
    log_warn "uv not found (recommended for faster installs)"
fi

# Cognitia
if python3 -c "import cognitia" 2>/dev/null; then
    COG_VER=$(python3 -c "import cognitia; print(cognitia.__version__)")
    log_ok "Cognitia $COG_VER"
else
    log_fail "Cognitia not installed (pip install cognitia>=1.1.0)"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    log_fail "Pre-flight checks failed ($ERRORS issues). Fix and retry."
    exit 1
fi

# --- Dry run ---
if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "[DRY RUN] Would perform:"
    echo "  - Host: $DETECTED_HOST (runtime: $RUNTIME)"
    echo "  - Symlink 6 /factory: commands"
    echo "  - Clone/update build skill from GitHub (claude-skill-build)"
    echo "  - Install build commands, agents, hooks from open-source repo"
    echo "  - Verify L0 global agents at ~/.claude/agents/"
    echo "  - Copy SKILL.md + dependencies.yaml"
    echo "  - Install code-factory Python package"
    echo "  - Register 8 hooks in settings.json"
    echo "  - Run host-specific installer (skill/hosts/$DETECTED_HOST/install.sh)"
    echo "  - Install GSD (if missing)"
    echo "  - Install CEK (if missing)"
    echo "  - Check find-skill (required for L3 fallback)"
    echo "  - Check Agent Teams setting"
    echo "  - Detect project stack"
    echo "  Flags: CI_MODE=$CI_MODE MINIMAL=$MINIMAL FORCE=$FORCE HOST=$DETECTED_HOST"
    exit 0
fi

# ═══════════════════════════════════════
step "2/10" "Factory commands (/factory:*)"
# ═══════════════════════════════════════
mkdir -p "$COMMANDS_DIR"
for cmd in "$SKILL_DIR/commands/"*.md; do
    [ -f "$cmd" ] || continue
    BASENAME=$(basename "$cmd")
    TARGET="$COMMANDS_DIR/$BASENAME"
    if [ -L "$TARGET" ] || [ -f "$TARGET" ]; then
        log_info "Skip $BASENAME (exists)"
    else
        ln -sf "$cmd" "$TARGET"
        log_ok "Linked $BASENAME"
        INSTALLED=$((INSTALLED + 1))
    fi
done

# ═══════════════════════════════════════
step "3/10" "Build skill (open-source: claude-skill-build)"
# ═══════════════════════════════════════
BUILD_SKILL_REPO="https://github.com/fockus/claude-skill-build.git"
BUILD_SKILL_DIR="$HOME/.claude/skills/build"

if [ -d "$BUILD_SKILL_DIR" ] && [ -d "$BUILD_SKILL_DIR/.git" ]; then
    # Existing installation -- pull latest
    log_info "Build skill found at $BUILD_SKILL_DIR — updating..."
    if git -C "$BUILD_SKILL_DIR" pull --ff-only 2>/dev/null; then
        log_ok "Build skill updated (git pull)"
    else
        log_warn "Build skill git pull failed (manual update needed)"
    fi
else
    # Fresh installation -- clone
    if [ -d "$BUILD_SKILL_DIR" ]; then
        # Non-git directory exists -- back up and replace
        mv "$BUILD_SKILL_DIR" "${BUILD_SKILL_DIR}.bak.$(date +%s)"
        log_warn "Backed up existing non-git build skill to ${BUILD_SKILL_DIR}.bak.*"
    fi
    if git clone "$BUILD_SKILL_REPO" "$BUILD_SKILL_DIR" 2>/dev/null; then
        log_ok "Build skill cloned from GitHub"
        INSTALLED=$((INSTALLED + 1))
    else
        log_fail "Build skill clone failed: $BUILD_SKILL_REPO"
        ERRORS=$((ERRORS + 1))
    fi
fi

# Install build skill commands to ~/.claude/commands/build/
if [ -d "$BUILD_SKILL_DIR/core/commands/build" ]; then
    mkdir -p "$CLAUDE_DIR/commands/build"
    for cmd_source in "$BUILD_SKILL_DIR/core/commands/build/"*.md; do
        [ -f "$cmd_source" ] || continue
        cmd_name=$(basename "$cmd_source")
        target="$CLAUDE_DIR/commands/build/$cmd_name"
        cp "$cmd_source" "$target"
        log_ok "/build:$(basename "$cmd_name" .md)"
        INSTALLED=$((INSTALLED + 1))
    done
fi

# Install build skill agents to ~/.claude/agents/
if [ -d "$BUILD_SKILL_DIR/core/agents" ]; then
    mkdir -p "$CLAUDE_DIR/agents"
    for agent_source in "$BUILD_SKILL_DIR/core/agents/"*.md; do
        [ -f "$agent_source" ] || continue
        agent_name=$(basename "$agent_source")
        target="$CLAUDE_DIR/agents/$agent_name"
        if [ ! -f "$target" ] || ! diff -q "$agent_source" "$target" >/dev/null 2>&1; then
            cp "$agent_source" "$target"
            log_ok "Agent: $(basename "$agent_name" .md)"
            INSTALLED=$((INSTALLED + 1))
        else
            log_info "Agent: $(basename "$agent_name" .md) — up to date"
        fi
    done
fi

# Install build skill hooks
if [ -d "$BUILD_SKILL_DIR/core/hooks" ]; then
    for hook_source in "$BUILD_SKILL_DIR/core/hooks/"*.sh; do
        [ -f "$hook_source" ] || continue
        hook_name=$(basename "$hook_source")
        target="$SKILLS_DIR/code-factory/hooks/$hook_name"
        mkdir -p "$(dirname "$target")"
        cp "$hook_source" "$target"
        chmod +x "$target"
    done
    log_ok "Build skill hooks synced"
fi

# Install standalone commands (/pipeline, /implement)
if [ -d "$BUILD_SKILL_DIR/core/commands" ]; then
    for cmd_source in "$BUILD_SKILL_DIR/core/commands/"*.md; do
        [ -f "$cmd_source" ] || continue
        cmd_name=$(basename "$cmd_source")
        target="$CLAUDE_DIR/commands/$cmd_name"
        if [ ! -f "$target" ]; then
            cp "$cmd_source" "$target"
            log_ok "/$(basename "$cmd_name" .md)"
            INSTALLED=$((INSTALLED + 1))
        else
            log_info "/$(basename "$cmd_name" .md) — exists"
        fi
    done
fi

# ═══════════════════════════════════════
step "4/10" "Skill files + L0 global agents"
# ═══════════════════════════════════════
mkdir -p "$FACTORY_SKILLS"

# SKILL.md
if [ -f "$SKILL_DIR/SKILL.md" ]; then
    cp "$SKILL_DIR/SKILL.md" "$FACTORY_SKILLS/"
    log_ok "SKILL.md (v2)"
fi

# Dependencies
if [ -f "$SKILL_DIR/dependencies.yaml" ]; then
    cp "$SKILL_DIR/dependencies.yaml" "$FACTORY_SKILLS/"
    log_ok "dependencies.yaml (v2)"
fi

# Config template
if [ -d "$SKILL_DIR/templates" ]; then
    mkdir -p "$FACTORY_SKILLS/templates"
    if compgen -G "$SKILL_DIR/templates/"* > /dev/null 2>&1; then
        cp "$SKILL_DIR/templates/"* "$FACTORY_SKILLS/templates/"
        log_ok "Config templates"
    else
        log_info "No templates to copy"
    fi
fi

# L0 global agents (from ~/.claude/agents/)
GLOBAL_AGENTS_DIR="$HOME/.claude/agents"
if [ -d "$GLOBAL_AGENTS_DIR" ]; then
    AGENT_COUNT=$(find "$GLOBAL_AGENTS_DIR" -name "*.md" -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
    log_ok "L0 global agents ($AGENT_COUNT prompts at ~/.claude/agents/)"
else
    log_warn "L0 global agents not found at ~/.claude/agents/"
    log_info "Agents will resolve from bundled_prompts/ (L1 fallback)"
fi

# ═══════════════════════════════════════
step "5/10" "Python package"
# ═══════════════════════════════════════
cd "$PROJECT_DIR"
if [ -f "$PROJECT_DIR/src/code_factory/__init__.py" ]; then
    # Running from repo — editable install
    if command -v uv &>/dev/null; then
        INSTALL_LOG=$(mktemp)
        uv pip install -e . 2>"$INSTALL_LOG" && log_ok "code-factory (editable)" || {
            log_warn "pip install failed (see log below)"
            cat "$INSTALL_LOG" >&2
        }
        rm -f "$INSTALL_LOG"
    else
        INSTALL_LOG=$(mktemp)
        pip install -e . 2>"$INSTALL_LOG" && log_ok "code-factory (editable)" || {
            log_warn "pip install failed (see log below)"
            cat "$INSTALL_LOG" >&2
        }
        rm -f "$INSTALL_LOG"
    fi
else
    # Running from npm package or standalone — install from PyPI
    if command -v uv &>/dev/null; then
        INSTALL_LOG=$(mktemp)
        uv pip install code-factory 2>"$INSTALL_LOG" && log_ok "code-factory (from PyPI)" || {
            log_warn "pip install failed (see log below)"
            cat "$INSTALL_LOG" >&2
        }
        rm -f "$INSTALL_LOG"
    else
        INSTALL_LOG=$(mktemp)
        pip install code-factory 2>"$INSTALL_LOG" && log_ok "code-factory (from PyPI)" || {
            log_warn "pip install failed (see log below)"
            cat "$INSTALL_LOG" >&2
        }
        rm -f "$INSTALL_LOG"
    fi
fi

if python3 -c "from code_factory.pipeline import SprintPipeline" 2>/dev/null; then
    log_ok "Import verification"
else
    log_warn "Import verification failed"
fi

# ═══════════════════════════════════════
step "6/10" "Hook registration"
# ═══════════════════════════════════════
FRAGMENT="$SKILL_DIR/hooks/settings-fragment.json"
HOOKS_DIR="$SKILL_DIR/hooks"

if [ -f "$FRAGMENT" ]; then
    python3 -c "
import json, sys
from pathlib import Path

settings_path = Path(sys.argv[1])
fragment_path = Path(sys.argv[2])
hooks_dir = sys.argv[3]  # absolute path to hooks directory

# Load existing settings
if settings_path.exists():
    settings = json.loads(settings_path.read_text())
else:
    settings = {}

# Load fragment and resolve relative paths to absolute
fragment = json.loads(fragment_path.read_text())
for hook_type in ('PreToolUse', 'PostToolUse'):
    for hook in fragment.get('hooks', {}).get(hook_type, []):
        # New format: hooks is array of {type, command}
        for inner in hook.get('hooks', []):
            cmd = inner.get('command', '')
            if 'skill/hooks/' in cmd:
                script_name = cmd.split('skill/hooks/')[-1]
                inner['command'] = f'bash {hooks_dir}/{script_name}'

# Merge hooks (idempotent — don't duplicate)
existing_hooks = settings.get('hooks', {})
for hook_type in ('PreToolUse', 'PostToolUse'):
    existing = existing_hooks.get(hook_type, [])
    # Extract commands from both old and new format for dedup
    def get_cmd(h):
        if 'hooks' in h and h['hooks']:
            return h['hooks'][0].get('command', '')
        return h.get('command', '')
    existing_cmds = {get_cmd(h) for h in existing}
    for new_hook in fragment.get('hooks', {}).get(hook_type, []):
        if get_cmd(new_hook) not in existing_cmds:
            existing.append(new_hook)
    existing_hooks[hook_type] = existing

settings['hooks'] = existing_hooks

# Backup and write
if settings_path.exists():
    backup = settings_path.with_suffix('.json.bak')
    backup.write_text(settings_path.read_text())
settings_path.write_text(json.dumps(settings, indent=2))
" "$SETTINGS" "$FRAGMENT" "$HOOKS_DIR" && log_ok "8 hooks registered (absolute paths)" || log_warn "Hook registration failed"
else
    log_warn "settings-fragment.json not found"
fi

# ═══════════════════════════════════════
step "7/10" "Host-specific setup ($DETECTED_HOST)"
# ═══════════════════════════════════════

HOST_INSTALLER="$SKILL_DIR/hosts/$DETECTED_HOST/install.sh"
if [ -f "$HOST_INSTALLER" ]; then
    if [ "$FORCE" = true ] || [ ! -f "$FACTORY_SKILLS/hosts/$DETECTED_HOST/config.json" ]; then
        bash "$HOST_INSTALLER"
        log_ok "Host-specific installer ran: $DETECTED_HOST"
        INSTALLED=$((INSTALLED + 1))
    else
        log_info "Host $DETECTED_HOST already configured (use --force to reinstall)"
    fi
elif [ "$DETECTED_HOST" = "claude-code" ]; then
    log_ok "claude-code is the default host — no extra setup needed"
elif [ "$DETECTED_HOST" = "cursor" ]; then
    # Cursor uses .cursor/ directory — generate .cursorrules if possible
    if python3 -c "from code_factory.hosts.cursor import CursorAdapter" 2>/dev/null; then
        log_ok "CursorAdapter available — .cursorrules can be generated via /factory:init"
    else
        log_info "CursorAdapter not importable — install code-factory package first"
    fi
else
    log_info "No host-specific installer found for $DETECTED_HOST"
fi

# ═══════════════════════════════════════
step "8/10" "External dependencies"
# ═══════════════════════════════════════

# GSD
if [ -d "$HOME/.claude/get-shit-done" ] && [ -f "$CLAUDE_DIR/commands/gsd/autonomous.md" ]; then
    GSD_VER=$(cat "$HOME/.claude/get-shit-done/VERSION" 2>/dev/null || echo "unknown")
    log_ok "GSD v${GSD_VER} (required)"
else
    log_warn "GSD not found — installing..."
    if npx -y get-shit-done-cc@latest --claude --global 2>/dev/null; then
        log_ok "GSD installed"
        INSTALLED=$((INSTALLED + 1))
    else
        log_fail "GSD install failed"
        echo "    Manual: npx -y get-shit-done-cc@latest --claude --global"
        ERRORS=$((ERRORS + 1))
    fi
fi

# CEK
if [ -f "$SKILLS_DIR/sdd-brainstorm/SKILL.md" ] && [ -f "$SKILLS_DIR/reflexion-critique/SKILL.md" ]; then
    log_ok "CEK — installed (required)"
else
    log_warn "CEK not found — installing..."
    if npx skills add NeoLabHQ/context-engineering-kit --yes --global 2>/dev/null; then
        log_ok "CEK installed (66 skills)"
        INSTALLED=$((INSTALLED + 1))
    else
        log_fail "CEK install failed"
        echo "    Manual: npx skills add NeoLabHQ/context-engineering-kit --yes --global"
        ERRORS=$((ERRORS + 1))
    fi
fi

# find-skill
if [ -d "$SKILLS_DIR/find-skill" ] && [ -f "$SKILLS_DIR/find-skill/cache/catalogue.json" ]; then
    log_ok "find-skill (required)"
else
    log_warn "find-skill not found — required for L3 fallback chain"
    echo "    Install: npx skills add find-skill --yes --global"
    ERRORS=$((ERRORS + 1))
fi

# Build skill (open-source)
if [ -d "$HOME/.claude/skills/build" ] && [ -d "$HOME/.claude/skills/build/.git" ]; then
    BUILD_VER=$(git -C "$HOME/.claude/skills/build" log --oneline -1 2>/dev/null | head -c 7)
    log_ok "Build skill (open-source, $BUILD_VER)"
else
    log_warn "Build skill not from open-source repo (installed in Step 3)"
fi

# Memory Bank
if [ -d "$SKILLS_DIR/memory-bank" ]; then
    log_ok "memory-bank (required)"
else
    log_fail "memory-bank not installed"
    ERRORS=$((ERRORS + 1))
fi

# Recommended
echo ""
echo -e "${BOLD}Recommended skills (enhance agent capabilities):${NC}"

SKILL_DESCS=(
    "backend-development:Backend specialist agents (10 roles)"
    "frontend-development:Frontend specialist agents (React, Vue, CSS)"
    "python-development:Python specialist agents (3 roles)"
    "tdd-workflows:TDD orchestration and code review"
    "ui-design:UI design specialist agents (3 roles)"
)

SKIPPED=0
for ENTRY in "${SKILL_DESCS[@]}"; do
    DEP="${ENTRY%%:*}"
    DESC="${ENTRY#*:}"
    if [ -d "$SKILLS_DIR/$DEP" ]; then
        log_ok "$DEP (already installed)"
    elif ask_install "$DEP" "$DESC"; then
        log_info "Installing $DEP..."
        if npx skills add "$DEP" --yes --global 2>/dev/null; then
            log_ok "$DEP installed"
            INSTALLED=$((INSTALLED + 1))
        else
            log_warn "$DEP install failed (manual: npx skills add $DEP --yes --global)"
        fi
    else
        log_info "Skipped $DEP"
        SKIPPED=$((SKIPPED + 1))
    fi
done

# claude-code-harness
if [ -d "$SKILLS_DIR/claude-code-harness" ] || [ -f "$SKILLS_DIR/harness-plan/SKILL.md" ]; then
    log_ok "claude-code-harness (already installed)"
elif ask_install "claude-code-harness" "Harness review and release workflows"; then
    log_info "Installing claude-code-harness..."
    if git clone https://github.com/Chachamaru127/claude-code-harness.git "$SKILLS_DIR/claude-code-harness" 2>/dev/null; then
        log_ok "claude-code-harness installed"
        INSTALLED=$((INSTALLED + 1))
    else
        log_warn "claude-code-harness install failed"
    fi
else
    log_info "Skipped claude-code-harness"
    SKIPPED=$((SKIPPED + 1))
fi

# ═══════════════════════════════════════
step "9/10" "Settings verification"
# ═══════════════════════════════════════

# Agent Teams
if [ -f "$SETTINGS" ]; then
    if grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" "$SETTINGS"; then
        log_ok "Agent Teams enabled"
    else
        log_fail "Agent Teams NOT enabled"
        echo "    Add to ~/.claude/settings.json -> env:"
        echo '    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"'
        ERRORS=$((ERRORS + 1))
    fi
else
    log_warn "settings.json not found"
fi

# Global factory directory
mkdir -p "$HOME/.claude/factory/projects"
log_ok "Global storage: ~/.claude/factory/projects/"

# ═══════════════════════════════════════
step "10/10" "Stack detection"
# ═══════════════════════════════════════
python3 -c "
from code_factory.stack_detector import StackDetector
from pathlib import Path
profile = StackDetector().detect(Path.cwd())
if profile.languages:
    print(f'  Languages: {\", \".join(profile.languages)}')
if profile.frameworks:
    print(f'  Frameworks: {\", \".join(profile.frameworks)}')
if profile.build_tools:
    print(f'  Build tools: {\", \".join(profile.build_tools)}')
if profile.package_managers:
    print(f'  Package managers: {\", \".join(profile.package_managers)}')
if profile.suggested_plugins:
    print(f'  Suggested plugins: {\", \".join(profile.suggested_plugins)}')
if not profile.languages:
    print('  No stack detected in current directory')
" 2>/dev/null || log_info "Stack detection skipped (install code-factory first)"

# ═══════════════════════════════════════
# Summary
# ═══════════════════════════════════════
echo ""
echo -e "${BOLD}=== Installation Complete ===${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}Success!${NC} ($INSTALLED new components)"
    if [ "${SKIPPED:-0}" -gt 0 ]; then
        echo -e "  ${YELLOW}Skipped $SKIPPED recommended skill(s)${NC}"
    fi
else
    echo -e "  ${YELLOW}${BOLD}Completed with $ERRORS issues${NC}"
fi
echo ""
echo "  Host:      $DETECTED_HOST"
echo "  Commands:  6 (/factory:init, :goal, :start, :status, :pause, :resume)"
echo "  Agents:    L0 global (~/.claude/agents/) + open-source build skill agents"
echo "  Hooks:     8 enforcement hooks"
echo "  Runtime:   $RUNTIME"
echo ""
echo "  Next: Run /factory:init in your project"
echo ""

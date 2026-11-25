---
name: "source-command-install-skill"
description: "Install a skill from GitHub into any of Codex, Codex, OpenCode, Cursor (auto-converts format)"
---

# source-command-install-skill

Use this skill when the user asks to run the migrated source command `install-skill`.

## Command Template

# /install-skill

Install a skill into one or more AI agents with automatic format conversion.

## Input

User provides:
- `owner/repo` — GitHub short reference
- Full URL — `https://github.com/owner/repo`
- Skill name — looked up in catalogue (`~/.Codex/skills/find-skill/cache/catalogue.json`)

Optional flags (pass-through to the installer):
- `--target Codex|codex|opencode|cursor|all` — default: **Codex** (current agent)
- `--name NAME` — override skill name (for mono-repos, pick a sub-skill)
- `--force` — overwrite existing install
- `--dry-run` — show actions without writing

## Workflow

### Step 1 — Confirm with user

Parse arguments and **preview** before running:
- Skill source (resolved URL)
- Targets (list of agents)
- Is it already installed? (check `$HOME/.Codex/skills/$NAME`, etc.)

Ask: "Install `<name>` into `<targets>`? (y/n)"

### Step 2 — Run universal installer

```bash
~/.Codex/skills/find-skill/scripts/install-skill.sh \
  "$SKILL_SRC" \
  --target Codex \
  [--name $NAME] \
  [--force]
```

The script handles:
- Git clone to temp
- SKILL.md detection (supports mono-repos via `find -maxdepth 4`)
- Frontmatter parsing (name, description)
- Per-target install:
  - `Codex` / `codex` → copy folder with SKILL.md as-is
  - `opencode` → convert frontmatter → single `.md` file in `~/.config/opencode/command/`
  - `cursor` → convert frontmatter → single `.md` file in `~/.cursor/commands/`

### Step 3 — Report

Show what was installed where:
- Each target + file path
- Converted vs. native format
- How to activate (usually: restart the agent)

## Multi-agent example

```
/install-skill fockus/Codex-skill-memory-bank --target all
```

→ installs memory-bank into:
- `~/.Codex/skills/memory-bank/SKILL.md` (native)
- `~/.codex/skills/memory-bank/SKILL.md` (same format)
- `~/.config/opencode/command/memory-bank.md` (converted to OpenCode command)
- `~/.cursor/commands/memory-bank.md` (converted to Cursor command)

## Mono-repo example

```
/install-skill obra/superpowers-skills --name brainstorming --target cursor
```

→ picks the `brainstorming/SKILL.md` sub-skill from the repo and installs it into Cursor.

## Rules

- **Always confirm before installing** — especially with `--target all`
- **Warn if skill already exists** — recommend `--force` if overwriting intentional
- **Show the converted file format** for OpenCode/Cursor so user knows what changed
- **After install, tell user to restart the target agent** — new files aren't picked up mid-session
- **If the source skill has no SKILL.md** — script falls back to README.md but warn user the conversion may be imperfect

## See also

- `/find-skill <query>` — search the catalogue before installing
- Shared installer script: `~/.Codex/skills/find-skill/scripts/install-skill.sh --help`

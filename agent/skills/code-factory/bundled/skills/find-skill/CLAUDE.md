# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Claude Code **skill** (`find-skill`) that searches, recommends, and installs other Claude Code skills from multiple community and official sources. It maintains a local JSON catalogue that auto-updates monthly via cron.

## Key Files

- `SKILL.md` — Skill definition and prompt (the instructions Claude follows when the skill is invoked)
- `update-skills-catalogue.sh` — Shell script that fetches skills from 5 sources (Anthropic official, travisvn, BehiSecc, VoltAgent, SkillsMP API), deduplicates them, and writes `cache/catalogue.json`
- `cache/catalogue.json` — Local skill catalogue (generated, not committed)
- `cache/last_update.txt` — Unix timestamp of last catalogue update

## How It Works

1. On invocation, checks catalogue freshness (>30 days = stale)
2. Searches `cache/catalogue.json` first (local, fast)
3. Falls back to SkillsMP live API if <2 local results (requires `SKILLSMP_API_KEY`)
4. Presents max 3 options ranked by source trust: Anthropic > travisvn > BehiSecc/VoltAgent > SkillsMP
5. Installs via `git clone` to `~/.claude/skills/` after user confirmation

## Commands

```bash
# Run catalogue update manually
~/.claude/skills/find-skill/update-skills-catalogue.sh

# Check last update date
cat ~/.claude/skills/find-skill/cache/last_update.txt | xargs -I{} date -r {}
```

## Notes

- The update script sources `~/.zshrc` and `~/.shared-config/.env.shared` to load env vars (notably `SKILLSMP_API_KEY`)
- Cron schedule (when enabled): daily at 9h — `0 9 * * *`
- All text in `SKILL.md` is in French; maintain this convention

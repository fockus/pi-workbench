---
name: factory:projects
description: "List factory projects, switch context"
argument-hint: "[list | switch <name> | info <name> | archive <name>]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<objective>
Управление реестром проектов Code Factory.
Просмотр, переключение, архивирование.
</objective>

<context>
Arguments: $ARGUMENTS
</context>

<process>

## Определить действие

Parse $ARGUMENTS:
- пусто или "list" → показать все проекты
- "switch <name>" → переключиться на проект
- "info <name>" → подробности о проекте
- "archive <name>" → архивировать проект

## Action: list (default)

Прочитай `~/.claude/factory/projects/registry.yaml`

Также сканируй текущую директорию — есть ли `.factory/` здесь?

```
═══════════════════════════════════════════════════
  CODE FACTORY — PROJECTS
═══════════════════════════════════════════════════

  #  Name              Status       Stack         Progress     Path
  ── ──────────────── ──────────── ───────────── ──────────── ─────────
  1  my-saas          running      python,react  42%  (5/12)  /Users/.../my-saas
  2  cli-tool         paused       go            80%  (8/10)  /Users/.../cli-tool
  3  api-gateway      completed    typescript    100% (15/15) /Users/.../api-gw

  → текущий проект: {current_dir} {есть .factory/? да/нет}

  Действия:
    /factory:projects switch <name>   — переключиться
    /factory:projects info <name>     — подробности
    /factory:projects archive <name>  — архивировать
═══════════════════════════════════════════════════
```

## Action: switch <name>

1. Найди проект в реестре по имени
2. Проверь что путь существует
3. Выведи: "Переключись в директорию {path} и запусти /factory:status или /factory:resume"

(Claude Code работает в текущей директории, переключение = cd в другую папку)

## Action: info <name>

1. Найди проект в реестре
2. Прочитай его `.factory/STATE.md` (по пути из реестра)
3. Прочитай его `.factory/config.yaml`
4. Выведи подробности:

```
═══════════════════════════════════════
  Project: {name}
═══════════════════════════════════════
  Path: {path}
  Stack: {stack}
  Status: {status}
  Storage: {local|global|both}

  Goals: {N}
  Sprints: {done}/{total}
  Tasks: {done}/{total}
  Coverage: {pct}%
  Judge avg: {score}/5

  Created: {date}
  Last activity: {date}

  Config: {path}/.factory/config.yaml
═══════════════════════════════════════
```

## Action: archive <name>

1. Подтверди с пользователем: "Архивировать проект {name}? (y/n)"
2. Обнови registry.yaml: status → archived
3. Если storage=global → перемести в `~/.claude/factory/archive/{name}/`
4. Выведи подтверждение

</process>

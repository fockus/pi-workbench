---
name: "source-command-factory-help"
description: "Show how Code Factory works — commands, architecture, workflow"
---

# source-command-factory-help

Use this skill when the user asks to run the migrated source command `factory-help`.

## Command Template

# /factory:help

Прочитай `skill/SKILL.md` (или `~/.Codex/skills/code-factory/SKILL.md`) и покажи справку:

```
═══════════════════════════════════════════════════════════════
  CODE FACTORY v2 — Help
═══════════════════════════════════════════════════════════════

  Автономная система разработки с AI-агентами.
  Один goal → спринты → параллельные команды → quality gates → готовый код.

  ─── Quick Start ─────────────────────────────────────────────

  1. /factory:init          Инициализация в текущем проекте
  2. /factory:goal           Поставить цель разработки
  3. /factory:start          Запустить спринты
  4. /factory:status         Посмотреть прогресс

  ─── Команды ─────────────────────────────────────────────────

  /factory:init             Создать .factory/ с config, schema, agents
  /factory:goal             Декомпозировать цель → epics → tasks → sprints
  /factory:start            Запустить sprint execution loop
                            --sprint N | --from N --to M | --dry-run
  /factory:plan-and-start   Goal + Start в одну команду
  /factory:status           Dashboard: прогресс, качество, бюджет
  /factory:pause            Пауза с сохранением состояния
  /factory:resume           Возобновить с точки паузы
  /factory:limits           Лимиты: спринты, операции, бюджет
  /factory:projects         Реестр проектов: list, switch, info, archive
  /factory:migrate          Миграция v1 → v2 (SQLite)
  /factory:help             Эта справка

  ─── Архитектура ─────────────────────────────────────────────

  Orchestrator (Opus)
  ├── Tech Lead (Opus)        координация, pre-review
  │   └── dev-1..N (Sonnet)   TDD реализация
  ├── QA Lead (Sonnet)        тест-координация, покрытие
  │   └── tester-1..N (Sonnet)
  ├── Reviewer (Opus)         архитектурное ревью
  ├── Judge (Opus)            scoring 1-5
  ├── Supervisor (Sonnet)     мониторинг, health checks
  ├── PM Agent (Sonnet)       бэклог, спринты
  └── Architect (Opus)        дизайн, ADR

  ─── Sprint Loop (9 шагов) ───────────────────────────────────

  1. init → 2. pm_analysis → 3. contract → 4. team
  5. implementation → 6. evaluation → 7. reflexion
  8. checkpoint → 9. synced

  ─── Принципы ────────────────────────────────────────────────

  • Generator ≠ Evaluator
  • Disposable Agents + Persistent State (SQLite)
  • Single Writer — каждый файл принадлежит одному агенту
  • Hard Thresholds — Sprint Contract: pass/fail
  • Budget Enforcement — hard stop при превышении

═══════════════════════════════════════════════════════════════
```

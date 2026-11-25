# Code Factory

**Автономная система разработки проектов для Claude Code.**

Code Factory берёт описание цели (фича или целый проект) и автономно выполняет все этапы: требования, архитектура, декомпозиция, реализация, тестирование, review, документация и аудит.

## Возможности

- **E2E автономность** — от идеи до готового проекта
- **Dynamic Agent Teams** — агенты создаются по потребности спринта
- **Sprint Contracts** — hard thresholds на каждом критерии
- **Generator ≠ Evaluator** — разделение исполнителя и оценщика (Anthropic Harness)
- **Self-Improvement** — 3 уровня рефлексии с обновлением промптов
- **Multi-Project** — контекст каждого проекта хранится отдельно
- **Skill Discovery** — автоматический поиск и установка нужных скилов
- **Budget Control** — hard stop при превышении лимитов

## Установка

```bash
# Клонировать в скилы Claude Code
git clone https://github.com/YOUR_USERNAME/code-factory.git ~/.claude/skills/code-factory

# Запустить установщик
bash ~/.claude/skills/code-factory/install.sh
```

## Требования

- Claude Code (latest)
- Agent Teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)

### Зависимости (устанавливаются автоматически)

- **memory-bank** — долгосрочная память проекта (bundled)
- **find-skill** — поиск и установка скилов (bundled)
- **pipeline** — Team Mode оркестрация (bundled)
- **implement** — chain workflow (bundled)
- **build** — GSD execution engine (bundled)
- **context-engineering-kit** — SDD, Reflexion, Kaizen и др. (npm)
- **claude-code-harness** — harness pattern skills (git, optional)

## Использование

### 1. Инициализация

```
/factory:init
```

Проводит интервью для настройки pipeline:
- Тип проекта, стек, quality gates
- Уровень автономии (full auto / confirm per sprint / confirm per phase)
- Лимиты (sprints, operations, budget)

### 2. Определение цели

```
/factory:goal "SaaS платформа для управления задачами"
```

Проводит бриф-интервью, затем:
- 3 параллельных исследователя (tech, code, business)
- Архитектор проектирует систему
- PM декомпозирует на Goals → Epics → Tasks → Sprints
- Sprint Contracts с hard criteria

### 3. Автономный запуск

```
/factory:start                    # Все спринты
/factory:start --sprint 3         # Конкретный спринт
/factory:start --from 5 --to 10   # Диапазон
/factory:start --dry-run           # Только план
```

### 4. Мониторинг

```
/factory:status    # Dashboard
/factory:pause     # Пауза с checkpoint
/factory:resume    # Восстановление
/factory:limits    # Лимиты
/factory:projects  # Все проекты
```

## Архитектура

```
Orchestrator (Opus)
├── Analyst → requirements, user stories
├── Architect → design, ADR, interfaces
├── PM Agent → backlog, sprints
├── Dev Team (Sonnet x1-3) → TDD implementation
├── QA Team (Sonnet x1-2) → testing
├── Evaluator (Opus) → independent assessment
├── Judge (Opus) → scores 1-5
├── Reviewer (Opus) → architecture review
└── Supervisor → health, optimization
```

### Sprint Execution Loop

```
for each Sprint:
  1. Baseline Check
  2. Sprint Contract
  3. Team Assembly (dynamic)
  4. Implementation (parallel, TDD)
  5. Evaluation (Generator ≠ Evaluator)
  6. Sprint Report + Reflexion
  7. Checkpoint (git, STATE)
  8. Heartbeat (limits, goal)
```

### Storage Modes

| Mode | Location | Use Case |
|------|----------|----------|
| `local` | `.factory/` в проекте | Один проект (default) |
| `global` | `~/.claude/factory/projects/` | Доступ из любого места |
| `both` | local + global sync | Multi-workspace |

## Принципы

Основано на исследованиях:

- **[Anthropic Harness](https://www.anthropic.com/engineering/harness-design-long-running-apps)** — Generator-Evaluator, Sprint Contracts, Context Management
- **[Paperclip](https://github.com/paperclipai/paperclip)** — Org hierarchy, Heartbeat cycles, Issue-based communication
- **[MetaGPT](https://github.com/geekan/MetaGPT)** — SOP Pipeline, Role-based agents
- **[Google's 8 Multi-Agent Patterns](https://www.infoq.com/news/2026/01/multi-agent-design-patterns/)** — Fan-Out, Coordinator, Generator+Critic

## License

MIT

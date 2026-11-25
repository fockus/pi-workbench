---
name: build:quick
description: Quick task with GSD execution + project rules + MB sync
argument-hint: "[--discuss] [--research] [--full] [--reflexion]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
  - Agent
---

<objective>
Быстрая задача через GSD quick mode с соблюдением проектных правил и синхронизацией Memory Bank.

Для ad-hoc задач, которые не требуют полного phase-цикла, но должны:
- Следовать TDD/Contract-First/SOLID
- Получить atomic commit
- Обновить Memory Bank
</objective>

<context>
$ARGUMENTS

Flags (передаются в GSD):
- `--discuss` — обсудить серые зоны перед планированием
- `--research` — исследовать подходы перед планированием
- `--full` — план-чекер + верификация после execute
- `--reflexion` — после execution запустить рефлексию и root cause analysis при ошибках
</context>

<process>

## Step 0: Load MB Context

1. Прочитай `.memory-bank/STATUS.md` и `.memory-bank/checklist.md`
2. Краткое резюме текущего состояния (1-2 предложения)

## Step 1: Execute GSD Quick

Вызови `/gsd:quick` с переданными флагами и описанием задачи от пользователя.

Дождись завершения.

## Step 2: MB Sync

После завершения GSD quick:

1. **checklist.md** — если задача была в списке → ⬜→✅. Если новая → не добавлять (quick tasks вне roadmap)
2. **STATUS.md** — обнови метрики если изменились (тесты, coverage)
3. **progress.md** — APPEND запись:

```markdown
## {date}

### Quick: {название задачи}
- {что сделано — 2-3 пункта}
- Тесты: {число} green
```

4. **lessons.md** — если обнаружен антипаттерн во время работы
5. **BACKLOG.md** — если принято архитектурное решение (ADR)

## Step 2.5: Reflexion (опционально)

Если во время execution были проблемы (failed tests, multiple retries, unexpected issues):

Вызови `/reflexion-reflect` для self-analysis:
- Что пошло не так и почему
- Как избежать в будущем
- Нужно ли обновить lessons.md

Если проблема глубокая (причина неочевидна):
- Вызови `/kaizen-why` для 5 Whys root cause analysis
- Результат → `.memory-bank/lessons.md`

## Step 3: Report

Выведи краткий итог:
- Что сделано
- Commit hash
- Следующий шаг (если есть)

</process>

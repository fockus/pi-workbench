# Note Frontmatter Template

Все заметки в `{MB_ROOT}/notes/` создаются с YAML frontmatter для семантического поиска.

## Шаблон

```yaml
---
type: lesson | note | decision | pattern
tags: []
related_features: []
sprint: null
importance: high | medium | low
created: YYYY-MM-DD
---
```

## Поля

| Поле | Тип | Описание | Обязательное |
|------|-----|----------|-------------|
| `type` | enum | Тип заметки: `lesson` (антипаттерн/инсайт), `note` (знания), `decision` (ADR/выбор), `pattern` (переиспользуемое решение) | да |
| `tags` | string[] | Теги контента. LLM извлекает автоматически из содержимого. 3-7 тегов. Примеры: `[testing, mock, integration, pytest]` | да |
| `related_features` | string[] | ID фич из features.json или sprint tasks. Пример: `[F-003, F-007]` | нет |
| `sprint` | int/null | Номер спринта при создании. `null` если вне спринта | нет |
| `importance` | enum | `high` -- patterns, decisions, critical lessons. `medium` -- general notes, observations. `low` -- minor observations, trivial fixes | да |
| `created` | date | Дата создания в формате YYYY-MM-DD | да |

## Правила присвоения importance

- **high**: type == `pattern` или type == `decision`, или содержит критический баг/architectural insight
- **medium**: type == `note`, general knowledge
- **low**: type == `lesson` с узким скоупом (одноразовый фикс), observations

## Правила генерации tags

LLM извлекает теги автоматически при создании заметки:
1. Анализируй содержание заметки (секции "Что сделано" и "Новые знания")
2. Извлеки 3-7 ключевых технических терминов
3. Нормализуй: lowercase, singular form, no spaces (используй дефис)
4. Приоритет: stack/framework > конкретная технология > общие паттерны
5. Добавь project-specific термины (из features.json если доступен)

## Пример заполненной заметки

```markdown
---
type: pattern
tags: [sqlite-vec, embedding, semantic-search, mcp, local-first]
related_features: [F-012]
sprint: 3
importance: high
created: 2026-03-29
---

# Local Semantic Search Pattern
Date: 2026-03-29 14:30

## Что сделано
- Реализован локальный semantic search через sqlite-vec
- Embedding: all-MiniLM-L6-v2 (384 dims)

## Новые знания
- sqlite-vec работает без внешних зависимостей, 50ms на 1K записей
- Для Memory Bank достаточно cosine similarity threshold 0.7
```

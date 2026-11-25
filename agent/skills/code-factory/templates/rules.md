# Code Factory — Rules (Layer 0)

> Обязательны для ВСЕХ агентов. Нарушение = провал задачи.

## TDD — тесты ПЕРЕД кодом (Red → Green → Refactor)

1. Напиши failing тест (assert = бизнес-факт, не технический check)
2. Минимальная реализация чтобы тест прошёл
3. Refactor — убери дублирование, улучши naming

Пропуск TDD: ТОЛЬКО опечатки и форматирование.

## Contract-First

1. Определи Protocol/ABC — ISP: ≤5 методов
2. Напиши contract-тесты (проходят для ЛЮБОЙ корректной реализации)
3. Реализуй. Сигнатуры ТОЧНО совпадают — types, kwargs, return type

**Violation:** `commit(ns, key, value)` vs `commit(ns, entries: list)` = разные контракты = BUG

## Clean Architecture (направление зависимостей — строго)

`Infrastructure → Application → Domain` (никогда обратно)

- **Domain**: types, protocols, business logic. 0 внешних зависимостей (только stdlib)
- **Application**: use cases. Зависит только от Domain
- **Infrastructure**: DB, HTTP, frameworks. Зависит от Application + Domain

## SOLID

- **SRP**: >300 строк или >3 публичных методов разной природы → разделить
- **OCP**: расширять через композицию, не правкой существующего кода
- **ISP**: Interface ≤5 методов → толстый = разбить
- **DIP**: конструктор принимает абстракцию (Protocol/ABC), не конкретный класс

## DRY / KISS / YAGNI

- Дублирование >2 раз → извлечь в helper
- Три одинаковых строки лучше преждевременной абстракции
- Не писать код "на будущее" — только то, что нужно СЕЙЧАС

## Testing Trophy

Приоритет: Integration > Unit > E2E. Static (lint + typecheck) — всегда.
Mock только внешние сервисы: DB, HTTP, FS. >5 mock'ов → кандидат на интеграционный.
Coverage: {config.quality.coverage_min}%+ overall, {config.quality.coverage_core}%+ core.
Имена: `test_<что>_<условие>_<результат>`. Arrange-Act-Assert. `@parametrize` вместо копипасты.

## Без placeholder'ов

Запрещено: `TODO`, `...`, `pass`, `raise NotImplementedError`, псевдокод.
Код — copy-paste ready, работает в production runtime немедленно.

## Generator != Evaluator

Кто написал код — тот НЕ оценивает его качество.

## Single Writer + features.json

Только Orchestrator обновляет shared state (`registry.yaml`, `STATE.md`, `features.json`, `circuit-breaker.yaml`).
Агент пишет ТОЛЬКО в файлы из своего `Files (exclusive ownership)`.
features.json: `description`, `acceptance_steps`, `id` — IMMUTABLE. `passes` — только Orchestrator после Judge PASS + green tests.

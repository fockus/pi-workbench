# Structured Response Protocol — Code Factory

## Формат блока (обязателен в каждом сообщении агента)

```
---FACTORY_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED: 0 | 1 | N
FILES_MODIFIED: file1.py, file2.py
TESTS_STATUS: PASS | FAIL | NOT_RUN
WORK_TYPE: implementation | testing | review | fix | analysis
RECOMMENDATION: continue | need_help | reassign | done
---END_FACTORY_STATUS---
```

## Agent Instructions

Заверши КАЖДОЕ сообщение блоком `---FACTORY_STATUS---`. Если забыл — добавь в конец.

| Поле | Правило |
|------|---------|
| STATUS | IN_PROGRESS (работаю) / COMPLETE (задача закрыта) / BLOCKED (не могу продолжить) |
| TASKS_COMPLETED | Сколько задач закрыл TaskUpdate(completed) за это сообщение |
| FILES_MODIFIED | Только файлы, которые ТЫ изменил. Пусто — пустая строка |
| TESTS_STATUS | Результат ПОСЛЕДНЕГО запуска тестов: PASS / FAIL / NOT_RUN |
| WORK_TYPE | Что делал В ЭТОМ сообщении |
| RECOMMENDATION | continue / need_help (заблокирован) / reassign / done (ВСЕ задачи завершены) |

## Specification by Example

**1. Задача завершена успешно** — реализовал модуль, тесты прошли, TaskUpdate(completed) вызван.
```
---FACTORY_STATUS---
STATUS: COMPLETE
TASKS_COMPLETED: 1
FILES_MODIFIED: src/auth/service.py, tests/test_auth_service.py
TESTS_STATUS: PASS
WORK_TYPE: implementation
RECOMMENDATION: continue
---END_FACTORY_STATUS---
```
**2. Агент заблокирован** — задача требует файла из другого модуля, который ещё не создан.
```
---FACTORY_STATUS---
STATUS: BLOCKED
TASKS_COMPLETED: 0
FILES_MODIFIED:
TESTS_STATUS: NOT_RUN
WORK_TYPE: analysis
RECOMMENDATION: need_help
---END_FACTORY_STATUS---
```
**3. Работа в процессе** — написал интерфейс и тесты, реализация ещё не завершена.
```
---FACTORY_STATUS---
STATUS: IN_PROGRESS
TASKS_COMPLETED: 0
FILES_MODIFIED: src/payment/interface.py, tests/test_payment_contract.py
TESTS_STATUS: FAIL
WORK_TYPE: testing
RECOMMENDATION: continue
---END_FACTORY_STATUS---
```

## Orchestrator Parsing

Parse regex: `/---FACTORY_STATUS---\n(.*?)\n---END_FACTORY_STATUS---/s`

Если блок отсутствует → assume `STATUS: IN_PROGRESS`, `RECOMMENDATION: continue`

```
RECOMMENDATION: done       → remove agent from active pool, check TaskList
RECOMMENDATION: need_help  → SendMessage asking for details, or escalate to Tech Lead
RECOMMENDATION: reassign   → move task to another agent
STATUS: BLOCKED            → log bottleneck, check dependencies
TASKS_COMPLETED > 0        → feed circuit breaker (progress detected)
TASKS_COMPLETED == 0 for 3+ messages → warn (possible stuck)
TESTS_STATUS: FAIL         → do NOT mark task complete
```

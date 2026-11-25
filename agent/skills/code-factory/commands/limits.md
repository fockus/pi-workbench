---
name: factory:limits
description: "View and update factory limits"
argument-hint: "[--sprints N] [--operations N] [--budget N]"
allowed-tools:
  - Read
  - Write
  - Edit
  - AskUserQuestion
---

<objective>
Показать текущие лимиты и использование. Обновить лимиты если указаны аргументы.
</objective>

<context>
Arguments: $ARGUMENTS
</context>

<process>

## Без аргументов — показать

Прочитай `.factory/config.yaml` и `.factory/STATE.md`.

```
═══════════════════════════════════════
  CODE FACTORY — LIMITS
═══════════════════════════════════════

              Used    /   Limit     Status
  Sprints:    {N}     /   {max}     {ok|warning|exceeded}
  Operations: {N}     /   {max}     {ok|warning|exceeded}
  Budget:     ${N}    /   ${max}    {ok|warning|exceeded}

  Autonomy: {full_auto|confirm_sprint|confirm_phase}

  Обновить:
    /factory:limits --sprints 100
    /factory:limits --budget 500
    /factory:limits --operations 2000
═══════════════════════════════════════
```

## С аргументами — обновить

Parse аргументы (--sprints N, --operations N, --budget N).
Обнови `.factory/config.yaml` секцию `limits`.
Выведи обновлённые лимиты.

</process>

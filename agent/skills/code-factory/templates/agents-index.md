# Code Factory — Agent Context Index

> Этот файл = TABLE OF CONTENTS. Агент читает index + task-relevant docs, НЕ всё целиком.
> Правило: "Context is a scarce resource. A giant instruction file crowds out the task."

## Rules (ОБЯЗАТЕЛЬНО)
→ .factory/RULES.md (~60-80 строк, критические правила кода)

## Architecture
→ .factory/docs/architecture.md (модули, зависимости, интерфейсы, boundary rules)
→ .factory/docs/adr/ (архитектурные решения — ADR-NNN)

## Current Sprint
→ .factory/sprints/SPRINT-{current}.md (contract, задачи, acceptance criteria)

## Features Progress
→ .factory/features.json (какие features passing, общий прогресс)

## Patterns & Conventions
→ .factory/docs/patterns.md (naming, structure, код-конвенции проекта)

## Known Issues
→ .factory/docs/known-issues.md (workarounds, flaky tests, technical debt)

## Stack Reference
→ .factory/docs/stack/ (per-framework docs, best practices, API reference links)

## Agent Registry
→ .factory/agents/registry.yaml (кто активен, метрики, file ownership)

## Lessons Learned
→ {MB_ROOT}/lessons.md (антипаттерны из прошлых спринтов — НЕ повторять)

---

## Injection Rules (для Orchestrator)

При спавне агента, инжектируй:
1. **Leads (Tech Lead, QA Lead):** RULES.md + этот index + deep docs
2. **Workers (dev, tester, reviewer, judge):** RULES.md + task-relevant docs (без index — экономия context)
3. **По роли:**
   - developer → + architecture.md + patterns.md + sprint contract
   - tester → + patterns.md + known-issues.md + sprint contract
   - architect/reviewer → + architecture.md + adr/ + features.json
   - judge → + architecture.md + features.json
3. **По задаче:**
   - Если задача в domain/ → + architecture.md (domain section)
   - Если задача с external API → + stack/{api_name}.md
   - Если fix-task → + known-issues.md
4. **Правило обновления:** Если агент ошибся из-за нехватки контекста → обнови AGENTS.md (добавь ссылку на нужный doc), НЕ раздувай промпт

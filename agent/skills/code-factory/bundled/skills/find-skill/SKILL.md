---
name: "find-skill"
description: "\u041D\u0430\u0445\u043E\u0434\u0438\u0442 \u0438 \u0443\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442 Codex Skills \u0434\u043B\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u043A\u043E\u0433\u0434\u0430 \u043D\u0443\u0436\u0435\u043D \u0441\u043A\u0438\u043B \u0434\u043B\u044F \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438. \u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0440\u0430\u0437 \u0432 \u043C\u0435\u0441\u044F\u0446. \u041F\u0440\u0438\u043C\u0435\u0440\u044B: \"\u043D\u0430\u0439\u0434\u0438 \u0441\u043A\u0438\u043B \u0434\u043B\u044F Docker\", \"\u043F\u043E\u0438\u0449\u0438 \u0441\u043A\u0438\u043B\u044B \u0434\u043B\u044F \u0442\u0435\u0441\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F\", \"\u043F\u043E\u043A\u0430\u0436\u0438 \u0432\u0441\u0435 \u0441\u043A\u0438\u043B\u044B \u043F\u043E react\". \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B: limit (\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C), page (\u043F\u0430\u0433\u0438\u043D\u0430\u0446\u0438\u044F), --all (\u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435)."
---

# Find Skill — поиск и установка скилов

Ты — эксперт по поиску скилов с локальным каталогом (943+ скилов, 9 источников).

---

## Параметры вызова

Скил принимает аргументы в свободной форме. Парси их так:

| Формат | Пример | Значение |
|--------|--------|----------|
| `<запрос>` | `docker` | Поиск по ключевому слову, показать top 3 |
| `<запрос> --limit N` | `react --limit 10` | Показать N результатов |
| `<запрос> --all` | `design --all` | Показать ВСЕ найденные результаты |
| `<запрос> --page N` | `python --limit 5 --page 2` | Страница N (по `limit` на страницу) |
| `--top N` | `--top 20` | Показать top-N скилов по звёздам из всего каталога |
| `--stats` | `--stats` | Статистика каталога по источникам |
| `--category <cat>` | `--category design` | Все скилы категории |

**Значения по умолчанию:** limit=5, page=1.

---

## Этап 0 — Проверить свежесть каталога

```bash
CACHE_FILE="$HOME/.Codex/skills/find-skill/cache/catalogue.json"
LAST_UPDATE="$HOME/.Codex/skills/find-skill/cache/last_update.txt"

if [ ! -f "$LAST_UPDATE" ]; then
  echo "Каталог не инициализирован — нужно обновить"
  NEEDS_UPDATE=true
else
  LAST=$(cat "$LAST_UPDATE")
  NOW=$(date +%s)
  DIFF=$(( (NOW - LAST) / 86400 ))
  if [ "$DIFF" -gt 30 ]; then
    echo "Каталог устарел ($DIFF дней) — нужно обновить"
    NEEDS_UPDATE=true
  else
    echo "Каталог актуален (обновлён $DIFF дней назад)"
    NEEDS_UPDATE=false
  fi
fi
```

Если `NEEDS_UPDATE=true` — запусти `~/.Codex/skills/find-skill/update-skills-catalogue.sh`.

---

## Этап 1 — Понять запрос

Если запрос неясен — задай 1-2 вопроса:
- Какой стек/язык/фреймворк?
- Для какой конкретной задачи?

Если запрос ясен — сразу к этапу 2.

---

## Этап 2 — Поиск в локальном каталоге

```bash
cat ~/.Codex/skills/find-skill/cache/catalogue.json | \
  python3 -c "
import json, sys, re

data = json.load(sys.stdin)
query = 'QUERY'.lower()
limit = LIMIT        # заменить на число из параметра
page = PAGE          # заменить на число из параметра
show_all = SHOW_ALL  # True/False

# Приоритет источников (выше = надёжнее, больше бонус)
SOURCE_PRIORITY = {
    'Anthropic': 50,       # Официальные скилы Anthropic
    'travisvn': 30,        # Крупнейший курированный список (9.6K stars)
    'BehiSecc': 20,        # Второй по размеру список (5.6K stars)
    'VoltAgent': 15,       # Курированный агентский список
    'daymade': 15,         # Production-ready коллекция
    'alirezarezvani': 10,  # Большая коллекция (192+ скилов)
    'mxyhi': 10,           # ok-skills
    'ComposioHQ': 10,      # Курированный список
    'SkillsMP': 5,         # Маркетплейс (много, но менее проверены)
}

# Поиск: имя, описание, теги
results = []
for s in data['skills']:
    score = 0
    name_l = s['name'].lower()
    desc_l = s.get('description', '').lower()
    tags_l = [t.lower() for t in s.get('tags', [])]

    # Релевантность запросу
    if query == name_l:
        score = 100
    elif query in name_l:
        score = 50
    elif query in desc_l:
        score = 20
    elif any(query in t for t in tags_l):
        score = 10

    if score > 0:
        # Бонус за источник (приоритет доверия)
        source = s.get('source', '')
        source_bonus = SOURCE_PRIORITY.get(source, 0)

        # Бонус за звёзды (макс +20)
        try:
            stars = int(str(s.get('stars', 0) or 0).replace(',','').replace('+',''))
        except:
            stars = 0
        stars_bonus = min(stars / 1000, 20)

        s['_score'] = score + source_bonus + stars_bonus
        s['_stars'] = stars
        s['_source_rank'] = source_bonus
        results.append(s)

# Сортировка: score desc (включает source + stars), затем stars desc
results.sort(key=lambda x: (-x['_score'], -x['_stars']))

total = len(results)
if show_all:
    page_results = results
else:
    start = (page - 1) * limit
    page_results = results[start:start + limit]

total_pages = (total + limit - 1) // limit if not show_all else 1

output = {
    'total': total,
    'showing': len(page_results),
    'page': page if not show_all else 1,
    'total_pages': total_pages,
    'limit': limit,
    'results': page_results
}
print(json.dumps(output, indent=2, ensure_ascii=False))
"
```

---

## Этап 3 — Живой поиск (если в каталоге < 2 результатов)

### SkillsMP API:
```bash
source "$HOME/.Codex/skills/find-skill/.env" 2>/dev/null

# Поиск по ключевому слову
curl -s "https://skillsmp.com/api/v1/skills/search?q=QUERY&limit=LIMIT" \
  -H "Authorization: Bearer $SKILLSMP_API_KEY"

# AI семантический поиск
curl -s "https://skillsmp.com/api/v1/skills/ai-search?q=QUERY+CONTEXT" \
  -H "Authorization: Bearer $SKILLSMP_API_KEY"
```

---

## Этап 4 — Показать результаты

**Никогда не устанавливать без подтверждения.**

Формат вывода зависит от количества:

### Уровни доверия (по источнику):
```
Anthropic                → Официальный (зелёный)
travisvn / BehiSecc      → Курированный (жёлтый)
VoltAgent / daymade       → Сообщество-проверенный (жёлтый)
alirezarezvani / mxyhi / ComposioHQ → Сообщество (оранжевый)
SkillsMP                 → Маркетплейс (серый, проверять вручную)
```

### Компактный (до 5 результатов):
```
Найдено N скилов по запросу "QUERY":

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. [название] (РЕКОМЕНДОВАНО)
   Источник  : Anthropic        | Доверие: Официальный
   Описание  : [1-2 предложения]
   Звёзды    : [N]
   Repo      : [URL]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. [название]
   Источник  : SkillsMP         | Доверие: Маркетплейс — проверь repo
   ...

Установить? (1, 2, все, или нет)
```

### Табличный (6+ результатов):
```
Найдено N скилов по запросу "QUERY" (стр. PAGE/TOTAL_PAGES):

| #  | Название          | Источник   | Доверие | Звёзды | Описание (кратко)      |
|----|-------------------|-----------|---------|--------|------------------------|
| 1  | skill-name        | Anthropic | Офиц.   | 9600   | Краткое описание...    |
| 2  | another-skill     | travisvn  | Курир.  | 5600   | Краткое описание...    |
| 3  | some-skill        | SkillsMP  | Маркет. | 120    | Краткое описание...    |

Страница PAGE из TOTAL_PAGES. Следующая: /find-skill QUERY --page NEXT
Установить? (номер, диапазон 1-3, все, или нет)
```

Результаты автоматически отсортированы: сначала официальные и курированные, затем community, в конце маркетплейс. При одинаковом источнике — по звёздам.

---

## Этап 5 — Установить после подтверждения

```bash
mkdir -p ~/.Codex/skills
git clone [REPO_URL] ~/.Codex/skills/[SKILL_NAME]
echo "Skill [SKILL_NAME] установлен"

# Проверка
ls ~/.Codex/skills/[SKILL_NAME]/
head -10 ~/.Codex/skills/[SKILL_NAME]/SKILL.md
```

---

## Этап 6 — Подтвердить и объяснить

После установки:
1. Где установлен скил
2. Как активировать (`/skill-name` или автоматически)
3. Пример использования в текущем проекте

---

## Специальные команды

| Запрос | Действие |
|--------|----------|
| `обнови каталог` | Запустить `update-skills-catalogue.sh` |
| `когда обновлялся каталог?` | Показать дату из `last_update.txt` |
| `покажи весь каталог` | Все скилы по категориям |
| `--top 20` | Top-20 по звёздам |
| `--stats` | Статистика по источникам |
| `react --all` | Все скилы по запросу |
| `python --limit 10 --page 2` | Стр. 2 по 10 результатов |

---

## Правила

- **Никогда не устанавливать без подтверждения**
- **Сначала кэш, потом API** (экономим 500 req/день)
- **По умолчанию 5 результатов**, но пользователь может запросить больше
- **Сигнализировать риски** если источник неизвестен
- **Приоритет**: Anthropic > travisvn > BehiSecc/VoltAgent > SkillsMP
- **Табличный формат** при 6+ результатах для компактности

---

## Деактивация / удаление

### Временно отключить
```bash
mv ~/.Codex/skills/find-skill ~/.Codex/skills/find-skill-disabled
```

### Включить обратно
```bash
mv ~/.Codex/skills/find-skill-disabled ~/.Codex/skills/find-skill
```

### Остановить автообновление (cron)
```bash
crontab -l | grep -v "update-skills-catalogue" | crontab -
```

### Полностью удалить
```bash
crontab -l | grep -v "update-skills-catalogue" | crontab -
rm -rf ~/.Codex/skills/find-skill
```

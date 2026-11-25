# find-skill

Un skill Claude Code qui cherche, recommande et installe d'autres skills depuis plusieurs sources communautaires et officielles.

## Fonctionnalités

- **Catalogue local** — Cache JSON mis à jour automatiquement chaque mois
- **5 sources agrégées** — Anthropic officiel, travisvn, BehiSecc, VoltAgent, SkillsMP API
- **Recherche hybride** — Cache local d'abord, API live en fallback
- **Installation guidée** — Présente max 3 options avec niveau de confiance, installe après confirmation

## Installation

```bash
git clone https://github.com/otonibar123/find-skill.git ~/.claude/skills/find-skill
```

Puis lancez la première mise à jour du catalogue :

```bash
~/.claude/skills/find-skill/update-skills-catalogue.sh
```

### Mise à jour automatique (optionnel)

Pour mettre à jour le catalogue automatiquement chaque jour à 9h :

```bash
(crontab -l 2>/dev/null; echo "0 9 * * * ~/.claude/skills/find-skill/update-skills-catalogue.sh >> ~/.claude/skills/find-skill/cache/update.log 2>&1") | crontab -
```

## Utilisation

Le skill se déclenche automatiquement dans Claude Code quand vous demandez un skill :

- *"j'ai besoin d'un skill pour Astro"*
- *"trouve-moi un skill pour la sécurité"*
- *"cherche un skill pour générer des PDFs"*
- *"mets à jour le catalogue de skills"*

## Sources et priorité de confiance

| Priorité | Source | Confiance |
|----------|--------|-----------|
| 1 | Anthropic officiel | ✅ Officiel |
| 2 | travisvn/awesome-claude-skills | 🟡 Communauté vérifié |
| 3 | BehiSecc/awesome-claude-skills | 🟡 Communauté vérifié |
| 4 | VoltAgent/awesome-agent-skills | 🟡 Communauté vérifié |
| 5 | SkillsMP API | ⚠️ Communauté |

## Configuration optionnelle

Pour activer la recherche live via SkillsMP (en plus du cache local), définissez la variable d'environnement :

```bash
export SKILLSMP_API_KEY="votre-clé"
```

## Désinstallation

```bash
# Arrêter le cron
crontab -l | grep -v "update-skills-catalogue" | crontab -

# Supprimer le skill
rm -rf ~/.claude/skills/find-skill
```

## Licence

MIT

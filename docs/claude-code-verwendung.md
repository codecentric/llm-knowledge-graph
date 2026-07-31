# Claude Code in diesem Repository

Das Repo ist für **pi** *und* **[Claude Code](https://code.claude.com)** eingerichtet.
Beide teilen sich dieselbe Wahrheitsquelle (`AGENTS.md`) und dieselben Skills
(`.agents/skills/`). Der Unterschied liegt nur in der Auslöse-Schicht: pi nutzt
TypeScript-Extensions, Claude Code nutzt **Hooks**.

```bash
claude   # startet im aktuellen Verzeichnis
```

---

## Was Claude Code hier automatisch nutzt

### Agenten-Instruktionen

`CLAUDE.md` importiert per erster Zeile `@AGENTS.md`. Damit gilt dasselbe
**Graph-first-Prinzip** wie in pi – eine Quelle, kein Duplikat.

### Skills (`.claude/skills/`)

Claude Code liest Skills aus `.claude/skills/`, pi aus `.agents/skills/`. Beide folgen
demselben [Agent-Skills-Standard](https://agentskills.io). Damit es nur eine Kopie gibt,
sind die geteilten Skills als **Symlinks** eingebunden:

```
.claude/skills/sparql-query        → ../../.agents/skills/sparql-query
.claude/skills/domain-glossary-rdf → ../../.agents/skills/domain-glossary-rdf
.claude/skills/kg-html-visualizer  → ../../.agents/skills/kg-html-visualizer
.claude/skills/skos-owl-graph-design → ../../.agents/skills/skos-owl-graph-design
.claude/skills/kg                  (Claude-Code-only, siehe unten)
```

Aufruf direkt per `/sparql-query`, `/domain-glossary-rdf` usw., oder automatisch, wenn
die Aufgabe zur `description` passt.

### Hooks (`.claude/hooks/` + `.claude/settings.json`)

Die pi-Extensions `graph-gate` und `shacl-guard` sind 1:1 als Hooks portiert. Sie rufen
dieselben Validierungsskripte wie pi (`query.js`, `validate-shacl.js`).

| Hook | Event | Wirkung |
|---|---|---|
| `graph-gate.mjs` | `PreToolUse` (Matcher `Read`) | Fängt `Read` auf `graph/**/*.ttl` ab und verweist auf den SPARQL-Weg (`permissionDecision: ask`). Für inhaltliche Fragen ablehnen und SPARQL nutzen; nur zum Editieren freigeben, weil `Edit`/`Write` ein vorheriges `Read` derselben Datei verlangen. |
| `shacl-guard.mjs` | `PostToolUse` (Matcher `Edit\|Write`) | Nach jedem TTL-Schreiben SHACL-Validierung. Violation → `decision: block` (Agent muss korrigieren); Warning → Hinweis; konform → still. |
| `kg-mention.mjs` | `UserPromptSubmit` | Erkennt `#Label` im Prompt, löst sie per SPARQL auf und injiziert die Einträge als Kontext. |

---

## kg-browser-Ersatz: der `/kg`-Skill

pi hat ein interaktives TUI-Overlay (`Alt+K`). Claude Code hat kein TUI-Overlay – der
`/kg`-Skill (`.claude/skills/kg/`) erfüllt denselben Zweck nicht-interaktiv: er durchsucht
den Graph per SPARQL und lädt passende Einträge mit Properties in den Kontext.

```
/kg Sperrgut          # Einträge zum Suchbegriff laden
/kg                   # Überblick über alle Einträge
```

---

## Einmalige Einrichtung

```bash
npm install                                   # Root-Dependencies (SHACL)
cd .agents/skills/sparql-query && npm install # Skill-Dependencies (Comunica)
```

Ohne diese Installation meldet `shacl-guard` einen Hinweis (kein harter Fehler) und
`kg-mention` bleibt still.

---

## Grenzen gegenüber pi

- **Kein Live-`#`-Autocomplete** beim Tippen (kein Editor-Autocomplete-API in Claude Code).
  Die automatische Kontext-Injektion beim Absenden funktioniert vollständig.
- **Kein interaktives Graph-Overlay** (`Alt+K`). Ersatz: `/kg`-Skill.

Alles andere – Graph-first, TTL-Lesesperre, SHACL-Zwang, Skills, `.rq`-Queries,
HTML-Visualisierung – verhält sich in beiden Tools gleich.

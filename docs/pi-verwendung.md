# pi in diesem Repository

## Was ist pi?

[pi](https://pi.dev) ist ein minimales Terminal-Coding-Tool (wie Claude Code oder Cursor im Terminal), das sich über **Extensions**, **Skills** und **Prompt-Templates** projektspezifisch erweitern lässt. Diese Konfigurationen liegen direkt im Repo und greifen automatisch, sobald pi im Workspace-Verzeichnis gestartet wird.

```bash
pi   # startet im aktuellen Verzeichnis
```

---

## Was dieses Repo mitbringt

### Extensions (`.pi/extensions/`)

Mehrere projektlokale Extensions greifen automatisch beim Start.

#### `graph-gate`

Eine projektlokale Extension, die **direktes Lesen von `.ttl`-Dateien via `read`-Tool blockiert** und stattdessen auf den SPARQL-Weg umleitet. Das verhindert, dass der Agent TTL-Dateien als Plaintext interpretiert statt sie semantisch abzufragen.

```
Agent versucht read("graph/<modul>.ttl")
  → graph-gate blockiert
  → Fehlermeldung mit korrektem SPARQL-Befehl als Hinweis
```

> Diese Extension ist **pi-exklusiv** – Claude Code, Cursor & Co. haben keinen Mechanismus, um `read`-Tool-Calls zu intercepten.

#### `kg-browser` – Interaktiver Graph-Browser (`Alt+K` oder `/kg`)

Öffnet ein TUI-Overlay, das den gesamten Knowledge Graph durchsuchbar und navigierbar macht – direkt im Terminal, ohne SPARQL tippen zu müssen.

```
Alt+K  oder  /kg   → Browser öffnen
↑↓             Navigation
Tab            Kategorie wechseln (Konzepte / Klassen / Personen / …)
/              Freitext-Suche
Enter          Detailansicht (alle Properties des Eintrags)
c              Eintrag für Kontext markieren
Esc            Schließen – markierte Einträge werden als Kontext in die Session injiziert
```

Der Browser lädt alle TTL-Dateien aus `graph/` per SPARQL, zeigt Konzepte, Klassen, Personen, Properties und Instanzen und erlaubt, einzelne Einträge mit ihren vollständigen Eigenschaften in den Agenten-Kontext zu übernehmen – als strukturierte Nachricht, nicht als Rohdaten.

> Nur in pi verfügbar (nutzt `ctx.ui.custom()` für das TUI-Overlay und `pi.registerShortcut()`)

#### `shacl-guard` – Automatische SHACL-Validierung nach Schreiboperationen

Führt nach jeder `write`- oder `edit`-Operation auf einer `.ttl`-Datei **automatisch die SHACL-Validierung** durch und konfrontiert den Agenten sofort mit Verstößen – bevor er mit der nächsten Aktion fortfährt.

```
Agent schreibt graph/<modul>.ttl  (write oder edit)
  → shacl-guard startet validate-shacl.js
  → sh:Violation → isError: true   (Agent muss korrigieren)
  → sh:Warning   → isError: false  (Hinweis, kein harter Fehler)
  → konform      → ✅-Meldung, kein Rauschen
```

Das Validierungsscript liegt unter:
```
.agents/skills/sparql-query/scripts/validate-shacl.js
```

> Nur in pi verfügbar – der `tool_result`-Hook, über den die Extension das Ergebnis eines Tool-Calls abfängt und ergänzt, existiert in Claude Code oder Cursor nicht.

#### `kg-mention` – `#Konzept`-Syntax im Editor

Ermöglicht `#Label`-Mentions direkt beim Schreiben einer Frage. Zwei Mechanismen:

1. **Autocomplete:** Sobald `#` getippt wird, erscheint eine Vorschlagsliste mit passenden KG-Einträgen (Fuzzy-Suche). Auswahl mit `Enter`.
2. **Automatischer Kontext:** Beim Absenden erkennt die Extension alle `#Label`-Mentions im Prompt, lädt die passenden Einträge (URI, Definition, alle Properties) und injiziert sie als Kontext-Nachricht vor dem Agenten-Turn.

```
"Was sind die Versandregeln für #Accessoires und #Sperrgut?"
→ KG-Einträge beider Konzepte werden automatisch als Kontext vorangestellt
```

> Nur in pi verfügbar (nutzt `ctx.ui.addAutocompleteProvider()` und das `input`-Event)

---

### Skills (`.agents/skills/`)

Skills sind **Kompetenz-Anleitungen für den Agenten** – Markdown-Dateien, die der Agent zur Laufzeit liest und dann weiß, wie er ein Werkzeug benutzt. Vier Skills sind installiert:

| Skill | Wozu |
|---|---|
| `sparql-query` | SPARQL gegen lokale TTL-Dateien ausführen (via Comunica) |
| `domain-glossary-rdf` | Rohdokumente → SKOS/OWL-Glossar in Turtle extrahieren |
| `kg-html-visualizer` | Interaktive HTML-Visualisierungen aus dem Graph erzeugen (→ `apps/`) |
| `skos-owl-graph-design` | Architekturprinzipien für neue Graph-Module (Namespaces, Punning, SHACL) |

Der Agent lädt einen Skill automatisch, wenn die Aufgabe dazu passt – oder auf expliziten Hinweis: *„lies den sparql-query Skill"*.

**Kernbefehl aus `sparql-query`:**
```bash
node .agents/skills/sparql-query/scripts/query.js \
  --file graph/<modul>.ttl \
  --sparql "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"
```

---

### Agenten-Instruktionen (`AGENTS.md`)

pi lädt `AGENTS.md` automatisch als Systemkontext. Darin steht das **Graph-first-Prinzip**: Der Agent soll bei jeder inhaltlichen Frage zuerst den Knowledge Graph per SPARQL abfragen – nicht aus dem Trainings-Gedächtnis antworten.

---

## Typische Workflows mit pi

**Inhaltliche Frage stellen:**
> *„Welche Länder sind für Messer gesperrt?"*
→ Agent liest AGENTS.md, fragt SPARQL ab, antwortet mit belegten Triples.

**Graph erweitern:**
> *„Lies das Meeting-Protokoll in `inputs/` und extrahiere neue Versandregeln in den Graph."*
→ Agent nutzt `domain-glossary-rdf`-Skill, schreibt TTL, validiert.

**Visualisierung erzeugen:**
> *„Erstell eine HTML-Übersicht aller Stakeholder mit ihren offenen Punkten."*
→ Agent nutzt `kg-html-visualizer`-Skill, erzeugt `apps/stakeholder.html`.

---

## Abgrenzung: pi vs. Claude Code / Cursor

| Fähigkeit | pi ✅ | Claude Code / Cursor |
|---|---|---|
| `AGENTS.md` als Systemkontext | ✅ automatisch | ✅ (Claude Code liest es auch) |
| Skills aus `.agents/skills/` | ✅ native Unterstützung | ⚠️ nur wenn Agent die Dateien manuell liest |
| `graph-gate` Extension aktiv | ✅ blockiert `read` auf TTL | ❌ kein Intercept-Mechanismus |
| `shacl-guard` Extension aktiv | ✅ SHACL-Check nach jedem TTL-Schreibvorgang | ❌ kein `tool_result`-Hook |
| SPARQL-Abfrage-Workflow | ✅ durch Extension erzwungen | ⚠️ muss manuell per Prompt angewiesen werden |
| Vorgefertigte `.rq`-Queries in `queries/` | ✅ Agent kennt sie via Skill | ⚠️ Agent findet sie nur wenn er danach sucht |
| `kg-browser` (TUI-Overlay, `Alt+K`) | ✅ interaktiver Graph-Browser | ❌ kein TUI-Overlay-Mechanismus |
| `kg-mention` (`#Konzept`-Autocomplete) | ✅ live Vorschläge + Auto-Kontext | ❌ kein Editor-Autocomplete-API |

**Was mit Claude Code trotzdem funktioniert:**
- Inhaltliche Fragen – wenn du explizit sagst *„frag den Graph per SPARQL, lies nicht die TTL direkt"*
- Graph erweitern, Turtle schreiben und validieren
- HTML-Visualisierungen generieren
- Die Skills manuell lesen lassen: *„lies `.agents/skills/sparql-query/SKILL.md`"*

**Was fehlt ohne pi:**
- Die automatische Sperre gegen direktes TTL-Lesen (der Agent könnte Turtle als Text analysieren statt SPARQL zu benutzen – und dabei Zusammenhänge übersehen oder halluzinieren)
- `kg-browser` und `kg-mention` – kein anderes Tool hat einen Editor-Autocomplete-API oder TUI-Overlays
- Die nahtlose Skill-Entdeckung beim Session-Start

---

## Queries ohne Agent ausführen

Alle Abfragen laufen auch vollständig ohne LLM:

```bash
npm install        # einmalig
npm run query      # interaktives Menü aller .rq-Dateien
npm run query -- 3 # Query Nr. 3 direkt
```

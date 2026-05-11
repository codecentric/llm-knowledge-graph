# Knowledge Graph Starter Template

Ein domänenagnostisches Repository-Template für RDF-Knowledge-Graph-Projekte
mit SKOS/OWL-Ontologien, SPARQL-Abfragen und pi-Agent-Integration.

---

## Was ist dieses Repository?

Dieses Template stellt die vollständige **Infrastruktur** für ein
Knowledge-Graph-Projekt bereit – ohne vorinstalliertes Domänenwissen:

- **Skills** für SPARQL-Abfragen, Glossar-Extraktion und Graph-Visualisierung
- **pi-Extensions** für graph-aware Agenten (graph-gate, shacl-guard, kg-browser, kg-mention)
- **Tooling** für Validierung und Abfragen (`npm run validate`, `npm run query`)
- **CI/CD** via GitHub Actions
- **AGENTS.md** als Systeminstruktion für jeden LLM-Turn

---

## Schnellstart: Neues Projekt anlegen

```bash
# 1. Eigenen Branch von init erstellen
git checkout -b mein-projekt init

# 2. Namespace global anpassen (3 Werte ersetzen)
#    https://example.org/domain  →  https://meinprojekt.example.org/domain
#    "Meine Domäne"              →  "Mein Projektname"

# 3. Ersten Input ablegen
#    → inputs/<thema>.md  (Anforderungen, Meeting-Notizen, CSV …)

# 4. Glossar-Skill aufrufen (extrahiert Konzepte aus inputs/)
#    → graph/ wächst automatisch

# 5. Ergebnisse prüfen
npm install
npm run query     # Beispielkonzept + eigene Konzepte erscheinen
npm run validate  # muss grün sein
```

---

## Repository-Struktur

```
graph/                  RDF-Graphdateien (Turtle)
  meta.ttl              → Ontologie-Metadaten (Namespace, Titel, Version)
  example-concept.ttl   → Beispielkonzept (löschen oder ersetzen)

queries/                SPARQL-Abfragen (.rq)
  example/
    alle-konzepte.rq    → Alle SKOS-Konzepte auflisten
    graph-statistik.rq  → Überblick: Tripel, Klassen, Konzepte

inputs/                 Quelldokumente (Markdown, CSV, TXT …)
  README.md             → Hinweise zur Ablage

apps/                   HTML-Visualisierungen des Graphen
  manifest.ttl          → Leeres App-Manifest

.agents/skills/         Installierte Agent-Skills
  sparql-query/         → SPARQL gegen lokale TTL-Dateien
  domain-glossary-rdf/  → Konzepte aus Dokumenten extrahieren
  kg-html-visualizer/   → Interaktive HTML-Graphansicht
  skos-owl-graph-design/→ Architekturrichtlinien

.pi/extensions/         pi-Agent-Extensions
  graph-gate/           → Liest relevante TTL-Dateien vor jeder Antwort
  shacl-guard/          → Validiert TTL-Änderungen automatisch
  kg-browser/           → SPARQL-Tool im Agenten-Kontext
  kg-mention/           → Erwähnte Konzepte mit Graphdaten anreichern

docs/                   Dokumentation
AGENTS.md               → Systeminstruktion für LLM-Agenten
```

---

## Tooling

```bash
npm install          # Abhängigkeiten installieren (einmalig)
npm run query        # Alle .rq-Dateien in queries/ ausführen
npm run validate     # Alle TTL- und RQ-Dateien validieren
```

---

## pi-Integration

Dieses Repo ist für den Einsatz mit dem **pi Coding Agent** optimiert.
Die Extensions in `.pi/extensions/` werden automatisch geladen und stellen
dem Agenten graph-aware Werkzeuge bereit.

Dokumentation der Extensions: `docs/pi-verwendung.md`

---
name: kg-html-visualizer
description: Builds lightweight single-file HTML visualizations of RDF/Turtle knowledge graphs. Reads .ttl files, runs SPARQL queries via Oxigraph (WASM) in the browser, and renders results as interactive HTML using Shoelace web components and/or Cytoscape.js for force-directed graph layouts. Use this skill when the user wants to explore, browse, or present parts of a knowledge graph as a self-contained HTML page.
---

# Knowledge Graph HTML Visualizer

Dieses Skill erzeugt **selbstständige Single-Page-HTML-Dateien**, die RDF/Turtle-Daten direkt im Browser laden, per SPARQL abfragen (Oxigraph WASM) und interaktiv visualisieren – entweder als tabellarische/Card-basierte Ansicht (Shoelace) oder als Kraftgraph (Cytoscape.js).

## Grundprinzip

```
.ttl-Dateien einlesen → SPARQL formulieren → HTML-Template befüllen → fertige .html ausgeben
```

Die erzeugte HTML-Datei ist **komplett standalone**: alle Bibliotheken kommen von CDN, die TTL-Daten werden inline als JavaScript-String eingebettet. Kein Server nötig.

## Schritt-für-Schritt-Workflow

### Schritt 1 – TTL-Dateien einlesen

Alle relevanten `.ttl`-Dateien mit dem `read`-Tool einlesen. Bei mehreren Dateien den Inhalt zu einem gemeinsamen Turtle-String zusammenführen (einfach konkatenieren, gleiche `@prefix`-Deklarationen werden von Oxigraph toleriert).

Wichtig: Prüfe, welche Prefixe definiert sind – sie werden für SPARQL-Queries gebraucht.

### Schritt 2 – Visualisierungstyp wählen

| Typ | Wann | Template |
|-----|------|---------|
| **Tabelle / Cards** | Listen, Glossare, flache Konzepte | `templates/table-cards.html` |
| **Kraft-Graph** | Relationen, Hierarchien, Netzwerke | `templates/force-graph.html` |
| **Kombiniert** | Überblick + Details | `templates/combined.html` |

### Schritt 3 – SPARQL-Query entwerfen

Passende SPARQL-SELECT-Queries für den Anwendungsfall formulieren. Referenz: [references/sparql-patterns.md](references/sparql-patterns.md).

Typische Queries:
- SKOS-Konzepte mit Labels und Definitionen
- Klassen-Hierarchien (`rdfs:subClassOf`)
- Objekteigenschaften als Kanten (`?s ?p ?o FILTER(isIRI(?o))`)
- Named Entities und ihre Eigenschaften

### Schritt 4 – HTML generieren

Das passende Template aus `templates/` als Basis nehmen und mit den Skripten befüllen:

```bash
# Tabellen-/Card-Ansicht
node /workspace/.agents/skills/kg-html-visualizer/scripts/generate.js \
  --ttl input.ttl \
  --type table \
  --sparql "SELECT ?s ?label ?def WHERE { ?s a skos:Concept ; skos:prefLabel ?label ; skos:definition ?def }" \
  --title "Mein Glossar" \
  --output output.html

# Kraft-Graph
node /workspace/.agents/skills/kg-html-visualizer/scripts/generate.js \
  --ttl input.ttl \
  --type graph \
  --title "Konzept-Netzwerk" \
  --output output.html
```

Alternativ: Den Template-Inhalt direkt im Agenten per LLM anpassen (Inline-Ansatz, kein Node nötig – bevorzugt bei komplexen individuellen Anforderungen).

### Schritt 5 – Inline-Ansatz (bevorzugt für individuelle Visualisierungen)

Der Agent liest ein passendes Template, ersetzt die Platzhalter direkt im Code und schreibt das Ergebnis als fertige `.html`-Datei:

1. Template mit `read` laden
2. `__TTL_DATA__` durch den Base64-kodierten oder raw-escaped TTL-String ersetzen
3. `__SPARQL_QUERY__` durch die fertige Query ersetzen
4. `__PAGE_TITLE__` durch den gewünschten Titel ersetzen
5. Mit `write` als `.html` speichern

## Template-Bibliotheken (CDN, kein Install)

| Bibliothek | Zweck | CDN |
|-----------|-------|-----|
| **Oxigraph WASM** | SPARQL-Engine im Browser | `https://cdn.jsdelivr.net/npm/oxigraph@0.3.10/web.js` |
| **Shoelace** | Web Components (Cards, Tabellen, Badges, Details) | `https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/` |
| **Cytoscape.js** | Kraft-Graphen, Layouts | `https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js` |
| **Cytoscape-Cola** | Physik-Layout (optional) | `https://cdn.jsdelivr.net/npm/cytoscape-cola@2.5.1/cytoscape-cola.js` |

## Hinweise für den Agenten

- **TTL einbetten:** Den TTL-Rohtext als JS-Template-Literal in die HTML-Datei schreiben: `` const TTL = `...`; ``
  - Backticks im TTL escapen: `` ` `` → `` \` ``
  - Backslashes verdoppeln: `\` → `\\`
- **Oxigraph-Initialisierung:** Immer `await init()` vor `new Store()` aufrufen (WASM muss geladen sein)
- **SPARQL-Fehler abfangen:** `try/catch` um alle `store.query()` Aufrufe – Fehler als `<sl-alert variant="danger">` anzeigen
- **Cytoscape-Knoten:** Für SKOS-Graphen: Konzepte als Knoten, `skos:broader`/`skos:related`/`skos:narrower` als Kanten – unterschiedliche Kantenfarben je Relation
- **Shoelace-Theme:** Immer beide CSS-Dateien einbinden: light + `shoelace/cdn/themes/light.css`; `sl-` Prefix für alle Komponenten
- **Responsivität:** CSS-Grid mit `auto-fill, minmax(300px, 1fr)` für Card-Layouts
- **Titel:** Aus `dct:title` oder `skos:ConceptScheme skos:prefLabel` per SPARQL ermitteln
- **Ladeindikator:** `<sl-spinner>` während Oxigraph/WASM initialisiert
- **Kein Build-Step:** Alle Bibliotheken via ES-Module-CDN oder klassisches Script-Tag – keine npm, kein Bundler in der fertigen HTML

## Referenzen

- [SPARQL-Muster und Beispiel-Queries](references/sparql-patterns.md)
- [Oxigraph WASM API](references/oxigraph-api.md)
- [Cytoscape Layout-Optionen](references/cytoscape-layouts.md)

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

Die erzeugte HTML-Datei lädt alle Bibliotheken von CDN und die TTL-Daten per `fetch()` aus dem `graph/`-Ordner. Ein lokaler Webserver ist nötig (`npm run serve`). TTL-Daten dürfen **niemals** als JS-String-Literal eingebettet werden – das führt zu `Not supported MIME type`-Fehlern in Oxigraph (siehe `references/oxigraph-api.md`).

> **Output-Verzeichnis:** Alle erzeugten HTML-Dateien werden im Ordner **`apps/`** (relativ zum Projekt-Root) gespeichert. Der Ordner wird bei Bedarf automatisch angelegt. Beispiel-Pfad: `apps/mein-glossar.html`.
>
> **Backlink (Pflicht):** Jede App-HTML muss im `<header>` als erstes Kind einen Link zurück zur Übersicht enthalten:
> ```html
> <a class="back-link" href="../index.html">&#8592; Übersicht</a>
> ```
> Mit diesem CSS direkt im `<style>`-Block der App (an den vorhandenen `header`-Block anhängen):
> ```css
> .back-link {
>   display: inline-flex; align-items: center; gap: .35rem;
>   color: rgba(255,255,255,.75); font-size: .8rem; text-decoration: none;
>   padding: .2rem .55rem; border-radius: 6px;
>   border: 1px solid rgba(255,255,255,.25);
>   transition: background .15s, color .15s;
>   white-space: nowrap;
> }
> .back-link:hover { background: rgba(255,255,255,.15); color: #fff; }
> ```
>
> **App-TTL (Pflicht):** Jede neue App bekommt eine eigene TTL-Datei **direkt neben der HTML-Datei** in `apps/`, z. B. `apps/mein-glossar.ttl`. Sie beschreibt die App als Instanz von `app:App` mit den Properties `rdfs:label`, `dct:description`, `app:url`, `app:icon`, `app:badgeVariant`, `app:badgeLabel` und `app:sortOrder`. Die Klassen-/Property-Definitionen (`app:App` etc.) sind in `graph/apps.ttl` definiert, werden aber nicht von `index.html` geladen – Oxigraph benötigt sie für die SPARQL-Query nicht.
>
> **Manifest aktualisieren (Pflicht):** Nach dem Anlegen der App-TTL muss `apps/manifest.ttl` um einen `owl:imports`-Triple für die neue App-IRI ergänzt werden, z. B.:
> ```turtle
> owl:imports <https://shop.example.org/apps/mein-glossar> .
> ```
> `index.html` liest das Manifest und lädt alle verknüpften TTLs automatisch – kein manueller Eingriff in die HTML nötig.
>
> **Validierung:** Nach jeder Änderung an TTL-Dateien validieren:
> ```bash
> node .agents/skills/sparql-query/scripts/validate.js apps/mein-glossar.ttl apps/manifest.ttl
> ```

## Schritt-für-Schritt-Workflow

### Schritt 1 – TTL-Dateien per SPARQL erkunden

Nie direkt lesen (Zugriff nur per SPARQL). Mit `node .agents/skills/sparql-query/scripts/query.js` die Struktur und Prefixe der TTL-Datei ermitteln. Die Dateipfade werden später im `fetch()`-Aufruf im HTML referenziert – **kein** Einbetten als String.

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
node .agents/skills/kg-html-visualizer/scripts/generate.js \
  --ttl input.ttl \
  --type table \
  --sparql "SELECT ?s ?label ?def WHERE { ?s a skos:Concept ; skos:prefLabel ?label ; skos:definition ?def }" \
  --title "Mein Glossar" \
  --output apps/mein-glossar.html

# Kraft-Graph
node .agents/skills/kg-html-visualizer/scripts/generate.js \
  --ttl input.ttl \
  --type graph \
  --title "Konzept-Netzwerk" \
  --output apps/konzept-netzwerk.html
```

Der Agent schreibt die HTML-Datei direkt mit dem `write`-Tool. Als Basis dient das passende Template aus `templates/`, das manuell angepasst wird.

### Schritt 5 – HTML schreiben (fetch-Ansatz, immer verwenden)

1. Template mit `read` laden
2. `__TTL_DATA__`-Platzhalter **entfernen** – stattdessen `fetch()`-Aufruf einbauen:
   ```js
   const ttl = await fetchTtl('../graph/meine-datei.ttl');
   store.load(ttl, 'text/turtle', 'https://example.org/');
   ```
3. `__SPARQL_QUERY__` durch die fertige Query ersetzen
4. `__PAGE_TITLE__` durch den gewünschten Titel ersetzen
5. Mit `write` als `.html` in **`apps/`** speichern

> **Niemals** TTL als JS-Template-Literal einbetten. Immer `fetch()` verwenden.
> **Starten** mit `npm run serve`, dann `http://localhost:4000/apps/datei.html` öffnen.

## Template-Bibliotheken (CDN, kein Install)

| Bibliothek | Zweck | CDN |
|-----------|-------|-----|
| **Oxigraph WASM** | SPARQL-Engine im Browser | `https://cdn.jsdelivr.net/npm/oxigraph@0.3.10/web.js` |
| **Shoelace** | Web Components (Cards, Tabellen, Badges, Details) | `https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/` |
| **Cytoscape.js** | Kraft-Graphen, Layouts | `https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js` |
| **Cytoscape-Cola** | Physik-Layout (optional) | `https://cdn.jsdelivr.net/npm/cytoscape-cola@2.5.1/cytoscape-cola.js` |

## Hinweise für den Agenten

- **TTL laden:** Immer `fetch('../graph/datei.ttl')` verwenden – niemals als JS-String einbetten
- **store.load() Signatur:** Positional-Parameter: `store.load(ttlString, 'text/turtle', 'https://example.org/')` – kein Options-Objekt `{ format, baseIri }` (wirft sonst `Not supported MIME type`)
- **Oxigraph-Initialisierung:** Immer `await init()` vor `new Store()` aufrufen (WASM muss geladen sein)
- **SPARQL-Fehler abfangen:** `try/catch` um alle `store.query()` Aufrufe – Fehler als `<sl-alert variant="danger">` anzeigen
- **Cytoscape Graph-Panel Höhe:** `sl-tab-panel` rendert ein Shadow-DOM – `height: 100%` auf `#cy` erbt **nicht** vom Panel. Immer so stylen:
  ```css
  #cy-panel { padding: 0; }
  #cy-panel::part(base) { height: calc(100vh - 115px); padding: 0; }
  #cy { width: 100%; height: calc(100vh - 115px); display: block; }
  ```
  Ohne `::part(base)` ist die effektive Höhe 0px und der Graph bleibt unsichtbar.
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

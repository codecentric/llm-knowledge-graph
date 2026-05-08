# Agent-Instruktionen für dieses Repository

## Grundprinzip: Knowledge Graph zuerst

Dieses Repository enthält einen **RDF Knowledge Graph** (Turtle-Dateien), der die
Fachdomäne des Shops strukturiert und maschinenlesbar dokumentiert.

**Wenn der Nutzer eine inhaltliche Frage stellt** – z. B. zu Versandregeln,
Exportbeschränkungen, Produktkategorien, Preisregeln, Stakeholdern oder anderen
Fachthemen – gilt immer:

> 🔍 **Zuerst den Knowledge Graph per SPARQL abfragen, dann antworten.**

Niemals aus dem Gedächtnis/Trainingsdaten raten. Der Graph ist die Wahrheitsquelle.

---

## TTL-Dateien im Workspace

Der Knowledge Graph wächst dynamisch. **Nie einzelne Dateien hardcoden.**
Stattdessen vor jeder Abfrage alle vorhandenen TTL/RDF-Dateien ermitteln:

```bash
find /workspace/graph -name "*.ttl" -o -name "*.rdf" -o -name "*.n3"
```

Alle gefundenen Dateien sind gleichwertige Teile des Knowledge Graphs und müssen
bei inhaltlichen Fragen berücksichtigt werden. Neue Fachmodule landen ebenfalls
in `graph/` – deshalb immer dynamisch suchen, nie Pfade hardcoden.

---

## SPARQL-Abfragen ausführen

**Skill:** `sparql-query` (bereits installiert unter `/workspace/.agents/skills/sparql-query/`)

```bash
# Abhängigkeiten (einmalig):
cd /workspace/.agents/skills/sparql-query && npm install

# Abfrage ausführen:
node /workspace/.agents/skills/sparql-query/scripts/query.js \
  --file /workspace/versand.ttl \
  --sparql "PREFIX versand: <https://shop.example.org/versand#> SELECT ..."
```

### Wichtige Prefixe

```sparql
PREFIX :        <https://shop.example.org/glossary#>
PREFIX versand: <https://shop.example.org/versand#>
PREFIX person:  <https://shop.example.org/personen#>
PREFIX skos:    <http://www.w3.org/2004/02/skos/core#>
PREFIX owl:     <http://www.w3.org/2002/07/owl#>
PREFIX rdfs:    <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct:     <http://purl.org/dc/terms/>
PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>
PREFIX schema:  <https://schema.org/>
```

---

## Validierung nach jeder Änderung am Graph

**Nach jeder Änderung an `.ttl`- oder `.rq`-Dateien** muss validiert werden.
Nur die tatsächlich geänderten Dateien übergeben:

```bash
# Eine oder mehrere konkrete Dateien prüfen (bevorzugt):
cd /workspace && node .agents/skills/sparql-query/scripts/validate.js graph/versand.ttl queries/versand/laendersperren.rq

# Alle Dateien prüfen (nur wenn viele Dateien auf einmal geändert wurden):
cd /workspace && npm run validate
```

Bei Exit-Code 1 den Fehler beheben, bevor die Antwort an den Nutzer geht.

---

## Workflow für jede inhaltliche Nutzerfrage

1. **Alle TTL-Dateien ermitteln:** `find /workspace/graph -name "*.ttl" -o -name "*.rdf" -o -name "*.n3"`
2. **SPARQL-Abfrage formulieren** und gegen die relevanten Dateien ausführen (ggf. mehrere Dateien nacheinander abfragen)
3. **Ergebnis in natürlicher Sprache erklären** – mit Hinweis auf offene Punkte/Unsicherheiten aus dem Graphen

---

## Hinweis zur Dateiauswahl

Da der Graph dynamisch wächst, gibt es keine feste Zuordnung von Themen zu Dateien.
Im Zweifelsfall alle gefundenen TTL-Dateien abfragen oder zunächst mit einem
breiten `SELECT ?s ?p ?o` die Inhalte sondieren.

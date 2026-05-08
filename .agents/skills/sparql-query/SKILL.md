---
name: sparql-query
description: Executes SPARQL 1.1 queries (SELECT, ASK, CONSTRUCT, DESCRIBE) against local RDF/Turtle knowledge graph files in the workspace using Comunica. Use this skill whenever the user wants to query, explore, search, or analyse a knowledge graph, ontology or SKOS glossary with SPARQL — for example to list all concepts, traverse broader/narrower hierarchies, find related terms, or run custom graph queries.
---

# SPARQL Query Skill

Führt SPARQL-Abfragen gegen lokale RDF/Turtle-Dateien aus – angetrieben von
[Comunica `query-sparql-file`](https://github.com/comunica/comunica).

## Abhängigkeiten installieren

Einmalig ausführen, bevor der Skill erstmals genutzt wird:

```bash
cd /workspace/.agents/skills/sparql-query && npm install
```

## Primärer Knowledge Graph

```
/workspace/glossary.ttl   ← SKOS/OWL-Glossar dieses Depots
```

Weitere `.ttl`-Dateien im Depot findest du mit:
```bash
find /workspace -name "*.ttl" -o -name "*.rdf" -o -name "*.n3" | grep -v node_modules
```

---

## Workflow

### Schritt 1 – Abhängigkeiten prüfen / installieren

```bash
cd /workspace/.agents/skills/sparql-query && npm install
```

### Schritt 2 – Abfrage ausführen

**Inline-SPARQL (einfach für kurze Abfragen):**

```bash
node /workspace/.agents/skills/sparql-query/scripts/query.js \
  --file /workspace/glossary.ttl \
  --sparql "PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            SELECT ?c ?label WHERE { ?c a skos:Concept ; skos:prefLabel ?label }
            ORDER BY ?label LIMIT 20"
```

**Mit .rq-Datei (für längere / wiederverwendbare Abfragen):**

```bash
node /workspace/.agents/skills/sparql-query/scripts/query.js \
  --file /workspace/glossary.ttl \
  --query /workspace/.agents/skills/sparql-query/queries/all-concepts.rq
```

**Mit explizitem Limit (Sicherheitskappung, nur für SELECT ohne eigenes LIMIT):**

```bash
node /workspace/.agents/skills/sparql-query/scripts/query.js \
  --file /workspace/glossary.ttl \
  --sparql "SELECT ?s ?p ?o WHERE { ?s ?p ?o }" \
  --limit 50
```

**ASK-Abfrage:**

```bash
node /workspace/.agents/skills/sparql-query/scripts/query.js \
  --file /workspace/glossary.ttl \
  --sparql "ASK { <https://shop.example.org/glossary#Checkout> a <http://www.w3.org/2004/02/skos/core#Concept> }"
```

**CONSTRUCT (Teilgraph extrahieren):**

```bash
node /workspace/.agents/skills/sparql-query/scripts/query.js \
  --file /workspace/glossary.ttl \
  --sparql "PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            CONSTRUCT { ?s skos:prefLabel ?l ; skos:broader ?b }
            WHERE { ?s a skos:Concept ; skos:prefLabel ?l . OPTIONAL { ?s skos:broader ?b } }"
```

**JSON-Ausgabe (maschinenlesbar):**

```bash
node /workspace/.agents/skills/sparql-query/scripts/query.js \
  --file /workspace/glossary.ttl \
  --query /workspace/.agents/skills/sparql-query/queries/all-concepts.rq \
  --format json
```

---

## Vorgefertigte Abfragen

| Datei | Inhalt |
|-------|--------|
| `queries/all-concepts.rq`      | Alle SKOS-Konzepte mit Label und Definition |
| `queries/broader-narrower.rq`  | Übergeordnete/untergeordnete Konzept-Hierarchie |
| `queries/related-concepts.rq`  | `skos:related`-Beziehungen |
| `queries/top-concepts.rq`      | Konzepte ohne übergeordnetes Konzept (Wurzeln) |
| `queries/search-by-label.rq`   | Substring-Suche im Label (anpassen: Suchbegriff) |

---

## Optionen des Skripts

| Option | Beschreibung |
|--------|-------------|
| `--file <pfad>` | Pfad zur Turtle/RDF-Datei (**erforderlich**) |
| `--sparql <string>` | Inline-SPARQL-Abfrage |
| `--query <pfad>` | Pfad zu einer `.rq`-Abfragedatei |
| `--format table\|json\|csv\|turtle` | Ausgabeformat (Standard: `table`) |
| `--limit <n>` | Fügt `LIMIT n` zu SELECT-Abfragen ohne eigenes LIMIT hinzu |
| `--help` | Hilfe anzeigen |

---

## Präfixe im Depot-Glossar

```sparql
PREFIX :     <https://shop.example.org/glossary#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct:  <http://purl.org/dc/terms/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
```

Für weitere SPARQL-Muster → [references/sparql-cheatsheet.md](references/sparql-cheatsheet.md)

---

## Fehlerbehebung

| Fehler | Ursache / Lösung |
|--------|-----------------|
| `Cannot find package '@comunica/query-sparql-file'` | `npm install` im Skill-Verzeichnis vergessen |
| `file not found` | Pfad zu `.ttl`-Datei prüfen; relativer vs. absoluter Pfad |
| `SPARQL Error: Parse error` | SPARQL-Syntax prüfen; Prefixe vollständig angeben |
| Leere Ergebnisse | Präfixe/IRIs mit `SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10` debuggen |

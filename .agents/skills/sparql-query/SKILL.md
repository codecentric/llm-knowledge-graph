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
cd .agents/skills/sparql-query && npm install
```

## Knowledge Graph im Depot

Alle RDF-Dateien liegen unter `graph/`:

```
graph/glossary.ttl          ← SKOS/OWL-Fachglossar
graph/versand.ttl           ← Versandlogik, Ländersperren, offene Punkte
graph/personen/*.ttl        ← Stakeholder, Entscheidungen, offene Fragen
```

Alle TTL-Dateien dynamisch ermitteln:
```bash
find graph -name "*.ttl" -o -name "*.rdf" -o -name "*.n3"
```

---

## Abfrage-Strategie: Semantisch zuerst, Text als Fallback

Bei jeder inhaltlichen Frage **immer diese Reihenfolge einhalten**:

### 🥇 Schritt 0: Vorhandene Queries prüfen

Bevor eine neue Abfrage formuliert wird, prüfen ob bereits eine passende `.rq`-Datei existiert:

```bash
find queries -name "*.rq"
```

- Passt eine Query **direkt** → ausführen
- Passt sie **teilweise** → anpassen und als neue `.rq`-Datei speichern (Original nicht überschreiben)
- Keine passende Query → weiter mit Schritt 1

### 🥈 Schritt 1: Semantische Abfrage (Typ + Objektreferenz)

1. **Klassen und Eigenschaften im Graph ermitteln** – welche `owl:Class`-Instanzen und `rdf:type`-Verwendungen existieren?

```sparql
SELECT DISTINCT ?klasse ?label WHERE {
  { ?klasse a owl:Class } UNION { ?x a ?klasse . FILTER(isIRI(?klasse)) }
  OPTIONAL { ?klasse rdfs:label ?label }
} ORDER BY ?klasse
```

2. **Relevante Klasse und benannte Instanz identifizieren** – z. B. `versand:UK`, `:Versandpartner`, `:Landerbeschrankung`

3. **Direkt über Typ und Objektreferenz navigieren** – kein Stringvergleich, sondern Graph-Traversal:

```sparql
# ✅ Gut: direkte Objektreferenz
?partner a :Versandpartner ;
         versand:liefertIn versand:UK .

?sperre a :Landerbeschrankung ;
        versand:gesperrtFuerLand versand:UK .

# ❌ Schlecht: Textsuche in URIs
FILTER(CONTAINS(LCASE(STR(?s)), "uk"))
```

### 🥉 Fallback: Textbasierte Suche

Nur verwenden wenn:
- die gesuchte Entität **nicht als benanntes Individuum** im Graph existiert
- die Klassen-/Property-Struktur noch **unbekannt** ist und explorativ erkundet werden muss
- eine Schritt-1-Abfrage keine verwertbaren Typen liefert

```sparql
# Fallback: strukturelle Erkundung
SELECT ?s ?p ?o WHERE {
  ?s ?p ?o .
  FILTER(CONTAINS(LCASE(STR(?o)), "suchbegriff"))
} LIMIT 20
```

> **Merkregel:** Erst vorhandene Queries prüfen, dann den Graph nach seiner eigenen Struktur fragen,
> dann entlang dieser Struktur navigieren.

> **⚠️ Keine Schlussfolgerungen als Graphfakten ausgeben.**
> Jede inhaltliche Aussage muss durch einen konkreten abgefragten Triple gedeckt sein.
> Zusammenhänge, die sich nur aus Textdefinitionen oder LLM-Weltwissen ergeben, sind explizit als
> *"Interpretation – nicht im Graph modelliert"* zu kennzeichnen. Niemals SPARQL-Ergebnisse und
> LLM-Schlussfolgerungen vermischen ohne dies kenntlich zu machen.

---

## Workflow

### Schritt 1 – Abhängigkeiten prüfen / installieren

```bash
cd .agents/skills/sparql-query && npm install
```

### Schritt 2 – Abfrage ausführen

**Inline-SPARQL (einfach für kurze Abfragen):**

```bash
node .agents/skills/sparql-query/scripts/query.js \
  --file graph/glossary.ttl \
  --sparql "PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            SELECT ?c ?label WHERE { ?c a skos:Concept ; skos:prefLabel ?label }
            ORDER BY ?label LIMIT 20"
```

**Mit .rq-Datei (für längere / wiederverwendbare Abfragen):**

```bash
node .agents/skills/sparql-query/scripts/query.js \
  --file graph/glossary.ttl \
  --query queries/glossary/alle-konzepte.rq
```

**Mit explizitem Limit (Sicherheitskappung, nur für SELECT ohne eigenes LIMIT):**

```bash
node .agents/skills/sparql-query/scripts/query.js \
  --file graph/glossary.ttl \
  --sparql "SELECT ?s ?p ?o WHERE { ?s ?p ?o }" \
  --limit 50
```

**ASK-Abfrage:**

```bash
node .agents/skills/sparql-query/scripts/query.js \
  --file graph/glossary.ttl \
  --sparql "ASK { <https://shop.example.org/glossary#Checkout> a <http://www.w3.org/2004/02/skos/core#Concept> }"
```

**CONSTRUCT (Teilgraph extrahieren):**

```bash
node .agents/skills/sparql-query/scripts/query.js \
  --file graph/glossary.ttl \
  --sparql "PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            CONSTRUCT { ?s skos:prefLabel ?l ; skos:broader ?b }
            WHERE { ?s a skos:Concept ; skos:prefLabel ?l . OPTIONAL { ?s skos:broader ?b } }"
```

**JSON-Ausgabe (maschinenlesbar):**

```bash
node .agents/skills/sparql-query/scripts/query.js \
  --file graph/glossary.ttl \
  --query queries/glossary/alle-konzepte.rq \
  --format json
```

**Mehrere Dateien gleichzeitig (z. B. alle Personen-TTLs):**

```bash
node .agents/skills/sparql-query/scripts/query.js \
  --file graph/personen/thomas.ttl \
  --file graph/personen/sarah.ttl \
  --file graph/personen/julia.ttl \
  --file graph/personen/lena.ttl \
  --file graph/personen/marco.ttl \
  --query queries/personen/alle-stakeholder.rq
```

---

## Vorgefertigte Abfragen

Domainspezifische Abfragen liegen in `queries/` im Workspace-Root,
geordnet nach Fachmodul. Jede Datei enthält den passenden Ausführungsbefehl
als Kommentar im Header.

### `queries/glossary/` – Fachglossar (`graph/glossary.ttl`)

| Datei | Inhalt |
|-------|--------|
| `alle-konzepte.rq`  | Alle SKOS-Konzepte mit Label und Definition |
| `hierarchie.rq`     | Konzept-Hierarchie (broader/narrower) |
| `top-konzepte.rq`   | Wurzel-Konzepte ohne übergeordneten Begriff |

### `queries/versand/` – Versandlogik (`graph/versand.ttl`)

| Datei | Inhalt |
|-------|--------|
| `alle-versandpartner.rq`              | Alle Partner mit Lieferzeiten und Sperrgut-Flag |
| `lieferlaender-pro-partner.rq`        | Welcher Partner liefert in welche Länder |
| `kostenlos-versand-schwellenwerte.rq` | Kostenlos-Versand-Schwellenwerte pro Land |
| `laendersperren.rq`                   | Ländersperren nach Kategorie und Land |
| `offene-punkte.rq`                    | Ungeklärte Fachentscheidungen im Versandmodul |

### `queries/personen/` – Stakeholder (alle `graph/personen/*.ttl`)

| Datei | Inhalt |
|-------|--------|
| `alle-stakeholder.rq`           | Alle Personen mit Rolle und Beschreibung |
| `entscheidungen-pro-person.rq`  | Wer hat welche Entscheidung getroffen? |
| `offene-fragen.rq`              | Offene Fragen mit verantwortlicher Person |

### Generische SKOS-Abfragen (im Skill, für neue Graphen)

| Datei | Inhalt |
|-------|--------|
| `queries/all-concepts.rq`      | Alle SKOS-Konzepte (generisch, kein Domain-Prefix) |
| `queries/broader-narrower.rq`  | Übergeordnete/untergeordnete Konzept-Hierarchie |
| `queries/related-concepts.rq`  | `skos:related`-Beziehungen |
| `queries/top-concepts.rq`      | Konzepte ohne übergeordnetes Konzept (Wurzeln) |
| `queries/search-by-label.rq`   | Substring-Suche im Label (Suchbegriff anpassen) |

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

## Präfixe im Depot

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
PREFIX foaf:    <http://xmlns.com/foaf/0.1/>
```

Für weitere SPARQL-Muster → [references/sparql-cheatsheet.md](references/sparql-cheatsheet.md)

---

## Validierung – TTL-Syntax und SPARQL-Queries prüfen

Nur die tatsächlich geänderten Dateien übergeben (sehr schnell, ~150ms):

```bash
node .agents/skills/sparql-query/scripts/validate.js graph/versand.ttl
node .agents/skills/sparql-query/scripts/validate.js graph/versand.ttl queries/versand/laendersperren.rq
```

Alle Dateien auf einmal (wenn viele Dateien geändert wurden):

```bash
npm run validate
```

Das Skript prüft:
- **Turtle-Syntax** von `.ttl`-Dateien (via `rdf-parse`, in-process, parallel)
- **SPARQL-Syntax** von `.rq`-Dateien (via `sparqljs`, in-process)

Bei Fehlern: Exit-Code 1, Ausgabe zeigt betroffene Datei und Fehlermeldung.

---

## SHACL-Validierung – Geschäftsregeln prüfen

Prüft alle `sh:NodeShape`-Constraints gegen die Graphdaten:

```bash
# Alle graph/*.ttl prüfen (Standard)
node .agents/skills/sparql-query/scripts/validate-shacl.js

# Nur eine Datei
node .agents/skills/sparql-query/scripts/validate-shacl.js graph/versand.ttl

# Mehrere Dateien
node .agents/skills/sparql-query/scripts/validate-shacl.js graph/versand.ttl graph/glossary.ttl

# Als npm-Skript
npm run validate:shacl
```

### Optionen

| Option | Beschreibung | Standard |
|--------|-------------|----------|
| `--format table\|json` | Ausgabeformat | `table` |
| `--severity violation\|warning\|info` | Schwelle für angezeigte Befunde | `info` |
| `--fail-on violation\|warning\|info` | Exit-Code 1 ab diesem Schweregrad | `violation` |

### Unterstützte Constraint-Typen

| Typ | Implementierung | Beispiel |
|-----|----------------|----------|
| `sh:property` (minCount, datatype, minInclusive …) | `rdf-validate-shacl` | `versand:AufpreisShape` |
| `sh:sparql` (SPARQLConstraintComponent) | Comunica | `versand:SperrgutVersandShape` |

### Automatische Validierung durch die Extension

Die Extension `shacl-guard.ts` läuft im Hintergrund: Nach jedem `write`- oder
`edit`-Call auf eine `.ttl`-Datei wird `validate-shacl.js` automatisch ausgeführt.
Violations werden dem Agenten als Fehler angezeigt, Warnings als Hinweis.

---

## Fehlerbehebung

| Fehler | Ursache / Lösung |
|--------|-----------------|
| `Cannot find package '@comunica/query-sparql-file'` | `npm install` im Skill-Verzeichnis vergessen |
| `file not found` | Pfad zu `.ttl`-Datei prüfen; relativer vs. absoluter Pfad |
| `SPARQL Error: Parse error` | SPARQL-Syntax prüfen; Prefixe vollständig angeben |
| Leere Ergebnisse | Präfixe/IRIs mit `SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10` debuggen |

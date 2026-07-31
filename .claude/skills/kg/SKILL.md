---
name: kg
description: Knowledge-Graph-Browser-Ersatz für Claude Code. Durchsucht alle TTL-Dateien in graph/ per SPARQL und lädt passende Einträge (Konzepte, Klassen, Personen, Instanzen) mit ihren vollständigen Properties in den Kontext. Ersetzt das interaktive kg-browser-TUI-Overlay aus pi. Nutze es, wenn der Nutzer den Graphen erkunden/durchstöbern will oder bestimmte Einträge als Kontext braucht, z. B. "/kg Sperrgut" oder "zeig mir alle Personen aus dem Graph".
---

# KG Browser (Claude-Code-Ersatz für pi `kg-browser`)

pi bietet ein interaktives TUI-Overlay (`Alt+K`). Claude Code hat kein TUI-Overlay,
aber denselben Zweck – **Graph durchsuchen und Einträge als Kontext laden** – erfüllt
dieser Skill über SPARQL. Kein Rohtext aus TTL lesen: immer über `query.js`.

## Aufruf

`/kg <suchbegriff>` – oder ohne Argument für einen Überblick.

## Ablauf

1. **TTL-Dateien ermitteln:**
   ```bash
   find graph -name "*.ttl" -o -name "*.rdf" -o -name "*.n3"
   ```

2. **Übersicht laden** (alle benannten Einträge mit Label + Definition). Alle gefundenen
   Dateien als mehrere `--file`-Argumente übergeben:
   ```bash
   node .agents/skills/sparql-query/scripts/query.js \
     --file graph/<a>.ttl --file graph/<b>.ttl \
     --format json \
     --sparql "SELECT DISTINCT ?uri ?type ?label ?def WHERE {
       ?uri a ?type .
       OPTIONAL { ?uri <http://www.w3.org/2004/02/skos/core#prefLabel> ?label }
       OPTIONAL { ?uri <http://www.w3.org/2000/01/rdf-schema#label> ?label }
       OPTIONAL { ?uri <https://schema.org/name> ?label }
       OPTIONAL { ?uri <http://www.w3.org/2004/02/skos/core#definition> ?def }
       OPTIONAL { ?uri <http://www.w3.org/2000/01/rdf-schema#comment> ?def }
       FILTER(isIRI(?uri))
       FILTER(?type NOT IN (
         <http://www.w3.org/2002/07/owl#Ontology>,
         <http://www.w3.org/ns/shacl#NodeShape>,
         <http://www.w3.org/ns/shacl#PropertyShape>,
         <http://www.w3.org/2004/02/skos/core#ConceptScheme>))
     } ORDER BY ?label"
   ```

3. **Filtern:** Wurde ein Suchbegriff übergeben, nur Einträge behalten, deren Label
   oder Definition ihn (case-insensitive) enthält. Nach Typ gruppiert präsentieren
   (Konzepte ◆ / Klassen ■ / Personen ● / Properties → / Instanzen ○).

4. **Details eines Eintrags laden**, wenn der Nutzer einen auswählt oder danach fragt:
   ```bash
   node .agents/skills/sparql-query/scripts/query.js \
     --file graph/<datei>.ttl --format json \
     --sparql "SELECT ?pred ?obj WHERE { <VOLLE_URI> ?pred ?obj } ORDER BY ?pred"
   ```

5. **Als Kontext behalten:** Die ausgewählten Einträge mit URI, Definition und
   Properties strukturiert zusammenfassen. Jede inhaltliche Aussage muss durch einen
   abgefragten Tripel gedeckt sein – Interpretationen klar als solche kennzeichnen
   (siehe `AGENTS.md`).

## Hinweis

Das ist der nicht-interaktive Ersatz für das pi-Overlay. Für die volle Live-Navigation
(`Alt+K`, Tab-Kategorien, Markieren) weiterhin pi verwenden.

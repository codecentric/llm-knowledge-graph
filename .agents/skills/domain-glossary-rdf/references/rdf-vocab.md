# RDF-Vokabular im Domain Glossary Skill

## Verwendete Ontologien

### SKOS — Simple Knowledge Organization System
**Prefix:** `skos:` → `http://www.w3.org/2004/02/skos/core#`
**Spezifikation:** https://www.w3.org/TR/skos-reference/

| Term | Verwendung |
|------|-----------|
| `skos:ConceptScheme` | Wurzel-Container für alle Konzepte des Glossars |
| `skos:Concept` | Einzelner Domain-Begriff |
| `skos:prefLabel` | Bevorzugtes Label (mit Sprach-Tag) |
| `skos:altLabel` | Synonyme, Abkürzungen |
| `skos:hiddenLabel` | Falschschreibungen, Lookup-Hilfe |
| `skos:definition` | Formale Definition (Freitext) |
| `skos:scopeNote` | Verwendungshinweis |
| `skos:example` | Anwendungsbeispiel |
| `skos:inScheme` | Verbindet Konzept mit ConceptScheme |
| `skos:broader` | Übergeordnetes Konzept (Hierarchie ↑) |
| `skos:narrower` | Untergeordnetes Konzept (Hierarchie ↓) |
| `skos:related` | Assoziative Relation (nicht hierarchisch) |
| `skos:exactMatch` | Äquivalenz zu externem Konzept |
| `skos:closeMatch` | Enge Ähnlichkeit zu externem Konzept |

### OWL — Web Ontology Language
**Prefix:** `owl:` → `http://www.w3.org/2002/07/owl#`

| Term | Verwendung |
|------|-----------|
| `owl:Ontology` | Deklaration des RDF-Dokuments als Ontologie |

### RDFS — RDF Schema
**Prefix:** `rdfs:` → `http://www.w3.org/2000/01/rdf-schema#`

| Term | Verwendung |
|------|-----------|
| `rdfs:label` | Allgemeines Label |
| `rdfs:comment` | Freitext-Kommentar (z. B. Term-Häufigkeit) |

### Dublin Core Terms
**Prefix:** `dct:` → `http://purl.org/dc/terms/`

| Term | Verwendung |
|------|-----------|
| `dct:title` | Titel des Glossars |
| `dct:created` | Erstellungsdatum (xsd:date) |
| `dct:source` | Quelldokumente |

---

## Beispiel-Turtle

```turtle
@prefix :     <https://example.org/glossary#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix dct:  <http://purl.org/dc/terms/> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<https://example.org/glossary#>
    a owl:Ontology ;
    dct:title "Domain Glossary" ;
    dct:created "2026-05-08"^^xsd:date ;
    dct:source "anforderungen.md" .

:GlossaryScheme
    a skos:ConceptScheme ;
    skos:prefLabel "Domain Glossary"@de ;
    rdfs:comment "Auto-generated glossary." .

:Domainbegriff
    a skos:Concept ;
    skos:prefLabel "Domainbegriff"@de ;
    skos:definition ""@de ;                  # ← manuell ergänzen
    skos:inScheme :GlossaryScheme ;
    rdfs:comment "Term frequency in source corpus: 7" .
```

---

## Empfohlene Nachbearbeitung

1. **`skos:definition`** für jeden Begriff manuell oder per LLM befüllen.
2. **`skos:broader` / `skos:narrower`** Hierarchien modellieren (Taxonomie).
3. **`skos:altLabel`** für Synonyme und Abkürzungen ergänzen.
4. **`skos:exactMatch`** auf bestehende Ontologien verlinken (z. B. Wikidata, GND).
5. Validierung mit [SKOS Testing Tool](https://www.w3.org/2001/sw/wiki/SKOS/Datasets) oder `skosify`.

---

## Weiterführende Werkzeuge

| Tool | Beschreibung |
|------|-------------|
| [Protégé](https://protege.stanford.edu/) | OWL/SKOS Editor mit GUI |
| [skosify](https://github.com/NatLibFi/Skosify) | SKOS-Validierung & -Konvertierung (Python) |
| [VocBench](http://vocbench.uniroma2.it/) | Kollaboratives Thesaurus-Management |
| [SKOS Play!](https://skos-play.sparna.fr/) | SKOS-Visualisierung & HTML-Export |
| [Apache Jena](https://jena.apache.org/) | SPARQL-Abfragen auf TTL-Dateien |

# SPARQL 1.1 Cheat Sheet (for SKOS/OWL Knowledge Graphs)

## Common Prefixes

```sparql
PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct:  <http://purl.org/dc/terms/>
```

## Query Types

| Type        | Returns        | Comunica method      |
|-------------|----------------|----------------------|
| `SELECT`    | Variable bindings (table) | `queryBindings` |
| `ASK`       | true / false   | `queryBoolean`       |
| `CONSTRUCT` | RDF triples    | `queryQuads`         |
| `DESCRIBE`  | RDF triples    | `queryQuads`         |

## Useful Patterns

### All triples
```sparql
SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 20
```

### All SKOS concepts with labels
```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?c ?label WHERE { ?c a skos:Concept ; skos:prefLabel ?label }
```

### Hierarchy (broader/narrower)
```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?child ?childLabel ?parent ?parentLabel WHERE {
  ?child skos:broader ?parent ;
         skos:prefLabel ?childLabel .
  ?parent skos:prefLabel ?parentLabel .
}
```

### Full-text substring search
```sparql
FILTER(CONTAINS(LCASE(STR(?label)), LCASE("checkout")))
```

### Language filter
```sparql
FILTER(LANG(?label) = "de")
```

### Optional values (LEFT JOIN)
```sparql
OPTIONAL { ?concept skos:definition ?def . }
```

### Existence check (ASK)
```sparql
ASK { <https://example.org/glossary#Checkout> a skos:Concept }
```

### CONSTRUCT (extract subgraph)
```sparql
CONSTRUCT { ?s skos:prefLabel ?l ; skos:definition ?d }
WHERE     { ?s a skos:Concept ; skos:prefLabel ?l . OPTIONAL { ?s skos:definition ?d } }
```

### Count results
```sparql
SELECT (COUNT(?c) AS ?total) WHERE { ?c a skos:Concept }
```

### Transitive broader (all ancestors)
```sparql
SELECT ?concept ?ancestor WHERE {
  ?concept skos:broader+ ?ancestor .
}
```

## Comunica `--format` options

| Value    | Description                          |
|----------|--------------------------------------|
| `table`  | ASCII table (default, best for agent)|
| `json`   | JSON array of binding objects        |
| `csv`    | CSV with header row                  |
| `turtle` | Turtle (for CONSTRUCT/DESCRIBE only) |

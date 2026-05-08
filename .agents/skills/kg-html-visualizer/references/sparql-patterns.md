# SPARQL-Muster für Knowledge-Graph-Visualisierungen

Alle Queries sind für Oxigraph (SPARQL 1.1) getestet. Prefixe müssen im Query deklariert sein, auch wenn sie im TTL definiert sind.

## Präfix-Block (immer einfügen)

```sparql
PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct:  <http://purl.org/dc/terms/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
```

---

## SKOS-Glossar

### Alle Konzepte mit Label + Definition

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label ?definition WHERE {
  ?concept a skos:Concept ;
           skos:prefLabel ?label .
  OPTIONAL { ?concept skos:definition ?definition }
  FILTER(LANG(?label) = "de" || LANG(?label) = "")
}
ORDER BY ?label
```

### Konzepte mit altLabels (für Tag-Anzeige)

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label (GROUP_CONCAT(?alt; SEPARATOR="|") AS ?altLabels) WHERE {
  ?concept a skos:Concept ;
           skos:prefLabel ?label .
  OPTIONAL { ?concept skos:altLabel ?alt }
}
GROUP BY ?concept ?label
ORDER BY ?label
```

### Hierarchie-Kanten (für Cytoscape)

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?source ?sourceLabel ?target ?targetLabel ?relType WHERE {
  {
    ?source skos:broader ?target .
    BIND("broader" AS ?relType)
  } UNION {
    ?source skos:related ?target .
    BIND("related" AS ?relType)
  }
  ?source skos:prefLabel ?sourceLabel .
  ?target skos:prefLabel ?targetLabel .
  FILTER(LANG(?sourceLabel) = "de" || LANG(?sourceLabel) = "")
  FILTER(LANG(?targetLabel) = "de" || LANG(?targetLabel) = "")
}
```

### ConceptScheme-Metadaten

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct:  <http://purl.org/dc/terms/>
SELECT ?title ?created WHERE {
  ?scheme a skos:ConceptScheme .
  OPTIONAL { ?scheme skos:prefLabel ?title }
  OPTIONAL { ?scheme dct:created ?created }
}
LIMIT 1
```

---

## OWL/RDFS-Ontologien

### Klassen mit Labels

```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
SELECT ?class ?label ?comment WHERE {
  ?class a owl:Class .
  OPTIONAL { ?class rdfs:label ?label }
  OPTIONAL { ?class rdfs:comment ?comment }
  FILTER(!isBlank(?class))
}
ORDER BY ?label
```

### Subklassen-Hierarchie (Cytoscape-Kanten)

```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
SELECT ?child ?childLabel ?parent ?parentLabel WHERE {
  ?child rdfs:subClassOf ?parent .
  FILTER(!isBlank(?child) && !isBlank(?parent))
  OPTIONAL { ?child  rdfs:label ?childLabel }
  OPTIONAL { ?parent rdfs:label ?parentLabel }
}
```

### Object Properties als Kanten

```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
SELECT ?prop ?domain ?range ?label WHERE {
  ?prop a owl:ObjectProperty .
  OPTIONAL { ?prop rdfs:domain ?domain }
  OPTIONAL { ?prop rdfs:range  ?range  }
  OPTIONAL { ?prop rdfs:label  ?label  }
  FILTER(!isBlank(?prop))
}
```

---

## Generische Instanz-Daten

### Alle Instanzen einer Klasse

```sparql
# __CLASS_IRI__ ersetzen z. B. durch <https://example.org#Person>
SELECT ?instance ?label WHERE {
  ?instance a __CLASS_IRI__ .
  OPTIONAL { ?instance rdfs:label ?label }
  OPTIONAL { ?instance <http://schema.org/name> ?label }
}
ORDER BY ?label
```

### Alle Objekt-Relationen (Kraft-Graph, generisch)

```sparql
SELECT ?s ?sLabel ?p ?pLabel ?o ?oLabel WHERE {
  ?s ?p ?o .
  FILTER(isIRI(?o) && isIRI(?s))
  FILTER(?p != rdf:type)
  OPTIONAL { ?s rdfs:label ?sLabel }
  OPTIONAL { ?o rdfs:label ?oLabel }
  OPTIONAL { ?p rdfs:label ?pLabel }
}
LIMIT 500
```

---

## Tipps für Oxigraph im Browser

- Oxigraph unterstützt **SPARQL 1.1 SELECT, CONSTRUCT, ASK, DESCRIBE**
- `GROUP_CONCAT` funktioniert; `SEPARATOR` muss in Anführungszeichen stehen
- `BIND` und `VALUES` werden unterstützt
- Kein `LOAD` oder `SERVICE` im Browser-WASM
- Ergebnis-Bindings sind `Map`-Objekte: `row.get("label").value` für den Stringwert
- Literal-Typ prüfen: `row.get("x").termType === "Literal"`
- IRI-Wert: `row.get("x").value` (gibt die IRI als String zurück)

---
name: domain-glossary-rdf
description: Extracts domain-specific concepts from unstructured input documents and builds a formal SKOS/OWL RDF glossary in Turtle format. The agent reads the documents, identifies relevant terms (nouns, verbs, adjectives – whatever is domain-relevant) using LLM understanding, and serialises the result as Turtle. Use this skill when the user wants to identify domain vocabulary, build a knowledge base, or produce a machine-readable concept glossary from raw documents.
---

# Domain Glossary RDF Skill

Dieses Skill analysiert unstrukturierte Eingabedokumente mit LLM-Verständnis, extrahiert domänenrelevante Begriffe – unabhängig von Sprache oder Wortart – und persistiert das Ergebnis als RDF-Glossar im SKOS/OWL-Format (Turtle-Serialisierung).

## Abhängigkeiten installieren

Einmalig ausführen, bevor der Skill zum ersten Mal genutzt wird:

```bash
cd .agents/skills/domain-glossary-rdf && npm install
```

## Workflow

### Schritt 1 – Dokumente einlesen

Dokumente mit dem `read`-Tool einlesen oder direkt als Text im Chat entgegennehmen.
Mehrere Dateien oder Verzeichnisse können nacheinander eingelesen werden.

### Schritt 2 – Konzepte per LLM extrahieren

Den gesamten Dokumenttext an das LLM übergeben mit folgendem Prompt-Muster:

```
Analysiere den folgenden Text und extrahiere alle domänenrelevanten Konzepte
für ein Fachglossar. Berücksichtige dabei:

- Substantive (Entitäten, Rollen, Artefakte, Systeme)
- Verben / Prozessbegriffe (fachspezifische Tätigkeiten und Abläufe)
- Adjektive / Eigenschaften (wenn sie fachlich bedeutsam sind)
- Mehrwortbegriffe und Komposita als Ganzes

Für jeden Begriff bestimme:
- prefLabel: die bevorzugte Bezeichnung (in der Sprache des Dokuments)
- altLabels: Synonyme, Abkürzungen, alternative Schreibweisen (kann leer sein)
- definition: eine kurze fachliche Definition (1-2 Sätze, aus dem Kontext ableitbar)
- broader: falls ein übergeordnetes Konzept im selben Glossar erkennbar ist
- related: thematisch verwandte Konzepte im selben Glossar

Antworte ausschließlich als JSON-Array gemäß dem Schema in
references/concept-schema.json

TEXT:
<Dokumentinhalt>
```

### Schritt 3 – RDF/Turtle serialisieren

Das JSON-Array aus Schritt 2 an den Serialisierer übergeben:

```bash
echo '<JSON-Array>' | node .agents/skills/domain-glossary-rdf/scripts/to-turtle.js \
  --output glossary.ttl \
  --namespace "https://example.org/glossary#" \
  --lang de \
  --title "Mein Fachglossar"
```

Oder als Datei:

```bash
node .agents/skills/domain-glossary-rdf/scripts/to-turtle.js \
  --input concepts.json \
  --output glossary.ttl \
  --namespace "https://example.org/glossary#" \
  --lang de
```

**Optionen:**

| Option | Standard | Beschreibung |
|--------|----------|--------------|
| `--input` | stdin | JSON-Datei oder `-` für stdin |
| `--output` | `glossary.ttl` | Ausgabedatei (Turtle) |
| `--namespace` | `https://example.org/glossary#` | Basis-IRI für Konzepte |
| `--lang` | `de` | Sprach-Tag für Labels (`de`, `en`, …) |
| `--title` | `Domain Glossary` | Titel des ConceptScheme |
| `--source` | – | Quelldokument(e), kommasepariert |

### Schritt 4 – Ergebnis prüfen

```bash
node .agents/skills/domain-glossary-rdf/scripts/show-concepts.js glossary.ttl
```

## Verwendetes RDF-Vokabular

Siehe [references/rdf-vocab.md](references/rdf-vocab.md) für Details.

Das erzeugte Turtle-Dokument nutzt:
- **SKOS** (`skos:Concept`, `skos:prefLabel`, `skos:altLabel`, `skos:definition`, `skos:broader`, `skos:narrower`, `skos:related`)
- **OWL** (`owl:Ontology`)
- **DCTerms** (`dct:title`, `dct:created`, `dct:source`)
- **RDFS** (`rdfs:label`, `rdfs:comment`)

## Hinweise für den Agenten

- **Namespace:** Falls der Nutzer keinen angibt, einen sinnvollen Default aus Dateinamen oder Thema ableiten.
- **Sprache:** Die Sprache des Dokuments automatisch erkennen und `--lang` entsprechend setzen.
- **Wortarten:** Das LLM entscheidet, was domänenrelevant ist. Verben wie „authentifizieren", „persistieren" oder Adjektive wie „idempotent" können wichtiger sein als Substantive wie „System".
- **Granularität:** Lieber etwas breiter extrahieren; der Nutzer kann danach ausfiltern.
- **Mehrwortbegriffe:** Komposita und Phrasen als Ganzes behalten, nicht auseinanderreißen.
- **Relationen:** `broader`/`related` nur eintragen, wenn sie aus dem Text klar erkennbar sind – nicht raten.
- **Iterativ:** Der Nutzer kann das Glossar manuell ergänzen und `to-turtle.js` erneut aufrufen.

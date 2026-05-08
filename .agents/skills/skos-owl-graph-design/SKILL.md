---
name: skos-owl-graph-design
description: Architectural guidelines and design decisions for building domain knowledge graphs that combine SKOS concept schemes with OWL ontologies and SHACL business rules in RDF/Turtle. Use this skill whenever you are modelling a new domain module, connecting concepts to classes, writing SHACL shapes, or deciding how to structure namespaces and files in a multi-module RDF graph.
---

# SKOS + OWL Graph Design – Architekturprinzipien

Dieses Skill hält verbindliche Designentscheidungen und Leitlinien für den Aufbau von Wissensgraphen fest, die SKOS, OWL und SHACL kombinieren. Es wächst iterativ mit dem Projekt.

---

## Prinzip 1: Eine Ressource, eine URI — kein doppelter Namespace

**Entscheidung:** Konzepte aus dem SKOS-Glossar werden **nicht** in einem separaten OWL-Namespace dupliziert. Stattdessen erhält dieselbe URI beide Rollen gleichzeitig.

### Das Problem (Anti-Pattern)

```turtle
# ❌ FALSCH: Zwei URIs für dasselbe Konzept
:Versandpartner a skos:Concept ;          # im Glossar
    skos:prefLabel "Versandpartner"@de .

versand:Versandpartner a owl:Class ;      # in der Domänendatei
    skos:closeMatch :Versandpartner .     # künstliche Brücke nötig
```

Das erzeugt:
- Redundanz (zwei URIs, zwei Labels, zwei Definitionen)
- Wartungsaufwand (Änderungen müssen doppelt gepflegt werden)
- Verwirrung für Konsumenten des Graphen

### Die Lösung (RDF Punning)

```turtle
# ✅ RICHTIG: Eine URI, beide Rollen
:Versandpartner a skos:Concept, owl:Class ;
    skos:prefLabel  "Versandpartner"@de ;
    skos:definition "Ein beauftragtes Logistikunternehmen..."@de ;
    rdfs:label      "Versandpartner"@de .

# Instanzen direkt dagegen:
versand:DHL_Standard a :Versandpartner ;
    rdfs:label "DHL Standard"@de .
```

RDF erlaubt es explizit, dass eine URI mehrere `rdf:type`-Werte hat. OWL 2 nennt das *Punning* — es ist der empfohlene Weg für SKOS+OWL-Kombinationen.

### Wann `skos:closeMatch` trotzdem sinnvoll ist

`skos:closeMatch` (und `skos:exactMatch`) sind für **externe** Vokabulare gedacht:

```turtle
:Versandpartner skos:closeMatch <http://schema.org/DeliveryMethod> .
```

Innerhalb desselben Graphen: nie `closeMatch` als Ersatz für eine gemeinsame URI verwenden.

---

## Prinzip 2: Fachdomänen-orientierter Modulschnitt

**Entscheidung:** Der Graph wächst domänenweise, nicht technisch. Jedes Modul entspricht einer klar abgrenzbaren Fachdomäne.

### Dateistruktur

```
glossary.ttl          ← SKOS-Basisvokabular (alle Konzepte, alle Domänen)
versand.ttl           ← Fachdomäne Versandlogik
rabatt.ttl            ← Fachdomäne Rabatt- & Preislogik
checkout.ttl          ← Fachdomäne Checkout & Zahlungsmethoden
personen/             ← Stakeholder (eine Datei pro Person)
```

### Regeln für den Modulschnitt

- Ein Modul = eine fachliche Verantwortlichkeit (wie in DDD: Bounded Context)
- Instanzen und SHACL-Regeln leben im Fachmodul, nicht im Glossar
- Das Glossar enthält nur Konzepte (`skos:Concept` + `owl:Class`) — keine Instanzen
- Module referenzieren das Glossar via `owl:imports`

### Namespace-Strategie

```turtle
# Glossar-Namespace: Konzepte und Klassen
@prefix : <https://shop.example.org/glossary#> .

# Modul-Namespace: Instanzen und Properties
@prefix versand: <https://shop.example.org/versand#> .
```

Properties und Instanzen gehören in den Modul-Namespace. Klassen gehören in den Glossar-Namespace.

---

## Prinzip 3: Offene Punkte gehören in den Graphen

**Entscheidung:** Ungeklärte Fachentscheidungen werden nicht in Kommentaren oder Tickets versteckt, sondern als explizite Ressourcen im Graphen modelliert.

```turtle
versand:OffenerPunkt a owl:Class ;
    rdfs:label "Offener Punkt"@de .

versand:OffenerPunkt_AT_CH_Schwellenwert a versand:OffenerPunkt ;
    rdfs:label       "Kostenlos-Versand-Schwellenwert AT/CH"@de ;
    dct:description  "Thomas prüft ob 99 € korrekt ist. Deadline: 2024-03-15."@de ;
    dct:created      "2024-03-05"^^xsd:date ;
    versand:betrifft versand:AT, versand:CH ;
    versand:status   "offen" .
```

### Vorteile

- SPARQL-abfragbar: alle offenen Punkte auf einen Blick
- Direkt mit den betroffenen Ressourcen verknüpft
- Bleibt im Graphen bis die Entscheidung getroffen und als `"geklärt"` markiert ist

---

## Prinzip 4: SHACL-Schweregrade bewusst einsetzen

| Schweregrad | Bedeutung | Wann verwenden |
|---|---|---|
| `sh:Violation` | Daten sind ungültig | Harte Geschäftsregel, immer prüfbar |
| `sh:Warning` | Daten sind verdächtig | Offene Entscheidungen, Empfehlungen |
| `sh:Info` | Hinweis | Dokumentation, Best Practices |

Offene Punkte → `sh:Warning` bis die Entscheidung gefallen ist, dann auf `sh:Violation` hochstufen.

---

## Prinzip 5: Metadaten als Tripel, nicht als Kommentare

**Entscheidung:** Metadaten (Quelle, Datum, Urheber, Begründung) gehören nicht in Turtle-Kommentare (`#`), sondern als echte Tripel direkt an die Ressource — damit sie SPARQL-abfragbar sind.

```turtle
# ❌ FALSCH: Metadaten im Kommentar
versand:Sperre_Messer_UK a :Landerbeschrankung ;
    versand:gesperrteKategorie :Haushalt .  # Unterkategorie laut Meeting, Julia

# ✅ RICHTIG: Metadaten als Tripel
versand:Sperre_Messer_UK a :Landerbeschrankung ;
    versand:gesperrteKategorie :Haushalt ;
    dct:source      <inputs/meeting-checkout-versand.md> ;
    dct:contributor person:Julia ;
    dct:date        "2024-03-05"^^xsd:date ;
    dct:description "Kategoriebasiert (Haushalt inkl. Unterkategorien)."@de .
```

### Verwendete Properties

| Property | Bedeutung |
|---|---|
| `dct:source` | Quelldokument als URI |
| `dct:contributor` | Person als URI — niemals als String |
| `dct:date` / `dct:created` | Datum der Entscheidung |
| `dct:description` | Kontext und Begründung |
| `rdfs:comment` | Nur für technische Hinweise zur Ressource selbst |

Kommentare (`#`) sind erlaubt für Abschnittsüberschriften und Strukturhinweise — aber nie für inhaltliche Informationen, die später abgefragt werden sollen.

---

## Prinzip 6: Personen als eigene Ressourcen modellieren

**Entscheidung:** Stakeholder werden als `foaf:Person`-Instanzen ausmodelliert — nicht als Strings in `dct:contributor`. Jede Person bekommt eine eigene Turtle-Datei.

### Dateistruktur

```
personen/
├── _vocab.ttl     ← gemeinsame Klassen & Properties (einmalig)
├── sarah.ttl      ← eine Datei pro Person
├── marco.ttl
├── julia.ttl
└── ...
```

### Beispiel

```turtle
# personen/julia.ttl
person:Julia a foaf:Person, owl:NamedIndividual ;
    foaf:firstName       "Julia" ;
    org:role             person:Rolle_Logistik ;
    rdfs:label           "Julia (Logistik)"@de ;
    dct:source           <inputs/meeting-checkout-versand.md> ;
    person:hatEingebracht
        versand:DHL_Standard,
        versand:Sperre_Messer_UK .
```

### Warum URIs statt Strings

```turtle
# ❌ String: toter Endpunkt, nicht navigierbar
dct:contributor "Julia (Logistik)" .

# ✅ URI: vollständig verknüpft, SPARQL kann traversieren
dct:contributor person:Julia .
```

Mit URIs sind Fragen wie *„Welche Regeln hat Julia definiert?"*, *„Welche offenen Punkte liegen bei Thomas?"* oder *„Wer hat Marcos Frage beantwortet?"* direkt per SPARQL beantwortbar.

### Properties im `_vocab.ttl`

| Property | Domain | Bedeutung |
|---|---|---|
| `person:hatEntschieden` | `foaf:Person` | Finale Entscheidungsverantwortung |
| `person:hatEingebracht` | `foaf:Person` | Inhalte in Diskussion eingebracht |
| `person:hatInitiiert` | `foaf:Person` | Frage gestellt |
| `person:hatFestgehalten` | `foaf:Person` | Dokument verfasst / Protokoll geführt |
| `person:hatOffenePunkte` | `foaf:Person` | Verantwortlich für offene Punkte |
| `person:beantwortetVon` | `person:OffeneFrage` | Wer hat die Frage geklärt |

---

## Prinzip 7: Jede neue TTL-Datei braucht vollständige Prefix-Deklarationen

**Entscheidung:** Jede `.ttl`-Datei deklariert alle Prefixe, die sie verwendet – auch wenn benachbarte Dateien im selben Verzeichnis sie bereits deklarieren. RDF-Dateien werden einzeln oder in beliebiger Kombination geladen; ein Parser kennt nur die Prefixe der Datei, die er gerade liest.

### Checkliste beim Anlegen einer neuen TTL-Datei

1. Alle verwendeten Präfixe per `grep -o '[a-z]*:' datei.ttl | sort -u` ermitteln
2. Für jeden Präfix prüfen ob `@prefix xyz: <...> .` oben in der Datei steht
3. Keine typografischen Anführungszeichen (`„“`) innerhalb von Turtle-Literals – nur `"..."`; innere Anführungszeichen als einfache Hochkommas (`'`) oder mit `\"` escapen
4. Nach dem Anlegen/Ändern validieren: `cd /workspace && npm run validate`

### Standardsatz Prefixe für dieses Depot

```turtle
@prefix :        <https://shop.example.org/glossary#> .
@prefix versand: <https://shop.example.org/versand#> .
@prefix person:  <https://shop.example.org/personen#> .
@prefix skos:    <http://www.w3.org/2004/02/skos/core#> .
@prefix owl:     <http://www.w3.org/2002/07/owl#> .
@prefix rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix dct:     <http://purl.org/dc/terms/> .
@prefix foaf:    <http://xmlns.com/foaf/0.1/> .
@prefix org:     <http://www.w3.org/ns/org#> .
@prefix schema:  <https://schema.org/> .
@prefix sh:      <http://www.w3.org/ns/shacl#> .
```

Nur die tatsächlich verwendeten Prefixe einbinden, aber lieber einen zu viel als einen zu wenig.

---

## Entscheidungslog

| Datum | Entscheidung | Begründung |
|---|---|---|
| 2026-05-08 | Kein Doppel-Namespace für Konzepte (Prinzip 1) | Redundanz vermeiden; RDF Punning ist W3C-konform und ausreichend |
| 2026-05-08 | Domänenorientierter Modulschnitt (Prinzip 2) | Bounded-Context-Prinzip; Module unabhängig erweiterbar |
| 2026-05-08 | Offene Punkte als Graphressourcen (Prinzip 3) | SPARQL-Abfragbarkeit; keine Wissenssilos in Tickets oder Kommentaren |
| 2026-05-08 | SHACL-Schweregrade bewusst einsetzen (Prinzip 4) | Warning für offene Entscheidungen schafft abgestufte Validierung |
| 2026-05-08 | Metadaten als Tripel statt Kommentare (Prinzip 5) | Kommentare sind für Maschinen unsichtbar; Tripel sind abfragbar |
| 2026-05-08 | Personen als foaf:Person-Ressourcen (Prinzip 6) | Strings sind tote Enden im Graph; URIs ermöglichen Navigation und Abfragen |
| 2026-05-08 | Vollständige Prefix-Deklarationen pro Datei (Prinzip 7) | Dateien werden einzeln oder in beliebiger Kombination geladen; fehlende Prefixe führen zu Parse-Fehlern die erst zur Laufzeit sichtbar werden |

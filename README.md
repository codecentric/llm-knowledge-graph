# LLM + Knowledge Graph – Praxisbeispiel

> Begleitcode zum Artikel *„Knowledge Graphs als Langzeitgedächtnis für AI-Agenten"*

---

## Worum geht es hier?

Dieses Repository zeigt anhand eines konkreten Beispiels, wie ein **Knowledge Graph als strukturierte Dokumentation einer Fachdomäne** eingesetzt werden kann – und warum dieser Ansatz klassischen Dokumentationsformen (PDFs, Wikis, Confluence) überlegen ist, sobald ein LLM damit arbeiten soll.

Der Ansatz ist kein klassisches Datenverwaltungssystem. Es geht nicht darum, eine eCommerce-Anwendung zu bauen. Stattdessen wird der Knowledge Graph genutzt, um **Anforderungen, Geschäftsregeln und fachliche Zusammenhänge** einer Domäne so zu strukturieren, dass sie maschinell abfragbar, nachvollziehbar und widerspruchsfrei sind.

---

## Die Fachdomäne: eCommerce

Als Beispieldomäne dient ein fiktiver Online-Shop. Diese Domäne wurde gewählt, weil sie:

- **allgemein verständlich** ist – jeder kennt Produkte, Bestellungen, Rabatte und Versandregeln
- **komplex genug** ist – mit vielen Entitäten, Abhängigkeiten und Geschäftsregeln, die sich gegenseitig beeinflussen
- **typische Dokumentationsprobleme** zeigt – Regeln sind über viele Dokumente verteilt, widersprechen sich teilweise und sind schwer vollständig zu überblicken

Der Graph modelliert vier zentrale Bereiche:

| Modul | Inhalt |
|---|---|
| **Produktkatalog** | Produkte, Kategorien, Varianten, digitale vs. physische Güter |
| **Preisregeln & Rabatte** | Gutscheine, Kombinierbarkeitsregeln, Kundensegmente |
| **Checkout-Regeln** | Zahlungsmethoden, Versandoptionen, Länderbeschränkungen |
| **Stakeholder & Anforderungen** | Wer hat welche Anforderung definiert und warum |

Der Graph wird als **RDF-Ontologie** modelliert. RDF (Resource Description Framework) ist ein W3C-Standard zur Wissensrepräsentation – Fakten werden als Tripel gespeichert: **Subjekt → Prädikat → Objekt**. Abfragen erfolgen über **SPARQL**, die standardisierte Abfragesprache für RDF-Graphen. Dieser Ansatz macht das Wissen nicht nur maschinenlesbar, sondern auch interoperabel und erweiterbar.

Alle SPARQL-Abfragen sind als wiederverwendbare `.rq`-Dateien in `queries/` hinterlegt – geordnet nach Fachmodul, direkt ausführbar, mit Ausführungsbefehl als Kommentar in jeder Datei.

---

## Das Problem: LLMs als Wissensspeicher

Ein LLM direkt mit Domänenwissen zu befragen – egal ob per Prompt oder RAG über Dokumente – hat fundamentale Schwächen:

- **Halluzinationen:** Das Modell erfindet plausibel klingende, aber falsche Antworten
- **Keine Nachvollziehbarkeit:** Es kann keine Quelle für seine Aussagen nennen
- **Widersprüche werden ignoriert:** Bei konfligierenden Regeln wählt das Modell willkürlich
- **Kein Gedächtnis über Kontext hinaus:** Zusammenhänge zwischen weit entfernten Dokumenten gehen verloren

**Beispiel:** Die Frage *„Unter welchen Bedingungen darf ein Rabatt auf einen Artikel angewendet werden?“* erfordert das Wissen über Produktkategorien, Kundensegmente, Kombinierbarkeitsregeln und deren Ausnahmen – Informationen, die in einem klassischen Dokumentationssystem über mehrere Dokumente verteilt, schwer auffindbar und oft widersprüchlich sind. Ein LLM ohne strukturierte Wissensquelle kann diese Frage nicht zuverlässig beantworten – es kennt weder die konkrete Regel noch deren Herkunft. Der Knowledge Graph hingegen liefert nicht nur die Regel selbst, sondern auch den Stakeholder, der sie definiert hat, und die Anforderung, aus der sie entstammt.

---

## Der Ansatz: LLM als Übersetzer, Graph als Wissensquelle

Statt das LLM raten zu lassen, wird die Aufgabe klar aufgeteilt:

```
Natürliche Sprache
       │
       ▼
  LLM (Übersetzer)
       │  versteht die Frage, formuliert eine strukturierte Abfrage
       ▼
 Knowledge Graph
       │  liefert verifizierte, vollständige Fakten
       ▼
  LLM (Formulierer)
       │  formuliert die Antwort verständlich in natürlicher Sprache
       ▼
  Präzise Antwort mit nachvollziehbarer Quelle
```

Das LLM muss **nicht mehr wissen** – es muss nur noch **fragen und erklären**. Die Wahrheit liegt im Graph.

---

## Struktur des Repositories

```
.
├── README.md
├── AGENTS.md              # Instruktionen für den AI-Agenten (Graph-first-Prinzip)
├── apps/                  # Generierte HTML-Visualisierungen des Knowledge Graphs
├── graph/                 # Alle RDF-Dateien des Knowledge Graphs
├── inputs/                # Rohdaten, die als Basis für die Graphgenerierung dienen
│   └── ...                #   freie Struktur – Unterordner, Dateien, wie es passt
└── queries/               # SPARQL-Abfragen, nach Fachmodul geordnet
```

### `graph/` – Der Knowledge Graph

Alle RDF/Turtle-Dateien (`.ttl`) liegen zentral im Ordner `graph/`. Der Graph wächst
dynamisch – neue Fachmodule werden als neue `.ttl`-Dateien in diesem Ordner abgelegt,
ggf. in thematischen Unterordnern. Es gibt keine feste Dateiliste; der gesamte Inhalt
von `graph/` bildet gemeinsam den Knowledge Graph der Domäne.

### `inputs/` – Woher kommt das Wissen?

Der Knowledge Graph entsteht nicht aus dem Nichts. Die Grundlage bilden unstrukturierte oder halbstrukturierte Rohdaten, wie sie im Projektalltag anfallen – etwa Meeting-Protokolle, CSV-Exporte aus Jira, Notion oder ERP-Systemen, Freitext-Notizen oder Anforderungsschnipsel.

Die interne Struktur von `inputs/` ist **bewusst freigelassen**. Unterordner, Dateinamen und Formate können je nach Projekt und Domäne frei gewählt werden. Einzige Anforderung: die Dateien müssen für den Extraktionsschritt lesbar sein.

Diese Dokumente werden **nicht direkt** in den Graph übernommen. Stattdessen dienen sie als Input für einen LLM-gestützten Extraktionsschritt, der relevante Entitäten, Beziehungen und Regeln identifiziert und in RDF-Tripel überführt:

```
Rohdokument (inputs/)
       │
       ▼
  LLM (Extraktor)
       │  erkennt Entitäten, Beziehungen, Regeln und Widersprüche
       ▼
  RDF-Tripel (graph/)
       │
       ▼
  Knowledge Graph – abfragbar via SPARQL (queries/)
```

Die Rohdokumente bleiben im Repository erhalten, um die **Herkunft jedes Graphknotens nachvollziehbar** zu machen – Quelldokument und Extraktionszeitpunkt können als Metadaten direkt am Tripel hinterlegt werden.

---

## Tech-Stack

- **Wissensrepräsentation:** RDF (Resource Description Framework)
- **Abfragesprache:** SPARQL

---

## Weiterführend

Dieser Code begleitet den Artikel:
> *„Knowledge Graphs als Langzeitgedächtnis für AI-Agenten – wie LLMs aufhören zu raten und anfangen nachzuschlagen"*

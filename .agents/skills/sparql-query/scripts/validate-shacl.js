#!/usr/bin/env node
/**
 * validate-shacl.js — SHACL-Validierung für den Knowledge Graph
 *
 * Unterstützt zwei SHACL-Constraint-Typen:
 *   ① sh:property-Constraints  → via rdf-validate-shacl
 *   ② sh:sparql-Constraints    → via Comunica (SPARQL-Ausführung)
 *
 * Verwendung:
 *   node validate-shacl.js                          # alle graph/*.ttl
 *   node validate-shacl.js graph/versand.ttl        # nur diese Datei
 *   node validate-shacl.js --format json            # JSON-Ausgabe
 *   node validate-shacl.js --severity warning       # ab Warning anzeigen
 *   node validate-shacl.js --fail-on warning        # Exit 1 ab Warning
 *
 * Exit-Code:
 *   0  keine Befunde mit dem konfigurierten fail-on-Schweregrad (Standard: violation)
 *   1  mindestens ein Befund ab fail-on-Schweregrad
 */

import fs   from "fs";
import path from "path";
import { createRequire } from "module";

// CommonJS-Pakete
const require = createRequire(import.meta.url);
const N3 = require("n3");

// ESM-Pakete
const { default: SHACLValidator } = await import("rdf-validate-shacl");
const { default: shaclFactory }   = await import("rdf-validate-shacl/src/defaultEnv.js");
const { QueryEngine }             = await import("@comunica/query-sparql-file");

// ─── CLI-Parsing ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const positional = [];
const opts = { format: "table", severity: "info", "fail-on": "violation" };

for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    const key = argv[i].slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      opts[key] = argv[++i];
    } else {
      opts[key] = true;
    }
  } else {
    positional.push(argv[i]);
  }
}

// ─── Konstanten ──────────────────────────────────────────────────────────────

const SH     = "http://www.w3.org/ns/shacl#";
const RDF    = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS   = "http://www.w3.org/2000/01/rdf-schema#";
const SH_NodeShape  = `${SH}NodeShape`;
const SH_sparql     = `${SH}sparql`;
const SH_select     = `${SH}select`;
const SH_message    = `${SH}message`;
const SH_severity   = `${SH}severity`;
const SH_Violation  = `${SH}Violation`;
const SH_Warning    = `${SH}Warning`;
const RDF_type      = `${RDF}type`;
const RDFS_label    = `${RDFS}label`;

const SEVERITY_ORDER = { violation: 3, warning: 2, info: 1 };

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function rel(p) {
  return path.relative(process.cwd(), path.resolve(p));
}

function findTtlFiles(dir) {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) return [];
  const out = [];
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, e.name);
    if (e.isDirectory()) out.push(...findTtlFiles(full));
    else if (e.name.endsWith(".ttl")) out.push(full);
  }
  return out.sort();
}

function parseTurtle(files) {
  const allQuads = [];
  const parser = new N3.Parser();
  for (const file of files) {
    const content = fs.readFileSync(path.resolve(file), "utf8");
    try {
      allQuads.push(...parser.parse(content));
    } catch (e) {
      throw new Error(`Parse-Fehler in ${rel(file)}: ${e.message}`);
    }
  }
  return allQuads;
}

function severityLabel(iri) {
  if (!iri) return "Info";
  const local = iri.split(/[#/]/).pop()?.toLowerCase() ?? "";
  if (local === "violation") return "Violation";
  if (local === "warning")   return "Warning";
  return "Info";
}

function severityLevel(label) {
  return SEVERITY_ORDER[label.toLowerCase()] ?? 1;
}

function localName(iri) {
  if (!iri) return "";
  return iri.split(/[#/]/).pop() ?? iri;
}

// ─── Dateien bestimmen ───────────────────────────────────────────────────────

const files = positional.length > 0
  ? positional.map((f) => path.resolve(f))
  : findTtlFiles("graph");

if (files.length === 0) {
  console.log("(keine TTL-Dateien gefunden)");
  process.exit(0);
}

// ─── Graphen laden ───────────────────────────────────────────────────────────

let allQuads;
try {
  allQuads = parseTurtle(files);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

// N3.Store für direkten Quad-Zugriff (SPARQL-Shape-Extraktion)
const store = new N3.Store(allQuads);

// RDFJS-Dataset für rdf-validate-shacl
const dataset = shaclFactory.dataset(allQuads);

// ─── Shapes-Count prüfen ─────────────────────────────────────────────────────

const shapeNodes = store.getSubjects(RDF_type, SH_NodeShape, null);

if (shapeNodes.length === 0) {
  console.log("ℹ️  Keine sh:NodeShape-Instanzen gefunden – SHACL-Validierung übersprungen.");
  process.exit(0);
}

// ─── ① Property-Shapes via rdf-validate-shacl ────────────────────────────────

// Shapes mit sh:sparql aus dem dataset entfernen (nicht unterstützt),
// um den Validator nicht zum Absturz zu bringen.
// Dafür ein gefiltertes Dataset erstellen.

const sparqlShapeNodes = new Set(
  store.getSubjects(SH_sparql, null, null).map((s) => s.value)
);

// Auch blank nodes, die als sh:sparql-Objekte an Shapes hängen
const sparqlConstraintBNodes = new Set(
  store.getObjects(null, SH_sparql, null).map((o) => o.value)
);

// Dataset ohne SPARQL-Constraints
const nonSparqlQuads = allQuads.filter((q) => {
  // Quads, die direkt zu einem SPARQL-Constraint-Blank-Node gehören, ausschließen
  if (sparqlConstraintBNodes.has(q.subject.value)) return false;
  // Quads, die sh:sparql-Beziehungen darstellen, ausschließen
  if (q.predicate.value === SH_sparql) return false;
  return true;
});

const nonSparqlDataset = shaclFactory.dataset(nonSparqlQuads);

const propertyResults = [];
try {
  const validator = new SHACLValidator(nonSparqlDataset, {
    importGraph: () => nonSparqlDataset,
  });
  const report = await validator.validate(nonSparqlDataset);

  for (const r of report.results) {
    const label = severityLabel(r.severity?.value ?? "");
    propertyResults.push({
      type: "property",
      severity: label,
      level: severityLevel(label),
      message:    r.message?.map((m) => m.value).join("; ") ?? "(keine Meldung)",
      path:       r.path?.value ?? "",
      focusNode:  r.focusNode?.value ?? "",
      shape:      r.sourceShape?.value ?? "",
      constraint: localName(r.sourceConstraintComponent?.value ?? ""),
    });
  }
} catch (e) {
  console.error(`⚠️  Property-Shape-Validierung fehlgeschlagen: ${e.message}`);
}

// ─── ② SPARQL-Constraints via Comunica ───────────────────────────────────────

// Alle sh:sparql-Blanknode-Constraints aus dem Store extrahieren

const sparqlResults = [];

for (const shapeNode of shapeNodes) {
  // Shape-Label für Meldungen
  const shapeLabels = store.getObjects(shapeNode, RDFS_label, null);
  const shapeLabel = shapeLabels[0]?.value ?? localName(shapeNode.value);

  // Alle sh:sparql-Constraints dieser Shape
  const constraintNodes = store.getObjects(shapeNode, SH_sparql, null);

  for (const constraintNode of constraintNodes) {
    // sh:select auslesen
    const selectObjs = store.getObjects(constraintNode, SH_select, null);
    if (selectObjs.length === 0) continue;
    const selectQuery = selectObjs[0].value;

    // sh:message
    const msgObjs = store.getObjects(constraintNode, SH_message, null);
    const msgText = msgObjs[0]?.value ?? `SHACL-Constraint verletzt (Shape: ${shapeLabel})`;

    // sh:severity
    const sevObjs = store.getObjects(constraintNode, SH_severity, null);
    const sevLabel = severityLabel(sevObjs[0]?.value ?? SH_Violation);

    // Comunica-Quellen aus den Dateien
    const sources = files.map((f) => ({ type: "file", value: f }));

    try {
      const engine = new QueryEngine();
      const bindingsStream = await engine.queryBindings(selectQuery, { sources });
      const bindings = await bindingsStream.toArray();

      // Jede Zeile im Ergebnis ist ein Verstoß
      for (const row of bindings) {
        // SHACL SPARQL-Constraints: $this (oder ?this) ist der Fokus-Knoten
        const thisNode =
          row.get("this")?.value ??
          row.get("subject")?.value ??
          "(unbekannt)";

        sparqlResults.push({
          type: "sparql",
          severity: sevLabel,
          level: severityLevel(sevLabel),
          message: msgText,
          focusNode: thisNode,
          shape: shapeNode.value,
          shapeLabel,
          constraint: "SPARQLConstraintComponent",
          path: "",
        });
      }
    } catch (e) {
      // SPARQL-Fehler als Warning ausgeben (nicht als fatalen Fehler)
      sparqlResults.push({
        type: "sparql-error",
        severity: "Warning",
        level: 2,
        message: `Constraint-Query fehlgeschlagen (${shapeLabel}): ${e.message.slice(0, 120)}`,
        focusNode: "",
        shape: shapeNode.value,
        shapeLabel,
        constraint: "SPARQLConstraintComponent",
        path: "",
      });
    }
  }
}

// ─── Ergebnisse zusammenführen ────────────────────────────────────────────────

const minLevel  = SEVERITY_ORDER[opts.severity.toLowerCase()]  ?? 1;
const failLevel = SEVERITY_ORDER[opts["fail-on"].toLowerCase()] ?? 3;

const allResults = [...propertyResults, ...sparqlResults]
  .filter((r) => r.level >= minLevel)
  .sort((a, b) => b.level - a.level);

// ─── Ausgabe ──────────────────────────────────────────────────────────────────

if (opts.format === "json") {
  console.log(JSON.stringify({
    shapeCount: shapeNodes.length,
    sparqlConstraintCount: sparqlResults.length,
    propertyConstraintCount: propertyResults.length,
    results: allResults,
  }, null, 2));
} else {
  const fileList = files.map(rel).join(", ");
  console.log(`\n🔍 SHACL-Validierung`);
  console.log(`   Dateien: ${fileList}`);
  console.log(`   Shapes:  ${shapeNodes.length} sh:NodeShape(s)  ` +
              `(${sparqlShapeNodes.size} mit SPARQL-Constraints)\n`);

  if (allResults.length === 0) {
    console.log(`✅ Konform – keine Verstöße gefunden.\n`);
  } else {
    const ICON = { Violation: "❌", Warning: "⚠️ ", Info: "ℹ️ " };

    for (const r of allResults) {
      const icon = ICON[r.severity] ?? "·";
      console.log(`${icon} [${r.severity.toUpperCase()}]  ${r.message}`);
      if (r.focusNode) {
        const local = localName(r.focusNode);
        console.log(`   Knoten:     ${local}  <${r.focusNode}>`);
      }
      if (r.path) {
        console.log(`   Pfad:       ${localName(r.path)}`);
      }
      if (r.shapeLabel) {
        console.log(`   Shape:      ${r.shapeLabel}`);
      } else if (r.shape) {
        console.log(`   Shape:      ${localName(r.shape)}`);
      }
      if (r.constraint) {
        console.log(`   Constraint: ${r.constraint}`);
      }
      console.log();
    }

    const byLevel = {};
    for (const r of allResults) byLevel[r.severity] = (byLevel[r.severity] ?? 0) + 1;
    const summary = Object.entries(byLevel)
      .sort((a, b) => severityLevel(b[0]) - severityLevel(a[0]))
      .map(([k, v]) => `${v} ${k}`)
      .join(", ");

    console.log("─".repeat(60));
    console.log(`Gesamt: ${allResults.length} Befund(e) – ${summary}\n`);
  }
}

// ─── Exit-Code ────────────────────────────────────────────────────────────────

const hasFailure = allResults.some((r) => r.level >= failLevel);
process.exit(hasFailure ? 1 : 0);

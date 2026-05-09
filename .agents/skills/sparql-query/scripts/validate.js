#!/usr/bin/env node
/**
 * validate.js — Turtle syntax check + SPARQL query syntax check (in-process)
 *
 * Prüft:
 *   - Turtle-Syntax von .ttl-Dateien  (via rdf-parse)
 *   - SPARQL-Syntax  von .rq-Dateien  (via sparqljs)
 *
 * Verwendung:
 *   node validate.js                          # alle .ttl in graph/, alle .rq in queries/
 *   node validate.js graph/versand.ttl        # nur diese eine Datei
 *   node validate.js graph/versand.ttl queries/versand/laendersperren.rq
 *   node validate.js --graph <dir> --queries <dir>   # andere Verzeichnisse
 *
 * Exit-Code:
 *   0  alles OK
 *   1  mindestens ein Fehler gefunden
 */

import fs   from "fs";
import path from "path";
import { createRequire } from "module";
import { rdfParser } from "rdf-parse";
import { QueryEngine } from "@comunica/query-sparql-file";

// sparqljs ist CommonJS
const require      = createRequire(import.meta.url);
const { Parser: SparqlParser } = require("sparqljs");

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// Explizit übergebene Dateien vs. Verzeichnis-Scan
const explicitFiles = args.filter(a => !a.startsWith("--"));
const flags         = Object.fromEntries(
  args.filter(a => a.startsWith("--"))
      .map(a => a.replace(/^--/, ""))
      .reduce((pairs, a, i, arr) => {
        if (i % 2 === 0) pairs.push([a, arr[i + 1]]);
        return pairs;
      }, [])
);

const GRAPH_DIR = path.resolve(flags.graph   ?? "graph");
const QUERY_DIR = path.resolve(flags.queries ?? "queries");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory())                     out.push(...findFiles(full, ext));
    else if (e.name.endsWith(ext)) out.push(full);
  }
  return out.sort();
}

function rel(p) { return path.relative(process.cwd(), p); }

function checkTtl(filePath) {
  return new Promise(resolve => {
    const stream = rdfParser.parse(
      fs.createReadStream(filePath),
      { path: filePath }
    );
    stream.on("data",  () => {});
    stream.on("error", e  => resolve({ ok: false, msg: e.message }));
    stream.on("end",   () => resolve({ ok: true }));
  });
}

function checkRq(filePath) {
  const sp = new SparqlParser();
  try {
    sp.parse(fs.readFileSync(filePath, "utf8"));
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// ─── Punning-Check ───────────────────────────────────────────────────────────
//
// Prüft zwei Invarianten über alle TTL-Dateien zusammen:
//
// 1. KEIN DUPLIKAT-NAMESPACE:
//    Instanzen außerhalb von glossary# dürfen nicht denselben rdfs:label
//    wie ein bestehendes skos:Concept haben (= zahlung:Kreditkarte-Anti-Pattern).
//
// 2. PUNNING VOLLSTÄNDIG:
//    Jedes Glossar-Konzept, das als rdf:type einer Instanz verwendet wird,
//    muss auch als owl:Class deklariert sein.
//
// Läuft nur beim vollständigen Verzeichnis-Scan (nicht bei expliziten Dateien),
// da beide Prüfungen mehrere Dateien gleichzeitig benötigen.

async function checkPunning(ttlFiles) {
  if (ttlFiles.length === 0) return [];
  const engine   = new QueryEngine();
  const sources  = ttlFiles.map(f => ({ type: "file", value: f }));
  const failures = [];

  // ── 1. Duplikat-Namespace ────────────────────────────────────────────────
  const dupQuery = `
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX owl:  <http://www.w3.org/2002/07/owl#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    SELECT DISTINCT ?duplikat ?glossarLabel WHERE {
      ?duplikat a owl:NamedIndividual .
      FILTER(!STRSTARTS(STR(?duplikat), "https://shop.example.org/glossary#"))
      { ?duplikat rdfs:label ?name } UNION { ?duplikat <http://www.w3.org/2004/02/skos/core#prefLabel> ?name }
      ?glossarKonzept a skos:Concept ; skos:prefLabel ?glossarLabel .
      FILTER(LCASE(STR(?name)) = LCASE(STR(?glossarLabel)))
    } ORDER BY ?glossarLabel`;

  const dupResult = await engine.queryBindings(dupQuery, { sources });
  const dupRows   = await dupResult.toArray();
  for (const row of dupRows) {
    failures.push(
      `Duplikat-Namespace: <${row.get("duplikat").value}> ` +
      `dupliziert Glossar-Konzept "${row.get("glossarLabel").value}" – ` +
      `stattdessen Glossar-URI direkt als owl:NamedIndividual verwenden (Punning).`
    );
  }

  // ── 2. Fehlendes owl:Class-Punning ──────────────────────────────────────
  const owlClassQuery = `
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX owl:  <http://www.w3.org/2002/07/owl#>
    SELECT DISTINCT ?konzept ?label WHERE {
      ?konzept a skos:Concept ; skos:prefLabel ?label .
      ?instanz a ?konzept .
      FILTER NOT EXISTS { ?konzept a owl:Class }
      FILTER(STRSTARTS(STR(?konzept), "https://shop.example.org/glossary#"))
    } ORDER BY ?label`;

  const owlClassResult = await engine.queryBindings(owlClassQuery, { sources });
  const owlClassRows   = await owlClassResult.toArray();
  for (const row of owlClassRows) {
    failures.push(
      `Fehlendes owl:Class: <${row.get("konzept").value}> ("${row.get("label").value}") ` +
      `wird als rdf:type verwendet, ist aber nicht als owl:Class deklariert. ` +
      `→ Im Glossar ergänzen: :${row.get("konzept").value.split("#")[1]} a owl:Class .`
    );
  }

  return failures;
}

// ─── Dateiliste aufbauen ──────────────────────────────────────────────────────

let ttlFiles, rqFiles;

if (explicitFiles.length > 0) {
  // Nur die explizit genannten Dateien prüfen
  ttlFiles = explicitFiles.filter(f => f.endsWith(".ttl")).map(f => path.resolve(f));
  rqFiles  = explicitFiles.filter(f => f.endsWith(".rq")).map(f => path.resolve(f));
} else {
  // Ganzes Verzeichnis scannen
  ttlFiles = findFiles(GRAPH_DIR, ".ttl");
  rqFiles  = findFiles(QUERY_DIR, ".rq");
}

// ─── Prüfungen ausführen ──────────────────────────────────────────────────────

// Punning-Check nur beim vollständigen Scan (nicht bei expliziten Einzeldateien)
let punnErrors = [];
if (explicitFiles.length === 0 && ttlFiles.length > 0) {
  punnErrors = await checkPunning(ttlFiles);
}

let errors = 0;
const total = ttlFiles.length + rqFiles.length;

if (total === 0) {
  console.log("(keine Dateien zu prüfen)");
  process.exit(0);
}

if (ttlFiles.length > 0) {
  console.log(`\n📂 Turtle-Syntax\n`);
  const results = await Promise.all(ttlFiles.map(f => checkTtl(f)));
  for (let i = 0; i < ttlFiles.length; i++) {
    const { ok, msg } = results[i];
    if (ok) {
      console.log(`   ✅ ${rel(ttlFiles[i])}`);
    } else {
      console.log(`   ❌ ${rel(ttlFiles[i])}`);
      console.log(`      ${msg}`);
      errors++;
    }
  }
}

if (rqFiles.length > 0) {
  console.log(`\n📂 SPARQL-Syntax\n`);
  for (const f of rqFiles) {
    const { ok, msg } = checkRq(f);
    if (ok) {
      console.log(`   ✅ ${rel(f)}`);
    } else {
      console.log(`   ❌ ${rel(f)}`);
      console.log(`      ${msg}`);
      errors++;
    }
  }
}

if (punnErrors.length > 0) {
  console.log(`\n📂 Punning-Check\n`);
  for (const msg of punnErrors) {
    console.log(`   ❌ ${msg}`);
    errors++;
  }
}

console.log(`\n${"─".repeat(60)}`);
if (errors === 0) {
  console.log(`✅ Alle ${total} Prüfungen bestanden.\n`);
  process.exit(0);
} else {
  console.log(`❌ ${errors} von ${total} Prüfungen fehlgeschlagen.\n`);
  process.exit(1);
}

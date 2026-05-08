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

console.log(`\n${"─".repeat(60)}`);
if (errors === 0) {
  console.log(`✅ Alle ${total} Prüfungen bestanden.\n`);
  process.exit(0);
} else {
  console.log(`❌ ${errors} von ${total} Prüfungen fehlgeschlagen.\n`);
  process.exit(1);
}

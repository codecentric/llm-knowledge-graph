#!/usr/bin/env node
/**
 * query.js — SPARQL query runner for local RDF/Turtle files via Comunica
 *
 * Usage:
 *   node query.js --file <path.ttl> --sparql "<SELECT …>"
 *   node query.js --file <path.ttl> --query <queryfile.rq>
 *   node query.js --file <path.ttl> --sparql "<ASK …>"
 *   node query.js --file <path.ttl> --sparql "<CONSTRUCT …>"
 *
 * Options:
 *   --file    <path>    Path to the Turtle/RDF file (required)
 *   --sparql  <string>  Inline SPARQL query string
 *   --query   <path>    Path to a .rq SPARQL query file (alternative to --sparql)
 *   --format  <fmt>     Output format: table (default), json, csv, turtle
 *   --limit   <n>       Append LIMIT n to SELECT queries that have none (safety cap)
 *   --help              Show this message
 *
 * Examples:
 *   node query.js --file graph/glossary.ttl \
 *     --sparql "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"
 *
 *   node query.js --file graph/glossary.ttl \
 *     --query .agents/skills/sparql-query/queries/all-concepts.rq
 */

import fs   from "fs";
import path from "path";
import minimist from "minimist";
import { QueryEngine } from "@comunica/query-sparql-file";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usage() {
  console.log(`
Usage:
  node query.js --file <path.ttl> --sparql "<SPARQL>" [--format table|json|csv] [--limit N]
  node query.js --file <path.ttl> --query  <file.rq>  [--format table|json|csv] [--limit N]
`);
}

function termValue(term) {
  if (!term) return "";
  switch (term.termType) {
    case "NamedNode":  return `<${term.value}>`;
    case "Literal":
      if (term.language) return `"${term.value}"@${term.language}`;
      if (term.datatype && term.datatype.value !== "http://www.w3.org/2001/XMLSchema#string")
        return `"${term.value}"^^<${term.datatype.value}>`;
      return `"${term.value}"`;
    case "BlankNode":  return `_:${term.value}`;
    default:           return term.value;
  }
}

const pad = (s, w) => String(s ?? "").padEnd(w);

// ─── CLI ──────────────────────────────────────────────────────────────────────

const argv = minimist(process.argv.slice(2), {
  string:  ["sparql", "query", "format"],
  number:  ["limit"],
  boolean: ["help"],
  default: { format: "table" },
  alias:   { f: "file", s: "sparql", q: "query", h: "help" },
});

if (argv.help) { usage(); process.exit(0); }

// --file kann einmal oder mehrfach angegeben werden
const fileArgs = argv.file
  ? (Array.isArray(argv.file) ? argv.file : [argv.file])
  : [];

if (fileArgs.length === 0) {
  console.error("Error: --file is required.\n");
  usage();
  process.exit(1);
}

for (const f of fileArgs) {
  const resolved = path.resolve(f);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: file not found: ${resolved}`);
    process.exit(1);
  }
}

let sparql = "";
if (argv.sparql) {
  sparql = argv.sparql;
} else if (argv.query) {
  const qPath = path.resolve(argv.query);
  if (!fs.existsSync(qPath)) {
    console.error(`Error: query file not found: ${qPath}`);
    process.exit(1);
  }
  sparql = fs.readFileSync(qPath, "utf8");
} else {
  console.error("Error: one of --sparql or --query is required.\n");
  usage();
  process.exit(1);
}

// Safety limit: append LIMIT to SELECT queries that have none
if (argv.limit && /^\s*(PREFIX[^]*?\s+)?SELECT/i.test(sparql) && !/\bLIMIT\s+\d+/i.test(sparql)) {
  sparql = sparql.trimEnd() + `\nLIMIT ${argv.limit}`;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

const engine  = new QueryEngine();
const sources = fileArgs.map(f => ({ type: "file", value: `file://${path.resolve(f)}` }));
const context = { sources };

(async () => {
  try {
    const result = await engine.query(sparql, context);
    const rtype  = result.resultType;   // Comunica v3+: resultType (not .type)

    // ── SELECT ──────────────────────────────────────────────────────────────
    if (rtype === "bindings") {
      const stream = await result.execute();
      const rows   = [];
      let vars     = [];

      await new Promise((resolve, reject) => {
        stream.on("data", b => {
          if (vars.length === 0) vars = [...b.keys()].map(k => k.value);
          const row = {};
          for (const v of vars) row[v] = termValue(b.get(v));
          rows.push(row);
        });
        stream.on("end",   resolve);
        stream.on("error", reject);
      });

      if (rows.length === 0) { console.log("(no results)"); return; }

      const fmt = argv.format.toLowerCase();

      if (fmt === "json") {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (fmt === "csv") {
        console.log(vars.join(","));
        for (const row of rows)
          console.log(vars.map(v => `"${(row[v] ?? "").replace(/"/g, '""')}"`).join(","));
        return;
      }

      // table (default)
      const widths = vars.map(v => Math.max(v.length, ...rows.map(r => (r[v] ?? "").length)));
      const sep    = "+" + widths.map(w => "-".repeat(w + 2)).join("+") + "+";
      const header = "|" + vars.map((v, i) => ` ${pad(v, widths[i])} `).join("|") + "|";
      console.log(sep);
      console.log(header);
      console.log(sep);
      for (const row of rows)
        console.log("|" + vars.map((v, i) => ` ${pad(row[v], widths[i])} `).join("|") + "|");
      console.log(sep);
      console.log(`${rows.length} result(s)`);
      return;
    }

    // ── ASK ─────────────────────────────────────────────────────────────────
    if (rtype === "boolean") {
      const bool = await result.execute();
      console.log(`ASK → ${bool}`);
      return;
    }

    // ── CONSTRUCT / DESCRIBE ────────────────────────────────────────────────
    if (rtype === "quads") {
      const stream = await result.execute();
      const quads  = [];
      await new Promise((resolve, reject) => {
        stream.on("data",  q => quads.push(q));
        stream.on("end",   resolve);
        stream.on("error", reject);
      });
      console.log(`${quads.length} triple(s):`);
      for (const q of quads)
        console.log(`  ${termValue(q.subject)} ${termValue(q.predicate)} ${termValue(q.object)} .`);
      return;
    }

    console.error(`Unknown resultType: "${rtype}"`);
    process.exit(1);

  } catch (err) {
    console.error("SPARQL Error:", err.message);
    process.exit(1);
  }
})();

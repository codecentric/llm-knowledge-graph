#!/usr/bin/env node
/**
 * kg-html-visualizer – generate.js
 *
 * Befüllt ein HTML-Template mit TTL-Daten und einer SPARQL-Query und schreibt
 * die fertige Single-Page-HTML-Datei.
 *
 * Usage:
 *   node generate.js --ttl data.ttl --type table --title "Mein Graph" --output out.html
 *   node generate.js --ttl data.ttl --type graph --sparql query.sparql --output out.html
 *   node generate.js --ttl a.ttl --ttl b.ttl --type combined --output out.html
 */

const fs   = require('fs');
const path = require('path');

// ── CLI-Argumente parsen ────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const opts   = { ttl: [], type: 'table', title: 'Knowledge Graph', output: 'output.html', sparql: null, graphSparql: null };
const SKILL_DIR = path.resolve(__dirname, '..');

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--ttl':          opts.ttl.push(args[++i]);          break;
    case '--type':         opts.type = args[++i];             break;
    case '--title':        opts.title = args[++i];            break;
    case '--output':       opts.output = args[++i];           break;
    case '--sparql':       opts.sparql = args[++i];           break;
    case '--graph-sparql': opts.graphSparql = args[++i];      break;
    case '--help': case '-h':
      console.log(`
Usage: node generate.js [options]

Options:
  --ttl <file>          TTL-Datei (wiederholbar für mehrere Dateien)
  --type <type>         Template: table | graph | combined  (default: table)
  --title <title>       Seitentitel
  --output <file>       Ausgabedatei (default: output.html)
  --sparql <file|str>   SPARQL-Query (Datei oder Inline-String)
  --graph-sparql <f|s>  SPARQL für Graphkanten (nur bei combined)
`);
      process.exit(0);
  }
}

// ── TTL einlesen und zusammenführen ────────────────────────────────────────
if (opts.ttl.length === 0) {
  console.error('Fehler: Mindestens eine --ttl Datei angeben.');
  process.exit(1);
}

let combinedTtl = '';
for (const ttlPath of opts.ttl) {
  if (!fs.existsSync(ttlPath)) {
    console.error(`Fehler: TTL-Datei nicht gefunden: ${ttlPath}`);
    process.exit(1);
  }
  combinedTtl += fs.readFileSync(ttlPath, 'utf8') + '\n';
}

// ── SPARQL-Query laden ─────────────────────────────────────────────────────
function loadSparql(src, fallback) {
  if (!src) return fallback;
  if (fs.existsSync(src)) return fs.readFileSync(src, 'utf8');
  return src; // Inline-String
}

const DEFAULT_CARDS_SPARQL = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label ?definition (GROUP_CONCAT(?alt; SEPARATOR="|") AS ?altLabels) WHERE {
  ?concept a skos:Concept ;
           skos:prefLabel ?label .
  OPTIONAL { ?concept skos:definition ?definition }
  OPTIONAL { ?concept skos:altLabel ?alt }
}
GROUP BY ?concept ?label ?definition
ORDER BY ?label
`.trim();

const DEFAULT_GRAPH_SPARQL = `
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
}
`.trim();

const cardsSparql = loadSparql(opts.sparql,      DEFAULT_CARDS_SPARQL);
const graphSparql = loadSparql(opts.graphSparql, DEFAULT_GRAPH_SPARQL);

// ── Template laden ─────────────────────────────────────────────────────────
const templateMap = {
  table:    'table-cards.html',
  cards:    'table-cards.html',
  graph:    'force-graph.html',
  combined: 'combined.html',
};

const templateFile = templateMap[opts.type];
if (!templateFile) {
  console.error(`Unbekannter Typ: ${opts.type}. Erlaubt: table, graph, combined`);
  process.exit(1);
}

const templatePath = path.join(SKILL_DIR, 'templates', templateFile);
if (!fs.existsSync(templatePath)) {
  console.error(`Template nicht gefunden: ${templatePath}`);
  process.exit(1);
}

let html = fs.readFileSync(templatePath, 'utf8');

// ── TTL für JS-Template-Literal escapen ────────────────────────────────────
function escapeTtlForTemplateLiteral(ttl) {
  return ttl
    .replace(/\\/g, '\\\\')
    .replace(/`/g,  '\\`')
    .replace(/\$\{/g, '\\${');
}

const escapedTtl         = escapeTtlForTemplateLiteral(combinedTtl);
const escapedCardsSparql = cardsSparql.replace(/`/g, '\\`');
const escapedGraphSparql = graphSparql.replace(/`/g, '\\`');

// ── Platzhalter ersetzen ───────────────────────────────────────────────────
html = html
  .replace(/__PAGE_TITLE__/g,      opts.title)
  .replace(/__TTL_DATA__/g,        escapedTtl)
  .replace(/__SPARQL_QUERY__/g,    escapedCardsSparql)
  .replace(/__SPARQL_GRAPH_QUERY__/g, escapedGraphSparql);

// ── Ausgabe schreiben ──────────────────────────────────────────────────────
const outDir = path.dirname(path.resolve(opts.output));
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(opts.output, html, 'utf8');

const sizeKb = (fs.statSync(opts.output).size / 1024).toFixed(1);
console.log(`✓ Erstellt: ${opts.output} (${sizeKb} KB)`);
console.log(`  Typ: ${opts.type} | TTL-Dateien: ${opts.ttl.length} | Titel: "${opts.title}"`);

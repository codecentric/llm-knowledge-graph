#!/usr/bin/env node
/**
 * show-concepts.js
 * ----------------
 * Reads a generated SKOS/Turtle glossary and prints a human-readable
 * summary of all concepts to stdout.
 *
 * Usage:  node show-concepts.js <glossary.ttl>
 */

import fs from "fs";
import { Parser } from "n3";

const file = process.argv[2];
if (!file) {
  console.error("Usage: show-concepts.js <glossary.ttl>");
  process.exit(1);
}

const SKOS = "http://www.w3.org/2004/02/skos/core#";
const RDF  = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";

const turtle = fs.readFileSync(file, "utf8");
const parser = new Parser();
const quads  = parser.parse(turtle);

// Collect concepts
const concepts   = new Map(); // iri → { label, definition, comment, broader, narrower, related }
const schemeIRI  = new Map(); // iri → prefLabel
const typeMap    = new Map();

for (const q of quads) {
  const s = q.subject.value;
  const p = q.predicate.value;
  const o = q.object.value;

  if (p === RDF + "type" && o === SKOS + "Concept") {
    if (!concepts.has(s)) concepts.set(s, { label: "", definition: "", comment: "", broader: [], related: [] });
  }
  if (p === SKOS + "prefLabel")  { ensure(concepts, s).label      = o; }
  if (p === SKOS + "definition") { ensure(concepts, s).definition = o; }
  if (p === RDFS + "comment")    { ensure(concepts, s).comment    = o; }
  if (p === SKOS + "broader")    { ensure(concepts, s).broader.push(o); }
  if (p === SKOS + "related")    { ensure(concepts, s).related.push(o); }
  if (p === SKOS + "prefLabel" && o && !concepts.has(s)) schemeIRI.set(s, o);
}

function ensure(map, key) {
  if (!map.has(key)) map.set(key, { label: "", definition: "", comment: "", broader: [], related: [] });
  return map.get(key);
}

// ── Output ───────────────────────────────────────────────────────────────────

const list = [...concepts.entries()].sort(([, a], [, b]) =>
  a.label.localeCompare(b.label)
);

console.log(`\n╔══════════════════════════════════════════════════════════╗`);
console.log(`║  SKOS Glossary — ${list.length} Concept(s)${" ".repeat(Math.max(0, 32 - String(list.length).length))}║`);
console.log(`╚══════════════════════════════════════════════════════════╝\n`);

for (const [iri, c] of list) {
  const localName = iri.split(/[#/]/).pop();
  console.log(`▸ ${c.label || localName}`);
  console.log(`  IRI:        ${iri}`);
  if (c.definition) console.log(`  Definition: ${c.definition}`);
  if (c.comment)    console.log(`  Note:       ${c.comment}`);
  if (c.broader.length)  console.log(`  Broader:    ${c.broader.join(", ")}`);
  if (c.related.length)  console.log(`  Related:    ${c.related.join(", ")}`);
  console.log();
}

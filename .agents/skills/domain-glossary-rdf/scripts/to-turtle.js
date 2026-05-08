#!/usr/bin/env node
/**
 * to-turtle.js
 * ------------
 * Reads a JSON array of domain concepts (produced by the LLM extraction step)
 * and serialises it as a SKOS/OWL glossary in RDF Turtle format.
 *
 * Input JSON schema: see ../references/concept-schema.json
 *
 * Usage:
 *   echo '[{"prefLabel":"Foo","definition":"Bar"}]' | node to-turtle.js --output out.ttl
 *   node to-turtle.js --input concepts.json --output out.ttl --namespace "https://my.org/g#"
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

import minimist          from "minimist";
import { DataFactory, Writer } from "n3";

const { namedNode, literal, quad } = DataFactory;

// ─── CLI ─────────────────────────────────────────────────────────────────────

const argv = minimist(process.argv.slice(2), {
  string:  ["input", "output", "namespace", "lang", "title", "source"],
  boolean: ["help"],
  default: {
    input:     "-",
    output:    "glossary.ttl",
    namespace: "https://example.org/glossary#",
    lang:      "de",
    title:     "Domain Glossary",
    source:    "",
  },
  alias: { i: "input", o: "output", n: "namespace", l: "lang", h: "help" },
});

if (argv.help) {
  console.log(`
Usage: to-turtle.js [options]

Reads a JSON array of domain concepts and writes a SKOS/OWL Turtle file.

Options:
  -i, --input <path>       JSON file or '-' for stdin          (default: stdin)
  -o, --output <path>      Output Turtle file                  (default: glossary.ttl)
  -n, --namespace <iri>    Base IRI for concept local names    (default: https://example.org/glossary#)
  -l, --lang <tag>         BCP-47 language tag for labels      (default: de)
      --title <text>       ConceptScheme prefLabel             (default: Domain Glossary)
      --source <text>      Comma-separated source document(s)  (default: none)
  -h, --help               Show this help
`);
  process.exit(0);
}

// ─── Namespaces ───────────────────────────────────────────────────────────────

const NS = {
  skos: "http://www.w3.org/2004/02/skos/core#",
  owl:  "http://www.w3.org/2002/07/owl#",
  rdf:  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  dct:  "http://purl.org/dc/terms/",
  xsd:  "http://www.w3.org/2001/XMLSchema#",
};

const s  = (suffix) => NS.skos + suffix;
const r  = (suffix) => NS.rdf  + suffix;
const rd = (suffix) => NS.rdfs + suffix;
const d  = (suffix) => NS.dct  + suffix;
const x  = (suffix) => NS.xsd  + suffix;
const o  = (suffix) => NS.owl  + suffix;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive a stable local IRI name from a prefLabel. */
function toLocalName(label) {
  return label
    .normalize("NFD")                         // decompose accents
    .replace(/[\u0300-\u036f]/g, "")          // strip combining marks
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/\s+/g, "_")                     // spaces → underscore
    .replace(/[^a-zA-Z0-9_-]/g, "")          // drop everything else
    .replace(/^[_-]+|[_-]+$/g, "")           // trim leading/trailing
    || "concept_" + Math.random().toString(36).slice(2, 8);
}

/** Read JSON from stdin or file. */
function readInput(inputArg) {
  const raw = inputArg === "-"
    ? fs.readFileSync("/dev/stdin", "utf8")
    : fs.readFileSync(inputArg, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error: Input is not valid JSON.\n" + e.message);
    process.exit(1);
  }
}

/** Validate that input is an array of objects with at least prefLabel. */
function validate(data) {
  if (!Array.isArray(data)) {
    console.error("Error: JSON root must be an array of concept objects.");
    process.exit(1);
  }
  const invalid = data.filter((c) => typeof c !== "object" || !c.prefLabel);
  if (invalid.length) {
    console.error(
      `Error: ${invalid.length} concept(s) are missing 'prefLabel'. ` +
      `First bad entry: ${JSON.stringify(invalid[0])}`
    );
    process.exit(1);
  }
  return data;
}

// ─── RDF builder ─────────────────────────────────────────────────────────────

async function buildTurtle(concepts, opts) {
  const { namespace, lang, title, sources } = opts;

  // Build a map prefLabel → IRI for resolving broader/related
  const labelToIri = new Map();
  const localNames  = new Map();
  const seen        = new Set();

  for (const c of concepts) {
    let ln = toLocalName(c.prefLabel);
    // Deduplicate local names
    let candidate = ln;
    let idx = 2;
    while (seen.has(candidate)) candidate = `${ln}_${idx++}`;
    seen.add(candidate);
    localNames.set(c.prefLabel, candidate);
    labelToIri.set(c.prefLabel, namespace + candidate);
    // Also register altLabels so broader/related can reference them
    for (const alt of (c.altLabels || [])) {
      if (!labelToIri.has(alt)) labelToIri.set(alt, namespace + candidate);
    }
  }

  const writer = new Writer({
    prefixes: {
      "":    namespace,
      skos:  NS.skos,
      owl:   NS.owl,
      rdf:   NS.rdf,
      rdfs:  NS.rdfs,
      dct:   NS.dct,
      xsd:   NS.xsd,
    },
  });

  const quads = [];

  // ── owl:Ontology ────────────────────────────────────────────────────────
  const onto = namedNode(namespace);
  quads.push(
    quad(onto, namedNode(r("type")),    namedNode(o("Ontology"))),
    quad(onto, namedNode(d("title")),   literal(title)),
    quad(onto, namedNode(d("created")), literal(
      new Date().toISOString().slice(0, 10), namedNode(x("date"))
    )),
  );
  for (const src of sources) {
    quads.push(quad(onto, namedNode(d("source")), literal(src)));
  }

  // ── skos:ConceptScheme ──────────────────────────────────────────────────
  const scheme = namedNode(namespace + "GlossaryScheme");
  quads.push(
    quad(scheme, namedNode(r("type")),       namedNode(s("ConceptScheme"))),
    quad(scheme, namedNode(s("prefLabel")),  literal(title, lang)),
    quad(scheme, namedNode(rd("comment")),   literal(
      `Auto-generated by domain-glossary-rdf skill. ` +
      `${concepts.length} concept(s). Review and enrich manually.`
    )),
  );

  // ── skos:Concept per entry ──────────────────────────────────────────────
  for (const c of concepts) {
    const iri = namedNode(labelToIri.get(c.prefLabel));

    quads.push(
      quad(iri, namedNode(r("type")),      namedNode(s("Concept"))),
      quad(iri, namedNode(s("inScheme")),  scheme),
      quad(iri, namedNode(s("prefLabel")), literal(c.prefLabel, lang)),
    );

    // altLabels
    for (const alt of (c.altLabels || [])) {
      if (alt) quads.push(quad(iri, namedNode(s("altLabel")), literal(alt, lang)));
    }

    // definition
    if (c.definition) {
      quads.push(quad(iri, namedNode(s("definition")), literal(c.definition, lang)));
    }

    // scopeNote / note
    if (c.note) {
      quads.push(quad(iri, namedNode(s("scopeNote")), literal(c.note, lang)));
    }

    // broader
    if (c.broader) {
      const broaderIri = labelToIri.get(c.broader);
      if (broaderIri) {
        quads.push(quad(iri, namedNode(s("broader")), namedNode(broaderIri)));
      } else {
        // Store as a plain annotation so the information is not lost
        quads.push(quad(iri, namedNode(rd("comment")), literal(`broader: ${c.broader} (unresolved)`)));
      }
    }

    // related
    for (const rel of (c.related || [])) {
      const relIri = labelToIri.get(rel);
      if (relIri) {
        quads.push(quad(iri, namedNode(s("related")), namedNode(relIri)));
      }
    }
  }

  writer.addQuads(quads);

  return new Promise((resolve, reject) => {
    writer.end((err, result) => (err ? reject(err) : resolve(result)));
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const data     = validate(readInput(argv.input));
  const sources  = argv.source
    ? argv.source.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const turtle = await buildTurtle(data, {
    namespace: argv.namespace,
    lang:      argv.lang,
    title:     argv.title,
    sources,
  });

  fs.writeFileSync(argv.output, turtle, "utf8");
  console.log(`✓  ${data.length} concept(s) → ${argv.output}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

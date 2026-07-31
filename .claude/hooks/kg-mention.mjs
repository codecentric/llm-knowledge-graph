#!/usr/bin/env node
/**
 * kg-mention.mjs — Claude-Code-Ersatz für die pi-Extension `.pi/extensions/kg-mention`
 *
 * UserPromptSubmit-Hook. Erkennt `#Label`-Mentions im Prompt, löst sie gegen den
 * Knowledge Graph auf und injiziert die passenden Einträge (URI, Definition,
 * Properties) als Kontext VOR dem Agenten-Turn.
 *
 * Unterschied zur pi-Extension: kein Live-Autocomplete beim Tippen (Claude Code
 * hat kein Editor-Autocomplete-API). Die automatische Kontext-Injektion beim
 * Absenden funktioniert vollständig.
 *
 * Eingabe:  JSON auf stdin  { prompt, cwd }
 * Ausgabe:  JSON mit hookSpecificOutput.additionalContext (nur wenn Mentions auflösbar)
 */

import path from "node:path";
import { execSync } from "node:child_process";

const QUERY_SCRIPT = ".agents/skills/sparql-query/scripts/query.js";

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const prompt = data?.prompt ?? "";
  const cwd = data?.cwd ?? process.cwd();

  const mentions = extractMentions(prompt);
  if (mentions.length === 0) process.exit(0);

  const files = findTtlFiles(cwd);
  if (files.length === 0) process.exit(0);

  const entries = loadAllEntries(cwd, files);
  if (entries.length === 0) process.exit(0);

  const resolved = resolveMentions(mentions, entries);
  if (resolved.length === 0) process.exit(0);

  const context = buildContextMessage(cwd, files, resolved);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: context,
      },
    }),
  );
  process.exit(0);
});

// ── Helpers (portiert aus .pi/extensions/kg-mention/index.ts) ──────────────────

function extractMentions(text) {
  const matches = text.matchAll(/#([\wÀ-ɏ][\wÀ-ɏ-]*)/g);
  const set = new Set();
  for (const m of matches) if (m[1]) set.add(m[1].trim());
  return [...set];
}

function findTtlFiles(cwd) {
  try {
    const out = execSync('find graph -name "*.ttl" -o -name "*.rdf" -o -name "*.n3" 2>/dev/null', {
      cwd,
      timeout: 3000,
      encoding: "utf-8",
    });
    return out.trim().split("\n").filter(Boolean).map((f) => path.resolve(cwd, f));
  } catch {
    return [];
  }
}

function sparql(cwd, files, query) {
  try {
    const fileArgs = files.map((f) => `--file "${f}"`).join(" ");
    const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
    const out = execSync(`node "${QUERY_SCRIPT}" ${fileArgs} --sparql "${escaped}" --format json`, {
      cwd,
      timeout: 15000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(out) ?? [];
  } catch {
    return [];
  }
}

function clean(rawVal) {
  if (!rawVal) return "";
  const uri = rawVal.match(/^<(.+)>$/);
  if (uri) return uri[1];
  const lit = rawVal.match(/^"([\s\S]*?)"(?:@\w[\w-]*|(?:\^\^.*?))?$/);
  if (lit) return lit[1];
  return rawVal;
}

function localName(uri) {
  return clean(uri).split(/[#/]/).pop() ?? clean(uri);
}

function loadAllEntries(cwd, files) {
  const rows = sparql(
    cwd,
    files,
    `SELECT DISTINCT ?uri ?label ?def WHERE {
       ?uri a ?type .
       OPTIONAL { ?uri <http://www.w3.org/2004/02/skos/core#prefLabel> ?label }
       OPTIONAL { ?uri <http://www.w3.org/2000/01/rdf-schema#label> ?label }
       OPTIONAL { ?uri <https://schema.org/name> ?label }
       OPTIONAL { ?uri <http://www.w3.org/2004/02/skos/core#definition> ?def }
       OPTIONAL { ?uri <http://www.w3.org/2000/01/rdf-schema#comment> ?def }
       FILTER(isIRI(?uri))
       FILTER(?type NOT IN (
         <http://www.w3.org/2002/07/owl#Ontology>,
         <http://www.w3.org/ns/shacl#NodeShape>,
         <http://www.w3.org/ns/shacl#PropertyShape>,
         <http://www.w3.org/2004/02/skos/core#ConceptScheme>
       ))
     }`,
  );

  const seen = new Map();
  for (const row of rows) {
    const uri = clean(row.uri ?? "");
    if (!uri) continue;
    const label = clean(row.label ?? "") || localName(uri);
    const definition = clean(row.def ?? "");
    const existing = seen.get(uri);
    if (existing) {
      if (!existing.definition && definition) existing.definition = definition;
    } else {
      seen.set(uri, { uri, label, definition });
    }
  }
  return [...seen.values()];
}

function resolveMentions(mentions, entries) {
  const resolved = [];
  for (const mention of mentions) {
    const lower = mention.toLowerCase();
    let found = entries.find((e) => e.label.toLowerCase() === lower);
    if (!found) found = entries.find((e) => e.label.toLowerCase().startsWith(lower));
    if (!found) found = entries.find((e) => e.label.toLowerCase().includes(lower));
    if (found && !resolved.some((e) => e.uri === found.uri)) resolved.push(found);
  }
  return resolved;
}

function loadProps(cwd, files, uri) {
  const rows = sparql(cwd, files, `SELECT ?pred ?obj WHERE { <${uri}> ?pred ?obj } ORDER BY ?pred`);
  const skip = new Set([
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    "http://www.w3.org/2002/07/owl#topObjectProperty",
  ]);
  return rows
    .filter((r) => !skip.has(clean(r.pred ?? "")))
    .map((r) => ({ predicate: localName(r.pred ?? ""), value: clean(r.obj ?? "") }))
    .filter((r) => r.predicate && r.value);
}

function buildContextMessage(cwd, files, entries) {
  const lines = [`## Knowledge-Graph-Kontext – ${entries.length} Eintrag/Einträge (aus #-Mentions)`, ""];
  for (const entry of entries) {
    lines.push(`### ${entry.label}`);
    lines.push(`URI: \`${entry.uri}\``);
    if (entry.definition) lines.push(`> ${entry.definition}`);
    const props = loadProps(cwd, files, entry.uri);
    if (props.length > 0) {
      lines.push("");
      for (const p of props.slice(0, 20)) lines.push(`- **${p.predicate}**: ${p.value}`);
      if (props.length > 20) lines.push(`_(…${props.length - 20} weitere)_`);
    }
    lines.push("");
  }
  lines.push(
    "> Hinweis: Dieser Kontext stammt direkt aus dem Graphen (SPARQL). " +
      "Nur durch Tripel belegte Aussagen als Graphfakten behandeln.",
  );
  return lines.join("\n");
}

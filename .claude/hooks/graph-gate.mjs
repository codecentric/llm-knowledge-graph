#!/usr/bin/env node
/**
 * graph-gate.mjs — Claude-Code-Port der pi-Extension `.pi/extensions/graph-gate.ts`
 *
 * PreToolUse-Hook (Matcher: Read). Fängt direktes Lesen von TTL-Dateien aus
 * graph/ ab und leitet den Agenten auf den SPARQL-Weg um.
 *
 * Statt hart zu blockieren (deny) wird "ask" zurückgegeben: Für inhaltliche
 * Fragen soll der Zugriff abgelehnt und stattdessen SPARQL genutzt werden.
 * Für echte Bearbeitungen (Edit/Write verlangen ein vorheriges Read derselben
 * Datei) kann das Read gezielt freigegeben werden – sonst wäre der Graph nicht
 * mehr editierbar.
 *
 * Eingabe:  JSON auf stdin  { tool_name, tool_input: { file_path }, cwd }
 * Ausgabe:  JSON auf stdout mit permissionDecision "ask" (nur im Trefferfall)
 */

import path from "node:path";

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    process.exit(0); // Kein parsebarer Input → nicht blockieren
  }

  const filePath = data?.tool_input?.file_path ?? "";
  const cwd = data?.cwd ?? process.cwd();
  if (!filePath) process.exit(0);

  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const graphDir = path.resolve(cwd, "graph");

  // Nur .ttl-Dateien innerhalb von graph/ blockieren
  const inGraph = abs === graphDir || abs.startsWith(graphDir + path.sep);
  if (!inGraph || !abs.endsWith(".ttl")) process.exit(0);

  const rel = path.relative(cwd, abs);

  const reason = [
    `Direktes Lesen von \`${rel}\` ist nur zum Bearbeiten gedacht.`,
    ``,
    `Für inhaltliche Fragen ablehnen und stattdessen SPARQL nutzen – der`,
    `Knowledge Graph ist die Wahrheitsquelle. Nur freigeben, wenn die Datei`,
    `tatsächlich editiert werden soll (Edit/Write brauchen ein vorheriges Read).`,
    ``,
    `Zugriff auf den Graph-Inhalt ausschließlich über SPARQL:`,
    ``,
    `  node .agents/skills/sparql-query/scripts/query.js \\`,
    `    --file ${rel} \\`,
    `    --sparql "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 20"`,
    ``,
    `Oder mit einer vorhandenen .rq-Datei:`,
    ``,
    `  node .agents/skills/sparql-query/scripts/query.js \\`,
    `    --file ${rel} \\`,
    `    --query queries/<sektion>/<name>.rq`,
    ``,
    `Vorhandene Queries:  find queries -name "*.rq"`,
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
});

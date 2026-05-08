/**
 * graph-gate.ts
 *
 * Blockiert direktes Lesen von TTL-Dateien aus graph/ über das read-Tool.
 * Leitet den Agenten stattdessen zur SPARQL-Query-Methode weiter.
 *
 * Abgedeckt: read-Tool (Normalfall)
 * Nicht abgedeckt: bash cat/grep/etc. (bewusste Einschränkung – siehe Kommentar unten)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import path from "node:path";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("read", event)) return;

    const filePath = event.input.path;

    // Normalisieren: absolut oder relativ – beides abdecken
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(ctx.cwd, filePath);

    const graphDir = path.resolve(ctx.cwd, "graph");

    // Nur Dateien innerhalb von graph/ mit .ttl-Endung blockieren
    if (!abs.startsWith(graphDir + path.sep) && abs !== graphDir) return;
    if (!abs.endsWith(".ttl")) return;

    // Relativer Pfad für die Fehlermeldung (lesbarer)
    const rel = path.relative(ctx.cwd, abs);

    const message = [
      `❌ Direktes Lesen von \`${rel}\` ist nicht erlaubt.`,
      ``,
      `TTL-Dateien dürfen nicht direkt gelesen werden – Zugriff auf den`,
      `Knowledge Graph ausschließlich über SPARQL:`,
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
      `Vorhandene Queries:`,
      `  find queries -name "*.rq"`,
    ].join("\n");

    return { block: true, reason: message };
  });
}

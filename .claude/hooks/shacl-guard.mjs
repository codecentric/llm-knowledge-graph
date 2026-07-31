#!/usr/bin/env node
/**
 * shacl-guard.mjs — Claude-Code-Port der pi-Extension `.pi/extensions/shacl-guard.ts`
 *
 * PostToolUse-Hook (Matcher: Edit|Write). Führt nach jedem Schreibvorgang auf eine
 * .ttl-Datei automatisch die SHACL-Validierung aus und konfrontiert den Agenten
 * sofort mit Verstößen.
 *
 * Eingabe:  JSON auf stdin  { tool_name, tool_input: { file_path }, cwd }
 * Ausgabe:
 *   - sh:Violation  → { decision: "block", reason }         (Agent muss korrigieren)
 *   - sh:Warning    → additionalContext (Hinweis, kein Block)
 *   - konform       → still (Exit 0, keine Ausgabe)
 *
 * Ruft dasselbe Script wie die pi-Extension:
 *   .agents/skills/sparql-query/scripts/validate-shacl.js
 */

import path from "node:path";
import { spawnSync } from "node:child_process";

const SHACL_SCRIPT = ".agents/skills/sparql-query/scripts/validate-shacl.js";

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

  const filePath = data?.tool_input?.file_path ?? "";
  const cwd = data?.cwd ?? process.cwd();
  if (!filePath.endsWith(".ttl")) process.exit(0);

  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const rel = path.relative(cwd, abs);

  const result = spawnSync("node", [SHACL_SCRIPT, rel], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
  });

  if (result.error) {
    // Validator nicht startbar (z. B. npm install fehlt) → Hinweis, kein Block
    emitContext(
      `⚠️  SHACL-Validator konnte nicht gestartet werden (${result.error.message}). ` +
        `Ggf. \`npm install\` im Projektwurzelverzeichnis ausführen.`,
    );
  }

  const out = ((result.stdout ?? "") + (result.stderr ? `\nStderr:\n${result.stderr}` : "")).trim();
  const code = result.status ?? 0;
  const hasViolation = code === 1 || out.includes("[VIOLATION]");

  if (hasViolation) {
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          `🔍 SHACL-Validierung nach Schreiboperation auf \`${rel}\` meldet Verstöße – ` +
          `bitte zuerst korrigieren, bevor du weitermachst:\n\n${out}`,
      }),
    );
    process.exit(0);
  }

  if (out.includes("Befund") || out.includes("[WARNING]")) {
    emitContext(`🔍 SHACL-Hinweise nach Schreiben von \`${rel}\`:\n\n${out}`);
  }

  // Konform / keine relevanten Befunde → still
  process.exit(0);
});

function emitContext(text) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: text,
      },
    }),
  );
  process.exit(0);
}

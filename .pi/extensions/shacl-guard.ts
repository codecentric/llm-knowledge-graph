/**
 * shacl-guard.ts
 *
 * Führt nach jeder write/edit-Operation auf TTL-Dateien automatisch die
 * SHACL-Validierung durch und konfrontiert den Agenten sofort mit Verstößen.
 *
 * Abgedeckt:
 *   - write-Tool auf *.ttl-Dateien
 *   - edit-Tool auf *.ttl-Dateien
 *
 * Schweregrade:
 *   - sh:Violation → isError: true  (Agent muss korrigieren)
 *   - sh:Warning   → isError: false (Hinweis, kein harter Fehler)
 *   - sh:Info      → wird still protokolliert
 *
 * Das Script validate-shacl.js liegt unter:
 *   .agents/skills/sparql-query/scripts/validate-shacl.js
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import path from "node:path";

const SHACL_SCRIPT = ".agents/skills/sparql-query/scripts/validate-shacl.js";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, _ctx) => {
    // Nur write und edit beobachten
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    // Dateipath aus den Tool-Inputs
    const filePath: string = (event.input as { path?: string })?.path ?? "";
    if (!filePath.endsWith(".ttl")) return;

    // Pfad relativ zum workspace für validate-shacl.js
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    const relPath = path.relative(process.cwd(), absPath);

    // SHACL-Validierung ausführen
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const result = await pi.exec("node", [SHACL_SCRIPT, relPath], {
        timeout: 30_000,
      });
      stdout   = result.stdout ?? "";
      stderr   = result.stderr ?? "";
      exitCode = result.code ?? 0;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: [
          ...event.content,
          {
            type: "text" as const,
            text: `\n⚠️  SHACL-Validator konnte nicht gestartet werden:\n${msg}`,
          },
        ],
        isError: false,
      };
    }

    // Wenn keine Befunde: nichts anhängen (kein Rauschen)
    if (exitCode === 0 && !stdout.includes("Befund")) {
      const conformLine = stdout.includes("Konform") ? "  ✅ SHACL-konform." : "";
      if (conformLine) {
        return {
          content: [
            ...event.content,
            { type: "text" as const, text: `\n${conformLine}` },
          ],
          isError: false,
        };
      }
      return; // Keine Änderung am Ergebnis
    }

    // Befunde vorhanden oder Fehler → Meldung an den Agenten anhängen
    const output = (stdout + (stderr ? `\nStderr:\n${stderr}` : "")).trim();
    const hasViolation = stdout.includes("[VIOLATION]") || exitCode === 1;

    return {
      content: [
        ...event.content,
        {
          type: "text" as const,
          text: `\n\n${"─".repeat(50)}\n🔍 SHACL-Validierung nach Schreiboperation:\n\n${output}\n${"─".repeat(50)}`,
        },
      ],
      isError: hasViolation,
    };
  });
}

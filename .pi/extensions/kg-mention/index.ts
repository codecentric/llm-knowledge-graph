/**
 * KG Mention Extension
 *
 * Ermöglicht @-Mention-ähnliche Syntax mit # für Knowledge-Graph-Konzepte.
 *
 * Verwendung im Editor:
 *   #Accessoires  →  Autocomplete zeigt passende KG-Einträge
 *   Nach Auswahl wird das vollständige #Label-Mention in den Text eingesetzt.
 *
 * Beim Absenden:
 *   Alle #Label-Mentions werden erkannt, die passenden KG-Einträge geladen
 *   und als Kontext-Nachricht vor dem User-Prompt in den Agenten injiziert.
 *
 * Beispiel:
 *   "Was sind die Regeln für #Accessoires und #Versandkosten?"
 *   → Lädt beide Konzepte aus dem KG und stellt sie als Kontext bereit.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  fuzzyFilter,
} from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

type EntryKind = "Konzept" | "Klasse" | "Property" | "Person" | "Instanz" | "Sonstiges";

interface KGEntry {
  uri: string;
  label: string;
  kind: EntryKind;
  definition?: string;
}

interface PropRow {
  predicate: string;
  value: string;
}

// ---------------------------------------------------------------------------
// SPARQL-Helpers (identisch zu kg-browser)
// ---------------------------------------------------------------------------

// __dirname-Äquivalent für ESM; von .pi/extensions/kg-mention/ drei Ebenen hoch zum Workspace-Root
const __dir = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(__dir, "../../..");
const SKILL_SCRIPT = resolve(WORKSPACE_ROOT, ".agents/skills/sparql-query/scripts/query.js");

function findTtlFiles(cwd: string): string[] {
  try {
    const out = execSync('find graph -name "*.ttl" -o -name "*.rdf" -o -name "*.n3" 2>/dev/null', {
      cwd,
      timeout: 3000,
      encoding: "utf-8",
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((f) => resolve(cwd, f));
  } catch {
    return [];
  }
}

function sparqlQuery(files: string[], query: string): any[] {
  if (!existsSync(SKILL_SCRIPT) || files.length === 0) return [];
  try {
    const fileArgs = files.map((f) => `--file "${f}"`).join(" ");
    const escaped = query
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, " ");
    const out = execSync(
      `node "${SKILL_SCRIPT}" ${fileArgs} --sparql "${escaped}" --format json`,
      { cwd: WORKSPACE_ROOT, timeout: 15000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return JSON.parse(out) ?? [];
  } catch {
    return [];
  }
}

function clean(raw: string): string {
  if (!raw) return "";
  const uri = raw.match(/^<(.+)>$/);
  if (uri) return uri[1]!;
  const lit = raw.match(/^"([\s\S]*?)"(?:@\w[\w-]*|(?:\^\^.*?))?$/);
  if (lit) return lit[1]!;
  return raw;
}

function localName(uri: string): string {
  return clean(uri).split(/[#/]/).pop() ?? clean(uri);
}

function kindFromTypeUri(typeUri: string): EntryKind {
  const t = clean(typeUri);
  if (t.includes("skos/core#Concept")) return "Konzept";
  if (t.includes("owl#Class") || t.includes("rdfs/Class")) return "Klasse";
  if (
    t.includes("owl#ObjectProperty") ||
    t.includes("owl#DatatypeProperty") ||
    t.includes("owl#AnnotationProperty") ||
    t.includes("rdf-syntax-ns#Property")
  )
    return "Property";
  if (t.includes("schema.org/Person") || t.includes("foaf/0.1/Person")) return "Person";
  return "Instanz";
}

// ---------------------------------------------------------------------------
// KG-Einträge laden (einmalig pro Session, lazy)
// ---------------------------------------------------------------------------

function loadAllEntries(files: string[]): KGEntry[] {
  const rows = sparqlQuery(
    files,
    `
    SELECT DISTINCT ?uri ?type ?label ?def WHERE {
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
    }
  `,
  );

  const priority: Record<EntryKind, number> = {
    Konzept: 5, Klasse: 4, Person: 3, Property: 2, Instanz: 1, Sonstiges: 0,
  };
  const seen = new Map<string, KGEntry>();

  for (const row of rows) {
    const uri = clean(row.uri ?? "");
    if (!uri) continue;
    const kind = kindFromTypeUri(row.type ?? "");
    const label = clean(row.label ?? "") || localName(uri);
    const definition = clean(row.def ?? "");

    const existing = seen.get(uri);
    if (existing) {
      if (priority[kind] > priority[existing.kind]) existing.kind = kind;
      if (!existing.definition && definition) existing.definition = definition;
    } else {
      seen.set(uri, { uri, label, kind, definition });
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, "de"));
}

function loadProps(files: string[], uri: string): PropRow[] {
  const rows = sparqlQuery(
    files,
    `
    SELECT ?pred ?obj WHERE {
      <${uri}> ?pred ?obj .
    }
    ORDER BY ?pred
  `,
  );

  const skip = new Set([
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    "http://www.w3.org/2002/07/owl#topObjectProperty",
  ]);

  return rows
    .filter((r) => !skip.has(clean(r.pred ?? "")))
    .map((r) => ({ predicate: localName(r.pred ?? ""), value: clean(r.obj ?? "") }))
    .filter((r) => r.predicate && r.value);
}

// ---------------------------------------------------------------------------
// Icon / Beschreibung für Autocomplete-Items
// ---------------------------------------------------------------------------

const KIND_ICON: Record<EntryKind, string> = {
  Konzept: "◆", Klasse: "■", Property: "→", Person: "●", Instanz: "○", Sonstiges: "·",
};

function entryToItem(entry: KGEntry): AutocompleteItem {
  const icon = KIND_ICON[entry.kind];
  const desc = entry.definition
    ? entry.definition.slice(0, 80) + (entry.definition.length > 80 ? "…" : "")
    : `[${entry.kind}]`;
  return {
    value: `#${entry.label}`,
    label: `${icon} ${entry.label}`,
    description: desc,
  };
}

// ---------------------------------------------------------------------------
// Kontext-Nachricht für einen oder mehrere Einträge bauen
// ---------------------------------------------------------------------------

function buildContextMessage(entries: KGEntry[], files: string[]): string {
  const lines: string[] = [
    `## Knowledge Graph Kontext – ${entries.length} Konzept${entries.length !== 1 ? "e" : ""}`,
    "",
  ];

  for (const entry of entries) {
    lines.push(`### ${KIND_ICON[entry.kind]} ${entry.label}  [${entry.kind}]`);
    lines.push(`URI: \`${entry.uri}\``);
    if (entry.definition) {
      lines.push(`> ${entry.definition}`);
    }

    try {
      const props = loadProps(files, entry.uri);
      if (props.length > 0) {
        lines.push("");
        for (const p of props.slice(0, 20)) {
          lines.push(`- **${p.predicate}**: ${p.value}`);
        }
        if (props.length > 20) lines.push(`_(…${props.length - 20} weitere Eigenschaften)_`);
      }
    } catch {}

    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Mention-Extraktion aus dem Prompt-Text
// ---------------------------------------------------------------------------

/**
 * Findet alle #Label-Mentions in einem Text.
 * Labels sind einzelne Wörter, Zahlen und Bindestriche – kein Leerzeichen.
 * Beispiele: #Accessoires  #Außenhandel-EU  #Export2024
 * Gibt die Label-Strings zurück (ohne führendes #).
 */
function extractMentions(text: string): string[] {
  const matches = text.matchAll(/#([\w\u00C0-\u024F][\w\u00C0-\u024F\-]*)/g);
  const result = new Set<string>();
  for (const m of matches) {
    const label = m[1]?.trim();
    if (label) result.add(label);
  }
  return Array.from(result);
}

/**
 * Sucht Einträge, deren Label exakt (case-insensitive) oder fuzzy zu einem Mention passt.
 */
function resolveMentions(mentions: string[], entries: KGEntry[]): KGEntry[] {
  const resolved: KGEntry[] = [];
  for (const mention of mentions) {
    const lower = mention.toLowerCase();
    // Zuerst exakter Match
    let found = entries.find((e) => e.label.toLowerCase() === lower);
    // Dann Prefix-Match
    if (!found) found = entries.find((e) => e.label.toLowerCase().startsWith(lower));
    // Dann enthaltener Substring
    if (!found) found = entries.find((e) => e.label.toLowerCase().includes(lower));
    if (found && !resolved.some((e) => e.uri === found!.uri)) {
      resolved.push(found);
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Autocomplete-Token extrahieren
// ---------------------------------------------------------------------------

/**
 * Gibt den aktuellen #-Token vor dem Cursor zurück (ohne #), oder undefined wenn keiner.
 * Token sind einzelne Wörter ohne Leerzeichen (Bindestriche erlaubt).
 */
function extractHashToken(textBeforeCursor: string): string | undefined {
  const match = textBeforeCursor.match(/#([\w\u00C0-\u024F][\w\u00C0-\u024F\-]*)$/);
  return match?.[1];
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  let ttlFiles: string[] = [];
  let entriesPromise: Promise<KGEntry[]> | undefined;

  // Einträge lazy + gecacht laden
  function getEntries(): Promise<KGEntry[]> {
    entriesPromise ??= Promise.resolve().then(() => loadAllEntries(ttlFiles));
    return entriesPromise;
  }

  // -------------------------------------------------------------------------
  // Session-Start: TTL-Dateien finden, Autocomplete registrieren
  // -------------------------------------------------------------------------
  pi.on("session_start", async (_event, ctx) => {
    // State zurücksetzen (z.B. nach /new)
    ttlFiles = findTtlFiles(ctx.cwd);
    entriesPromise = undefined;

    if (ttlFiles.length === 0) return;

    // Einträge im Hintergrund vorladen
    void getEntries();

    // Autocomplete-Provider registrieren
    ctx.ui.addAutocompleteProvider((current) =>
      createKGAutocompleteProvider(current, getEntries),
    );
  });

  // -------------------------------------------------------------------------
  // Input-Event: Mentions aus Prompt extrahieren und KG-Kontext injizieren
  // -------------------------------------------------------------------------
  pi.on("input", async (event, ctx) => {
    if (ttlFiles.length === 0) return { action: "continue" };

    const mentions = extractMentions(event.text);
    if (mentions.length === 0) return { action: "continue" };

    let entries: KGEntry[];
    try {
      entries = await getEntries();
    } catch {
      return { action: "continue" };
    }

    const resolved = resolveMentions(mentions, entries);
    if (resolved.length === 0) return { action: "continue" };

    // KG-Kontext als Custom-Message VOR dem Agenten-Turn injizieren
    const contextText = buildContextMessage(resolved, ttlFiles);
    pi.sendMessage(
      {
        customType: "kg-mention-context",
        content: contextText,
        display: true,
      },
      { triggerTurn: false },
    );

    ctx.ui.notify(
      `📚 KG-Kontext geladen: ${resolved.map((e) => e.label).join(", ")}`,
      "info",
    );

    return { action: "continue" };
  });
}

// ---------------------------------------------------------------------------
// Autocomplete-Provider-Fabrik
// ---------------------------------------------------------------------------

function createKGAutocompleteProvider(
  current: AutocompleteProvider,
  getEntries: () => Promise<KGEntry[]>,
): AutocompleteProvider {
  const MAX = 15;

  return {
    async getSuggestions(
      lines,
      cursorLine,
      cursorCol,
      options,
    ): Promise<AutocompleteSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const token = extractHashToken(beforeCursor);

      // Kein #-Token → an Standard-Provider delegieren
      if (token === undefined) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      // # direkt getippt (leerer Token) → alle Einträge anzeigen
      let entries: KGEntry[];
      try {
        entries = await getEntries();
      } catch {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      if (options.signal.aborted) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      let matches: KGEntry[];
      if (!token.trim()) {
        // Leerer Token: erste MAX Einträge alphabetisch
        matches = entries.slice(0, MAX);
      } else {
        // Fuzzy-Filter nach Label
        const fuzzyMatches = fuzzyFilter(entries, token, (e) => e.label);
        matches = fuzzyMatches.slice(0, MAX);
      }

      if (matches.length === 0) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      return {
        prefix: `#${token}`,
        items: matches.map(entryToItem),
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

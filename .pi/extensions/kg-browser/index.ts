/**
 * KG Browser Extension
 *
 * Interaktiver Knowledge-Graph-Browser als TUI-Overlay.
 * Öffnen: /kg  oder  Alt+K
 *
 * Navigation:
 *   ↑↓        Einträge navigieren
 *   Enter     Details öffnen / Eintrag zum Kontext hinzufügen (Detail-Ansicht)
 *   /         Suche tippen
 *   Esc       Suche leeren / zurück / schließen
 *   Tab       Kategorie wechseln
 *   c         Markierten Eintrag zum Agent-Kontext hinzufügen
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Daten-Typen
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
// SPARQL-Helpers
// ---------------------------------------------------------------------------

// __dirname-Äquivalent für ESM; von .pi/extensions/kg-browser/ drei Ebenen hoch zum Workspace-Root
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
    return out.trim().split("\n").filter(Boolean).map((f) => resolve(cwd, f));
  } catch {
    return [];
  }
}

function sparql(files: string[], query: string): any[] {
  if (!existsSync(SKILL_SCRIPT) || files.length === 0) return [];
  try {
    const fileArgs = files.map((f) => `--file "${f}"`).join(" ");
    const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
    const out = execSync(
      `node "${SKILL_SCRIPT}" ${fileArgs} --sparql "${escaped}" --format json`,
      { cwd: WORKSPACE_ROOT, timeout: 15000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
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
  return clean(uri).split(/[#\/]/).pop() ?? clean(uri);
}

function kindFromTypeUri(typeUri: string): EntryKind {
  const t = clean(typeUri);
  if (t.includes("skos/core#Concept")) return "Konzept";
  if (t.includes("owl#Class") || t.includes("rdfs/Class")) return "Klasse";
  if (t.includes("owl#ObjectProperty") || t.includes("owl#DatatypeProperty") ||
      t.includes("owl#AnnotationProperty") || t.includes("rdf-syntax-ns#Property")) return "Property";
  if (t.includes("schema.org/Person") || t.includes("foaf/0.1/Person")) return "Person";
  return "Instanz";
}

// ---------------------------------------------------------------------------
// Daten laden
// ---------------------------------------------------------------------------

function loadEntries(files: string[]): KGEntry[] {
  const rows = sparql(files, `
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
  `);

  const priority: Record<EntryKind, number> = { Konzept: 5, Klasse: 4, Person: 3, Property: 2, Instanz: 1, Sonstiges: 0 };
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
  const rows = sparql(files, `
    SELECT ?pred ?obj WHERE {
      <${uri}> ?pred ?obj .
    }
    ORDER BY ?pred
  `);

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
// Konstanten
// ---------------------------------------------------------------------------

const TABS = [
  { label: "Alle",       kinds: null as EntryKind[] | null },
  { label: "Konzepte",   kinds: ["Konzept"] as EntryKind[] },
  { label: "Klassen",    kinds: ["Klasse"] as EntryKind[] },
  { label: "Personen",   kinds: ["Person"] as EntryKind[] },
  { label: "Properties", kinds: ["Property"] as EntryKind[] },
  { label: "Instanzen",  kinds: ["Instanz"] as EntryKind[] },
];

const KIND_ICON: Record<EntryKind, string> = {
  Konzept: "◆", Klasse: "■", Property: "→", Person: "●", Instanz: "○", Sonstiges: "·",
};
const KIND_COLOR: Record<EntryKind, string> = {
  Konzept: "accent", Klasse: "success", Property: "muted", Person: "warning", Instanz: "text", Sonstiges: "dim",
};

// ---------------------------------------------------------------------------
// Browser-Komponente
// ---------------------------------------------------------------------------

type TUI = { requestRender(): void };
type Theme = { fg(c: string, t: string): string; bold(t: string): string; bg(c: string, t: string): string };

class KGBrowser {
  // Daten
  private all: KGEntry[] = [];
  private filtered: KGEntry[] = [];
  private files: string[];

  // Listennavigation
  private tabIdx = 0;
  private search = "";
  private searching = false;
  private listCursor = 0;
  private listScroll = 0;
  private readonly PAGE = 16; // sichtbare Listenzeilen

  // Detail
  private detailMode = false;
  private detailEntry: KGEntry | null = null;
  private detailProps: PropRow[] = [];
  private detailLoading = false;
  private detailScroll = 0;
  private readonly DETAIL_PAGE = 14;

  // Kontext-Sammlung
  private selected: Set<string> = new Set();

  // Zustand
  private loading = true;
  private error: string | null = null;

  constructor(
    private tui: TUI,
    private theme: Theme,
    private cwd: string,
    private onClose: (selected: KGEntry[]) => void,
  ) {
    this.files = findTtlFiles(cwd);
    this.startLoad();
  }

  private async startLoad() {
    try {
      this.all = loadEntries(this.files);
      this.applyFilter();
    } catch (e: any) {
      this.error = String(e?.message ?? e);
    } finally {
      this.loading = false;
      this.tui.requestRender();
    }
  }

  private applyFilter() {
    const tab = TABS[this.tabIdx]!;
    let entries = this.all;
    if (tab.kinds) entries = entries.filter((e) => tab.kinds!.includes(e.kind));
    if (this.search) {
      const q = this.search.toLowerCase();
      entries = entries.filter(
        (e) => e.label.toLowerCase().includes(q) || (e.definition ?? "").toLowerCase().includes(q)
      );
    }
    this.filtered = entries;
    this.listCursor = Math.min(this.listCursor, Math.max(0, entries.length - 1));
    this.listScroll = 0;
  }

  private openDetail(entry: KGEntry) {
    this.detailMode = true;
    this.detailEntry = entry;
    this.detailProps = [];
    this.detailLoading = true;
    this.detailScroll = 0;
    this.tui.requestRender();

    try {
      this.detailProps = loadProps(this.files, entry.uri);
    } catch {
      this.detailProps = [];
    }
    this.detailLoading = false;
    this.tui.requestRender();
  }

  private closeDetail() {
    this.detailMode = false;
    this.detailEntry = null;
    this.detailProps = [];
    this.tui.requestRender();
  }

  private toggleSelected(uri: string) {
    if (this.selected.has(uri)) this.selected.delete(uri);
    else this.selected.add(uri);
  }

  private close() {
    const entries = this.all.filter((e) => this.selected.has(e.uri));
    this.onClose(entries);
  }

  // ---- handleInput ---------------------------------------------------------

  handleInput(data: string): void {
    if (this.detailMode) {
      this.handleDetailInput(data);
    } else {
      this.handleListInput(data);
    }
  }

  private handleListInput(data: string) {
    // Suche aktiv: alle Zeichen eingeben
    if (this.searching) {
      if (matchesKey(data, "escape")) {
        this.searching = false;
        this.tui.requestRender();
        return;
      }
      if (matchesKey(data, "enter")) {
        this.searching = false;
        this.tui.requestRender();
        return;
      }
      if (matchesKey(data, "backspace")) {
        this.search = this.search.slice(0, -1);
        if (this.search === "") this.searching = false;
        this.applyFilter();
        this.tui.requestRender();
        return;
      }
      if (data.length === 1 && data.charCodeAt(0) >= 32) {
        this.search += data;
        this.applyFilter();
        this.tui.requestRender();
        return;
      }
      return;
    }

    if (data === "/" ) {
      this.searching = true;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "tab")) {
      this.tabIdx = (this.tabIdx + 1) % TABS.length;
      this.search = "";
      this.searching = false;
      this.applyFilter();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "up")) {
      if (this.listCursor > 0) {
        this.listCursor--;
        if (this.listCursor < this.listScroll) this.listScroll = this.listCursor;
        this.tui.requestRender();
      }
      return;
    }

    if (matchesKey(data, "down")) {
      if (this.listCursor < this.filtered.length - 1) {
        this.listCursor++;
        if (this.listCursor >= this.listScroll + this.PAGE) this.listScroll = this.listCursor - this.PAGE + 1;
        this.tui.requestRender();
      }
      return;
    }

    if (matchesKey(data, "enter")) {
      const entry = this.filtered[this.listCursor];
      if (entry) this.openDetail(entry);
      return;
    }

    if (data === "c" || data === "C") {
      const entry = this.filtered[this.listCursor];
      if (entry) {
        this.toggleSelected(entry.uri);
        this.tui.requestRender();
      }
      return;
    }

    if (matchesKey(data, "escape")) {
      if (this.search) {
        this.search = "";
        this.searching = false;
        this.applyFilter();
        this.tui.requestRender();
      } else {
        this.close();
      }
      return;
    }

    if (data === "q" || data === "Q") {
      this.close();
      return;
    }
  }

  private handleDetailInput(data: string) {
    if (matchesKey(data, "escape") || data === "q" || data === "Q") {
      this.closeDetail();
      return;
    }
    if (matchesKey(data, "up")) {
      this.detailScroll = Math.max(0, this.detailScroll - 1);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "down")) {
      const max = Math.max(0, this.detailProps.length - this.DETAIL_PAGE);
      this.detailScroll = Math.min(max, this.detailScroll + 1);
      this.tui.requestRender();
      return;
    }
    if (data === "c" || data === "C") {
      if (this.detailEntry) {
        this.toggleSelected(this.detailEntry.uri);
        this.tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, "enter")) {
      if (this.detailEntry) {
        this.toggleSelected(this.detailEntry.uri);
        this.tui.requestRender();
      }
      return;
    }
  }

  // ---- render --------------------------------------------------------------

  render(width: number): string[] {
    return this.detailMode ? this.renderDetail(width) : this.renderList(width);
  }

  private sep(width: number, l = "├", r = "┤") {
    return this.theme.fg("border", l + "─".repeat(Math.max(0, width - 2)) + r);
  }
  private top(width: number) {
    return this.theme.fg("border", "╭" + "─".repeat(Math.max(0, width - 2)) + "╮");
  }
  private bot(width: number) {
    return this.theme.fg("border", "╰" + "─".repeat(Math.max(0, width - 2)) + "╯");
  }
  private row(content: string, width: number) {
    const t = this.theme;
    return t.fg("border", "│") + truncateToWidth(content, width - 2) + t.fg("border", "│");
  }

  private renderList(width: number): string[] {
    const t = this.theme;
    const lines: string[] = [];
    const inner = width - 2;

    // Header
    lines.push(this.top(width));
    const title = t.bold(" 🔍 KG Browser");
    const selInfo = this.selected.size > 0
      ? t.fg("success", `  ✓ ${this.selected.size} markiert`)
      : "";
    lines.push(this.row(title + selInfo, width));

    // Tabs
    const tabStr = TABS.map((tab, i) => {
      const active = i === this.tabIdx;
      const label = active ? t.fg("accent", t.bold(`[${tab.label}]`)) : t.fg("dim", ` ${tab.label} `);
      return label;
    }).join(t.fg("dim", "│"));
    lines.push(this.row(" " + tabStr, width));

    // Suche
    const searchLine = this.searching
      ? t.fg("accent", " /") + " " + this.search + t.fg("accent", "█")
      : this.search
        ? t.fg("accent", " /") + " " + this.search + t.fg("dim", "  (Esc löschen)")
        : t.fg("dim", " / zum Suchen");
    lines.push(this.row(searchLine, width));
    lines.push(this.sep(width));

    if (this.loading) {
      lines.push(this.row(t.fg("dim", " ⏳ Lade Graph…"), width));
    } else if (this.error) {
      lines.push(this.row(t.fg("error", ` ✗ ${this.error}`), width));
    } else if (this.filtered.length === 0) {
      lines.push(this.row(t.fg("muted", " (keine Treffer)"), width));
    } else {
      // Zähler
      const cnt = t.fg("dim", ` ${this.filtered.length} Einträge`);
      lines.push(this.row(cnt, width));

      // Liste
      const visible = this.filtered.slice(this.listScroll, this.listScroll + this.PAGE);
      for (let i = 0; i < visible.length; i++) {
        const entry = visible[i]!;
        const absIdx = this.listScroll + i;
        const isCursor = absIdx === this.listCursor;
        const isMarked = this.selected.has(entry.uri);

        const icon = KIND_ICON[entry.kind];
        const color = KIND_COLOR[entry.kind];
        const mark = isMarked ? t.fg("success", "✓ ") : "  ";
        const labelColor = isCursor ? "accent" : color;
        const label = t.fg(labelColor, `${icon} ${entry.label}`);
        const prefix = isCursor ? t.bg("selectedBg", mark + label) : mark + label;
        lines.push(this.row(" " + prefix, width));
      }

      // Scrollbar-Hinweis
      if (this.filtered.length > this.PAGE) {
        const scrollInfo = t.fg("dim",
          ` ↑↓ ${this.listScroll + 1}–${Math.min(this.listScroll + this.PAGE, this.filtered.length)} / ${this.filtered.length}`
        );
        lines.push(this.row(scrollInfo, width));
      }
    }

    lines.push(this.sep(width, "╰", "╯"));

    // Footer
    const hint = this.searching
      ? t.fg("dim", " Tippen = filtern  •  Esc = abbrechen")
      : t.fg("dim", " ↑↓ nav  •  Enter Details  •  c markieren  •  / suchen  •  Tab Kat.  •  Esc schließen") +
        (this.selected.size > 0 ? t.fg("success", `  •  Esc→Kontext`) : "");
    lines.push(truncateToWidth(hint, width));

    return lines;
  }

  private renderDetail(width: number): string[] {
    const t = this.theme;
    const inner = width - 2;
    const lines: string[] = [];
    const entry = this.detailEntry!;
    const isMarked = entry ? this.selected.has(entry.uri) : false;

    // Header
    lines.push(this.top(width));
    const icon = entry ? KIND_ICON[entry.kind] : "?";
    const color = entry ? KIND_COLOR[entry.kind] : "dim";
    const markStr = isMarked ? t.fg("success", " ✓") : "";
    lines.push(this.row(
      ` ${t.fg(color, icon + " " + t.bold(entry?.label ?? "…"))}${markStr}  ${t.fg("muted", `[${entry?.kind}]`)}`,
      width
    ));

    // URI
    const uriStr = truncateToWidth(t.fg("dim", " " + (entry?.uri ?? "")), inner);
    lines.push(this.row(uriStr, width));

    if (entry?.definition) {
      lines.push(this.sep(width));
      const defLines = wordWrap(entry.definition, inner - 2);
      for (const l of defLines) lines.push(this.row(" " + t.fg("muted", l), width));
    }

    lines.push(this.sep(width));

    if (this.detailLoading) {
      lines.push(this.row(t.fg("dim", " ⏳ Lade Properties…"), width));
    } else if (this.detailProps.length === 0) {
      lines.push(this.row(t.fg("muted", " (keine weiteren Eigenschaften)"), width));
    } else {
      // Scroll
      const max = Math.max(0, this.detailProps.length - this.DETAIL_PAGE);
      this.detailScroll = Math.min(max, this.detailScroll);
      const visible = this.detailProps.slice(this.detailScroll, this.detailScroll + this.DETAIL_PAGE);

      for (const prop of visible) {
        const line = truncateToWidth(
          "  " + t.fg("dim", prop.predicate + ": ") + prop.value,
          inner
        );
        lines.push(this.row(line, width));
      }

      if (this.detailProps.length > this.DETAIL_PAGE) {
        const info = t.fg("dim",
          ` ↑↓ ${this.detailScroll + 1}–${Math.min(this.detailScroll + this.DETAIL_PAGE, this.detailProps.length)} / ${this.detailProps.length}`
        );
        lines.push(this.row(info, width));
      }
    }

    lines.push(this.sep(width, "╰", "╯"));
    const hint = t.fg("dim", " ↑↓ scrollen  •  c/Enter markieren  •  Esc zurück");
    lines.push(truncateToWidth(hint, width));

    return lines;
  }

  invalidate(): void {}
}

// ---------------------------------------------------------------------------
// Hilfsfunktion: Zeilenumbruch
// ---------------------------------------------------------------------------

function wordWrap(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > width && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Kontext-Text bauen
// ---------------------------------------------------------------------------

function buildContextMessage(entries: KGEntry[], files: string[]): string {
  const lines: string[] = [
    `## Knowledge Graph – Ausgewählte Einträge (${entries.length})`,
    "",
  ];

  for (const entry of entries) {
    lines.push(`### ${KIND_ICON[entry.kind]} ${entry.label}  [${entry.kind}]`);
    lines.push(`URI: \`${entry.uri}\``);
    if (entry.definition) {
      lines.push(`> ${entry.definition}`);
    }

    // Properties laden
    try {
      const props = loadProps(files, entry.uri);
      if (props.length > 0) {
        for (const p of props.slice(0, 20)) {
          lines.push(`- **${p.predicate}**: ${p.value}`);
        }
        if (props.length > 20) lines.push(`_(…${props.length - 20} weitere)_`);
      }
    } catch {}

    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  async function openBrowser(ctx: {
    cwd: string;
    hasUI: boolean;
    ui: {
      custom: Function;
      notify: Function;
      theme: Theme;
    };
  }) {
    if (!ctx.hasUI) {
      ctx.ui.notify("KG Browser benötigt interaktiven Modus", "warning");
      return;
    }

    const files = findTtlFiles(ctx.cwd);
    if (files.length === 0) {
      ctx.ui.notify("Keine TTL-Dateien in graph/ gefunden", "warning");
      return;
    }

    let browser: KGBrowser;
    let selectedEntries: KGEntry[] = [];

    await ctx.ui.custom<void>(
      (tui, theme, _kb, done) => {
        browser = new KGBrowser(tui, theme, ctx.cwd, (entries) => {
          selectedEntries = entries;
          done(undefined);
        });
        return {
          render: (w: number) => browser.render(w),
          invalidate: () => browser.invalidate(),
          handleInput: (data: string) => browser.handleInput(data),
        };
      },
      {
        overlay: true,
        overlayOptions: {
          width: "90%",
          maxHeight: "88%",
          anchor: "center",
        },
      }
    );

    // Nach dem Schließen: markierte Einträge als Kontext injizieren
    if (selectedEntries.length > 0) {
      const msg = buildContextMessage(selectedEntries, files);
      pi.sendMessage(
        {
          customType: "kg-context",
          content: msg,
          display: true,
        },
        { triggerTurn: false }
      );
      ctx.ui.notify(
        `${selectedEntries.length} Eintrag/Einträge als Kontext hinzugefügt`,
        "success"
      );
    }
  }

  pi.registerCommand("kg", {
    description: "Knowledge Graph Browser öffnen",
    handler: async (_args, ctx) => {
      await openBrowser(ctx);
    },
  });

  pi.registerShortcut("alt+k", {
    description: "Knowledge Graph Browser öffnen",
    handler: async (ctx) => {
      await openBrowser(ctx);
    },
  });
}

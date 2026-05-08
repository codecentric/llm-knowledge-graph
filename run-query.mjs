#!/usr/bin/env node
// =============================================================================
// run-query.mjs  –  SPARQL-Abfragen gegen den Knowledge Graph ausführen
//
// Verwendung:
//   npm run query                → interaktives Menü mit Filter
//   npm run query -- <nummer>    → Query direkt starten (z. B. npm run query -- 3)
//   npm run query -- --list      → Übersicht aller Queries
//   npm run query -- --help      → diese Hilfe
// =============================================================================

import { spawnSync }                    from 'child_process';
import { existsSync, readFileSync }     from 'fs';
import { join, dirname, basename }      from 'path';
import { fileURLToPath }                from 'url';
import { createRequire }                from 'module';
import readline                         from 'readline';
import { QueryEngine }                  from '@comunica/query-sparql-file';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Pfade
// ---------------------------------------------------------------------------
const SKILL   = join(__dirname, '.agents/skills/sparql-query');
const GRAPH   = join(__dirname, 'graph');
const QUERIES = join(__dirname, 'queries');

// ---------------------------------------------------------------------------
// ANSI
// ---------------------------------------------------------------------------
const T = process.stdout.isTTY;
const esc  = (c) => T ? `\x1b[${c}m` : '';
const ansi = (c, s) => `${esc(c)}${s}${esc(0)}`;

const bold    = (s) => ansi('1',    s);
const dim     = (s) => ansi('2',    s);
const cyan    = (s) => ansi('1;36', s);
const green   = (s) => ansi('1;32', s);
const yellow  = (s) => ansi('1;33', s);
const magenta = (s) => ansi('1;35', s);
const red     = (s) => ansi('1;31', s);
const white   = (s) => ansi('1;37', s);

// Länge ohne ANSI-Escape-Sequenzen
const visLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
const padEnd = (s, w) => s + ' '.repeat(Math.max(0, w - visLen(s)));

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
function die(msg) { console.error(red('Fehler: ') + msg); process.exit(1); }

function checkDeps() {
  const req = createRequire(join(SKILL, 'package.json'));
  try { req('@comunica/query-sparql-file'); }
  catch {
    console.log(yellow('Abhängigkeiten fehlen – werden installiert …'));
    spawnSync('npm', ['install', '--silent'], { cwd: SKILL, stdio: 'inherit', shell: true });
  }
}

function queryTitle(rqPath) {
  try {
    const line = readFileSync(rqPath, 'utf8').split('\n').find(l => l.startsWith('#'));
    return line ? line.replace(/^#\s*/, '') : basename(rqPath);
  } catch { return basename(rqPath); }
}

// ---------------------------------------------------------------------------
// Query-Katalog
// ---------------------------------------------------------------------------
const PERSONEN_TTL = ['thomas','sarah','julia','lena','marco']
  .map(n => join(GRAPH, `personen/${n}.ttl`));

const ENTRIES = [
  // ── Glossar ──────────────────────────────────────────────────────────────
  { section: 'Glossar',   rq: 'glossary/alle-konzepte.rq',                ttl: ['glossary.ttl'] },
  { section: 'Glossar',   rq: 'glossary/top-konzepte.rq',                 ttl: ['glossary.ttl'] },
  { section: 'Glossar',   rq: 'glossary/hierarchie.rq',                   ttl: ['glossary.ttl'] },
  // ── Versand ──────────────────────────────────────────────────────────────
  { section: 'Versand',   rq: 'versand/alle-versandpartner.rq',            ttl: ['versand.ttl'] },
  { section: 'Versand',   rq: 'versand/lieferlaender-pro-partner.rq',      ttl: ['versand.ttl'] },
  { section: 'Versand',   rq: 'versand/kostenlos-versand-schwellenwerte.rq', ttl: ['versand.ttl'] },
  { section: 'Versand',   rq: 'versand/laendersperren.rq',                 ttl: ['versand.ttl'] },
  { section: 'Versand',   rq: 'versand/offene-punkte.rq',                  ttl: ['versand.ttl'] },
  // ── Personen ─────────────────────────────────────────────────────────────
  { section: 'Personen',  rq: 'personen/alle-stakeholder.rq',              ttl: PERSONEN_TTL, ttlAbsolute: true },
  { section: 'Personen',  rq: 'personen/entscheidungen-pro-person.rq',     ttl: PERSONEN_TTL, ttlAbsolute: true },
  { section: 'Personen',  rq: 'personen/offene-fragen.rq',                 ttl: PERSONEN_TTL, ttlAbsolute: true },
].map((e, i) => ({
  idx:     i,
  section: e.section,
  label:   queryTitle(join(QUERIES, e.rq)),
  rq:      join(QUERIES, e.rq),
  ttl:     e.ttlAbsolute ? e.ttl : e.ttl.map(f => join(GRAPH, f)),
}));

// ---------------------------------------------------------------------------
// Wert eines RDF-Terms bereinigt darstellen
// ---------------------------------------------------------------------------
function cleanTerm(raw) {
  if (!raw) return '';
  // Literal mit Sprachtag: "Wert"@de  →  Wert
  let m = raw.match(/^"([\s\S]*)"@[a-z-]+$/);
  if (m) return m[1];
  // Literal mit Datentyp
  m = raw.match(/^"([\s\S]*?)"\^\^<[^>]+>$/);
  if (m) {
    const val = m[1];
    // Boolean
    if (val === 'true')  return '✓';
    if (val === 'false') return '✗';
    return val;
  }
  // Einfaches Literal
  m = raw.match(/^"([\s\S]*)"$/);
  if (m) return m[1];
  // NamedNode: kürzen auf Fragment oder letztes Pfadsegment
  m = raw.match(/^<[^>]*[#/]([^#/>]+)>$/);
  if (m) return m[1];
  return raw;
}

// ---------------------------------------------------------------------------
// SPARQL ausführen und Rohdaten liefern
// ---------------------------------------------------------------------------
async function runSparql(rqPath, ttlFiles) {
  const engine  = new QueryEngine();
  const sources = ttlFiles.map(f => ({ type: 'file', value: `file://${f}` }));
  const sparql  = readFileSync(rqPath, 'utf8');
  const result  = await engine.query(sparql, { sources });

  if (result.resultType === 'bindings') {
    const stream = await result.execute();
    const rows   = [];
    let   vars   = [];
    await new Promise((ok, fail) => {
      stream.on('data', b => {
        if (!vars.length) vars = [...b.keys()].map(k => k.value);
        const row = {};
        for (const v of vars) row[v] = b.get(v)?.value !== undefined
          ? termRaw(b.get(v)) : '';
        rows.push(row);
      });
      stream.on('end',   ok);
      stream.on('error', fail);
    });
    return { type: 'bindings', vars, rows };
  }
  if (result.resultType === 'boolean') {
    const val = await result.execute();
    return { type: 'boolean', val };
  }
  return { type: 'unknown' };
}

// Rohwert eines Comunica-Terms (analog zu termValue in query.js)
function termRaw(term) {
  if (!term) return '';
  if (term.termType === 'NamedNode') return `<${term.value}>`;
  if (term.termType === 'Literal') {
    if (term.language) return `"${term.value}"@${term.language}`;
    const dt = term.datatype?.value;
    if (dt && dt !== 'http://www.w3.org/2001/XMLSchema#string')
      return `"${term.value}"^^<${dt}>`;
    return `"${term.value}"`;
  }
  if (term.termType === 'BlankNode') return `_:${term.value}`;
  return term.value;
}

// ---------------------------------------------------------------------------
// Tabelle formatieren
// ---------------------------------------------------------------------------
const SECTION_COLORS = { Glossar: magenta, Versand: yellow, Personen: green };
const colColor = (sec) => SECTION_COLORS[sec] ?? white;

function printTable(entry, vars, rows) {
  const cc = colColor(entry.section);

  // Spalten bereinigen
  const clean = rows.map(r => {
    const out = {};
    for (const v of vars) out[v] = cleanTerm(r[v]);
    return out;
  });

  // Spaltenbreiten (min = Header-Länge)
  const widths = vars.map(v =>
    Math.max(visLen(v), ...clean.map(r => visLen(r[v] ?? '')))
  );

  const hr  = '┼' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┼';
  const top = '┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  const mid = '├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  const bot = '└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

  const fmtCell = (val, w) => ` ${padEnd(val, w)} `;
  const headerRow = '│' + vars.map((v, i) => fmtCell(bold(v), widths[i] + visLen(bold('')) )) .join('│') + '│';

  console.log('');
  console.log(cyan(`▶  ${entry.label}`));
  console.log(dim(`   ${entry.rq.replace(__dirname + '/', '')}`));
  console.log('');
  console.log(dim(top));
  console.log(dim('│') + vars.map((v, i) => bold(` ${v.padEnd(widths[i])} `)).join(dim('│')) + dim('│'));
  console.log(dim(mid));

  for (const row of clean) {
    const cells = vars.map((v, i) => {
      const val = row[v] ?? '';
      // Boolesches Ergebnis einfärben
      const colored = val === '✓' ? green(val) : val === '✗' ? red(val) : val;
      return ` ${padEnd(colored, widths[i] + visLen(colored) - visLen(val))} `;
    });
    console.log(dim('│') + cells.join(dim('│')) + dim('│'));
  }

  console.log(dim(bot));
  console.log(dim(`  ${rows.length} Ergebnis${rows.length !== 1 ? 'se' : ''}`));
  console.log('');
}

// ---------------------------------------------------------------------------
// Query ausführen
// ---------------------------------------------------------------------------
async function executeQuery(entry) {
  let data;
  try {
    data = await runSparql(entry.rq, entry.ttl);
  } catch (err) {
    console.error(red('SPARQL-Fehler: ') + err.message);
    return;
  }

  if (data.type === 'bindings') {
    if (!data.rows.length) {
      console.log(dim('  (keine Ergebnisse)'));
      return;
    }
    printTable(entry, data.vars, data.rows);
  } else if (data.type === 'boolean') {
    console.log(`\n  Ergebnis: ${data.val ? green('true') : red('false')}\n`);
  } else {
    console.log(dim('  (unbekannter Ergebnistyp)'));
  }
}

// ---------------------------------------------------------------------------
// Interaktives Menü mit Live-Filter
// ---------------------------------------------------------------------------

function printHeader() {
  console.log('');
  console.log(cyan(bold('╔══════════════════════════════════════════════════════════════╗')));
  console.log(cyan(bold('║     Knowledge Graph – SPARQL Query Runner                    ║')));
  console.log(cyan(bold('╚══════════════════════════════════════════════════════════════╝')));
  console.log('');
}

const SECTION_ORDER = ['Glossar', 'Versand', 'Personen'];

function sectionHeader(sec) {
  const fn = SECTION_COLORS[sec] ?? white;
  const bars = '─'.repeat(48 - sec.length);
  return fn(bold(`── ${sec} ${bars}`));
}

// Fuzzy-Filter: alle Buchstaben des Suchbegriffs müssen in Label erscheinen
function fuzzyMatch(label, filter) {
  if (!filter) return true;
  const hay = label.toLowerCase();
  let i = 0;
  for (const ch of filter.toLowerCase()) {
    const pos = hay.indexOf(ch, i);
    if (pos === -1) return false;
    i = pos + 1;
  }
  return true;
}

async function interactiveMenu() {
  let filter = '';
  let cursor = 0;    // Index in der gefilterten Liste
  let chosen = null;

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  let lastLineCount = 0;

  function filtered() {
    return ENTRIES.filter(e => fuzzyMatch(e.label, filter));
  }

  function draw() {
    if (lastLineCount > 0) {
      process.stdout.write(`\x1b[${lastLineCount}A\x1b[J`);
    }

    const list = filtered();
    cursor = Math.min(cursor, Math.max(0, list.length - 1));

    const lines = [];

    // Eingabezeile – immer sichtbar, mit blinkenden Cursor-Block
    const inputText = filter.length ? white(filter) : '';
    const placeholder = filter.length ? '' : dim('Tippen zum Filtern …');
    lines.push(`  ${cyan(bold('❯'))} ${inputText}${placeholder}`);
    lines.push(dim('    ↑/↓  navigieren  •  Enter  auswählen  •  Esc  beenden'));
    lines.push('');

    if (!list.length) {
      lines.push(dim('  Keine Treffer.'));
    } else {
      let curSection = '';
      list.forEach((e, i) => {
        if (e.section !== curSection) {
          curSection = e.section;
          lines.push(`  ${sectionHeader(e.section)}`);
        }
        if (i === cursor) {
          lines.push(`  ${cyan(bold('▶'))}  ${bold(e.label)}`);
        } else {
          lines.push(`     ${e.label}`);
        }
      });
    }

    lines.push('');
    process.stdout.write(lines.join('\n') + '\n');
    lastLineCount = lines.length;
  }

  draw();

  await new Promise((resolve) => {
    function cleanup() {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener('keypress', onKey);
      process.stdin.pause();
    }

    function onKey(str, key) {
      if (!key) return;
      const list = filtered();

      if (key.name === 'up') {
        if (list.length) cursor = (cursor - 1 + list.length) % list.length;
      } else if (key.name === 'down') {
        if (list.length) cursor = (cursor + 1) % list.length;
      } else if (key.name === 'return') {
        chosen = list[cursor] ?? null;
        cleanup(); resolve(); return;
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        chosen = null; cleanup(); resolve(); return;
      } else if (key.name === 'backspace') {
        if (filter.length) { filter = filter.slice(0, -1); cursor = 0; }
      } else if (str && !key.ctrl && !key.meta && str.length === 1 && str >= ' ') {
        // Jedes druckbare Zeichen landet im Filter – auch j, k, q
        filter += str;
        cursor = 0;
      } else {
        return;
      }

      draw();
    }

    process.stdin.on('keypress', onKey);
    process.stdin.resume();
  });

  if (lastLineCount > 0) {
    process.stdout.write(`\x1b[${lastLineCount}A\x1b[J`);
  }

  return chosen;
}

// ---------------------------------------------------------------------------
// --list Ausgabe
// ---------------------------------------------------------------------------
function printList() {
  let curSection = '';
  ENTRIES.forEach((e, i) => {
    if (e.section !== curSection) {
      curSection = e.section;
      console.log(`\n  ${sectionHeader(e.section)}`);
    }
    console.log(`  ${bold(String(i + 1).padStart(2) + ')')}  ${e.label}`);
  });
  console.log('');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const arg = process.argv[2];

if (arg === '--help' || arg === '-h') {
  console.log(`\nVerwendung: npm run query [-- <nr> | -- --list | -- --help]\n`);
  console.log('  Ohne Argument   interaktives Menü mit Filter (Tippen filtert, ↑/↓ navigiert)');
  console.log(`  <nummer>        Query direkt ausführen (1–${ENTRIES.length})`);
  console.log('  --list          Alle Queries auflisten');
  console.log('  --help          Diese Hilfe\n');
  process.exit(0);
}

if (arg === '--list' || arg === '-l') {
  printHeader();
  printList();
  process.exit(0);
}

if (arg && /^\d+$/.test(arg)) {
  const num = parseInt(arg, 10);
  if (num < 1 || num > ENTRIES.length) die(`Ungültige Nummer: ${num} (1–${ENTRIES.length})`);
  checkDeps();
  await executeQuery(ENTRIES[num - 1]);
  process.exit(0);
}

// Interaktives Menü
checkDeps();
printHeader();

while (true) {
  const entry = await interactiveMenu();

  if (!entry) {
    console.log(dim('\nTschüss!\n'));
    process.exit(0);
  }

  await executeQuery(entry);

  // Auf Enter warten
  await new Promise(resolve => {
    process.stdout.write(dim('  [Enter] zurück zum Menü … '));
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    function onKey(_s, key) {
      if (!key) return;
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener('keypress', onKey);
      process.stdin.pause();

      if ((key.ctrl && key.name === 'c') || key.name === 'q') {
        console.log(dim('\n\nTschüss!\n'));
        process.exit(0);
      }
      console.log('');
      resolve();
    }

    process.stdin.on('keypress', onKey);
    process.stdin.resume();
  });

  printHeader();
}

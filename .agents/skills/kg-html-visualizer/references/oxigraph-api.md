# Oxigraph WASM – Browser-API

Version: **0.3.x** (CDN: `https://cdn.jsdelivr.net/npm/oxigraph@0.3.10/web.js`)

## ⚠️ TTL-Daten niemals inline einbetten

RDF/Turtle-Daten dürfen **niemals** als JavaScript-String-Literal in die HTML-Datei geschrieben werden.
Sonderzeichen (€, –, Umlaute, Anführungszeichen, Backticks) in TTL-Dateien führen unweigerlich zu
`SyntaxError: Invalid or unexpected token` oder `Identifier already declared`.

**Immer** per `fetch()` laden:

```js
async function fetchTtl(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Konnte ${path} nicht laden (HTTP ${res.status})`);
  return res.text();
}

// Einzelne Datei
const ttl = await fetchTtl('../graph/glossary.ttl');

// Mehrere Dateien parallel
const [ttl1, ttl2] = await Promise.all([
  fetchTtl('../graph/versand.ttl'),
  fetchTtl('../graph/glossary.ttl'),
]);
```

> Die fertigen HTML-Dateien müssen deshalb über einen Webserver ausgeliefert werden –
> `file://`-Protokoll blockiert `fetch()`. Lokaler Start: `npm run serve` im Workspace-Root.

---

## Initialisierung (ES-Modul)

```html
<script type="module">
import init, { Store } from 'https://cdn.jsdelivr.net/npm/oxigraph@0.3.10/web.js';

async function main() {
  await init(); // WASM laden – MUSS vor allem anderen aufgerufen werden

  const ttl = await fetchTtl('../graph/meine-daten.ttl');

  const store = new Store();
  store.load(ttl, 'text/turtle', 'https://example.org/');

  // SPARQL SELECT
  const results = store.query(`
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT ?s ?label WHERE { ?s skos:prefLabel ?label }
  `);

  for (const row of results) {
    console.log(row.get('s').value, row.get('label').value);
  }
}

main().catch(console.error);
</script>
```

---

## store.load() – korrekte Signatur

```js
// ✅ RICHTIG – Positional-Parameter (verifiziert gegen oxigraph@0.3.10 WASM-Code):
store.load(data, mimeType, baseIri);

// Beispiele:
store.load(ttlString, 'text/turtle', 'https://shop.example.org/');
store.load(nqString,  'application/n-quads', 'https://example.org/');

// ❌ FALSCH – Objekt-Schreibweise funktioniert nicht und wirft "Not supported MIME type":
store.load(data, { format: 'text/turtle', baseIri: '...' });  // NICHT VERWENDEN
```

---

## Store-Methoden

| Methode | Beschreibung |
|---------|-------------|
| `store.load(data, mimeType, baseIri)` | Triples laden. mimeType z. B. `'text/turtle'`, `'application/n-triples'`, `'application/ld+json'` |
| `store.query(sparql)` | SELECT/ASK/CONSTRUCT/DESCRIBE ausführen |
| `store.update(sparql)` | INSERT/DELETE ausführen |
| `store.size` | Anzahl der Triples |
| `store.dump(mimeType)` | Serialisiert den gesamten Store |

## Ergebnis-Iteration (SELECT)

```js
const results = store.query(sparql);
// results ist ein iterierbares Objekt von Map-ähnlichen Bindings

for (const row of results) {
  const term = row.get('varName');   // gibt ein RDF/JS Term-Objekt zurück oder undefined

  term.termType   // "NamedNode" | "Literal" | "BlankNode"
  term.value      // String: IRI, Literal-Wert, oder BNode-ID
  term.language   // nur bei Literal: Sprach-Tag z. B. "de"
  term.datatype   // nur bei Literal: NamedNode mit der Datatype-IRI
}
```

## Mehrere TTL-Dateien laden

```js
// Parallel fetchen, dann nacheinander in denselben Store laden – Store akkumuliert:
const [ttl1, ttl2] = await Promise.all([
  fetchTtl('../graph/versand.ttl'),
  fetchTtl('../graph/glossary.ttl'),
]);
store.load(ttl1, 'text/turtle', 'https://shop.example.org/versand');
store.load(ttl2, 'text/turtle', 'https://shop.example.org/glossary');
```

## Fehlerbehandlung

```js
try {
  store.load(ttlString, 'text/turtle', 'https://example.org/');
} catch (e) {
  console.error('Parse error:', e.message);
}

try {
  const results = store.query(sparql);
} catch (e) {
  console.error('SPARQL error:', e.message);
}
```

## Vollständiges Initialisierungsmuster (mit Ladeindikator)

```html
<sl-spinner id="spinner"></sl-spinner>
<div id="app" style="display:none"></div>

<script type="module">
import init, { Store } from 'https://cdn.jsdelivr.net/npm/oxigraph@0.3.10/web.js';

async function fetchTtl(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Konnte ${path} nicht laden (HTTP ${res.status})`);
  return res.text();
}

const spinner = document.getElementById('spinner');
const app     = document.getElementById('app');

async function main() {
  await init();

  const ttl   = await fetchTtl('../graph/meine-daten.ttl');
  const store = new Store();
  store.load(ttl, 'text/turtle', 'https://example.org/');

  render(store);

  spinner.style.display = 'none';
  app.style.display     = 'block';
}

function render(store) {
  // store.query(...)
}

main().catch(err => {
  spinner.style.display = 'none';
  document.body.insertAdjacentHTML('afterbegin',
    `<sl-alert variant="danger" open>${err.message}</sl-alert>`);
});
</script>
```

## Häufige Fallstricke

- `init()` **muss** `await`-ed werden, bevor `new Store()` aufgerufen wird
- TTL **niemals** als JS-String-Literal einbetten – immer `fetch()` verwenden (siehe oben)
- `store.load()` erwartet **Positional-Parameter**, kein Options-Objekt
- CDN-URL für WASM muss das Modul exportieren – `jsdelivr` mit dem exakten Pfad `/web.js` funktioniert
- Bei sehr großen TTL-Dateien (> 5 MB) kann das Parsing einige Sekunden dauern → Ladeindikator zeigen
- `store.query()` gibt ein Iterable zurück – kein Array; für zufälligen Zugriff: `[...results]`

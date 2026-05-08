# Oxigraph WASM – Browser-API

Version: **0.3.x** (CDN: `https://cdn.jsdelivr.net/npm/oxigraph@0.3.10/web.js`)

## Initialisierung (ES-Modul)

```html
<script type="module">
import init, { Store } from 'https://cdn.jsdelivr.net/npm/oxigraph@0.3.10/web.js';

async function main() {
  await init(); // WASM laden – MUSS vor allem anderen aufgerufen werden

  const store = new Store();

  // Turtle einladen
  store.load(TTL_STRING, { format: 'text/turtle', baseIri: 'https://example.org/' });

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

## Store-Methoden

| Methode | Beschreibung |
|---------|-------------|
| `store.load(data, { format, baseIri })` | Triples laden. Format: `'text/turtle'`, `'application/n-triples'`, `'application/ld+json'` |
| `store.query(sparql)` | SELECT/ASK/CONSTRUCT/DESCRIBE ausführen |
| `store.update(sparql)` | INSERT/DELETE ausführen |
| `store.size` | Anzahl der Triples |
| `store.dump({ format })` | Serialisiert den gesamten Store |

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
// Einfach nacheinander aufrufen – Store akkumuliert
store.load(ttl1, { format: 'text/turtle', baseIri: 'https://base.org/' });
store.load(ttl2, { format: 'text/turtle', baseIri: 'https://base.org/' });
```

## Fehlerbehandlung

```js
try {
  store.load(ttlString, { format: 'text/turtle' });
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

const spinner = document.getElementById('spinner');
const app     = document.getElementById('app');

async function main() {
  await init();

  const store = new Store();
  store.load(TTL_DATA, { format: 'text/turtle', baseIri: 'https://example.org/' });

  // UI rendern
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
- CDN-URL für WASM muss das Modul exportieren – `jsdelivr` mit dem exakten Pfad `/web.js` funktioniert
- Bei sehr großen TTL-Strings (> 5 MB) kann das Parsing einige Sekunden dauern → Ladeindikator zeigen
- `store.query()` gibt ein Iterable zurück – kein Array; für zufälligen Zugriff: `[...results]`
- Backticks im eingebetteten TTL-String müssen escapt werden: `` ` `` → `` \` ``

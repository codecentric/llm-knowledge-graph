# Cytoscape.js – Layout-Optionen für Wissensgraphen

CDN: `https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js`

## Schnellstart

```html
<div id="cy" style="width:100%;height:600px;background:#f8f9fa;border-radius:8px;"></div>
<script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
<script>
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: {
    nodes: [
      { data: { id: 'n1', label: 'Konzept A' } },
      { data: { id: 'n2', label: 'Konzept B' } },
    ],
    edges: [
      { data: { id: 'e1', source: 'n1', target: 'n2', label: 'broader' } },
    ]
  },
  style: cytoscapeStyle(),
  layout: { name: 'cose', animate: true }
});
</script>
```

## Empfohlene Layouts

### `cose` (built-in, kein Extra-Plugin)
Physik-basiert, gut für mittlere Graphen (< 200 Knoten).

```js
{
  name: 'cose',
  animate: true,
  animationDuration: 800,
  nodeRepulsion: () => 8000,
  idealEdgeLength: () => 120,
  edgeElasticity: () => 100,
  gravity: 0.25,
  numIter: 1000,
  fit: true,
  padding: 30
}
```

### `breadthfirst` (built-in)
Gut für Hierarchien/Bäume.

```js
{
  name: 'breadthfirst',
  directed: true,
  roots: '#rootNodeId',  // optional
  padding: 20,
  spacingFactor: 1.5
}
```

### `circle` / `concentric` (built-in)
Für radialen Überblick.

```js
{ name: 'concentric', concentric: n => n.degree(), levelWidth: () => 2 }
```

### `cola` (Plugin – physikalisch realistisch)
CDN: `https://cdn.jsdelivr.net/npm/cytoscape-cola@2.5.1/cytoscape-cola.js`
Requires: `https://cdn.jsdelivr.net/npm/webcola@3.4.0/WebCola/cola.js`

```html
<script src="https://cdn.jsdelivr.net/npm/webcola@3.4.0/WebCola/cola.js"></script>
<script src="https://cdn.jsdelivr.net/npm/cytoscape-cola@2.5.1/cytoscape-cola.js"></script>
<script>
cytoscape.use(cytoscapeCola);
// layout:
{ name: 'cola', animate: true, maxSimulationTime: 2000, edgeLength: 150 }
</script>
```

## Standard-Stylesheet für Wissensgraphen

```js
function cytoscapeStyle() {
  return [
    {
      selector: 'node',
      style: {
        'background-color': '#4f6ef7',
        'label': 'data(label)',
        'color': '#fff',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '11px',
        'width': 'label',
        'height': 'label',
        'padding': '8px',
        'shape': 'roundrectangle',
        'text-wrap': 'wrap',
        'text-max-width': '120px'
      }
    },
    {
      selector: 'node:selected',
      style: { 'background-color': '#2541b2', 'border-width': 2, 'border-color': '#fff' }
    },
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': '#aab4d0',
        'target-arrow-color': '#aab4d0',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '9px',
        'color': '#666',
        'text-rotation': 'autorotate'
      }
    },
    // Kantenfarben nach Relationstyp
    {
      selector: 'edge[relType="broader"]',
      style: { 'line-color': '#e07b54', 'target-arrow-color': '#e07b54' }
    },
    {
      selector: 'edge[relType="related"]',
      style: { 'line-color': '#54b0e0', 'line-style': 'dashed' }
    },
    {
      selector: 'edge[relType="subClassOf"]',
      style: { 'line-color': '#6fcb97', 'target-arrow-color': '#6fcb97' }
    }
  ];
}
```

## Elemente aus SPARQL-Ergebnissen bauen

```js
function buildCytoscapeElements(sparqlResults) {
  const nodes = new Map();
  const edges = [];

  for (const row of sparqlResults) {
    const src   = row.get('source').value;
    const tgt   = row.get('target').value;
    const srcLbl = row.get('sourceLabel')?.value ?? src.split(/[/#]/).pop();
    const tgtLbl = row.get('targetLabel')?.value ?? tgt.split(/[/#]/).pop();
    const rel   = row.get('relType')?.value ?? '';

    if (!nodes.has(src)) nodes.set(src, { data: { id: src, label: srcLbl } });
    if (!nodes.has(tgt)) nodes.set(tgt, { data: { id: tgt, label: tgtLbl } });
    edges.push({ data: { id: `${src}-${rel}-${tgt}`, source: src, target: tgt, label: rel, relType: rel } });
  }

  return {
    nodes: [...nodes.values()],
    edges
  };
}
```

## Interaktivität

```js
// Klick auf Knoten → Detail-Panel befüllen
cy.on('tap', 'node', evt => {
  const node = evt.target;
  document.getElementById('detail-panel').innerHTML = `
    <strong>${node.data('label')}</strong><br>
    <code>${node.id()}</code>
  `;
});

// Auf Fit-Button reagieren
document.getElementById('btn-fit').addEventListener('click', () => cy.fit());

// Layout neu berechnen
document.getElementById('btn-relayout').addEventListener('click', () => {
  cy.layout({ name: 'cose', animate: true }).run();
});
```

## Tipps

- **Performance:** Mehr als 300 Knoten → `animate: false` setzen, sonst Browser-Freeze
- **Labels kürzen:** `label: data(label)` + `text-max-width: '100px'` + `text-wrap: 'ellipsis'`
- **Zoom-Limits:** `cy.minZoom(0.2); cy.maxZoom(4);`
- **Export als PNG:** `cy.png({ output: 'blob', scale: 2 })` → in `<a>` mit `href=URL.createObjectURL(...)`
- **Tooltips:** `tippy.js` oder natives `title`-Attribut via `cy.elements().forEach(el => el.tippy(...))`

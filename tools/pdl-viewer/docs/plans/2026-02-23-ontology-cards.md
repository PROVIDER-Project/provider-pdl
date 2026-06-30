# Ontologie Card-Raster Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sub-Tab "Klassen" im Ontologie-Tab mit aufklappbarem Card-Raster aller PDL/CoyPu-Klassen.

**Architecture:** Sub-Tab-Leiste innerhalb `#ontologyView` schaltet zwischen bestehendem Graph (`#ontoNetwork`) und neuem Card-Raster (`#ontoCardsView`) um. Filter-Sidebar und Details-Panel bleiben in beiden Modi aktiv. Card-Klick ruft bestehendes `showOntologyDetails(id)` auf — kein Code dupliziert.

**Tech Stack:** Vanilla JS (ES Module), vis.js (bereits geladen), CSS Grid

---

### Task 1: HTML — Sub-Tab-Leiste + Cards-Container

**Files:**
- Modify: `04_Apps/pdl-viewer/web/index.html`

**Step 1: Sub-Tab-Leiste vor `.onto-canvas main` einfügen**

Im `#ontologyView`, direkt vor `<main class="onto-canvas">` einfügen:

```html
<div id="ontoSubTabs" class="onto-sub-tabs">
  <button id="ontoTabGraph" class="onto-sub-tab active" type="button">Graph</button>
  <button id="ontoTabCards" class="onto-sub-tab" type="button">Klassen</button>
</div>
```

Hinweis: Die Sub-Tab-Leiste gehört NICHT in die `<aside>` oder `<main>`, sondern als eigenständiges Element — sie muss die volle Breite des Canvas überspannen. Daher: Das `.onto-layout` Grid um eine Zeile erweitern (Sub-Tabs oben, Content darunter). Konkret:

Aktuelles Grid in `.onto-layout`:
```
grid-template-columns: 220px 1fr 280px;
```

Neues Grid (Sub-Tabs spannen nur über die Canvas-Spalte):
Der einfachste Weg: Sub-Tabs direkt **in die `.onto-canvas main`** als erstes Kind-Element einfügen (vor `#ontoNetwork`).

```html
<main class="onto-canvas">
  <div id="ontoSubTabs" class="onto-sub-tabs">
    <button id="ontoTabGraph" class="onto-sub-tab active" type="button">Graph</button>
    <button id="ontoTabCards" class="onto-sub-tab" type="button">Klassen</button>
  </div>
  <div id="ontoNetwork" aria-label="Ontologie-Graph"></div>
  <div id="ontoCardsView" class="onto-cards-view" style="display:none">
    <div id="ontoCardsGrid" class="onto-cards-grid"></div>
  </div>
</main>
```

**Step 2: Manuell prüfen**

```bash
python3 -m http.server 8000
# Browser: http://localhost:8000/web/
```

Erwartung: Tab "Ontologie" zeigt zwei Sub-Tabs "Graph" und "Klassen" oben im Canvas-Bereich. "Klassen" noch ohne Funktion.

---

### Task 2: CSS — Sub-Tab-Leiste + Card-Styles

**Files:**
- Modify: `04_Apps/pdl-viewer/web/styles.css`

Am Ende der Datei (nach dem letzten `@media`-Block) anhängen:

**Step 1: Sub-Tab-Leiste stylen**

```css
/* ── Ontologie Sub-Tabs ──────────────────────────────────────────────────────── */

.onto-sub-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 12px 0;
  border-bottom: 1px solid var(--stroke);
  background: rgba(255,255,255,0.6);
  flex-shrink: 0;
}

.onto-sub-tab {
  padding: 6px 14px;
  border: 1px solid var(--stroke);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.onto-sub-tab:hover {
  background: var(--bg-2);
  color: var(--ink);
}

.onto-sub-tab.active {
  background: white;
  color: var(--ink);
  border-color: var(--stroke);
}

/* ── Ontologie Cards-View ──────────────────────────────────────────────────── */

.onto-canvas {
  display: flex;
  flex-direction: column;
}

.onto-cards-view {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.onto-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  align-content: start;
}

/* ── Einzelne Card ──────────────────────────────────────────────────────────── */

.onto-card {
  border: 1px solid var(--stroke);
  border-radius: 10px;
  background: var(--panel);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.1s;
}

.onto-card:hover {
  box-shadow: 0 4px 12px rgba(15,23,42,0.10);
  transform: translateY(-1px);
}

.onto-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 12px 8px;
  gap: 8px;
}

.onto-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.onto-card-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
  word-break: break-all;
  display: flex;
  align-items: center;
  gap: 6px;
}

.onto-card-badge-small {
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
}

.onto-card-toggle {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1px solid var(--stroke);
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.onto-card-body {
  display: none;
  padding: 0 12px 10px;
  border-top: 1px solid var(--stroke);
}

.onto-card.expanded .onto-card-body {
  display: block;
}

.onto-card-dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
  font-size: 11px;
  margin: 8px 0 0;
}

.onto-card-dl dt {
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
}

.onto-card-dl dd {
  margin: 0;
  color: var(--ink);
  word-break: break-all;
}

.onto-card-dl code {
  background: rgba(0,0,0,0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}
```

**Step 2: Manuell prüfen**

Browser neu laden. Erwartung: Sub-Tab-Leiste sieht ordentlich aus, "Graph"-Tab hat weißen Hintergrund, "Klassen"-Tab ist grau.

---

### Task 3: JS — `setOntoSubTab()` + `initOntoCards()` + `toggleOntoCard()`

**Files:**
- Modify: `04_Apps/pdl-viewer/web/app.js`

**Step 1: `elements`-Objekt erweitern**

Im `elements`-Objekt (ca. Zeile 155) folgende Zeilen hinzufügen, nach `ontologyView`:

```javascript
ontoTabGraph: document.getElementById("ontoTabGraph"),
ontoTabCards: document.getElementById("ontoTabCards"),
ontoCardsView: document.getElementById("ontoCardsView"),
ontoCardsGrid: document.getElementById("ontoCardsGrid"),
```

**Step 2: `state.uiState` erweitern**

In `state.uiState` ergänzen:

```javascript
ontoCardsInitialized: false
```

**Step 3: `setOntoSubTab()` einfügen**

Direkt nach `initOntologyTab()` (nach `renderOntoStats()`) eine neue Funktion einfügen:

```javascript
function setOntoSubTab(tab) {
  const isGraph = tab === "graph";
  const isCards = tab === "cards";

  if (elements.ontoNetwork) elements.ontoNetwork.style.display = isGraph ? "block" : "none";
  if (elements.ontoCardsView) elements.ontoCardsView.style.display = isCards ? "block" : "none";

  if (elements.ontoTabGraph) elements.ontoTabGraph.classList.toggle("active", isGraph);
  if (elements.ontoTabCards) elements.ontoTabCards.classList.toggle("active", isCards);

  if (isCards && !state.uiState.ontoCardsInitialized) {
    initOntoCards();
    state.uiState.ontoCardsInitialized = true;
  }

  if (isGraph && _ontoNetwork) {
    setTimeout(() => { _ontoNetwork.redraw(); _ontoNetwork.fit(); }, 50);
  }
}
```

Hinweis: `elements.ontoNetwork` ist noch nicht im `elements`-Objekt — entweder ergänzen oder direkt `document.getElementById("ontoNetwork")` verwenden. Einfacher: direkt verwenden.

Daher stattdessen:

```javascript
function setOntoSubTab(tab) {
  const isGraph = tab === "graph";
  const isCards = tab === "cards";

  const netEl = document.getElementById("ontoNetwork");
  if (netEl) netEl.style.display = isGraph ? "block" : "none";
  if (elements.ontoCardsView) elements.ontoCardsView.style.display = isCards ? "block" : "none";

  if (elements.ontoTabGraph) elements.ontoTabGraph.classList.toggle("active", isGraph);
  if (elements.ontoTabCards) elements.ontoTabCards.classList.toggle("active", isCards);

  if (isCards && !state.uiState.ontoCardsInitialized) {
    initOntoCards();
    state.uiState.ontoCardsInitialized = true;
  }

  if (isGraph && _ontoNetwork) {
    setTimeout(() => { _ontoNetwork.redraw(); _ontoNetwork.fit(); }, 50);
  }
}
```

**Step 4: `initOntoCards()` einfügen**

Direkt nach `setOntoSubTab()`:

```javascript
function initOntoCards() {
  const grid = elements.ontoCardsGrid;
  if (!grid) return;

  const allClasses = [
    ...ONTOLOGY_DATA.coypu.map(c => ({ ...c, group: "coypu", groupLabel: "CoyPu-Basisklasse" })),
    ...ONTOLOGY_DATA.pdl_inherited.map(c => ({ ...c, group: c.rel === "equivalentClass" ? "equiv" : "inherited", groupLabel: "PDL geerbt" })),
    ...ONTOLOGY_DATA.pdl_new.map(c => ({ ...c, group: "new", groupLabel: "PDL-Neuerung" })),
    ...ONTOLOGY_DATA.pdl_enum.map(c => ({ ...c, group: "enum", groupLabel: "PDL-Enumeration" }))
  ];

  grid.replaceChildren();

  allClasses.forEach(cls => {
    const card = document.createElement("article");
    card.className = "onto-card";
    card.dataset.id = cls.id;
    card.dataset.group = cls.group;

    // Header
    const header = document.createElement("div");
    header.className = "onto-card-header";

    const meta = document.createElement("div");
    meta.className = "onto-card-meta";

    const labelEl = document.createElement("div");
    labelEl.className = "onto-card-label";

    const dot = document.createElement("span");
    dot.className = `onto-dot onto-dot-${cls.group}`;
    labelEl.appendChild(dot);
    labelEl.appendChild(document.createTextNode(cls.label));

    const badgeEl = document.createElement("div");
    badgeEl.className = "onto-card-badge-small";
    badgeEl.textContent = cls.groupLabel;

    meta.appendChild(labelEl);
    meta.appendChild(badgeEl);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "onto-card-toggle";
    toggleBtn.type = "button";
    toggleBtn.textContent = "+";
    toggleBtn.setAttribute("aria-label", "Details ein-/ausblenden");

    header.appendChild(meta);
    header.appendChild(toggleBtn);

    // Body
    const body = document.createElement("div");
    body.className = "onto-card-body";

    const dl = document.createElement("dl");
    dl.className = "onto-card-dl";

    const addRow = (dtText, ddNodes) => {
      const dt = document.createElement("dt");
      dt.textContent = dtText;
      const dd = document.createElement("dd");
      if (typeof ddNodes === "string") {
        dd.textContent = ddNodes;
      } else {
        ddNodes.forEach(n => dd.appendChild(n));
      }
      dl.appendChild(dt);
      dl.appendChild(dd);
    };

    const makeCode = text => {
      const c = document.createElement("code");
      c.textContent = text;
      return c;
    };

    addRow("IRI", [makeCode(cls.id)]);
    if (cls.rel)     addRow("Relation",     [makeCode(cls.rel)]);
    if (cls.parent)  addRow("Elternklasse", [makeCode(cls.parent)]);
    if (cls.comment) addRow("Beschreibung", cls.comment);
    if (cls.values) {
      const codes = cls.values.flatMap((v, i) =>
        i < cls.values.length - 1
          ? [makeCode(v), document.createTextNode(" ")]
          : [makeCode(v)]
      );
      addRow("Werte", codes);
    }

    body.appendChild(dl);
    card.appendChild(header);
    card.appendChild(body);

    // Events
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleOntoCard(card, toggleBtn);
    });

    card.addEventListener("click", () => {
      showOntologyDetails(cls.id);
    });

    grid.appendChild(card);
  });
}

function toggleOntoCard(card, btn) {
  const expanded = card.classList.toggle("expanded");
  btn.textContent = expanded ? "−" : "+";
}
```

**Step 5: Event-Listener in der init-Funktion verdrahten**

In der `init()`-Funktion (am Ende, nach dem `tabOntology`-Listener) einfügen:

```javascript
if (elements.ontoTabGraph) {
  elements.ontoTabGraph.addEventListener("click", () => setOntoSubTab("graph"));
}
if (elements.ontoTabCards) {
  elements.ontoTabCards.addEventListener("click", () => setOntoSubTab("cards"));
}
```

**Step 6: `applyOntoFilter()` für Cards erweitern**

Die bestehende `applyOntoFilter()`-Funktion am Ende ergänzen:

```javascript
// Cards filtern (falls Cards-View aktiv)
const visibleGroupsForCards = {
  all:       ["coypu", "inherited", "equiv", "new", "enum"],
  coypu:     ["coypu"],
  inherited: ["inherited", "equiv"],
  new:       ["new", "enum"]
}[filter] || ["coypu", "inherited", "equiv", "new", "enum"];

if (elements.ontoCardsGrid) {
  elements.ontoCardsGrid.querySelectorAll(".onto-card").forEach(card => {
    card.style.display = visibleGroupsForCards.includes(card.dataset.group) ? "" : "none";
  });
}
```

**Step 7: Manuell prüfen**

Browser neu laden, Tab "Ontologie" → Sub-Tab "Klassen":
- Card-Raster erscheint mit allen 36 Klassen
- Klick auf [+] klappt Card auf, zeigt IRI, Beschreibung, Enum-Werte
- Klick auf Card-Body → rechtes Details-Panel wird befüllt
- Filter "PDL-Erweiterungen" → nur orange/violette Cards sichtbar
- Sub-Tab "Graph" → Graph erscheint wieder, fit() wird aufgerufen

---

### Task 4: Abschluss-Verifikation

**Step 1: Alle Kombinationen testen**

```
1. Tab "Ontologie" öffnen → Graph erscheint
2. Sub-Tab "Klassen" → Card-Raster erscheint
3. Filter "Nur CoyPu" → 8 graue Cards
4. Filter "PDL-Erweiterungen" → 20 orange/violette Cards
5. Filter "Alle" → 36 Cards
6. Card aufklappen → Details sichtbar
7. Card anklicken → rechtes Panel zeigt Details
8. Sub-Tab "Graph" → Graph erscheint wieder, Zoom korrekt
9. Filter im Graph-Modus → Knoten werden ausgeblendet
```

**Step 2: Responsive prüfen**

Browser auf < 900px Breite ziehen → Grid wechselt auf 1 Spalte (via `@media`-Breakpoint).

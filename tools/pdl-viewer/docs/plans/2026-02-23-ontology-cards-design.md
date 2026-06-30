# Design: Ontologie-Klassen-Karten (Card-Raster)

**Datum:** 2026-02-23
**Kontext:** PDL-Viewer — Ontologie-Tab
**Status:** Genehmigt

## Ziel

Ergänzung des bestehenden Force-Graphen im Ontologie-Tab um eine Card-Raster-Ansicht als Klassen-Steckbrief. Nutzer können alle PDL- und CoyPu-Klassen auf einen Blick sehen und per Klick Details aufklappen.

## Layout & Struktur

Innerhalb von `#ontologyView` wird eine Sub-Tab-Leiste eingefügt:

```
┌─────────────────────────────────────────────────────────┐
│  [ Graph ]  [ Klassen ]          ← Sub-Tabs             │
├──────────┬──────────────────────────────────┬───────────┤
│  Filter  │  Graph-Canvas  /  Karten-Raster  │  Details  │
│  Sidebar │  (je nach aktivem Sub-Tab)        │  Panel    │
└──────────┴──────────────────────────────────┴───────────┘
```

- Filter-Sidebar und Details-Panel bleiben für beide Sub-Views aktiv
- Im "Klassen"-Modus filtert die Sidebar die Cards (statt Graphknoten)
- Klick auf Card ruft bestehendes `showOntologyDetails(id)` auf

## Card-Design

Zwei Zustände pro Card:

```
Kompakt:                          Aufgeklappt:
╔══════════════════════════╗     ╔══════════════════════════╗
║ ● pdl:Scenario      [+]  ║     ║ ● pdl:Scenario      [−]  ║
║ PDL-Neuerung             ║     ║ PDL-Neuerung             ║
╚══════════════════════════╝     ╠══════════════════════════╣
                                 ║ IRI:   pdl:Scenario      ║
                                 ║ Desc:  Container für...  ║
                                 ╚══════════════════════════╝
```

- **Farbpunkt** = Kategorie-Farbe (grau/blau/teal/orange/violett)
- **Label** fett, **Badge** klein darunter
- **[+]/[−]** zum Auf-/Zuklappen
- Aufgeklappt: IRI, Relation, Elternklasse, Beschreibung, Enum-Werte
- Raster: `repeat(auto-fill, minmax(200px, 1fr))`

## Implementierung

### HTML (`index.html`)
- Sub-Tab-Leiste `#ontoSubTabs` mit `#ontoTabGraph` / `#ontoTabCards`
- `<div id="ontoCardsView">` als Geschwister von `#ontoNetwork` im `.onto-canvas`

### JS (`app.js`)
- `setOntoSubTab(tab)` — wechselt Sub-Tab, lazy-init Cards beim ersten Aufruf
- `initOntoCards()` — baut Card-Raster aus `ONTOLOGY_DATA`
- `toggleOntoCard(id)` — klappt Card auf/zu via CSS-Klasse `expanded`
- `applyOntoFilter()` erweitern — filtert Cards zusätzlich zum Graph
- Klick auf Card → ruft `showOntologyDetails(id)` auf (kein doppelter Code)

### CSS (`styles.css`)
- `.onto-cards-grid` — `auto-fill / minmax(200px, 1fr)`
- `.onto-card` + `.onto-card.expanded` — CSS-Transition für Aufklappanimation
- `.onto-card-dot`, `.onto-card-badge`, `.onto-card-body`

## Nicht im Scope

- Keine Suchfunktion in den Cards (bereits im YAML-Viewer vorhanden)
- Keine Bearbeitungsfunktion
- Kein Export der Card-Ansicht

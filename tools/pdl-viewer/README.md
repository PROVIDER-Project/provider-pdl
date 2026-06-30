# PDL-Viewer

Interaktiver Browser-Viewer für **PDL-YAML-Szenarien** (Provider Domain Language) — die DSL des Forschungsprojekts PROVIDER. Versorgungsengpässe in Lieferketten werden als Netzwerkgraphen visualisiert und analysiert.

---

## Was ist PDL?

PDL (Provider Domain Language) ist eine YAML-basierte Beschreibungssprache für Versorgungskrisen-Szenarien. Sie modelliert Lieferketten als Netzwerk aus Akteuren, Gütern, Infrastrukturen und Ereignissen — maschinenlesbar für Simulation und Wissengraphen, verständlich für Fachexpertinnen ohne Programmierkenntnisse.

---

## Features

### Graph-Ansicht
- Interaktiver Netzwerkgraph (via [vis.js](https://visjs.github.io/vis-network/))
- Filterung nach Entitätstypen, Sektoren und Ereignistypen
- Hervorhebung von Kaskaden und Abhängigkeiten
- Kürzeste-Pfad-Analyse zwischen beliebigen Knoten
- Auszeichnung der am stärksten vernetzten Knoten (Gold/Silber/Bronze)
- Integrierte Validierung (Schema + SHACL) mit Statusanzeige im UI
- Export als JSON (flat, graph, simulation) oder YAML

### YAML-Viewer
- Strukturierter Viewer mit Navigationspfad und Typen-Badges
- Seitenweise Übersicht aller Entitäten, Events und Kaskaden

### Ontologie-Tab
- Visualisierung der PDL-OWL-Ontologie als Graph
- Filterung: CoyPu-Basisklassen, PDL-Vererbungen, PDL-Erweiterungen
- Klassen-Karten-Ansicht mit Properties und Beschreibungen
- Integration mit dem [CoyPu Knowledge Graph](https://schema.coypu.org/global/2.3)

---

## Enthaltene Szenarien

| Nr | Titel | Sektor |
|----|-------|--------|
| S1 | Soja-Lieferkette | Landwirtschaft |
| S2 | Halbleiter-Engpass | Industrie |
| S3 | Pharma-Versorgung | Gesundheit |
| S4 | Düngemittel / AdBlue | Landwirtschaft / Mobilität |
| S5 | Wasseraufbereitung | Infrastruktur |
| S6 | Rechenzentren | Digitale Infrastruktur |
| S7 | Seltene Erden | Rohstoffe |
| S8 | Seefracht | Logistik |
| S9 | Unterwasserkabel | Telekommunikation |

---

## Schnellstart

Kein Build-Prozess erforderlich. Für die Web-App genügt ein lokaler statischer Server.

```bash
# Repository klonen
git clone https://github.com/implisense/pdl-ontology-web-viewer.git
cd pdl-ontology-web-viewer

# Lokalen Server starten (vom Repo-Root, nicht aus web/)
python3 -m http.server 8000
```

Dann im Browser öffnen: **http://localhost:8000/web/**

Szenarien laden:
- Eigene Datei über „YAML hochladen"
- Vordefinierte Szenarien (S1-S9) über das Pull-down „Szenario aus `scenarios/`" und „Ausgewähltes Szenario laden"

Hinweis zum Splash-Screen:
- Der Splash dient nur als Einstieg (Button „Starten")
- Es werden dort keine Beispiel-Szenarien mehr angeboten oder automatisch geladen

---

## Node.js-Tools

Für Datenverarbeitung in der Kommandozeile (Node.js ≥ 18 erforderlich):

```bash
# PDL-Szenario validieren
node tools/pdl-validator.js scenarios/s1-soja.pdl.yaml

# Gegen SHACL-Shapes validieren (YAML -> RDF -> SHACL)
node tools/pdl-shacl-validator.js scenarios/s1-soja.pdl.yaml

# Bereits exportierte Turtle-Datei gegen Shapes validieren
node tools/pdl-shacl-validator.js output.ttl --shapes shapes/pdl.shacl.ttl

# Nach RDF/Turtle konvertieren (für Knowledge Graph)
node tools/pdl-to-rdf.js scenarios/s1-soja.pdl.yaml > output.ttl

# Nach JSON konvertieren (Formate: flat | graph | simulation)
node tools/pdl-to-json.js scenarios/s1-soja.pdl.yaml -f simulation --pretty

# Tests ausführen
npm test
```

---

## Architektur

```
PDL YAML (scenarios/)
    │
    ├─→ Browser-Frontend (web/)
    │   ├─ index.html        — Einstiegspunkt
    │   ├─ app.js            — UI-Logik, vis.js-Graph, Filter, Details
    │   ├─ graph-utils.js    — Graphkonvertierung, Pfadsuche
    │   └─ styles.css        — Styling
    │
    └─→ Node.js-Tools (tools/)
        ├─ pdl-validator.js  — Schema- und Semantikvalidierung
        ├─ pdl-shacl-validator.js — Ontologie-/Regelvalidierung via SHACL
        ├─ pdl-to-rdf.js     — RDF/Turtle-Export (pdl: + coy: Namespaces)
        └─ pdl-to-json.js    — JSON-Export (flat, graph, simulation)

SHACL-Shapes: shapes/pdl.shacl.ttl

Ontologie: ontology/pdl-ontology.ttl (~700 Zeilen OWL)
```

Der Browser-Frontend und die Node.js-Tools teilen keine Laufzeit — keine Build-Pipeline, kein Backend erforderlich.

---

## Technologie

| Komponente | Technologie |
|------------|-------------|
| Graph-Visualisierung | [vis-network 9.1.2](https://visjs.github.io/vis-network/) |
| YAML-Parsing (Browser) | Vendored `yaml`-Paket |
| Schema-Validierung | AJV (JSON Schema draft-07) |
| Ontologie-Regeln | SHACL (`rdf-validate-shacl`) |
| Ontologie | OWL/Turtle, CoyPu-kompatibel |
| Node.js-Tests | Native `node:test` |

---

## Projektkontext

Der PDL-Viewer ist Teil des BMFTR-geförderten Verbundprojekts **PROVIDER** — *Proaktive Versorgungssicherheit durch dynamische Simulation mit selbstlernenden LLM-Agenten*. Koordiniert von [OFFIS e.V.](https://www.offis.de), Subauftragnehmer [Implisense](https://www.implisense.com).

---

## Lizenz

Siehe [LICENSE](LICENSE).

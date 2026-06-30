# provider-pdl

**PDL — PROVIDER Definition Language.** Eine YAML-basierte domänenspezifische
Sprache zur Beschreibung von Lieferketten-Störungsszenarien, entwickelt im
BMFTR-Verbundprojekt **PROVIDER** (Proaktive Versorgungssicherheit durch
dynamische Simulation mit selbstlernenden LLM-Agenten).

Dieses Repository bündelt die PDL an *einer* Stelle, damit Konsortialpartner sie
nachvollziehen, validieren und in eigenen Arbeiten einsetzen können — losgelöst
vom Simulations- und Knowledge-Graph-Code des Hauptprojekts.

## Wozu PDL?

Im PROVIDER-Stack ist die PDL die **Schnittstelle zwischen Knowledge Graph und
Simulation**: Aus einem PDL-Dokument wird eine agentenbasierte Simulation
*generiert*, statt sie von Hand zu bauen. Ein PDL-Szenario beschreibt Akteure
(`entities`), ihre Verkettung (`supply_chains`), Störereignisse (`events`), deren
zeitliche Fortpflanzung (`cascades`) und Ausweichmechanismen (`substitutions`).

```yaml
pdl_version: "1.0"
scenario:
  id: soy_feed_disruption
  name: "Soja-Futtermittel-Lieferkette"
  sector: agriculture
  criticality: high
entities:
  - { id: brazil_farms, type: region, name: "Sojaanbau Brasilien", sector: agriculture }
events:
  - id: brazil_drought
    name: "Dürre Brasilien"
    type: natural_disaster
    trigger: { target: brazil_farms, probability: 0.15 }
    impact:  { supply: "-40%", duration: 90d }
```

## Repo-Wegweiser

| Verzeichnis | Inhalt |
|---|---|
| **`spec/`** | Normative Spezifikation: [`PDL-SPECIFICATION.md`](spec/PDL-SPECIFICATION.md), JSON-Schema, OWL-Ontologie, SHACL-Shapes |
| **`parser/`** | Python-Referenz-Implementierung (`provider_pdl`), nur `PyYAML`, + Tests |
| **`examples/`** | [`minimal.pdl.yaml`](examples/minimal.pdl.yaml), [`annotated.pdl.yaml`](examples/annotated.pdl.yaml) (jede Sektion kommentiert) und kuratierte Referenz-Szenarien |
| **`tools/`** | Lauffähiges Tooling: `pdl-viewer` (Validierung/Visualisierung/RDF-Export), `pdl2palaestrai` (PDL → palaestrAI-Experiment) |
| **`docs/`** | [`data-sources.md`](docs/data-sources.md) (KG-Anreicherung), [`design-rationale.md`](docs/design-rationale.md) |

## Schnellstart

### PDL parsen (Python)

```bash
cd parser
pip install -e ".[dev]"
pytest -q                       # 33 Tests
python -c "from provider_pdl import load_pdl; \
  d = load_pdl('../examples/annotated.pdl.yaml'); \
  print(d.scenario.name, len(d.entities), 'entities')"
```

```python
from provider_pdl import load_pdl

doc = load_pdl("examples/scenarios/s1-soja.pdl.yaml")
print(doc.scenario.id)                       # soy_feed_disruption
ev = doc.event_by_id("brazil_drought")
print(ev.impact.supply.decimal)              # -0.4
```

### Validieren & visualisieren (Viewer)

```bash
cd tools/pdl-viewer
npm install
npm run validate -- ../../examples/scenarios/s1-soja.pdl.yaml   # JSON-Schema
npm run to-rdf   -- ../../examples/scenarios/s1-soja.pdl.yaml   # → Turtle (KG)
# Browser-Visualisierung:
python3 -m http.server 8000   # dann http://localhost:8000/web/
```

### Nach palaestrAI konvertieren

```bash
cd tools/pdl2palaestrai
pip install -e .
pdl2palaestrai convert ../../examples/scenarios/s1-soja.pdl.yaml
```

> Die mitgelieferten Tools sind eigenständige Projekte mit eigener `README.md`
> und eigenen Abhängigkeiten. Sie bringen aus historischen Gründen eigene Kopien
> von Schema/Ontologie mit; **normativ ist `spec/`**.

## Referenz-Szenarien

Kuratierte Auswahl in `examples/scenarios/` (die vollständige Sammlung von
~11 Szenarien liegt im PROVIDER-Hauptrepo unter `06_Szenarien/`):

| Datei | Szenario | PDL-Version |
|---|---|---|
| `s1-soja.pdl.yaml` | Soja-Futtermittel (Leitszenario / Ground-Truth 2022) | 1.0 |
| `s2-halbleiter.pdl.yaml` | Halbleiter-Lieferkettenkrise | 1.0 |

## PDL-Versionen

- **v1.0** — Basismodell (s1–s9).
- **v1.1** — ergänzt `scenario.title` und reichere Entity-/Substitutions-Felder.
  Siehe [CHANGELOG.md](CHANGELOG.md). (In diesem Repo ist kein v1.1-Referenz-
  Szenario gebündelt; die Sprachversion ist in der Spezifikation dokumentiert.)

## Stand & Grenzen

Die Referenz-Implementierung deckt `scenario`, `entities`, `supply_chains`,
`events` und `cascades` vollständig ab. `substitutions` ist im Schema und in den
Szenarien enthalten, wird vom Python-Parser aber noch nicht modelliert — die
bekannten Abweichungen sind in [`spec/PDL-SPECIFICATION.md` §8](spec/PDL-SPECIFICATION.md#8-bekannte-abweichungen)
transparent dokumentiert.

## Lizenz

MIT — siehe [LICENSE](LICENSE).

# PDL — PROVIDER Definition Language (Spezifikation)

Stand: PDL **v1.0** und **v1.1**. Diese Datei ist die prosaische, normative
Beschreibung der Sprache. Maschinenlesbare Gegenstücke im selben Verzeichnis:

| Artefakt | Zweck |
|---|---|
| `pdl-schema.json` | JSON-Schema (Draft-07) — strukturelle Validierung |
| `pdl-ontology.ttl` | OWL-Ontologie — Abbildung auf RDF/Knowledge-Graph (CoyPu-kompatibel) |
| `pdl.shacl.ttl` | SHACL-Shapes — semantische Constraints auf der RDF-Repräsentation |

> **Source of Truth:** Bei Konflikten gilt `pdl-schema.json` als normativ für die
> *Struktur*. Die Python-Referenz-Implementierung (`../parser/`) ist normativ für
> das *Laufzeitverhalten* (Parsing, Validierung, Auswertung). Wo beide
> auseinanderlaufen, ist das in [Abschnitt 8](#8-bekannte-abweichungen) vermerkt.

---

## 1. Was ist die PDL?

Die PDL ist eine **YAML-basierte domänenspezifische Sprache** zur Beschreibung von
Lieferketten-Störungsszenarien. Ein PDL-Dokument modelliert:

- **wer** beteiligt ist (`entities`),
- **wie** die Akteure verbunden sind (`supply_chains`),
- **was** passieren kann (`events`),
- **wie** sich Störungen zeitlich fortpflanzen (`cascades`),
- **womit** Ausfälle abgefedert werden (`substitutions`).

Sie ist die Schnittstelle zwischen Knowledge Graph (woher die Daten stammen) und
Simulation (was damit gerechnet wird): aus einem PDL-Dokument wird im
PROVIDER-Stack eine agentenbasierte Simulation *generiert* statt von Hand gebaut.

## 2. Top-Level-Struktur

```yaml
pdl_version: "1.0"      # PFLICHT — "1.0" | "1.1"
scenario: { ... }        # PFLICHT — Metadaten
entities: [ ... ]        # optional — Akteure, Orte, Rohstoffe
supply_chains: [ ... ]   # optional — Verkettung + Abhängigkeiten
substitutions: [ ... ]   # optional — Ausweichmechanismen (v1.1-reich)
events: [ ... ]          # optional — Störereignisse
cascades: [ ... ]        # optional — zeitliche Abläufe
_kg_enrichment: [ ... ]  # optional — Herkunfts-/Anreicherungs-Metadaten
```

Nur `pdl_version` und `scenario` sind zwingend. Keys mit `_`-Präfix sind
Anreicherungs-Metadaten (siehe [docs/data-sources.md](../docs/data-sources.md)).

## 3. Datentypen (Value Objects)

| Typ | Format | Beispiele | Bedeutung |
|---|---|---|---|
| **Duration** | `<zahl><einheit>` | `24h`, `90d`, `2w`, `6m`, `1y` | h=1/24 d, d=1, w=7, m=30, y=365 (in Tagen) |
| **Percentage** | `[+/-]<zahl>%` (String!) | `"-40%"`, `"+45%"`, `"45%"` | wird als Dezimal geparst (`-0.4`, `0.45`) |
| **Ratio** | float `0..1` | `0.6` | z.B. `vulnerability`, `coverage`, `probability` |

> Prozentwerte **müssen** als YAML-String notiert werden (`supply: "-40%"`),
> sonst interpretiert YAML das `%` falsch bzw. verliert das Vorzeichen.

## 4. Enumerationen

| Enum | Erlaubte Werte |
|---|---|
| `scenario.criticality`, `dependency.criticality` | `high`, `medium`, `low` |
| `*.severity` (in Impacts/Timeline) | `critical`, `high`, `medium`, `low` |
| `entity.type` | `manufacturer`, `commodity`, `infrastructure`, `service`, `region` |
| `event.type` | `natural_disaster`, `market_shock`, `infrastructure_failure`, `regulatory`, `geopolitical`, `pandemic`, `cyber_attack` |
| `substitution.type` | `product`, `supplier`, `route`, `technology`, `buffer`, `mode` |

## 5. Sektionen im Detail

### 5.1 `scenario` (Pflicht)

```yaml
scenario:
  id: soy_feed_disruption     # PFLICHT, Muster ^[a-z][a-z0-9_]*$
  name: "Soja-Futtermittel"   # PFLICHT
  sector: agriculture         # PFLICHT
  criticality: high           # PFLICHT — high|medium|low
  description: "..."          # optional
  title: "..."                # optional, nur v1.1
```

### 5.2 `entities`

```yaml
- id: brazil_farms            # PFLICHT, eindeutig
  type: region                # PFLICHT — siehe Enum
  name: "Sojaanbau Brasilien" # PFLICHT
  sector: agriculture         # PFLICHT
  location: "Brazil"          # optional
  vulnerability: 0.6          # optional, 0..1
  extra: { ... }              # optional — frei, untypisiert (s.u.)
  _kg_source: { ... }         # optional — Herkunft (s. data-sources.md)
```

`extra` sammelt **alle nicht im Schema bekannten Felder** einer Entity ein
(z.B. `market_share`, `tier`, `substitution_potential`, BACI-Kennzahlen). Diese
sind absichtlich untypisiert — so können Domänenpartner Zusatzdaten anhängen,
ohne die Sprache zu ändern.

### 5.3 `supply_chains`

```yaml
- id: soy_to_eu_main
  name: "Soja-Hauptlieferkette"
  stages:                     # Liste von [from_id, to_id]-Paaren (Hops)
    - [brazil_farms, santos_port]
    - [santos_port, rotterdam_port]
  dependencies:               # Querabhängigkeiten ausserhalb des Flusses
    - from: eu_oil_mills
      to: gas_supply
      type: energy            # z.B. input | energy | logistics
      criticality: high
```

Alle in `stages`/`dependencies` referenzierten IDs müssen existierende Entities
sein (wird validiert).

### 5.4 `events`

```yaml
- id: brazil_drought
  name: "Dürre Brasilien"
  type: natural_disaster
  trigger:
    target: brazil_farms      # PFLICHT — existierende Entity
    probability: 0.15         # optional — 0..1
    condition: "..."          # optional — Condition-Ausdruck (5.6)
  impact:
    supply: "-40%"            # optional
    demand: "+10%"            # optional
    price: "+45%"             # optional
    duration: 90d             # optional
    sector: agriculture       # optional
    severity: high            # optional
  causes: [soy_export_reduction]   # optional — Folge-Events (Kaskade)
  reference: "Dürre 2021/22 …"     # optional — Beleg
```

**Root-Event vs. bedingtes Event:**
- `probability` gesetzt **und** keine `condition` → **Root-Event**, wird pro Tick
  probabilistisch ausgelöst (`is_root_event == True`).
- `condition` gesetzt → bedingtes Event, wird per AST gegen den Sim-Zustand
  ausgewertet.

### 5.5 `cascades`

```yaml
- id: soy_crisis_cascade
  name: "Soja-Krise-Kaskade"
  origin: brazil_drought      # auslösendes Event
  probability: 0.9            # optional
  timeline:
    - at: 14d                 # Zeitpunkt relativ zum Origin (Duration)
      event: soy_export_reduction
      impact: { sector: logistics, severity: high }
      affects: [santos_port, rotterdam_port]   # betroffene Entities
  validation:                 # optional — Belegbarkeit
    reference: "Soja-Krise 2022"
    source: "BMEL Marktberichte, FAO GIEWS"
    confidence: 0.85
```

> Hinweis: Manche Szenarien verwenden den Schlüssel `trigger_event` statt
> `origin`. Die Referenz-Implementierung liest `origin`. Beim Übernehmen von
> Szenarien auf Konsistenz achten.

### 5.6 Condition-Grammatik (Trigger-Bedingungen)

```
expr     := or_expr
or_expr  := and_expr (" OR " and_expr)*
and_expr := atom (" AND " atom)*
atom     := EVENT_ID ".active"
          | EVENT_ID ".duration > " DURATION
```

Beispiele:
- `brazil_drought.active`
- `oil_mill_slowdown.active OR soy_export_reduction.active`
- `livestock_pressure.active AND consumer_substitution.active`
- `soy_export_reduction.active AND soy_export_reduction.duration > 30d`

Es gibt **keine Klammerung**; `AND` bindet stärker als `OR`. Geparst wird per
String-Split (`" OR "`, dann `" AND "`) und Regex pro Atom.

### 5.7 `substitutions` (Schema/v1.1)

```yaml
- id: sub_protein_replacement
  from: eu_oil_mills
  to: alternative_protein_sources
  type: product               # product|supplier|route|technology|buffer|mode
  coverage: 0.2               # 0..1 — abgedeckter Nachfrageanteil
  quality_delta: -0.12        # -1..+1
  cost_delta: 0.3
  ramp_up: 21d
  activation:
    trigger: feed_price_spike.active
    threshold: { price_increase: 0.25 }
  reversible: true
  side_effects:
    - { type: price_pressure, target: alternative_protein_sources, magnitude: 0.2 }
```

> ⚠️ Siehe [Abschnitt 8](#8-bekannte-abweichungen): `substitutions` ist im
> JSON-Schema und in mehreren Szenarien enthalten, wird von der aktuellen
> Python-Referenz-Implementierung aber (noch) **nicht** als Top-Level-Objekt
> modelliert.

## 6. Validierungsregeln (Referenz-Parser)

`load_pdl()` erzwingt:
1. `pdl_version` und `scenario` vorhanden.
2. Alle referenzierten Entity-/Event-IDs existieren — in `supply_chains.stages`,
   `dependencies`, `event.trigger.target`, `event.causes`, `cascade.origin` und
   `cascade.timeline[*].event`. Bei Verstoß: `PdlValidationError("... unknown
   entity/event ...")`.
3. Enum-Werte und Duration/Percentage-Formate werden beim Parsen geprüft
   (`PdlParseError` bei Verstoß).

## 7. Versionsunterschiede 1.0 → 1.1

Siehe [CHANGELOG.md](../CHANGELOG.md). Kurz: v1.1 ergänzt `scenario.title` und
reichere Entity-/Substitutions-Felder (Substitutions-Angaben auf Entity-Ebene)
für komplexere Lieferketten-Szenarien.

## 8. Bekannte Abweichungen (Schema ↔ Referenz-Parser)

Diese Diskrepanzen sind real und bewusst dokumentiert, damit Partner nicht
darüber stolpern:

| Thema | JSON-Schema / Szenarien | Python-Referenz-Parser |
|---|---|---|
| `substitutions` | vollständig spezifiziert | wird **ignoriert** (nicht im Datenmodell) |
| `_kg_enrichment`, `_kg_source`, `extra` auf Top-Level | erlaubt | unbekannte Top-Level-Keys werden still ignoriert; `extra` *innerhalb* von Entities wird gesammelt |
| `cascade.trigger_event` vs. `origin` | beide kommen in Szenarien vor | nur `origin` wird gelesen |
| `criticality: critical` | teils in Szenarien | Parser-Enum kennt nur `high/medium/low` (`critical` nur als `severity`) |

Wer ein Szenario sowohl gegen das Schema als auch gegen den Parser sauber halten
will, validiert mit **beiden** (`tools/pdl-viewer` für Schema/SHACL, `parser/`
für das Laufzeitverhalten).

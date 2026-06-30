# Datenquellen & KG-Anreicherung

PDL-Dokumente können mit Herkunfts- und Anreicherungs-Metadaten versehen werden.
Diese Felder sind **optional** und für die Simulation nicht zwingend — sie machen
ein Szenario aber *auditierbar*: man kann nachvollziehen, woher eine Zahl stammt
und auf welchen Knowledge-Graph-Knoten sie verweist.

## Konventionen

| Schlüssel | Ebene | Zweck |
|---|---|---|
| `extra` | Entity | Frei nutzbare, untypisierte Domänenfelder (z.B. `market_share`, `tier`). Wird vom Parser gesammelt. |
| `_kg_source` | Entity / Substitution | Verweis auf KG-/Datenquellen-Herkunft (URIs, Kennungen). |
| `_kg_enrichment` | Top-Level | Liste von Anreicherungsschritten (Provenienz). |

> Felder mit `_`-Präfix sind reine Metadaten. Die Python-Referenz-Implementierung
> sammelt `extra` *innerhalb* von Entities; unbekannte Top-Level-`_kg_*`-Keys
> werden still ignoriert (siehe `spec/PDL-SPECIFICATION.md` §8).

## Verbreitete Quell-Präfixe in `_kg_source` / `extra`

Diese Präfixe tauchen in den realen Szenarien auf und sind die De-facto-Konvention:

| Präfix | Quelle | Beispiel-Felder |
|---|---|---|
| `wpi_*` | **World Port Index** (Häfen) | `wpi_locode`, `wpi_port_size`, `wpi_repair_class`, `wpi_capacity_factor`, `wpi_kg_uri` |
| `baci_*` | **BACI** (CEPII-Handelsstatistik) | `baci_export_value_kusd`, `baci_export_volume_t_year`, `baci_year`, `baci_country`, `baci_hs4_codes` |
| `exiobase_*` | **EXIOBASE** (Input-Output-Tabellen) | `exiobase_uri`, `exiobase_type` |
| `icio_*` | **OECD ICIO** (Leontief/Ghosh) | `icio_model`, `leontief_effect_musd`, `ghosh_effect_musd` |

KG-URIs verweisen i.d.R. auf den CoyPu-Graphen, z.B.:

```
https://data.coypu.org/infrastructure/port/BRSFE
https://data.coypu.org/industry/exiobase/...
```

## Beispiel

```yaml
- id: santos_port
  type: infrastructure
  name: "Hafen Santos"
  sector: logistics
  vulnerability: 0.4
  extra:
    baci_export_value_kusd: 48212779998.0
    baci_hs4_codes: ['1201', '2304']
  _kg_source:
    wpi_locode: BRSFE
    wpi_port_size: L
    wpi_kg_uri: https://data.coypu.org/infrastructure/port/BRSFE
```

## Datenreifegrad

Die Werte in den mitgelieferten Szenarien sind überwiegend **illustrativ**
(Größenordnungen zur Methodendemonstration), nicht validiert. Das PROVIDER-Projekt
unterscheidet vier Reifegrade: *Skizze → Konsolidiert → Verifiziert → Validiert*.
Wer ein Szenario produktiv nutzt, sollte den Reifegrad der konkret verwendeten
Zahlen prüfen.

# Changelog — PDL (PROVIDER Definition Language)

Die PDL versioniert sich über das Pflichtfeld `pdl_version` im Dokument selbst.

## v1.1

Erweiterung um reichere Entity-Felder für komplexere Lieferketten-Szenarien.

**Neu gegenüber v1.0:**
- `scenario.title` zusätzlich zu `scenario.name`.
- Reichere Entity-Felder: `substitution_potential`, `substitution_type`,
  `substitution_direction` direkt auf Entity-Ebene (statt nur im separaten
  `substitutions`-Block).
- Entity-Level `stages` / `dependencies` für kompaktere Modellierung.

**Kompatibilität:** v1.1-Dokumente bleiben strukturell abwärtskompatibel; die
Erweiterungen sind additiv. Der Referenz-Parser lädt v1.0 und v1.1.

## v1.0

Basismodell der PDL (Referenz: s1–s9).

**Sektionen:** `scenario`, `entities`, `supply_chains`, `substitutions`,
`events`, `cascades`, optionale `_kg_*`-Anreicherung.

**Kernkonzepte:**
- Value Objects `Duration` (h/d/w/m/y) und `Percentage` (signierter String).
- Root-Events (probabilistisch) vs. bedingte Events (Condition-AST mit AND/OR).
- Kaskaden mit `timeline` relativ zum `origin`-Event.
- Referenz-Validierung über alle Entity-/Event-IDs.

---

> Hinweis: Dieses Changelog dokumentiert die **Sprache**. Die Versionierung der
> Python-Referenz-Implementierung (`parser/pyproject.toml`) folgt der jeweils
> höchsten unterstützten PDL-Version.

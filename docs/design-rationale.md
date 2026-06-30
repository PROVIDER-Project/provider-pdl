# Design-Rationale der PDL

Warum eine eigene Sprache — und warum *so*?

## Ausgangsproblem

PROVIDER will Lieferketten-Engpässe *proaktiv* erkennen, indem es aus
Realdaten (Knowledge Graph) eine agentenbasierte Simulation **generiert** statt
sie manuell zu modellieren (Design-Objektiv **O1: Dynamische Instanziierung**).
Dafür braucht es ein Zwischenformat, das

1. **menschenlesbar** ist (Domänenexperten ohne Programmierkenntnis sollen
   Szenarien lesen und korrigieren können),
2. **maschinell validierbar** ist (Schema, SHACL),
3. **verlustarm auf RDF abbildbar** ist (Rückkopplung in den KG),
4. **simulationsnah** ist (direkt in eine palaestrAI-/mosaik-Welt überführbar).

YAML + ein schlankes Datenmodell trifft diese vier Anforderungen besser als
roher RDF (zu sperrig für Menschen) oder freies JSON (keine Domänensemantik).

## Leitentscheidungen

| Entscheidung | Begründung |
|---|---|
| **YAML statt RDF als Autorenformat** | Menschen schreiben/lesen Szenarien direkt; RDF wird *daraus* generiert, nicht umgekehrt. |
| **Dataclasses statt Pydantic** | Minimale Abhängigkeiten (nur `PyYAML`), leicht portierbar, Python ≥3.9. |
| **`extra`-Feld auf Entities** | Domänenpartner können Zusatzdaten anhängen, ohne die Sprache zu ändern (offene Erweiterbarkeit). |
| **Strings für Prozente (`"-40%"`)** | Erhält die *rohe* Domänennotation für Audit + parst zugleich einen Dezimalwert für die Mathematik (Dual-Encoding). |
| **Condition-Sprache ohne Klammern** | Die realen Trigger sind einfach (`A.active AND B.duration > 30d`); ein voller Parser wäre Overengineering (YAGNI). |
| **Root-Events vs. bedingte Events** | Trennt exogene Schocks (probabilistisch) von endogenen Folgen (zustandsabhängig) — die zentrale Kausalmechanik der Simulation. |
| **Kaskaden mit relativer `timeline`** | Macht zeitliche Fortpflanzung explizit und belegbar (`validation`-Block), statt sie in der Engine zu verstecken. |

## Bezug zum PROVIDER-Gesamtsystem

Die PDL ist bewusst der **schmale Vertrag** zwischen mehreren Subsystemen:

```
News → [LLM-Parametrisierung] ─┐
                               ▼
Knowledge Graph (CoyPu) ──► PDL ──► Simulation (palaestrAI/mosaik)
                               │
                               └──► RDF-Rückkopplung (auditierbar)
```

- **News2Scenario / LLM** erzeugen PDL aus Nachrichten.
- **kg-bridge** materialisiert PDL aus dem KG und schreibt Erkenntnisse zurück.
- **pdl2palaestrai** überführt PDL in ein ausführbares Experiment.

Weil alle diese Werkzeuge an *einem* Format hängen, ist die PDL der natürliche
Ort für ein eigenständiges, zitierbares Repo — und der Grund, warum dieses Repo
die bisher dreifach duplizierte Schema-Definition zusammenführt.

## Drei sozio-technische Eigenschaften (aus dem Konzeptpapier)

Die PDL trägt zu allen drei bei:
- **anticipatory** — News-getriebene Parameter werden als Events/Impacts in die
  Zukunft projiziert.
- **explanatory** — das lesbare YAML ist die Grundlage der natürlichsprachigen
  Auswertung.
- **auditable by design** — `_kg_source`, `reference` und `validation` legen
  Herkunft und Belegbarkeit jeder Annahme offen.

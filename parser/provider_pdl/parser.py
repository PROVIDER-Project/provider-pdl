"""YAML → typed dataclasses parser for PDL documents."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Union

import yaml

from provider_pdl.errors import PdlParseError, PdlValidationError
from provider_pdl.model import (
    Cascade,
    Criticality,
    Dependency,
    Duration,
    Entity,
    EntityType,
    Event,
    EventType,
    Impact,
    Percentage,
    PdlDocument,
    Scenario,
    Severity,
    SupplyChain,
    TimelineEntry,
    Trigger,
    Validation,
)

# ---------------------------------------------------------------------------
# Duration / Percentage helpers
# ---------------------------------------------------------------------------

_DURATION_RE = re.compile(r"^(\d+)([dhwmy])$")
_DURATION_MULTIPLIERS: Dict[str, float] = {
    "h": 1 / 24,
    "d": 1,
    "w": 7,
    "m": 30,
    "y": 365,
}


def parse_duration(raw: str) -> Duration:
    m = _DURATION_RE.match(raw.strip())
    if not m:
        raise PdlParseError(f"Invalid duration: {raw!r}")
    value, unit = int(m.group(1)), m.group(2)
    return Duration(raw=raw.strip(), days=value * _DURATION_MULTIPLIERS[unit])


_PERCENTAGE_RE = re.compile(r"^([+-]?\d+)%$")


def parse_percentage(raw: str) -> Percentage:
    m = _PERCENTAGE_RE.match(raw.strip())
    if not m:
        raise PdlParseError(f"Invalid percentage: {raw!r}")
    return Percentage(raw=raw.strip(), decimal=int(m.group(1)) / 100)


# ---------------------------------------------------------------------------
# Internal converters
# ---------------------------------------------------------------------------

_KNOWN_ENTITY_FIELDS = {"id", "type", "name", "sector", "location", "vulnerability", "extra"}


def _parse_scenario(d: Dict[str, Any]) -> Scenario:
    return Scenario(
        id=d["id"],
        name=d["name"],
        sector=d["sector"],
        criticality=Criticality(d["criticality"]),
        description=d.get("description", ""),
    )


def _parse_entity(d: Dict[str, Any]) -> Entity:
    # Collect unknown top-level fields as extra, then merge explicit 'extra' block if present
    extra: Dict[str, Any] = {k: v for k, v in d.items() if k not in _KNOWN_ENTITY_FIELDS}
    if isinstance(d.get("extra"), dict):
        extra.update(d["extra"])
    return Entity(
        id=d["id"],
        type=EntityType(d["type"]),
        name=d["name"],
        sector=d["sector"],
        location=d.get("location", ""),
        vulnerability=d.get("vulnerability", 0.5),
        extra=extra,
    )


def _parse_impact(d: Dict[str, Any] | None) -> Impact:
    if d is None:
        return Impact()
    return Impact(
        supply=parse_percentage(d["supply"]) if "supply" in d else None,
        demand=parse_percentage(d["demand"]) if "demand" in d else None,
        price=parse_percentage(d["price"]) if "price" in d else None,
        duration=parse_duration(d["duration"]) if "duration" in d else None,
        sector=d.get("sector"),
        severity=Severity(d["severity"]) if "severity" in d else None,
    )


def _parse_trigger(d: Dict[str, Any]) -> Trigger:
    return Trigger(
        target=d["target"],
        probability=d.get("probability"),
        condition=d.get("condition"),
    )


def _parse_event(d: Dict[str, Any]) -> Event:
    return Event(
        id=d["id"],
        name=d["name"],
        type=EventType(d["type"]),
        trigger=_parse_trigger(d["trigger"]),
        impact=_parse_impact(d.get("impact")),
        causes=d.get("causes", []),
        reference=d.get("reference", ""),
    )


def _parse_dependency(d: Dict[str, Any]) -> Dependency:
    crit = Criticality(d["criticality"]) if "criticality" in d else None
    return Dependency(
        from_entity=d["from"],
        to_entity=d["to"],
        type=d["type"],
        criticality=crit,
    )


def _parse_supply_chain(d: Dict[str, Any]) -> SupplyChain:
    deps = [_parse_dependency(dep) for dep in d.get("dependencies", [])]
    return SupplyChain(
        id=d["id"],
        name=d.get("name", ""),
        stages=d.get("stages", []),
        dependencies=deps,
    )


def _parse_timeline_entry(d: Dict[str, Any]) -> TimelineEntry:
    return TimelineEntry(
        at=parse_duration(d["at"]),
        event=d["event"],
        impact=_parse_impact(d.get("impact")),
        affects=d.get("affects", []),
    )


def _parse_validation(d: Dict[str, Any] | None) -> Validation | None:
    if d is None:
        return None
    return Validation(
        reference=d.get("reference", ""),
        source=d.get("source", ""),
        confidence=d.get("confidence", 0.0),
    )


def _parse_cascade(d: Dict[str, Any]) -> Cascade:
    timeline = [_parse_timeline_entry(te) for te in d.get("timeline", [])]
    return Cascade(
        id=d["id"],
        origin=d["origin"],
        name=d.get("name", ""),
        timeline=timeline,
        probability=d.get("probability", 1.0),
        validation=_parse_validation(d.get("validation")),
    )


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _validate_references(doc: PdlDocument) -> None:
    entity_ids = {e.id for e in doc.entities}
    event_ids = {ev.id for ev in doc.events}
    errors: List[str] = []

    # Supply-chain stages reference existing entities
    for sc in doc.supply_chains:
        for stage in sc.stages:
            for eid in stage:
                if eid not in entity_ids:
                    errors.append(
                        f"supply_chain '{sc.id}' stage references unknown entity '{eid}'"
                    )
        for dep in sc.dependencies:
            if dep.from_entity not in entity_ids:
                errors.append(
                    f"supply_chain '{sc.id}' dependency from unknown entity '{dep.from_entity}'"
                )
            if dep.to_entity not in entity_ids:
                errors.append(
                    f"supply_chain '{sc.id}' dependency to unknown entity '{dep.to_entity}'"
                )

    # Event triggers → entities, causes → events
    for ev in doc.events:
        if ev.trigger.target not in entity_ids:
            errors.append(
                f"event '{ev.id}' trigger target unknown entity '{ev.trigger.target}'"
            )
        for caused_id in ev.causes:
            if caused_id not in event_ids:
                errors.append(
                    f"event '{ev.id}' causes unknown event '{caused_id}'"
                )

    # Cascade references
    for cas in doc.cascades:
        if cas.origin not in event_ids:
            errors.append(
                f"cascade '{cas.id}' origin unknown event '{cas.origin}'"
            )
        for te in cas.timeline:
            if te.event not in event_ids:
                errors.append(
                    f"cascade '{cas.id}' timeline references unknown event '{te.event}'"
                )
            for eid in te.affects:
                if eid not in entity_ids:
                    errors.append(
                        f"cascade '{cas.id}' timeline affects unknown entity '{eid}'"
                    )

    if errors:
        raise PdlValidationError(
            f"{len(errors)} reference error(s):\n" + "\n".join(f"  - {e}" for e in errors)
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_pdl(source: Union[str, Path, Dict[str, Any]]) -> PdlDocument:
    """Load a PDL document from a file path, YAML string, or pre-parsed dict."""
    if isinstance(source, dict):
        raw = source
    elif isinstance(source, Path) or (
        isinstance(source, str) and not source.strip().startswith("pdl_version")
        and (Path(source).suffix in (".yaml", ".yml") or Path(source).exists())
    ):
        path = Path(source)
        if not path.exists():
            raise PdlParseError(f"File not found: {path}")
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    else:
        raw = yaml.safe_load(source)

    if not isinstance(raw, dict):
        raise PdlParseError("PDL document must be a YAML mapping")

    if "pdl_version" not in raw or "scenario" not in raw:
        raise PdlParseError("PDL document must contain 'pdl_version' and 'scenario'")

    doc = PdlDocument(
        pdl_version=str(raw["pdl_version"]),
        scenario=_parse_scenario(raw["scenario"]),
        entities=[_parse_entity(e) for e in raw.get("entities", [])],
        supply_chains=[_parse_supply_chain(sc) for sc in raw.get("supply_chains", [])],
        events=[_parse_event(ev) for ev in raw.get("events", [])],
        cascades=[_parse_cascade(c) for c in raw.get("cascades", [])],
    )

    _validate_references(doc)
    return doc

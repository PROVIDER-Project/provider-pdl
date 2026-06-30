"""Dataclasses for the PDL (PROVIDER Domain Language) data model."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class EntityType(Enum):
    MANUFACTURER = "manufacturer"
    COMMODITY = "commodity"
    INFRASTRUCTURE = "infrastructure"
    SERVICE = "service"
    REGION = "region"


class EventType(Enum):
    NATURAL_DISASTER = "natural_disaster"
    MARKET_SHOCK = "market_shock"
    INFRASTRUCTURE_FAILURE = "infrastructure_failure"
    REGULATORY = "regulatory"
    GEOPOLITICAL = "geopolitical"
    PANDEMIC = "pandemic"
    CYBER_ATTACK = "cyber_attack"


class Criticality(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Severity(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# ---------------------------------------------------------------------------
# Value objects (frozen)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Duration:
    raw: str
    days: float


@dataclass(frozen=True)
class Percentage:
    raw: str
    decimal: float


# ---------------------------------------------------------------------------
# Core model
# ---------------------------------------------------------------------------

@dataclass
class Scenario:
    id: str
    name: str
    sector: str
    criticality: Criticality
    description: str = ""


@dataclass
class Entity:
    id: str
    type: EntityType
    name: str
    sector: str
    location: str = ""
    vulnerability: float = 0.5
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Trigger:
    target: str
    probability: Optional[float] = None
    condition: Optional[str] = None


@dataclass
class Impact:
    supply: Optional[Percentage] = None
    demand: Optional[Percentage] = None
    price: Optional[Percentage] = None
    duration: Optional[Duration] = None
    sector: Optional[str] = None
    severity: Optional[Severity] = None


@dataclass
class Event:
    id: str
    name: str
    type: EventType
    trigger: Trigger
    impact: Impact = field(default_factory=Impact)
    causes: List[str] = field(default_factory=list)
    reference: str = ""

    @property
    def is_root_event(self) -> bool:
        return self.trigger.probability is not None and self.trigger.condition is None


@dataclass
class Dependency:
    from_entity: str
    to_entity: str
    type: str
    criticality: Optional[Criticality] = None


@dataclass
class SupplyChain:
    id: str
    name: str = ""
    stages: List[List[str]] = field(default_factory=list)
    dependencies: List[Dependency] = field(default_factory=list)


@dataclass
class TimelineEntry:
    at: Duration
    event: str
    impact: Optional[Impact] = None
    affects: List[str] = field(default_factory=list)


@dataclass
class Validation:
    reference: str = ""
    source: str = ""
    confidence: float = 0.0


@dataclass
class Cascade:
    id: str
    origin: str
    name: str = ""
    timeline: List[TimelineEntry] = field(default_factory=list)
    probability: float = 1.0
    validation: Optional[Validation] = None


# ---------------------------------------------------------------------------
# Root document
# ---------------------------------------------------------------------------

@dataclass
class PdlDocument:
    pdl_version: str
    scenario: Scenario
    entities: List[Entity] = field(default_factory=list)
    supply_chains: List[SupplyChain] = field(default_factory=list)
    events: List[Event] = field(default_factory=list)
    cascades: List[Cascade] = field(default_factory=list)

    # ---- index lookups ----

    def entity_by_id(self, entity_id: str) -> Optional[Entity]:
        for e in self.entities:
            if e.id == entity_id:
                return e
        return None

    def event_by_id(self, event_id: str) -> Optional[Event]:
        for ev in self.events:
            if ev.id == event_id:
                return ev
        return None

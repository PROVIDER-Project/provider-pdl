"""Tests for the PDL parser: duration/percentage parsing, loading, validation."""

from __future__ import annotations

import pytest

from provider_pdl.errors import PdlParseError, PdlValidationError
from provider_pdl.model import Criticality, Duration, EntityType, EventType, Percentage
from provider_pdl.parser import load_pdl, parse_duration, parse_percentage


# ---------------------------------------------------------------------------
# Duration parsing
# ---------------------------------------------------------------------------


class TestParseDuration:
    def test_days(self):
        d = parse_duration("90d")
        assert d == Duration(raw="90d", days=90.0)

    def test_hours(self):
        d = parse_duration("24h")
        assert d.days == pytest.approx(1.0)

    def test_weeks(self):
        d = parse_duration("2w")
        assert d.days == 14.0

    def test_months(self):
        d = parse_duration("6m")
        assert d.days == 180.0

    def test_years(self):
        d = parse_duration("1y")
        assert d.days == 365.0

    def test_invalid(self):
        with pytest.raises(PdlParseError):
            parse_duration("abc")

    def test_missing_unit(self):
        with pytest.raises(PdlParseError):
            parse_duration("90")


# ---------------------------------------------------------------------------
# Percentage parsing
# ---------------------------------------------------------------------------


class TestParsePercentage:
    def test_negative(self):
        p = parse_percentage("-40%")
        assert p == Percentage(raw="-40%", decimal=-0.4)

    def test_positive(self):
        p = parse_percentage("+60%")
        assert p.decimal == pytest.approx(0.6)

    def test_unsigned(self):
        p = parse_percentage("45%")
        assert p.decimal == pytest.approx(0.45)

    def test_invalid(self):
        with pytest.raises(PdlParseError):
            parse_percentage("not_a_pct")


# ---------------------------------------------------------------------------
# Loading the soja scenario
# ---------------------------------------------------------------------------


class TestLoadSoja:
    def test_entity_count(self, soja_doc):
        assert len(soja_doc.entities) == 20

    def test_event_count(self, soja_doc):
        assert len(soja_doc.events) == 55

    def test_scenario_metadata(self, soja_doc):
        assert soja_doc.scenario.id == "soy_feed_disruption"
        assert soja_doc.scenario.criticality == Criticality.HIGH

    def test_entity_types(self, soja_doc):
        types = {e.type for e in soja_doc.entities}
        assert EntityType.REGION in types
        assert EntityType.INFRASTRUCTURE in types

    def test_extra_fields(self, soja_doc):
        alt = soja_doc.entity_by_id("alternative_protein_sources")
        assert alt is not None
        assert "substitution_potential" in alt.extra
        assert alt.extra["substitution_potential"] == 0.2

    def test_root_events(self, soja_doc):
        root = [ev for ev in soja_doc.events if ev.is_root_event]
        assert len(root) >= 2

    def test_event_by_id(self, soja_doc):
        ev = soja_doc.event_by_id("brazil_drought")
        assert ev is not None
        assert ev.type == EventType.NATURAL_DISASTER
        assert ev.impact.supply is not None
        assert ev.impact.supply.decimal == pytest.approx(-0.4)


# ---------------------------------------------------------------------------
# All 9 scenarios loadable
# ---------------------------------------------------------------------------


def test_load_any_scenario(any_scenario_path):
    doc = load_pdl(any_scenario_path)
    assert len(doc.entities) > 0
    assert len(doc.events) > 0
    assert doc.scenario.id


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------


def test_validation_unknown_entity():
    raw = {
        "pdl_version": "1.0",
        "scenario": {"id": "test", "name": "T", "sector": "x", "criticality": "low"},
        "entities": [
            {"id": "a", "type": "region", "name": "A", "sector": "x"},
        ],
        "events": [
            {
                "id": "ev1",
                "name": "E",
                "type": "market_shock",
                "trigger": {"target": "nonexistent", "probability": 0.1},
                "impact": {"duration": "30d"},
            }
        ],
    }
    with pytest.raises(PdlValidationError, match="unknown entity"):
        load_pdl(raw)

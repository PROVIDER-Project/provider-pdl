"""Tests for the condition-expression parser."""

from __future__ import annotations

import pytest

from provider_pdl.condition import (
    ActiveCheck,
    AndExpr,
    DurationCheck,
    OrExpr,
    parse_condition,
)
from provider_pdl.errors import PdlParseError


# ---------------------------------------------------------------------------
# Mock state
# ---------------------------------------------------------------------------


class MockState:
    def __init__(self, active: dict[str, bool] | None = None, durations: dict[str, float] | None = None):
        self._active = active or {}
        self._durations = durations or {}

    def is_event_active(self, event_id: str) -> bool:
        return self._active.get(event_id, False)

    def event_active_duration_days(self, event_id: str) -> float:
        return self._durations.get(event_id, 0.0)


# ---------------------------------------------------------------------------
# AST construction
# ---------------------------------------------------------------------------


class TestParseCondition:
    def test_simple_active(self):
        node = parse_condition("brazil_drought.active")
        assert isinstance(node, ActiveCheck)
        assert node.event_id == "brazil_drought"

    def test_or_expression(self):
        node = parse_condition("oil_mill_slowdown.active OR soy_export_reduction.active")
        assert isinstance(node, OrExpr)
        assert len(node.children) == 2

    def test_and_expression(self):
        node = parse_condition("livestock_pressure.active AND consumer_substitution.active")
        assert isinstance(node, AndExpr)
        assert len(node.children) == 2

    def test_duration_check(self):
        node = parse_condition("soy_export_reduction.active AND soy_export_reduction.duration > 30d")
        assert isinstance(node, AndExpr)
        assert isinstance(node.children[0], ActiveCheck)
        assert isinstance(node.children[1], DurationCheck)
        assert node.children[1].threshold_days == 30.0

    def test_complex_mixed(self):
        node = parse_condition("a.active AND a.duration > 90d OR b.active")
        # Should be: OR(AND(a.active, a.duration>90d), b.active)
        assert isinstance(node, OrExpr)

    def test_invalid(self):
        with pytest.raises(PdlParseError):
            parse_condition("not_valid_expr")


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


class TestEvaluate:
    def test_active_true(self):
        node = parse_condition("ev1.active")
        state = MockState(active={"ev1": True})
        assert node.evaluate(state) is True

    def test_active_false(self):
        node = parse_condition("ev1.active")
        state = MockState(active={"ev1": False})
        assert node.evaluate(state) is False

    def test_or_one_true(self):
        node = parse_condition("ev1.active OR ev2.active")
        state = MockState(active={"ev1": False, "ev2": True})
        assert node.evaluate(state) is True

    def test_and_both_required(self):
        node = parse_condition("ev1.active AND ev2.active")
        state = MockState(active={"ev1": True, "ev2": False})
        assert node.evaluate(state) is False

    def test_duration_check(self):
        node = parse_condition("ev1.active AND ev1.duration > 30d")
        # Active but not long enough
        state = MockState(active={"ev1": True}, durations={"ev1": 20.0})
        assert node.evaluate(state) is False
        # Active and long enough
        state2 = MockState(active={"ev1": True}, durations={"ev1": 45.0})
        assert node.evaluate(state2) is True

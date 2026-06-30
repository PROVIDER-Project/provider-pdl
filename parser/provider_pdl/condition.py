"""Condition-expression parser for PDL trigger conditions.

Grammar (extracted from all 9 PROVIDER scenarios):

    expr       := or_expr
    or_expr    := and_expr (" OR " and_expr)*
    and_expr   := atom (" AND " atom)*
    atom       := EVENT_ID ".active"
               |  EVENT_ID ".duration > " DURATION

EVENT_ID is ``[a-z][a-z0-9_]*`` and DURATION follows the standard PDL format
(e.g. ``90d``, ``30d``).
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Protocol

from provider_pdl.errors import PdlParseError
from provider_pdl.parser import parse_duration


# ---------------------------------------------------------------------------
# State protocol — the simulation state must implement this
# ---------------------------------------------------------------------------

class ConditionState(Protocol):
    def is_event_active(self, event_id: str) -> bool: ...
    def event_active_duration_days(self, event_id: str) -> float: ...


# ---------------------------------------------------------------------------
# AST nodes
# ---------------------------------------------------------------------------

class ConditionNode(ABC):
    @abstractmethod
    def evaluate(self, state: ConditionState) -> bool: ...


@dataclass
class ActiveCheck(ConditionNode):
    event_id: str

    def evaluate(self, state: ConditionState) -> bool:
        return state.is_event_active(self.event_id)


@dataclass
class DurationCheck(ConditionNode):
    event_id: str
    threshold_days: float

    def evaluate(self, state: ConditionState) -> bool:
        return (
            state.is_event_active(self.event_id)
            and state.event_active_duration_days(self.event_id) > self.threshold_days
        )


@dataclass
class AndExpr(ConditionNode):
    children: List[ConditionNode]

    def evaluate(self, state: ConditionState) -> bool:
        return all(c.evaluate(state) for c in self.children)


@dataclass
class OrExpr(ConditionNode):
    children: List[ConditionNode]

    def evaluate(self, state: ConditionState) -> bool:
        return any(c.evaluate(state) for c in self.children)


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

_ACTIVE_RE = re.compile(r"^([a-z][a-z0-9_]*)\.active$")
_DURATION_RE = re.compile(r"^([a-z][a-z0-9_]*)\.duration\s*>\s*(\d+[dhwmy])$")


def _parse_atom(token: str) -> ConditionNode:
    token = token.strip()
    m = _DURATION_RE.match(token)
    if m:
        dur = parse_duration(m.group(2))
        return DurationCheck(event_id=m.group(1), threshold_days=dur.days)
    m = _ACTIVE_RE.match(token)
    if m:
        return ActiveCheck(event_id=m.group(1))
    raise PdlParseError(f"Invalid condition atom: {token!r}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_condition(expr: str) -> ConditionNode:
    """Parse a PDL condition expression into an AST node."""
    or_parts = expr.split(" OR ")
    or_children: List[ConditionNode] = []

    for or_part in or_parts:
        and_parts = or_part.split(" AND ")
        and_children = [_parse_atom(a) for a in and_parts]
        if len(and_children) == 1:
            or_children.append(and_children[0])
        else:
            or_children.append(AndExpr(children=and_children))

    if len(or_children) == 1:
        return or_children[0]
    return OrExpr(children=or_children)

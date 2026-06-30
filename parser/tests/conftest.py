"""Shared fixtures for the standalone PDL parser tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from provider_pdl import load_pdl

SCENARIOS_DIR = Path(__file__).parent.parent.parent / "examples" / "scenarios"

SOJA_PATH = SCENARIOS_DIR / "s1-soja.pdl.yaml"


@pytest.fixture
def soja_path() -> Path:
    return SOJA_PATH


@pytest.fixture
def soja_doc():
    return load_pdl(SOJA_PATH)


@pytest.fixture(
    params=sorted(SCENARIOS_DIR.glob("*.pdl.yaml")),
    ids=lambda p: p.stem,
)
def any_scenario_path(request) -> Path:
    return request.param

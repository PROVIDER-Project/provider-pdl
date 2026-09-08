from pathlib import Path

import yaml

from pdl2palaestrai.converter import (
    SIM_CONTROLLER_PALAESTRAI_34,
    SIM_CONTROLLER_PALAESTRAI_35,
    ConvertOptions,
    build_experiment_config,
    validate_pdl_document,
)


def _load_example() -> dict:
    root = Path(__file__).resolve().parents[1]
    with (root / "examples" / "minimal.pdl.yaml").open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def test_validate_minimal_example() -> None:
    document = _load_example()
    errors = validate_pdl_document(document)
    assert errors == []


def test_build_config_contains_expected_uids() -> None:
    document = _load_example()
    options = ConvertOptions()
    config = build_experiment_config(document, Path("examples/minimal.pdl.yaml"), options)

    assert config["uid"] == "provider-minimal_demo-arl-dummy"
    sensors = config["schedule"][0]["phase_train"]["agents"][0]["sensors"]
    assert "provider_env.entity.supplier.supply" in sensors
    assert "provider_env.event.supplier_outage.active" in sensors


def test_default_sim_controller_targets_palaestrai_35() -> None:
    document = _load_example()
    config = build_experiment_config(document, Path("examples/minimal.pdl.yaml"), ConvertOptions())

    simulation = config["schedule"][0]["phase_train"]["simulation"]
    assert simulation["name"] == SIM_CONTROLLER_PALAESTRAI_35


def test_sim_controller_can_be_overridden_for_palaestrai_34() -> None:
    document = _load_example()
    options = ConvertOptions(sim_controller=SIM_CONTROLLER_PALAESTRAI_34)
    config = build_experiment_config(document, Path("examples/minimal.pdl.yaml"), options)

    simulation = config["schedule"][0]["phase_train"]["simulation"]
    assert simulation["name"] == SIM_CONTROLLER_PALAESTRAI_34

from pathlib import Path

import yaml

from pdl2palaestrai.converter import ConvertOptions, build_experiment_config, validate_pdl_document


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

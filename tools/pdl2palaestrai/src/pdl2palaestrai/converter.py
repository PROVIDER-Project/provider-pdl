from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


class PdlValidationError(Exception):
    """Raised when input PDL is missing required structure."""


@dataclass
class ConvertOptions:
    max_ticks: int = 365
    episodes: int = 1
    seed: int = 42
    environment_uid: str = "provider_env"
    experiment_uid_prefix: str = "provider"
    profile: str = "dummy"
    attacker_budget: float = 0.8
    defender_budget: float = 0.4


def load_pdl_file(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise PdlValidationError("PDL root must be a mapping/object.")
    return data


def validate_pdl_document(document: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    scenario = document.get("scenario")
    if not isinstance(scenario, dict):
        errors.append("Missing or invalid key: scenario (object expected)")
    elif not isinstance(scenario.get("id"), str) or not scenario["id"].strip():
        errors.append("Missing or invalid key: scenario.id (non-empty string expected)")

    entities = document.get("entities")
    if not isinstance(entities, list) or not entities:
        errors.append("Missing or invalid key: entities (non-empty list expected)")
    else:
        ids = set()
        for idx, entity in enumerate(entities):
            if not isinstance(entity, dict):
                errors.append(f"entities[{idx}] must be an object")
                continue
            entity_id = entity.get("id")
            if not isinstance(entity_id, str) or not entity_id.strip():
                errors.append(f"entities[{idx}].id must be a non-empty string")
                continue
            if entity_id in ids:
                errors.append(f"Duplicate entity id: {entity_id}")
            ids.add(entity_id)

    events = document.get("events", [])
    if events is None:
        events = []
    if not isinstance(events, list):
        errors.append("events must be a list when provided")
    else:
        event_ids = set()
        for idx, event in enumerate(events):
            if not isinstance(event, dict):
                errors.append(f"events[{idx}] must be an object")
                continue
            event_id = event.get("id")
            if not isinstance(event_id, str) or not event_id.strip():
                errors.append(f"events[{idx}].id must be a non-empty string")
                continue
            if event_id in event_ids:
                errors.append(f"Duplicate event id: {event_id}")
            event_ids.add(event_id)

    return errors


def _basename_without_yaml_suffix(path: Path) -> str:
    name = path.name
    for suffix in (".pdl.yaml", ".pdl.yml", ".yaml", ".yml"):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return path.stem


def _entity_ids(document: dict[str, Any]) -> list[str]:
    return [
        entity["id"]
        for entity in document.get("entities", [])
        if isinstance(entity, dict) and isinstance(entity.get("id"), str)
    ]


def _event_ids(document: dict[str, Any]) -> list[str]:
    events = document.get("events", []) or []
    return [
        event["id"]
        for event in events
        if isinstance(event, dict) and isinstance(event.get("id"), str)
    ]


def _build_sensor_ids(
    environment_uid: str,
    entity_ids: list[str],
    event_ids: list[str],
) -> list[str]:
    sensor_ids: list[str] = []
    for entity_id in entity_ids:
        for suffix in ("supply", "demand", "price", "health"):
            sensor_ids.append(f"{environment_uid}.entity.{entity_id}.{suffix}")

    for event_id in event_ids:
        sensor_ids.append(f"{environment_uid}.event.{event_id}.active")

    sensor_ids.append(f"{environment_uid}.sim.tick")
    return sensor_ids


def _build_actuator_ids(environment_uid: str, entity_ids: list[str], role: str) -> list[str]:
    return [f"{environment_uid}.{role}.{entity_id}" for entity_id in entity_ids]


def build_experiment_config(
    document: dict[str, Any],
    pdl_path: Path,
    options: ConvertOptions,
) -> dict[str, Any]:
    scenario = document.get("scenario") or {}
    scenario_id = (
        scenario.get("id")
        if isinstance(scenario.get("id"), str)
        else _basename_without_yaml_suffix(pdl_path)
    )

    entity_ids = _entity_ids(document)
    event_ids = _event_ids(document)
    sensors = _build_sensor_ids(options.environment_uid, entity_ids, event_ids)
    attacker_actuators = _build_actuator_ids(
        options.environment_uid,
        entity_ids,
        "attacker",
    )
    defender_actuators = _build_actuator_ids(
        options.environment_uid,
        entity_ids,
        "defender",
    )

    if options.profile == "dummy":
        attacker_brain_name = "palaestrai.agent.dummy_brain:DummyBrain"
        attacker_brain_params: dict[str, Any] = {}
        attacker_muscle_name = "palaestrai.agent.dummy_muscle:DummyMuscle"
        attacker_muscle_params: dict[str, Any] = {}

        defender_brain_name = "palaestrai.agent.dummy_brain:DummyBrain"
        defender_brain_params: dict[str, Any] = {}
        defender_muscle_name = "palaestrai.agent.dummy_muscle:DummyMuscle"
        defender_muscle_params: dict[str, Any] = {}
    else:
        n_obs = len(sensors)
        n_act = len(entity_ids)
        attacker_ckpt = str((Path("checkpoints") / "attacker.pt").resolve())
        defender_ckpt = str((Path("checkpoints") / "defender.pt").resolve())

        attacker_brain_name = "provider_sim.rl.ppo_brain:PPOBrain"
        attacker_brain_params = {
            "checkpoint_path": attacker_ckpt,
            "lr": 3e-4,
            "gamma": 0.99,
            "gae_lambda": 0.95,
            "clip_eps": 0.2,
            "entropy_coef": 0.01,
            "value_coef": 0.5,
            "ppo_epochs": 4,
            "n_obs": n_obs,
            "n_act": n_act,
        }
        attacker_muscle_name = "provider_sim.rl.ppo_muscle:PPOMuscle"
        attacker_muscle_params = {
            "checkpoint_path": attacker_ckpt,
            "n_obs": n_obs,
            "n_act": n_act,
            "budget": options.attacker_budget,
        }

        defender_brain_name = "provider_sim.rl.ppo_brain:PPOBrain"
        defender_brain_params = {
            "checkpoint_path": defender_ckpt,
            "lr": 3e-4,
            "gamma": 0.99,
            "gae_lambda": 0.95,
            "clip_eps": 0.2,
            "entropy_coef": 0.01,
            "value_coef": 0.5,
            "ppo_epochs": 4,
            "n_obs": n_obs,
            "n_act": n_act,
        }
        defender_muscle_name = "provider_sim.rl.ppo_muscle:PPOMuscle"
        defender_muscle_params = {
            "checkpoint_path": defender_ckpt,
            "n_obs": n_obs,
            "n_act": n_act,
            "budget": options.defender_budget,
        }

    return {
        "uid": f"{options.experiment_uid_prefix}-{scenario_id}-arl-{options.profile}",
        "seed": options.seed,
        "version": "3.4.1",
        "schedule": [
            {
                "phase_train": {
                    "environments": [
                        {
                            "environment": {
                                "name": "provider_sim.env.environment:ProviderEnvironment",
                                "uid": options.environment_uid,
                                "params": {
                                    "pdl_source": str(pdl_path.resolve()),
                                    "max_ticks": options.max_ticks,
                                },
                            },
                            "reward": {
                                "name": "palaestrai.agent.dummy_objective:DummyObjective",
                                "params": {"params": {}},
                            },
                        }
                    ],
                    "agents": [
                        {
                            "name": "attacker",
                            "brain": {
                                "name": attacker_brain_name,
                                "params": attacker_brain_params,
                            },
                            "muscle": {
                                "name": attacker_muscle_name,
                                "params": attacker_muscle_params,
                            },
                            "objective": {
                                "name": "provider_sim.env.objectives:AttackerObjective",
                                "params": {"reward_id": "reward.attacker"},
                            },
                            "sensors": sensors,
                            "actuators": attacker_actuators,
                        },
                        {
                            "name": "defender",
                            "brain": {
                                "name": defender_brain_name,
                                "params": defender_brain_params,
                            },
                            "muscle": {
                                "name": defender_muscle_name,
                                "params": defender_muscle_params,
                            },
                            "objective": {
                                "name": "provider_sim.env.objectives:DefenderObjective",
                                "params": {"reward_id": "reward.defender"},
                            },
                            "sensors": sensors,
                            "actuators": defender_actuators,
                        },
                    ],
                    "simulation": {
                        "name": "palaestrai.simulation.vanilla_sim_controller:VanillaSimController",
                        "conditions": [
                            {
                                "name": "palaestrai.simulation.vanilla_simcontroller_termination_condition:VanillaSimControllerTerminationCondition",
                                "params": {},
                            }
                        ],
                    },
                    "phase_config": {
                        "mode": "train",
                        "worker": 1,
                        "episodes": options.episodes,
                    },
                }
            }
        ],
        "run_config": {
            "condition": {
                "name": "palaestrai.experiment.vanilla_rungovernor_termination_condition:VanillaRunGovernorTerminationCondition",
                "params": {},
            }
        },
    }


def _resolve_output_file(input_file: Path, output_path: Path | None, profile: str) -> Path:
    if output_path:
        return output_path

    scenario_name = _basename_without_yaml_suffix(input_file)
    return Path("output") / f"{scenario_name}.arl.{profile}.yaml"


def convert_file(
    input_file: Path,
    *,
    output_file: Path | None,
    options: ConvertOptions,
) -> Path:
    document = load_pdl_file(input_file)
    errors = validate_pdl_document(document)
    if errors:
        details = "\n".join(f"- {error}" for error in errors)
        raise PdlValidationError(f"PDL validation failed for {input_file}:\n{details}")

    config = build_experiment_config(document, input_file, options)
    target_file = _resolve_output_file(input_file, output_file, options.profile)
    target_file.parent.mkdir(parents=True, exist_ok=True)

    with target_file.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(config, handle, sort_keys=False, allow_unicode=True)

    return target_file


def convert_directory(
    input_dir: Path,
    *,
    output_dir: Path,
    options: ConvertOptions,
) -> list[Path]:
    results: list[Path] = []
    pattern_matches = sorted(
        [
            *input_dir.glob("*.pdl.yaml"),
            *input_dir.glob("*.pdl.yml"),
            *input_dir.glob("*.yaml"),
            *input_dir.glob("*.yml"),
        ]
    )

    seen = set()
    files = []
    for path in pattern_matches:
        if path in seen:
            continue
        seen.add(path)
        files.append(path)

    for input_file in files:
        scenario_name = _basename_without_yaml_suffix(input_file)
        out_file = output_dir / f"{scenario_name}.arl.{options.profile}.yaml"
        result = convert_file(input_file, output_file=out_file, options=options)
        results.append(result)

    return results

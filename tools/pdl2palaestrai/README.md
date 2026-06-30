# pdl2palaestrAI

Konvertiert `pdl.yaml`-Szenarien in Palaestrai-Experiment-Inputs (`*.arl.*.yaml`).

## Ziel

Ein Endnutzer kann nach dem Klonen des Repos:
1. ein `pdl.yaml` validieren,
2. daraus ein lauffaehiges Palaestrai-Experiment-YAML erzeugen,
3. dieses YAML direkt mit `palaestrai experiment-start` verwenden.

## Voraussetzungen

- Python 3.10+
- optional: `palaestrai` + `provider_sim`, wenn das erzeugte YAML direkt ausgefuehrt werden soll

## Schnellstart (nach `git clone`)

```bash
cd pdl2palaestrAI
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

## Kommandos

### 1) PDL validieren

```bash
pdl2palaestrai validate examples/minimal.pdl.yaml
```

### 2) Einzeldatei konvertieren

```bash
pdl2palaestrai convert examples/minimal.pdl.yaml
```

Standard-Output: `output/minimal.arl.dummy.yaml`

Mit explizitem Zielpfad und PPO-Profil:

```bash
pdl2palaestrai convert examples/minimal.pdl.yaml \
  --profile ppo \
  --output output/minimal.arl.ppo.yaml
```

### 3) Ordnerweise konvertieren

```bash
pdl2palaestrai batch-convert ./scenarios --output-dir ./output
```

## Danach in Palaestrai starten

```bash
palaestrai experiment-start output/minimal.arl.dummy.yaml
```

## CLI-Optionen

- `--max-ticks` (Default `365`)
- `--episodes` (Default `1`)
- `--seed` (Default `42`)
- `--environment-uid` (Default `provider_env`)
- `--experiment-uid-prefix` (Default `provider`)
- `--profile` (`dummy` oder `ppo`)

## Hinweise

- Fuer `--profile ppo` setzt das Tool PPO-Komponenten (`provider_sim.rl.ppo_brain:PPOBrain`, `provider_sim.rl.ppo_muscle:PPOMuscle`) in das Output-YAML.
- Das Tool validiert die Mindeststruktur (`scenario.id`, `entities[*].id`, optional `events[*].id`) vor der Konvertierung.

## Alternative mit Makefile

```bash
make setup
make validate-example
make convert-example
make test
```

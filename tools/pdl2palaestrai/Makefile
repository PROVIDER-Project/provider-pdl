.PHONY: setup validate-example convert-example test

setup:
	python3 -m venv .venv
	. .venv/bin/activate && pip install -r requirements.txt && pip install -e .

validate-example:
	. .venv/bin/activate && pdl2palaestrai validate examples/minimal.pdl.yaml

convert-example:
	. .venv/bin/activate && pdl2palaestrai convert examples/minimal.pdl.yaml

test:
	. .venv/bin/activate && python -m pytest -q

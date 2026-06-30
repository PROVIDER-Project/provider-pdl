from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .converter import (
    ConvertOptions,
    PdlValidationError,
    convert_directory,
    convert_file,
    load_pdl_file,
    validate_pdl_document,
)


def _shared_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--max-ticks", type=int, default=365, help="max_ticks for ProviderEnvironment")
    parser.add_argument("--episodes", type=int, default=1, help="Training episodes")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--environment-uid", default="provider_env", help="Environment UID prefix")
    parser.add_argument("--experiment-uid-prefix", default="provider", help="Prefix for experiment uid")
    parser.add_argument(
        "--profile",
        choices=["dummy", "ppo"],
        default="dummy",
        help="Agent profile for generated config",
    )


def _to_options(args: argparse.Namespace) -> ConvertOptions:
    return ConvertOptions(
        max_ticks=args.max_ticks,
        episodes=args.episodes,
        seed=args.seed,
        environment_uid=args.environment_uid,
        experiment_uid_prefix=args.experiment_uid_prefix,
        profile=args.profile,
    )


def _cmd_validate(args: argparse.Namespace) -> int:
    try:
        document = load_pdl_file(Path(args.input))
        errors = validate_pdl_document(document)
    except Exception as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        return 2

    if errors:
        print("PDL is invalid:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("PDL is valid.")
    return 0


def _cmd_convert(args: argparse.Namespace) -> int:
    options = _to_options(args)
    input_file = Path(args.input)
    output_file = Path(args.output) if args.output else None

    try:
        target = convert_file(input_file, output_file=output_file, options=options)
    except PdlValidationError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Conversion failed: {exc}", file=sys.stderr)
        return 2

    print(f"Written: {target}")
    return 0


def _cmd_batch_convert(args: argparse.Namespace) -> int:
    options = _to_options(args)
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)

    if not input_dir.exists() or not input_dir.is_dir():
        print(f"Input directory does not exist: {input_dir}", file=sys.stderr)
        return 1

    try:
        results = convert_directory(input_dir, output_dir=output_dir, options=options)
    except PdlValidationError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Batch conversion failed: {exc}", file=sys.stderr)
        return 2

    if not results:
        print("No YAML files found.")
        return 0

    print(f"Converted {len(results)} files:")
    for result in results:
        print(f"- {result}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pdl2palaestrai",
        description="Convert PROVIDER PDL YAML to palaestrai experiment inputs",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate a PDL YAML file")
    validate_parser.add_argument("input", help="Path to pdl.yaml")
    validate_parser.set_defaults(func=_cmd_validate)

    convert_parser = subparsers.add_parser("convert", help="Convert one PDL YAML file")
    convert_parser.add_argument("input", help="Path to pdl.yaml")
    convert_parser.add_argument("--output", "-o", default=None, help="Output YAML path")
    _shared_options(convert_parser)
    convert_parser.set_defaults(func=_cmd_convert)

    batch_parser = subparsers.add_parser("batch-convert", help="Convert all YAML files in a directory")
    batch_parser.add_argument("input_dir", help="Directory with PDL YAML files")
    batch_parser.add_argument("--output-dir", default="output", help="Directory for generated configs")
    _shared_options(batch_parser)
    batch_parser.set_defaults(func=_cmd_batch_convert)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

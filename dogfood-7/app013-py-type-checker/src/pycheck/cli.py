"""Command-line boundary with stable machine-readable diagnostics."""
import argparse
from dataclasses import asdict
import json
from pathlib import Path

from .checker import check


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check the immutable Python subset")
    parser.add_argument("file", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        result = check(args.file.read_text(encoding="utf-8"))
    except (OSError, UnicodeError) as error:
        if args.json:
            print(json.dumps({"symbols": {}, "diagnostics": [{"code": "io", "line": 0, "column": 0, "message": str(error)}]}))
        else:
            print(f"{args.file}: {error}")
        return 2
    if args.json:
        print(json.dumps(asdict(result), sort_keys=True))
    else:
        for diagnostic in result.diagnostics:
            print(f"{args.file}:{diagnostic.line}:{diagnostic.column + 1}: {diagnostic.code}: {diagnostic.message}")
        for name, annotation in result.symbols.items():
            print(f"{name}: {annotation}")
    return int(bool(result.diagnostics))

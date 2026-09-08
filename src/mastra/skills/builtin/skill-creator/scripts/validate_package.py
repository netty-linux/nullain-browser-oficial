#!/usr/bin/env python3
"""Validate the portable structure of an Agent Skill package."""

from __future__ import annotations

import re
import sys
from pathlib import Path

NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
ALLOWED_ROOTS = {"assets", "references", "scripts", "templates"}
IGNORED_NAMES = {".DS_Store", "Thumbs.db"}


def frontmatter_value(document: str, key: str) -> str | None:
    if not document.startswith("---\n"):
        return None
    closing = document.find("\n---\n", 4)
    if closing < 0:
        return None
    for line in document[4:closing].splitlines():
        if line.startswith(f"{key}:"):
            return line.split(":", 1)[1].strip().strip('"\'')
    return None


def validate(directory: Path) -> list[str]:
    errors: list[str] = []
    document_path = directory / "SKILL.md"
    if not document_path.is_file():
        return ["SKILL.md is missing"]

    document = document_path.read_text(encoding="utf-8")
    name = frontmatter_value(document, "name")
    description = frontmatter_value(document, "description")
    if not name or not NAME_PATTERN.fullmatch(name):
        errors.append("frontmatter name must be lowercase kebab-case")
    elif name != directory.name:
        errors.append(f"frontmatter name '{name}' must match directory '{directory.name}'")
    if not description:
        errors.append("frontmatter description is required")

    for path in directory.rglob("*"):
        if not path.is_file() or path.name in IGNORED_NAMES or path == document_path:
            continue
        relative = path.relative_to(directory)
        if relative.parts[0] not in ALLOWED_ROOTS:
            errors.append(f"unsupported resource location: {relative.as_posix()}")
        if "__pycache__" in relative.parts or path.suffix == ".pyc":
            errors.append(f"generated cache must not be bundled: {relative.as_posix()}")
    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_package.py <skill-directory>", file=sys.stderr)
        return 2
    directory = Path(sys.argv[1]).resolve()
    if not directory.is_dir():
        print(f"error: directory not found: {directory}", file=sys.stderr)
        return 2
    errors = validate(directory)
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"valid package: {directory.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Ensure source-layout subprocesses use the same package as pytest."""
import os
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def source_layout_environment(monkeypatch):
    source = str(Path(__file__).resolve().parents[1] / "src")
    existing = os.environ.get("PYTHONPATH", "")
    monkeypatch.setenv("PYTHONPATH", source + (os.pathsep + existing if existing else ""))

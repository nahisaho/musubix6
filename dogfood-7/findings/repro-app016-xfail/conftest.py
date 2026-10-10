import os
import pytest

def pytest_collection_modifyitems(items):
    if os.environ.get("SDD_XFAIL") == "1":
        for item in items:
            item.add_marker(pytest.mark.xfail(reason="not implemented"))
    if os.environ.get("SDD_SKIP") == "1":
        for item in items:
            item.add_marker(pytest.mark.skip(reason="not executed"))

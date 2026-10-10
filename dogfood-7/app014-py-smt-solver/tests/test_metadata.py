from pathlib import Path


# @id TEST-TERMS-009 @verifies REQ-TERMS-009
def test_terms_009():
    text = (Path(__file__).parents[1] / "pyproject.toml").read_text()
    assert 'requires-python = ">=3.10"' in text
    assert 'version = "0.1.0"' in text

#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "ginza>=5.2.0,<5.3",
#   "ja-ginza>=5.2.0,<5.3",
#   "spacy>=3.8.0,<4",
# ]
# ///
"""Behavioral tests for kotonoha's original GiNZA diagnostics."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from core import strip_markdown_inline
from lint import analyze, compare_baseline
from outline import extract as extract_outline
from terms import extract as extract_terms


SCRIPT_DIR = Path(__file__).resolve().parent
FIXTURES = SCRIPT_DIR / "fixtures"


class DiagnosticTests(unittest.TestCase):
    def test_unnatural_fixture_scores_below_natural_fixture(self) -> None:
        unnatural = analyze(FIXTURES / "unnatural.md", "tech", False)
        natural = analyze(FIXTURES / "natural.md", "tech", False)

        self.assertLess(unnatural["score"], natural["score"])
        self.assertEqual(natural["finding_count"], 0)
        categories = {item["category"] for item in unnatural["findings"]}
        self.assertIn("formulaic_conclusion", categories)
        self.assertIn("double_negative", categories)
        self.assertIn("deep_dependency", categories)

    def test_markdown_code_is_not_analyzed_as_prose(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "code.md"
            path.write_text(
                "# Test\n\n自然な説明です。\n\n"
                "```text\n結論として、利用することが可能です。\n```\n",
                encoding="utf-8",
            )
            result = analyze(path, "tech", False)
            categories = {item["category"] for item in result["findings"]}
            self.assertNotIn("formulaic_transition", categories)
            self.assertNotIn("indirect_ability", categories)

    def test_inline_code_is_masked_without_corrupting_plain_identifiers(self) -> None:
        self.assertEqual(strip_markdown_inline("`MAX_RETRY_COUNT`"), "コード")
        self.assertEqual(
            strip_markdown_inline("MAX_RETRY_COUNTを確認する"),
            "MAX_RETRY_COUNTを確認する",
        )

    def test_ordinary_conditional_negation_is_not_double_negative(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "condition.md"
            path.write_text(
                "# Test\n\n設定が存在しない場合、既定値は適用されません。\n",
                encoding="utf-8",
            )
            result = analyze(path, "tech", False)
        categories = {item["category"] for item in result["findings"]}
        self.assertNotIn("double_negative", categories)

    def test_baseline_reports_resolved_findings(self) -> None:
        initial = analyze(FIXTURES / "unnatural.md", "tech", False)
        final = analyze(FIXTURES / "natural.md", "tech", False)
        with tempfile.TemporaryDirectory() as directory:
            baseline = Path(directory) / "baseline.json"
            baseline.write_text(
                json.dumps(initial, ensure_ascii=False),
                encoding="utf-8",
            )
            compare_baseline(final, baseline)
        self.assertGreater(final["resolved_count"], 0)
        self.assertEqual(final["new_count"], 0)

    def test_outline_and_terms_return_structured_results(self) -> None:
        outline = extract_outline(FIXTURES / "natural.md")
        terms = extract_terms(FIXTURES / "natural.md")
        self.assertEqual(outline["heading_count"], 1)
        self.assertGreater(outline["paragraph_count"], 0)
        self.assertIn("terms", terms)

    def test_outline_ignores_headings_inside_code_fences(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "outline.md"
            path.write_text(
                "# Real heading\n\n説明です。\n\n"
                "```bash\n# コマンド内のコメント\n```\n",
                encoding="utf-8",
            )
            outline = extract_outline(path)
        self.assertEqual(outline["heading_count"], 1)
        self.assertEqual(outline["headings"][0]["text"], "Real heading")

    def test_terms_ignore_inline_commands(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "terms.md"
            path.write_text(
                "# Test\n\n`npm run build --workspace=packages/core`を実行します。\n",
                encoding="utf-8",
            )
            terms = extract_terms(path)
        values = {item["term"] for item in terms["terms"]}
        self.assertTrue(values.isdisjoint({"npm", "run", "build", "workspace", "core"}))


if __name__ == "__main__":
    unittest.main()

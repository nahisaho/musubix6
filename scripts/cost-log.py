#!/usr/bin/env python3
"""Regenerate cumulative USD costs, preserving archived and exact live usage.

Usage: python3 scripts/cost-log.py [project-dir] [--store PATH]
"""
import argparse
import fcntl
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

USD_NANO = Decimal(100_000_000_000)
METRICS = ("calls", "nanoAiu", "inputTokens", "outputTokens")
MARKER = "- History: `cost-history.json` (schema 1)"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fields(value, names):
    require(type(value) is dict and set(value) == set(names), "invalid history fields")


def integer(value):
    require(type(value) is int and value >= 0, "usage counters must be nonnegative integers")


def money(value):
    require(isinstance(value, str) and re.fullmatch(r"\d+\.\d{2}", value),
            "legacy USD must be a nonnegative decimal string with two places")
    return Decimal(value)


def text(value):
    require(isinstance(value, str) and not any(c in value for c in "|\r\n"),
            "invalid Markdown table text")


def created(value):
    require(isinstance(value, str) and len(value) == 16, "invalid session timestamp")
    datetime.strptime(value, "%Y-%m-%dT%H:%M")


def validate_legacy(legacy):
    fields(legacy, ("totalUsd", "models", "rows"))
    money(legacy["totalUsd"])
    require(type(legacy["models"]) is dict and type(legacy["rows"]) is list,
            "invalid legacy tables")
    for model, metrics in legacy["models"].items():
        text(model)
        require(bool(model), "empty model")
        fields(metrics, ("calls", "usd", "inputTokens", "outputTokens"))
        money(metrics["usd"])
        for key in ("calls", "inputTokens", "outputTokens"):
            integer(metrics[key])
    pairs = set()
    calls = Counter()
    for row in legacy["rows"]:
        fields(row, ("created", "id", "model", "calls", "usd", "summary"))
        created(row["created"])
        require(isinstance(row["id"], str) and re.fullmatch(r"[0-9a-f]{8}", row["id"]),
                "invalid archived session prefix")
        text(row["summary"])
        text(row["model"])
        require(row["model"] in legacy["models"], "unknown archived model")
        integer(row["calls"])
        money(row["usd"])
        pair = (row["id"], row["model"])
        require(pair not in pairs, "duplicate archived session/model")
        pairs.add(pair)
        calls[row["model"]] += row["calls"]
    require(set(calls) == set(legacy["models"]) and
            all(calls[model] == metrics["calls"] for model, metrics in legacy["models"].items()),
            "legacy model/session call totals disagree")


def validate_sessions(sessions):
    require(type(sessions) is dict, "invalid exact session snapshots")
    for sid, session in sessions.items():
        require(isinstance(sid, str) and
                re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", sid),
                "invalid canonical full session UUID")
        fields(session, ("created", "summary", "models"))
        created(session["created"])
        text(session["summary"])
        require(type(session["models"]) is dict and bool(session["models"]),
                "invalid exact session models")
        for model, metrics in session["models"].items():
            text(model)
            require(bool(model), "empty model")
            fields(metrics, METRICS)
            for value in metrics.values():
                integer(value)
            require(metrics["calls"] > 0, "empty exact usage snapshot")


def table(report, heading, next_heading, header):
    require(report.count(heading) == 1, f"missing or repeated {heading} table")
    section = report.split(heading, 1)[1]
    if next_heading:
        require(section.count(next_heading) == 1, f"missing {next_heading} table")
        section = section.split(next_heading, 1)[0]
    lines = [line for line in section.splitlines() if line.strip()]
    require(len(lines) >= 2 and lines[0] == header and
            re.fullmatch(r"\|[-:|]+\|", lines[1]), f"invalid {heading} header")
    result = []
    for line in lines[2:]:
        require(line.startswith("|") and line.endswith("|"), "malformed legacy table row")
        values = [value.strip() for value in line[1:-1].split("|")]
        require(len(values) == len(header.split("|")) - 2, "malformed legacy table columns")
        result.append(values)
    return result


def usd_cell(value):
    require(value.startswith("$"), "invalid legacy USD cell")
    amount = money(value[1:].replace(",", ""))
    require(value == f"${amount:,.2f}", "invalid legacy USD grouping")
    return str(amount)


def bootstrap(report_path):
    if not report_path.exists():
        return {"totalUsd": "0.00", "models": {}, "rows": []}
    report = report_path.read_text(encoding="utf-8")
    require(MARKER not in report, "checkpoint missing for a previously generated report")
    totals = re.findall(r"(?m)^- \*\*Total: (\$[\d,]+\.\d{2})\*\*$", report)
    counts = re.findall(r"(?m)^- Sessions: (\d+)$", report)
    require(len(totals) == len(counts) == 1, "invalid legacy total/session count")
    model_rows = table(report, "## By model", "## By session",
                       "| Model | Calls | USD | Input tokens | Output tokens |")
    session_rows = table(report, "## By session", None,
                         "| Started (UTC) | Session | Model | Calls | USD | Summary |")
    legacy = {"totalUsd": usd_cell(totals[0]), "models": {}, "rows": []}
    for model, calls, usd, tin, tout in model_rows:
        require(model not in legacy["models"], "duplicate legacy model")
        legacy["models"][model] = {
            "calls": int(calls), "usd": usd_cell(usd),
            "inputTokens": int(tin), "outputTokens": int(tout),
        }
    for date, sid, model, calls, usd, summary in session_rows:
        require(re.fullmatch(r"`[0-9a-f]{8}`", sid), "invalid legacy session ID")
        legacy["rows"].append({
            "created": date, "id": sid[1:-1], "model": model,
            "calls": int(calls), "usd": usd_cell(usd), "summary": summary,
        })
    validate_legacy(legacy)
    require(len({row["id"] for row in legacy["rows"]}) == int(counts[0]),
            "legacy session count disagrees")
    return legacy


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate history JSON key")
        result[key] = value
    return result


def load_history(history_path, report_path):
    if history_path.exists():
        state = json.loads(history_path.read_text(encoding="utf-8"),
                           object_pairs_hook=unique_object)
    else:
        state = {"schemaVersion": 1, "legacy": bootstrap(report_path), "sessions": {}}
    fields(state, ("schemaVersion", "legacy", "sessions"))
    require(type(state["schemaVersion"]) is int and state["schemaVersion"] == 1,
            "unsupported cost history schema")
    validate_legacy(state["legacy"])
    validate_sessions(state["sessions"])
    return state


def read_usage(db, root):
    require(db.is_file(), f"session store not found: {db}")
    with sqlite3.connect(db.resolve().as_uri() + "?mode=ro", uri=True) as con:
        rows = con.execute(
            """SELECT s.id, substr(s.created_at,1,16), COALESCE(s.summary,''),
                      u.model, COUNT(*), SUM(u.total_nano_aiu),
                      SUM(u.input_tokens), SUM(u.output_tokens),
                      SUM(CASE WHEN typeof(u.total_nano_aiu)='integer'
                               AND u.total_nano_aiu>=0
                               AND typeof(u.input_tokens)='integer' AND u.input_tokens>=0
                               AND typeof(u.output_tokens)='integer' AND u.output_tokens>=0
                          THEN 1 ELSE 0 END)
               FROM sessions s JOIN assistant_usage_events u ON u.session_id=s.id
               WHERE s.cwd=? OR substr(s.cwd,1,length(?)+1)=? || '/'
               GROUP BY s.id,u.model ORDER BY s.created_at,u.model""",
            (str(root), str(root), str(root))).fetchall()
    sessions = {}
    for sid, date, summary, model, calls, nano, tin, tout, valid in rows:
        require(valid == calls, "invalid raw usage metrics: expected nonnegative integers")
        require(isinstance(summary, str), "invalid session summary")
        summary = summary.replace("|", "/").replace("\r", " ").replace("\n", " ")[:60]
        session = sessions.setdefault(sid, {"created": date, "summary": summary, "models": {}})
        session["models"][model] = dict(zip(METRICS, (calls, nano, tin, tout)))
    validate_sessions(sessions)
    return sessions


# @id CODE-COST-HISTORY-002 @implements REQ-COST-HISTORY-002
def merge_usage(state, observed):
    prefixes = {row["id"] for row in state["legacy"]["rows"]}
    require(not any(sid[:8] in prefixes for sid in state["sessions"]),
            "exact history overlaps archived session prefix")
    for sid, session in observed.items():
        require(sid[:8] not in prefixes, f"live session overlaps archived prefix: {sid}")
        old = state["sessions"].setdefault(sid, {
            "created": session["created"], "summary": session["summary"], "models": {},
        })
        require(old["created"] == session["created"], "session creation time changed")
        for model, metrics in session["models"].items():
            previous = old["models"].get(model)
            require(previous is None or all(metrics[key] >= previous[key] for key in METRICS),
                    f"usage counters decreased: {sid}/{model}")
            old["models"][model] = metrics
        old["summary"] = session["summary"]


def render(state, root):
    legacy = state["legacy"]
    sessions = state["sessions"]
    total = money(legacy["totalUsd"])
    models = {
        model: [value["calls"], money(value["usd"]), value["inputTokens"], value["outputTokens"]]
        for model, value in legacy["models"].items()
    }
    for session in sessions.values():
        for model, value in session["models"].items():
            usd = Decimal(value["nanoAiu"]) / USD_NANO
            total += usd
            metrics = models.setdefault(model, [0, Decimal(0), 0, 0])
            for index, amount in enumerate((value["calls"], usd, value["inputTokens"], value["outputTokens"])):
                metrics[index] += amount
    count = len({row["id"] for row in legacy["rows"]}) + len(sessions)
    out = [
        "# AI cost log (USD)", "", f"- Project: `{root}`",
        f'- Updated: {datetime.now(UTC).strftime("%Y-%m-%d %H:%M")} UTC',
        f"- Sessions: {count}", f"- **Total: ${total:,.2f}**", MARKER,
        "- Basis: exact live `total_nano_aiu` / 1e9 = AIU; 1 AIU = 0.01 USD.",
        "- Archived report totals retain their original cent precision independently of rounded rows.",
        "- Local-machine estimate; the GitHub billing dashboard is authoritative.",
        "", "Regenerate with `python3 scripts/cost-log.py`. Do not edit by hand.",
        "", "## By model", "",
        "| Model | Calls | USD | Input tokens | Output tokens |", "|---|---:|---:|---:|---:|",
    ]
    for model, (calls, usd, tin, tout) in sorted(models.items(), key=lambda item: (-item[1][1], item[0])):
        out.append(f"| {model} | {calls} | ${usd:,.2f} | {tin} | {tout} |")
    out += ["", "## By session", "",
            "| Started (UTC) | Session | Model | Calls | USD | Summary |",
            "|---|---|---|---:|---:|---|"]
    for row in legacy["rows"]:
        out.append(f'| {row["created"]} | `{row["id"]}` | {row["model"]} | '
                   f'{row["calls"]} | ${money(row["usd"]):,.2f} | {row["summary"]} |')
    for sid, session in sorted(sessions.items(), key=lambda item: (item[1]["created"], item[0])):
        for model, value in sorted(session["models"].items()):
            usd = Decimal(value["nanoAiu"]) / USD_NANO
            out.append(f'| {session["created"]} | `{sid}` | {model} | '
                       f'{value["calls"]} | ${usd:,.2f} | {session["summary"]} |')
    return "\n".join(out) + "\n", count, total


def atomic_write(path, content):
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def project_root(start):
    require(Path(start).is_dir(), f"project directory not found: {start}")
    try:
        root = subprocess.check_output(
            ["git", "-C", start, "rev-parse", "--show-toplevel"],
            text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        root = start
    return Path(root).resolve()


# @id CODE-COST-HISTORY-001 @implements REQ-COST-HISTORY-001
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", nargs="?", default=os.getcwd())
    parser.add_argument("--store", type=Path, default=Path.home() / ".copilot/session-store.db")
    args = parser.parse_args()
    root = project_root(args.project)
    directory = root / ".sdd"
    directory.mkdir(exist_ok=True)
    report_path = directory / "cost-log.md"
    history_path = directory / "cost-history.json"
    with (directory / ".cost-log.lock").open("a", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = load_history(history_path, report_path)
        merge_usage(state, read_usage(args.store, root))
        report, count, total = render(state, root)
        checkpoint = json.dumps(state, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        atomic_write(history_path, checkpoint)
        atomic_write(report_path, report)
    print(f"{report_path}: {count} sessions, ${total:,.2f}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, sqlite3.Error) as error:
        sys.exit(f"cost log: {error}")

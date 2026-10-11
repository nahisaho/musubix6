#!/usr/bin/env python3
"""Regenerate .sdd/cost-log.md: AI cost in USD (from AIU) of by Copilot CLI sessions
whose working directory is this project. Idempotent: safe to run at any time and
from any session, so the cumulative record survives session changes.

Usage: python3 scripts/cost-log.py [project-dir]
"""
import os, sqlite3, subprocess, sys
from datetime import datetime, timezone

DB = os.path.expanduser('~/.copilot/session-store.db')
NANO = 1e9

def project_root(start):
    try:
        return subprocess.check_output(['git', '-C', start, 'rev-parse', '--show-toplevel'],
                                       text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return os.path.realpath(start)

def main():
    root = project_root(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
    if not os.path.exists(DB):
        sys.exit(f'session store not found: {DB}')
    con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    rows = con.execute(
        """SELECT s.id, substr(s.created_at,1,16), COALESCE(NULLIF(s.summary,''),''),
                  u.model, COUNT(u.id), SUM(u.total_nano_aiu),
                  SUM(u.input_tokens), SUM(u.output_tokens)
           FROM sessions s JOIN assistant_usage_events u ON u.session_id = s.id
           WHERE s.cwd = ? OR s.cwd LIKE ? || '/%'
           GROUP BY s.id, u.model ORDER BY s.created_at, u.model""",
        (root, root)).fetchall()

    per_session = {}
    for sid, created, summary, model, n, nano, tin, tout in rows:
        d = per_session.setdefault(sid, {'created': created, 'summary': summary, 'models': {}})
        d['models'][model] = (n, (nano or 0) / NANO, tin or 0, tout or 0)

    USD = 0.01  # 1 AIU = 1 AI credit = 0.01 USD
    total = sum(v[1] for d in per_session.values() for v in d['models'].values()) * USD
    by_model = {}
    for d in per_session.values():
        for m, (n, aiu, tin, tout) in d['models'].items():
            t = by_model.setdefault(m, [0, 0.0, 0, 0])
            t[0] += n; t[1] += aiu * USD; t[2] += tin; t[3] += tout

    out = ['# AI cost log (USD)', '',
           f'- Project: `{root}`',
           f'- Updated: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")} UTC',
           f'- Sessions: {len(per_session)}',
           f'- **Total: ${total:,.2f}**',
           '- Basis: `total_nano_aiu` in the Copilot CLI session store / 1e9 = AIU; 1 AIU = 1 AI credit = 0.01 USD (docs.github.com, usage-based billing).',
           '- Local-machine estimate; the GitHub billing dashboard is authoritative.',
           '', 'Regenerate with `python3 scripts/cost-log.py`. Do not edit by hand.', '',
           '## By model', '', '| Model | Calls | USD | Input tokens | Output tokens |', '|---|---:|---:|---:|---:|']
    for m, (n, usd, tin, tout) in sorted(by_model.items(), key=lambda x: -x[1][1]):
        out.append(f'| {m} | {n} | ${usd:,.2f} | {tin} | {tout} |')
    out += ['', '## By session', '', '| Started (UTC) | Session | Model | Calls | USD | Summary |', '|---|---|---|---:|---:|---|']
    for sid, d in per_session.items():
        for m, (n, aiu, _, _) in d['models'].items():
            summ = d['summary'].replace('|', '/').replace('\n', ' ')[:60]
            out.append(f'| {d["created"]} | `{sid[:8]}` | {m} | {n} | ${aiu*USD:,.2f} | {summ} |')
    os.makedirs(os.path.join(root, '.sdd'), exist_ok=True)
    path = os.path.join(root, '.sdd', 'cost-log.md')
    with open(path, 'w') as f:
        f.write('\n'.join(out) + '\n')
    print(f'{path}: {len(per_session)} sessions, ${total:,.2f}')

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Regenerate .sdd/aic-log.md: AI credits (AIU) consumed by Copilot CLI sessions
whose working directory is this project. Idempotent: safe to run at any time and
from any session, so the cumulative record survives session changes.

Usage: python3 scripts/aic-log.py [project-dir]
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

    total = sum(v[1] for d in per_session.values() for v in d['models'].values())
    by_model = {}
    for d in per_session.values():
        for m, (n, aiu, tin, tout) in d['models'].items():
            t = by_model.setdefault(m, [0, 0.0, 0, 0])
            t[0] += n; t[1] += aiu; t[2] += tin; t[3] += tout

    out = ['# AI credits log', '',
           f'- Project: `{root}`',
           f'- Updated: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")} UTC',
           f'- Sessions: {len(per_session)}',
           f'- **Total: {total:.3f} AIU** (`total_nano_aiu` / 1e9 from the Copilot CLI session store)',
           '', 'Regenerate with `python3 scripts/aic-log.py`. Do not edit by hand.', '',
           '## By model', '', '| Model | Calls | AIU | Input tokens | Output tokens |', '|---|---:|---:|---:|---:|']
    for m, (n, aiu, tin, tout) in sorted(by_model.items(), key=lambda x: -x[1][1]):
        out.append(f'| {m} | {n} | {aiu:.3f} | {tin} | {tout} |')
    out += ['', '## By session', '', '| Started (UTC) | Session | Model | Calls | AIU | Summary |', '|---|---|---|---:|---:|---|']
    for sid, d in per_session.items():
        for m, (n, aiu, _, _) in d['models'].items():
            summ = d['summary'].replace('|', '/').replace('\n', ' ')[:60]
            out.append(f'| {d["created"]} | `{sid[:8]}` | {m} | {n} | {aiu:.3f} | {summ} |')
    os.makedirs(os.path.join(root, '.sdd'), exist_ok=True)
    path = os.path.join(root, '.sdd', 'aic-log.md')
    with open(path, 'w') as f:
        f.write('\n'.join(out) + '\n')
    print(f'{path}: {len(per_session)} sessions, {total:.3f} AIU')

if __name__ == '__main__':
    main()

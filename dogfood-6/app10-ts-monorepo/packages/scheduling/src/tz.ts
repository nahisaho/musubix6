const MIN = 60000;
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      });
    } catch {
      throw new RangeError(`invalid time zone: ${tz}`);
    }
    fmtCache.set(tz, f);
  }
  return f;
}

/** @id CODE-AVAIL-001 @implements REQ-AVAIL-001 REQ-AVAIL-002 */
export function zonedOffsetMinutes(tz: string, epochMs: number): number {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / MIN);
}

/** @id CODE-AVAIL-002 @implements REQ-AVAIL-003 REQ-AVAIL-004 */
export function localToEpoch(tz: string, date: string, time: string): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new RangeError('invalid local date/time');
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  const offsets = new Set([zonedOffsetMinutes(tz, guess - 86400000), zonedOffsetMinutes(tz, guess + 86400000)]);
  const valid = [...offsets].map((o) => guess - o * MIN).filter((e) => zonedOffsetMinutes(tz, e) === (guess - e) / MIN);
  if (valid.length === 0) throw new RangeError(`local time does not exist in ${tz}: ${date} ${time}`);
  return Math.min(...valid);
}

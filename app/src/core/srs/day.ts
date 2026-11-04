/** Календарни дни по часова зона на ученика (серия, „днес“). */
export const dayKey = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Началото на деня в дадената зона, като UTC момент. */
export function startOfDay(now: Date, tz: string): Date {
  const key = dayKey(now, tz);
  // търсим най-ранния момент в последните 26 часа със същия календарен ден
  let hi = Math.floor(now.getTime() / 1000) * 1000;
  let lo = hi - 26 * 3600_000;
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
    if (dayKey(new Date(mid), tz) === key) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

/** Поредни дни с поне един преговор, броени назад от днес (ако днес още няма, от вчера). */
export function streak(reviewTimes: Date[], tz: string, now = new Date()): number {
  const days = new Set(reviewTimes.map((d) => dayKey(d, tz)));
  let cursor = new Date(now);
  if (!days.has(dayKey(cursor, tz))) cursor = new Date(cursor.getTime() - 24 * 3600_000);
  let n = 0;
  while (days.has(dayKey(cursor, tz))) {
    n++;
    cursor = new Date(cursor.getTime() - 24 * 3600_000);
  }
  return n;
}

/* CONF_TAB_V2: pure, testable reading of the Guild Directory snapshot. */
const numeric = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
/** SEAT1c's minimum totals. 'defence' is included in /v1/seats/standings,
 * but older Guild Directory snapshots do not retain it. */
export const CLAIM_THRESHOLD = Object.freeze({ palace: 6000, crown: 30000 });
export const claimMinimum = seat => CLAIM_THRESHOLD[String(seat?.tier ?? '').toLowerCase()] ?? null;
export const challengeTarget = seat => {
  const min = claimMinimum(seat);
  if (min === null) return null;
  if (!seat?.holder) return min;
  if (seat.defence === null || seat.defence === undefined || !Number.isFinite(Number(seat.defence)) || Number(seat.defence) < 0) return null;
  return Math.max(min, Math.floor(Number(seat.defence)) + 1);
};
/** Distinct guilds visibly campaigning or party to a scheduled battle.
 * The incumbent counts when defending a scheduled battle, or when measured
 * with >0 influence; never invent an unmeasured guild's activity. */
export const competingGuilds = (seat, contenders, battle) => {
  const found = new Set();
  for (const c of contenders) if (c?.guild?.id != null) found.add(String(c.guild.id));
  if (battle && (battle.state === 'scheduled' || (battle.startsAt == null && !battle.state))) {
    for (const g of [battle.guild, battle.against]) if (g?.id != null) found.add(String(g.id));
  }
  return found.size;
};

/** Seat competition is distinct from the battle that the Turning scheduled. */
export function conflictRows(snapshot, nowMs = Date.now()) {
  if (!snapshot || !Array.isArray(snapshot.seats) || !Array.isArray(snapshot.guilds)) return [];
  const perSeat = new Map();
  for (const guild of snapshot.guilds) {
    if (!Array.isArray(guild?.contests)) continue;
    for (const contest of guild.contests) {
      if (!isObj(contest) || contest.key == null) continue;
      const k = String(contest.key);
      const list = perSeat.get(k) ?? [];
      list.push({ guild: { id: guild.id, name: guild.name, tag: guild.tag },
        influence: numeric(contest.influence), legacy: numeric(contest.legacy),
        current: Math.max(0, numeric(contest.influence) - numeric(contest.legacy)),
        contributors: numeric(contest.contributors), checkedAt: contest.checkedAt ?? guild.checkedAt ?? null });
      perSeat.set(k, list);
    }
  }
  const rows = [];
  for (const seat of snapshot.seats) {
    if (!isObj(seat) || seat.key == null) continue;
    const contenders = (perSeat.get(String(seat.key)) ?? [])
      .filter(c => c.influence > 0)
      .sort((a,b) => b.influence - a.influence || b.legacy - a.legacy || String(a.guild.name).localeCompare(String(b.guild.name)));
    const outsider = contenders.filter(c => !seat.holder || String(c.guild.id) !== String(seat.holder.id));
    const battle = isObj(seat.battle) ? seat.battle : null;
    const starts = battle?.startsAt == null ? null : numeric(battle.startsAt) * 1000;
    const ends = battle?.endsAt == null ? null : numeric(battle.endsAt) * 1000;
    const state = String(battle?.state ?? '').toLowerCase();
    const scheduled = !!battle && state === 'scheduled' && !!starts && !!ends && ends > nowMs;
    const open = scheduled && nowMs >= starts;
    const upcoming = scheduled && nowMs < starts;
    const right = !!battle && !state && !starts;  // right awarded, battle not yet placed
    const contested = outsider.length > 0;
    if (!open && !upcoming && !right && !contested) continue;
    const kind = open ? 'window' : upcoming ? 'upcoming' : right ? 'right' : 'contested';
    rows.push({ seat, battle, contenders, outsiders: outsider, competing: competingGuilds(seat, contenders, (open||upcoming||right) ? battle : null), kind, starts, ends,
      orderAt: kind === 'window' ? ends : kind === 'upcoming' ? starts : Infinity });
  }
  const priority = { window:0, upcoming:1, right:2, contested:3 };
  return rows.sort((a,b) => b.competing - a.competing || priority[a.kind] - priority[b.kind] || a.orderAt - b.orderAt || String(a.seat.name).localeCompare(String(b.seat.name)));
}

export const conflictSummary = rows => ({
  window: rows.filter(r => r.kind === 'window').length,
  upcoming: rows.filter(r => r.kind === 'upcoming' || r.kind === 'right').length,
  contested: rows.filter(r => r.kind === 'contested').length,
  total: rows.length,
});

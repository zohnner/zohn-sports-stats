#!/usr/bin/env node
// ============================================================
// SportStrata — name-join health probe (D-037, zero deps, LIVE)
// The NFL data layer bridges Sleeper ⇄ nflverse/ESPN by normalized
// name+position (Sleeper's foreign ids are ~25-33% populated). Joins
// degrade silently — trades break the team half, suffixes break the
// name half. This probe measures the match rate so drift shows up as
// a number, not a bug report.
//
// Run AGAINST A DEPLOY (needs the live /api/* Functions):
//   node tools/join-health.cjs https://sportstrata.cc
// Warns < 90% matched among top-200 ADP skill players; fails < 80%.
// ============================================================
const BASE = process.argv[2];
if (!BASE) { console.error('usage: node tools/join-health.cjs <site-base-url>'); process.exit(2); }

// Mirrors _vbdKey in js/fantasy.js — keep in sync.
const key = (name, pos) => (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim() + '|' + pos;

(async () => {
    const j = async p => (await fetch(BASE + p)).json();
    const [pool, fp] = await Promise.all([j('/api/sleeper?path=/v1/players/nfl'), j('/api/nflfp')]);

    const POS = new Set(['QB', 'RB', 'WR', 'TE']);
    const players = Object.values(pool)
        .filter(p => p && p.active && POS.has(p.position) && p.search_rank != null && p.search_rank < 100000)
        .sort((a, b) => a.search_rank - b.search_rank)
        .slice(0, 200);

    const fpKeys = new Set((fp.players || []).map(p => key(p.name, p.pos)));
    const unmatched = players.filter(p =>
        !fpKeys.has(key(p.full_name || `${p.first_name} ${p.last_name}`, p.position)));

    // Rookies (years_exp 0) legitimately have no production row — report separately.
    const rookies = unmatched.filter(p => p.years_exp === 0);
    const veterans = unmatched.filter(p => p.years_exp !== 0);
    const denom = players.length - rookies.length;
    const rate = denom > 0 ? ((denom - veterans.length) / denom * 100) : 100;

    console.log(`nflfp season: ${fp.season} · pool: top-${players.length} ADP skill players`);
    console.log(`rookies (expected unmatched): ${rookies.length}`);
    console.log(`veteran match rate: ${rate.toFixed(1)}%  (${veterans.length} unmatched of ${denom})`);
    if (veterans.length) console.log('unmatched veterans:\n  ' + veterans.map(p => `${p.full_name} ${p.position} ${p.team || 'FA'}`).join('\n  '));
    if (rate < 80) { console.log('❌ FAIL — join drift'); process.exit(1); }
    console.log(rate < 90 ? '⚠️  WARN — join rate degrading' : '✅ PASS');
})().catch(e => { console.error('probe failed:', e.message); process.exit(2); });

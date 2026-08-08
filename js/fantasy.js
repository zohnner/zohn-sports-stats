// ============================================================
// NFL Fantasy — Mock Draft Simulator (no-login, casual/redraft)
// Data: Sleeper public API via /api/sleeper proxy. ADP = search_rank.
// "Next level" (D-027): tiers + cliffs, a real-time Draft Assistant, format
// awareness (scoring + Superflex), a full draft board, and deep post-draft
// analysis. All client-side; Monte Carlo estimates survival to your next pick.
// Entry: loadMockDraft() (nfl-mock route). State is session-only.
// ============================================================

let _mdPool = null;
let _md = null;

// ── Value engine (VBD / VORP) — D-028 ─────────────────────────
// Transparent: projects rest-of-season production and values each player OVER
// positional replacement. Opponents draft to ADP (the crowd); your Assistant
// drafts to value (the edge).
//
// D-039 Track 2a (2026-08-01): _vbdProj no longer carries last season's rate
// flat into next season. It applies a trained regression Y = a*X + b per
// position x scoring format, fit on 2015-2025 nflverse year-over-year data
// (10 season transitions, 2850 weighted player-pairs, weighted by
// min(games_N, games_N+1)). Slopes land 0.57-0.74 — real regression to the
// mean, not a 1:1 carry-forward. See DECISIONS.md D-039 for the full fit
// table (N/a/b/R^2 per group) and QB's known-noisier R^2 (~0.30 vs ~0.44-0.54
// for RB/WR/TE — expected, not a bug: QB output swings hardest on a single
// benching or injury). Coefficients are a first production pass, not a
// yearly-refreshed model yet — no auto-retrain job exists.
const _RTS_COEF = {
    QB: { ppr: { a: 0.566, b: 6.881 }, half: { a: 0.566, b: 6.876 }, std: { a: 0.566, b: 6.871 } },
    RB: { ppr: { a: 0.706, b: 2.765 }, half: { a: 0.703, b: 2.500 }, std: { a: 0.697, b: 2.249 } },
    WR: { ppr: { a: 0.741, b: 2.277 }, half: { a: 0.726, b: 1.965 }, std: { a: 0.699, b: 1.688 } },
    TE: { ppr: { a: 0.719, b: 1.922 }, half: { a: 0.710, b: 1.594 }, std: { a: 0.691, b: 1.282 } },
};
let _vbd = null;
function _vbdKey(name, pos) {
    return (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
        .replace(/[^a-z ]/g,' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/\s+/g,' ').trim() + '|' + pos;
}
async function _vbdLoad() {
    if (_vbd) return _vbd;
    try {
        const r = await (await fetch('/api/nflfp')).json();
        const map = {};
        (r.players || []).forEach(p => { map[_vbdKey(p.name, p.pos)] = p; });
        _vbd = { season: r.season || null, map, ok: !!(r.found && r.players && r.players.length) };
    } catch (_) { _vbd = { season: null, map: {}, ok: false }; }
    return _vbd;
}
function _vbdProj(fp, scoring) {
    if (!fp) return null;
    const k = scoring === 'Standard' ? 'std' : scoring === 'Half-PPR' ? 'half' : 'ppr';
    const rate = fp[k] / (fp.g || 1);                                  // last-season per-game rate
    const coef = _RTS_COEF[fp.pos] && _RTS_COEF[fp.pos][k];
    const rtsRate = coef ? Math.max(0, coef.a * rate + coef.b) : rate; // trained RoS rate (D-039 2a); flat fallback for K/untrained pos
    return rtsRate * 17;        // projected over a full season
}
function _vbdReplacement(scoring, teams, superflex) {
    const base = { QB: superflex ? teams * 2 : teams, RB: Math.round(teams * 2.5), WR: Math.round(teams * 2.5), TE: teams };
    const rep = {};
    ['QB','RB','WR','TE'].forEach(pos => {
        const proj = Object.values(_vbd.map).filter(p => p.pos === pos).map(p => _vbdProj(p, scoring)).filter(v => v != null).sort((a,b)=>b-a);
        const n = Math.max(0, Math.min(proj.length - 1, (base[pos] || teams) - 1));
        rep[pos] = proj.length ? proj[n] : 0;
    });
    return rep;
}
// ── Market-implied projection (D-036) — rookies / no-production players ──
// A rookie has no prior-season stat line, so the value model was silent about
// the picks drafters agonize over most. Implied projection = the production-
// projected points of similarly-drafted players at the same position (up to
// 3 ADP neighbors each side, inverse-distance weighted). This is transparent
// market pricing — every surface tags it "est", never as a real projection.
let _vbdImp = { pool: null, tables: {} };
function _vbdImpTable(scoring) {
    if (_vbdImp.pool !== _mdPool) _vbdImp = { pool: _mdPool, tables: {} };
    if (_vbdImp.tables[scoring]) return _vbdImp.tables[scoring];
    const t = {};
    (_mdPool || []).forEach(p => {
        if (!p._fp) return;
        const proj = _vbdProj(p._fp, scoring);
        if (proj == null) return;
        (t[p.pos] = t[p.pos] || []).push({ adp: p.adp, proj });
    });
    Object.values(t).forEach(list => list.sort((a, b) => a.adp - b.adp));
    _vbdImp.tables[scoring] = t;
    return t;
}
function _vbdImplied(p, scoring) {
    // No market pricing for team-less veterans — retired/unsigned players
    // linger in Sleeper ADP (e.g. a retired FA back priced at #31). Rookies
    // (exp 0) keep implied value, signed or not (D-038).
    if ((p.exp ?? 0) > 0 && (!p.team || p.team === 'FA')) return null;
    const list = _vbdImpTable(scoring)[p.pos];
    if (!list || list.length < 4) return null;
    const below = list.filter(e => e.adp <= p.adp).slice(-3);
    const above = list.filter(e => e.adp > p.adp).slice(0, 3);
    const nbrs = below.concat(above);
    if (!nbrs.length) return null;
    let wSum = 0, vSum = 0;
    nbrs.forEach(e => { const w = 1 / (1 + Math.abs(e.adp - p.adp)); wSum += w; vSum += w * e.proj; });
    return wSum > 0 ? vSum / wSum : null;
}
function _mdVorp(p) {
    if (!_md || !_md.rep) return null;
    const proj = p._fp ? _vbdProj(p._fp, _md.scoring) : _vbdImplied(p, _md.scoring);
    return proj == null ? null : Math.round(proj - (_md.rep[p.pos] || 0));
}
function _mdVorpIsImplied(p) { return !p._fp && _mdVorp(p) != null; }

// ── Venue/surface context (D-053) — informational only, never feeds VBD math ──
// Surface split: Pro Football Network, "List of NFL Stadiums With Grass or
// Turf" (Sept 2025, ahead of the 2025 season — Buffalo's new grass stadium is
// slated to open for 2026 and will flip BUF once confirmed live). Cited
// outlier grades: NFLPA's 2026 "Home Game Field" survey category, reported by
// ESPN/Sportico after an arbitrator barred the NFLPA from publishing it
// directly over a CBA dispute — see DECISIONS.md D-053 for the full sourcing
// note. Deliberately NOT a numeric adjustment: injury-rate evidence is
// contested (the official 2023 joint NFL-NFLPA study found turf/grass
// non-contact injury rates nearly identical, while a widely-cited 2012-2018
// NFL dataset found turf carried a 28% higher non-contact lower-extremity
// injury rate and 69% higher foot/ankle rate) — no stable constant exists to
// bake into a projection the way MLB park factors have one, so this stays a
// badge, not a multiplier.
const _NFL_VENUE_ABBR_ALIAS = { WSH: 'WAS', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', LA: 'LAR' };
const _NFL_TURF_TEAMS = new Set(['ATL','BUF','CAR','CIN','DAL','DET','HOU','IND','LAC','LAR','MIN','NE','NO','NYG','NYJ','SEA','TEN']);
const _NFL_VENUE_NOTE = {
    BAL: 'A-graded grass field (2026 NFLPA player survey)',
    DEN: 'A-graded grass field (2026 NFLPA player survey)',
    PHI: 'A-graded grass field (2026 NFLPA player survey)',
    PIT: 'F−-graded field despite grass — lowest in the league (2026 NFLPA player survey)',
    NYG: 'F−-graded turf — tied lowest in the league (2026 NFLPA player survey)',
    NYJ: 'F−-graded turf — tied lowest in the league (2026 NFLPA player survey)',
    TEN: 'F−-graded turf — tied lowest in the league (2026 NFLPA player survey)',
    MIN: 'B-graded turf — best-rated turf field in the league (2026 NFLPA player survey)',
};
function _nflVenueBadge(teamAbbr) {
    const k = _NFL_VENUE_ABBR_ALIAS[teamAbbr] || teamAbbr;
    if (!k || k === 'FA') return '';
    const turf = _NFL_TURF_TEAMS.has(k);
    const note = _NFL_VENUE_NOTE[k];
    if (!turf && !note) return '';           // plain grass, nothing notable cited — no decorative badge
    const title = note || 'Plays on artificial turf — 2026 NFLPA player survey graded turf fields a median D vs. B+ for grass.';
    return `<span class="md-venue-badge" title="${_escHtml(title)}">${turf ? 'Turf' : 'Grass'}</span>`;
}

const _MD_POS = ['QB', 'RB', 'WR', 'TE', 'K'];
const _MD_POS_COLOR = { QB: '#ef4444', RB: '#34d399', WR: '#60a5fa', TE: '#fbbf24', K: '#a78bfa' };
const _MD_FLEX = ['RB', 'WR', 'TE'];
// Bench depth caps (starters handled separately by the lineup model)
const _MD_NEED = { QB: 3, RB: 6, WR: 6, TE: 2, K: 1 };

async function _mdFetchPool() {
    if (_mdPool) return _mdPool;
    const data = await (await fetch('/api/sleeper?path=/v1/players/nfl')).json();
    const fp = new Set(_MD_POS);
    _mdPool = Object.values(data)
        .filter(p => p && p.active && fp.has(p.position) && p.search_rank != null && p.search_rank < 100000)
        .map(p => ({ id: p.player_id, name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                     pos: p.position, team: p.team || 'FA', rank: p.search_rank, exp: p.years_exp }))
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    _mdPool.forEach((p, i) => { p.adp = i + 1; });  // dense ADP (search_rank has ties)
    _mdAssignTiers(_mdPool);
    await _vbdLoad();
    _mdPool.forEach(p => { p._fp = _vbd.map[_vbdKey(p.name, p.pos)] || null; });
    return _mdPool;
}

// ── Tiers: per-position, gap-based (Boris-Chen-style) ─────────
function _mdAssignTiers(pool) {
    const byPos = {};
    pool.forEach(p => { (byPos[p.pos] = byPos[p.pos] || []).push(p); });
    Object.values(byPos).forEach(list => {
        list.sort((a, b) => a.adp - b.adp);
        let tier = 1;
        list.forEach((p, i) => {
            if (i > 0) {
                const gap = p.adp - list[i - 1].adp;
                const thresh = 5 + Math.floor(list[i - 1].adp / 14); // bigger gaps are normal later
                if (gap > thresh) tier++;
            }
            p.tier = tier;
        });
    });
}

// ── Format-aware value (we only have ADP, so this is a documented heuristic) ──
function _mdPosMult(pos) {
    const s = _md ? _md.scoring : 'PPR';
    const sf = _md ? _md.superflex : false;
    let m = 1;
    if (sf && pos === 'QB') m *= 1.7;                       // Superflex spikes QB value
    if (pos === 'WR' || pos === 'TE') m *= (s === 'PPR' ? 1.08 : s === 'Half-PPR' ? 1.04 : 0.95);
    if (pos === 'RB') m *= (s === 'Standard' ? 1.06 : s === 'Half-PPR' ? 1.0 : 0.97);
    return m;
}
// Lower = better. Format-adjusted draft rank used by the AI + assistant (display ADP stays raw).
function _mdAdjRank(p) { return p.adp / _mdPosMult(p.pos); }

// ── Lineup-aware roster need ──────────────────────────────────
function _mdStartReq() {
    return { QB: _md.superflex ? 2 : 1, RB: 2, WR: 2, TE: 1, K: 1 };
}
function _mdNeedScore(roster, pos) {
    const have = c => roster.filter(p => p.pos === c).length;
    const start = _mdStartReq();
    if (have(pos) < (start[pos] || 0)) return 3;                 // unfilled starter
    const flexHave = _MD_FLEX.reduce((a, c) => a + Math.max(0, have(c) - (start[c] || 0)), 0);
    if (_MD_FLEX.includes(pos) && flexHave < 1) return 2;        // fills FLEX
    if (_md.superflex && pos === 'QB' && have('QB') < 2) return 2;
    if (have(pos) >= (_MD_NEED[pos] || 0)) return -1;            // bench full
    return 1;
}
function _mdTierLeft(p) {
    return _md.available.filter(a => a.pos === p.pos && a.tier === p.tier).length;
}

// ── Entry / setup ─────────────────────────────────────────────
async function loadMockDraft() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = '';
    grid.style.cssText = '';
    grid.innerHTML = `<div class="md-loading"><div class="skeleton-line" style="height:40px;width:60%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Loading player pool…</p></div>`;
    try {
        await _mdFetchPool();
    } catch (e) {
        if (typeof Logger !== 'undefined') Logger.error('Mock draft pool failed', e, 'NFL');
        grid.innerHTML = `<div class="md-empty"><p>Couldn't load the player pool. Try again.</p><button class="md-btn" onclick="loadMockDraft()">Retry</button></div>`;
        return;
    }
    _renderMockSetup(grid);
}

// ── Draft HQ strip (D-035, regrouped D-055) — one home for the fantasy
// research views. Rendered by each member view at the top of its own
// output, so routes, deep links, and .nav-tab[data-view] active-state all
// keep working. Grouped into Draft Prep (pre-draft research + the
// simulator) and In-Season (roster-management tools that only make sense
// once a season is live) — previously one flat row of 8 identical pills
// with no hierarchy; see ISSUES.md D-055 for the full rationale.
const _HQ_GROUPS = [
    { label: 'Draft Prep', tabs: [
        { v: 'nfl-draftkit', l: 'Value Board' },
        { v: 'nfl-rankings', l: 'ADP Rankings' },
        { v: 'nfl-sos',      l: 'Schedule' },
        { v: 'nfl-compare',  l: 'Compare' },
        { v: 'nfl-mock',     l: 'Mock Draft' },
        { v: 'nfl-mydrafts', l: 'My Drafts' },
    ] },
    { label: 'In-Season', tabs: [
        { v: 'nfl-trending', l: 'Trending' },
        { v: 'nfl-injuries', l: 'Injury Report' },
        { v: 'nfl-waivers',  l: 'Waiver Wire' },
    ] },
];
function _hqStrip(active) {
    const groups = _HQ_GROUPS.map(g => {
        const tabs = g.tabs.map(t =>
            `<button type="button" class="hq-tab${t.v === active ? ' hq-tab--on' : ''}"${t.v === active ? ' aria-current="page"' : ''} onclick="navigateTo('${t.v}')">${t.l}</button>`
        ).join('');
        return `<span class="hq-group-label">${g.label}</span>${tabs}`;
    }).join('');
    return `<nav class="hq-strip" aria-label="Draft HQ sections"><span class="hq-title">DRAFT HQ</span>${groups}</nav>`;
}

function _renderMockSetup(grid) {
    grid.innerHTML = _hqStrip('nfl-mock') + `
      <div class="md-wrap">
        <div class="md-setup">
          <h1 class="md-title">Mock Draft</h1>
          <p class="md-sub">Snake draft vs ADP-based AI, with a live Draft Assistant, tiers, and a full board. No account, fully resettable.</p>
          <div class="md-setup-row">
            <label>Teams<select id="mdTeams">${[8,10,12,14].map(n=>`<option value="${n}" ${n===12?'selected':''}>${n}</option>`).join('')}</select></label>
            <label>Your pick<select id="mdSlot"></select></label>
            <label>Rounds<select id="mdRounds">${[10,12,14,15,16].map(n=>`<option value="${n}" ${n===15?'selected':''}>${n}</option>`).join('')}</select></label>
            <label>Scoring<select id="mdScoring"><option>PPR</option><option>Half-PPR</option><option>Standard</option></select></label>
            <label class="md-check"><input type="checkbox" id="mdSuperflex"> Superflex (2 QB)</label>
          </div>
          <button class="md-btn md-btn--primary" id="mdStart">Start draft</button>
          <p class="md-note">${_mdPool.length} players · ADP from Sleeper</p>
        </div>
      </div>`;
    const teamsSel = grid.querySelector('#mdTeams');
    const slotSel  = grid.querySelector('#mdSlot');
    const fillSlots = () => {
        const n = +teamsSel.value;
        slotSel.innerHTML = Array.from({length:n}, (_,i)=>`<option value="${i+1}" ${i+1===Math.ceil(n/2)?'selected':''}>${i+1}</option>`).join('');
    };
    fillSlots();
    teamsSel.addEventListener('change', fillSlots);
    grid.querySelector('#mdStart').addEventListener('click', () => {
        _mdStart({
            teams:+teamsSel.value, slot:+slotSel.value, rounds:+grid.querySelector('#mdRounds').value,
            scoring: grid.querySelector('#mdScoring').value, superflex: grid.querySelector('#mdSuperflex').checked,
        });
    });
}

// ── Draft engine ──────────────────────────────────────────────
function _mdSnakeTeam(overall, teams) {
    const round = Math.floor(overall / teams);
    const inRound = overall % teams;
    return round % 2 === 0 ? inRound : teams - 1 - inRound;
}

function _mdStart(cfg) {
    _md = {
        ...cfg,
        userTeam: cfg.slot - 1,
        totalPicks: cfg.teams * cfg.rounds,
        overall: 0,
        available: _mdPool.slice(),
        picks: [],
        rosters: Array.from({ length: cfg.teams }, () => []),
        view: 'players',
        userTurnMark: 0,
    };
    _md.rep = (_vbd && _vbd.ok) ? _vbdReplacement(_md.scoring, _md.teams, _md.superflex) : null;
    _mdAdvance();
}

function _mdAiPick(teamIdx) {
    const roster = _md.rosters[teamIdx];
    const eligible = _md.available.filter(p => _mdNeedScore(roster, p.pos) >= 0);
    const pool = (eligible.length ? eligible : _md.available)
        .slice().sort((a, b) => _mdAdjRank(a) - _mdAdjRank(b)).slice(0, 8);
    const scored = pool.map((p, i) => ({ p, w: (pool.length - i) + 1.6 * Math.max(0, _mdNeedScore(roster, p.pos)) + Math.random() * 3 }));
    scored.sort((a, b) => b.w - a.w);
    return scored[0].p;
}

function _mdDraftPlayer(player) {
    const teamIdx = _mdSnakeTeam(_md.overall, _md.teams);
    _md.picks.push({ overall: _md.overall + 1, round: Math.floor(_md.overall / _md.teams) + 1, team: teamIdx, player });
    _md.rosters[teamIdx].push(player);
    _md.available = _md.available.filter(p => p.id !== player.id);
    _md.overall++;
}

function _mdAdvance() {
    while (_md.overall < _md.totalPicks) {
        const teamIdx = _mdSnakeTeam(_md.overall, _md.teams);
        if (teamIdx === _md.userTeam) { _mdRenderDraft(); return; }
        _mdDraftPlayer(_mdAiPick(teamIdx));
    }
    _mdRenderComplete();
}

function _mdUserDraft(playerId) {
    const p = _md.available.find(x => x.id === playerId);
    if (!p) return;
    _mdDraftPlayer(p);
    _md.userTurnMark = _md.picks.length; // AI picks after this point are "since your last pick"
    _mdAdvance();
}

// ── Monte Carlo: P(player still available at user's NEXT pick) ──
function _mdNextUserOverall() {
    for (let o = _md.overall + 1; o < _md.totalPicks; o++) {
        if (_mdSnakeTeam(o, _md.teams) === _md.userTeam) return o;
    }
    return -1;
}
function _mdSurvival(candidates, sims = 300) {
    const nextU = _mdNextUserOverall();
    if (nextU < 0) return {};
    const between = [];
    for (let o = _md.overall + 1; o < nextU; o++) between.push(_mdSnakeTeam(o, _md.teams));
    const counts = {}; candidates.forEach(c => counts[c.id] = 0);
    for (let s = 0; s < sims; s++) {
        const avail = _md.available.slice();
        const rost = _md.rosters.map(r => r.slice());
        for (const t of between) {
            const elig = avail.filter(p => _mdNeedScore(rost[t], p.pos) >= 0);
            const pool = (elig.length ? elig : avail).slice().sort((a, b) => _mdAdjRank(a) - _mdAdjRank(b)).slice(0, 8);
            if (!pool.length) break;
            const scored = pool.map((p, i) => ({ p, w: (pool.length - i) + Math.random() * 3 }));
            scored.sort((a, b) => b.w - a.w);
            const taken = scored[0].p;
            rost[t].push(taken);
            const idx = avail.findIndex(p => p.id === taken.id);
            if (idx >= 0) avail.splice(idx, 1);
        }
        const left = new Set(avail.map(p => p.id));
        candidates.forEach(c => { if (left.has(c.id)) counts[c.id]++; });
    }
    const out = {}; candidates.forEach(c => out[c.id] = Math.round(counts[c.id] / sims * 100));
    return out;
}

// ── Draft Assistant: the recommended pick + why ───────────────
function _mdRecommend(surv) {
    const roster = _md.rosters[_md.userTeam];
    const cands = _md.available.slice().sort((a, b) => _mdAdjRank(a) - _mdAdjRank(b)).slice(0, 24);
    const scored = cands.map(p => {
        const need = _mdNeedScore(roster, p.pos);
        if (need < 0) return null;
        const valueVsPick = (_md.overall + 1) - p.adp;     // + = sliding past ADP (value)
        const sv = surv[p.id];
        const tierLeft = _mdTierLeft(p);
        const vorp = _mdVorp(p);
        let score = 0;
        score += -_mdAdjRank(p) * 0.04;                    // raw quality
        // Implied VORP is market-derived (ADP neighbors), so half weight — it keeps
        // rookies from being invisibly penalized without double-counting ADP as "edge"
        if (vorp != null) score += vorp * (p._fp ? 0.06 : 0.03);
        score += need * 4;                                 // roster need
        score += Math.max(0, valueVsPick) * 0.45;          // value falling to you
        if (sv != null) score += (100 - sv) * 0.045;       // scarcity (won't last)
        if (tierLeft <= 2) score += (3 - tierLeft) * 2.5;  // tier-cliff urgency
        return { p, score, need, sv, tierLeft, valueVsPick, vorp, vorpImp: vorp != null && !p._fp };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return scored[0] || null;
}

function _mdRecReason(rec) {
    if (!rec) return '';
    const r = [];
    const startReq = _mdStartReq();
    const have = _md.rosters[_md.userTeam].filter(p => p.pos === rec.p.pos).length;
    if (rec.need >= 3) r.push(`fills your ${rec.p.pos}${(startReq[rec.p.pos]||1) > 1 ? (have + 1) : ''} starter`);
    else if (rec.need === 2) r.push(`fills your FLEX`);
    if (rec.sv != null && rec.sv <= 45) r.push(`only ${rec.sv}% to return at your next pick`);
    if (rec.tierLeft <= 2) r.push(rec.tierLeft <= 1 ? `last in the ${rec.p.pos} tier` : `only ${rec.tierLeft} left in this ${rec.p.pos} tier`);
    if (rec.valueVsPick >= 6) r.push(`slipping ${rec.valueVsPick} spots past ADP`);
    if (rec.vorp != null && rec.vorp >= 12) r.unshift(rec.vorpImp ? `~+${rec.vorp} pts over replacement (market est)` : `+${rec.vorp} pts over replacement`);
    if (!r.length) r.push(`best value on the board`);
    return r.slice(0, 3).join(' · ');
}

// ── Render: live draft ────────────────────────────────────────
function _mdRenderDraft() {
    const grid = document.getElementById('playersGrid');
    const round = Math.floor(_md.overall / _md.teams) + 1;
    const userRoster = _md.rosters[_md.userTeam];
    const top = _md.available.slice(0, 60);
    const surv = _mdSurvival(_md.available.slice(0, 16));
    const rec = _mdRecommend(surv);
    _md._recId = rec ? rec.p.id : null;

    // "Since your last pick" recap — the AI picks between turns resolve instantly with
    // no animation (nobody wants to sit through 22 fake picks), so this is the substitute
    // for watching the draft happen. Absent entirely when there's nothing to recap (your
    // very first turn, picking 1st overall) — no empty state, per the arsenal-plot precedent.
    const sinceLast = _md.picks.slice(_md.userTurnMark || 0);
    const recapHtml = sinceLast.length ? `
        <div class="md-recap">
          <div class="md-recap-title">Since your last pick</div>
          <div class="md-recap-list">${sinceLast.slice().reverse().map(pk => `
            <span class="md-recap-item"><b style="color:${_MD_POS_COLOR[pk.player.pos]||'var(--text-muted)'}">${pk.player.pos}</b> ${_escFan(pk.player.name)} <span class="md-recap-team">${pk.team===_md.userTeam?'You':'T'+(pk.team+1)} · R${pk.round}</span></span>`).join('')}</div>
        </div>` : '';

    const recBanner = rec ? `
        <div class="md-rec" data-pid="${rec.p.id}" role="button" tabindex="0">
            <div class="md-rec-tag">★ Recommended</div>
            <div class="md-rec-body">
                <span class="md-rec-pos" style="color:${_MD_POS_COLOR[rec.p.pos]}">${rec.p.pos}</span>
                <strong>${_escFan(rec.p.name)}</strong> <span class="md-rl-team">${rec.p.team}</span>
                <span class="md-rec-why">${_escFan(_mdRecReason(rec))}</span>
            </div>
            <button class="md-btn md-btn--primary md-rec-draft" data-pid="${rec.p.id}">Draft</button>
        </div>` : '';

    grid.innerHTML = `
      <div class="md-wrap md-draft">
        <div class="md-draft-head">
          <div><span class="md-onclock">On the clock — YOU</span><span class="md-pickno">Round ${round} · Pick ${_md.overall + 1} of ${_md.totalPicks}${_md.superflex?' · Superflex':''} · ${_escFan(_md.scoring)}</span></div>
          <div class="md-head-actions">
            <div class="md-viewtoggle">
              <button class="md-vt ${_md.view==='players'?'md-vt--on':''}" data-view="players">Players</button>
              <button class="md-vt ${_md.view==='board'?'md-vt--on':''}" data-view="board">Board</button>
            </div>
            <button class="md-btn md-btn--ghost" onclick="loadMockDraft()">Reset</button>
          </div>
        </div>
        ${recapHtml}
        ${recBanner}
        <div class="md-draft-grid">
          <div class="md-available">
            ${_md.view === 'board' ? _mdBoardHtml() : `
            <div class="md-avail-controls">
              <input id="mdSearch" class="md-search" placeholder="Search players…" autocomplete="off">
              <div class="md-pos-filters">${['ALL',..._MD_POS].map(p=>`<button class="md-pos-btn ${p==='ALL'?'md-pos-btn--on':''}" data-pos="${p}">${p}</button>`).join('')}</div>
            </div>
            <div class="md-legend"><span><b>%</b> chance still on the board at your next pick</span><span><b>VORP</b> projected points over replacement</span></div>
            <div class="md-list" id="mdList">${_mdListHtml(top, surv)}</div>`}
          </div>
          <aside class="md-roster">
            <h3>Your roster</h3>
            ${_MD_POS.map(pos => { const c = userRoster.filter(p=>p.pos===pos).length; return `<div class="md-need"><span style="color:${_MD_POS_COLOR[pos]}">${pos}</span><span>${c}</span></div>`; }).join('')}
            <div class="md-roster-list">${userRoster.map(p=>`<div class="md-rl-row"><span class="md-rl-pos" style="color:${_MD_POS_COLOR[p.pos]}">${p.pos}</span> ${_escFan(p.name)} <span class="md-rl-team">${p.team}</span></div>`).join('') || '<p class="md-note">No picks yet</p>'}</div>
          </aside>
        </div>
      </div>`;

    // view toggle
    grid.querySelectorAll('.md-vt').forEach(b => b.addEventListener('click', () => { _md.view = b.dataset.view; _mdRenderDraft(); }));
    // recommended banner → draft
    grid.querySelectorAll('.md-rec, .md-rec-draft').forEach(el => el.addEventListener('click', e => {
        e.stopPropagation(); const pid = (e.currentTarget.dataset.pid) || (rec && rec.p.id); if (pid) _mdUserDraft(pid);
    }));

    if (_md.view !== 'board') {
        const list = grid.querySelector('#mdList');
        grid.querySelector('#mdSearch').addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            const pos = grid.querySelector('.md-pos-btn--on')?.dataset.pos || 'ALL';
            const filtered = _md.available.filter(p => (pos==='ALL'||p.pos===pos) && p.name.toLowerCase().includes(q)).slice(0,60);
            list.innerHTML = _mdListHtml(filtered, surv);
        });
        grid.querySelectorAll('.md-pos-btn').forEach(b => b.addEventListener('click', () => {
            grid.querySelectorAll('.md-pos-btn').forEach(x=>x.classList.remove('md-pos-btn--on'));
            b.classList.add('md-pos-btn--on');
            const q = grid.querySelector('#mdSearch').value.toLowerCase();
            const filtered = _md.available.filter(p => (b.dataset.pos==='ALL'||p.pos===b.dataset.pos) && p.name.toLowerCase().includes(q)).slice(0,60);
            list.innerHTML = _mdListHtml(filtered, surv);
        }));
        list.addEventListener('click', e => { const row = e.target.closest('[data-pid]'); if (row) _mdUserDraft(row.dataset.pid); });
    }
}

function _mdListHtml(players, surv) {
    return players.map(p => {
        const s = surv[p.id];
        const sv = s != null ? `<span class="md-surv ${s<35?'md-surv--low':s>70?'md-surv--high':''}" title="Monte Carlo: chance still available at your next pick">${s}%</span>` : '';
        const tierLeft = _mdTierLeft(p);
        const cliff = tierLeft <= 2 ? `<span class="md-cliff" title="Players left in this position tier">T${p.tier} · ${tierLeft} left</span>` : `<span class="md-tier">T${p.tier}</span>`;
        const isRec = p.id === _md._recId ? ' md-row--rec' : '';
        return `<button class="md-row${isRec}" data-pid="${p.id}">
            <span class="md-row-pos" style="color:${_MD_POS_COLOR[p.pos]||'var(--text-muted)'}">${p.pos}</span>
            <span class="md-row-name">${p.id===_md._recId?'★ ':''}${_escFan(p.name)}</span>
            <span class="md-row-team">${p.team}${_nflVenueBadge(p.team)}</span>
            ${cliff}
            ${(()=>{const v=_mdVorp(p);if(v==null)return '<span class="md-row-vorp"></span>';const imp=_mdVorpIsImplied(p);return `<span class="md-row-vorp${imp?' dk-val--est':''}" style="color:${v>0&&!imp?'var(--color-win)':'var(--text-subtle)'}" title="${imp?'Market-implied VORP — no prior-season production, priced from ADP neighbors':'Projected points over positional replacement (VORP) — trained rest-of-season model'}">${imp?'~':''}${v>0?'+':''}${v}</span>`;})()}
            <span class="md-row-adp">ADP ${p.adp}</span>${sv}
        </button>`;
    }).join('') || '<p class="md-note" style="padding:1rem">No players match.</p>';
}

// ── Full draft board (all teams × rounds, snake) ──────────────
function _mdBoardHtml() {
    const teams = _md.teams, rounds = _md.rounds;
    const cell = {};
    _md.picks.forEach(pk => { cell[`${pk.round}-${pk.team}`] = pk.player; });
    const head = `<div class="md-bd-row md-bd-head"><div class="md-bd-rd">R</div>${
        Array.from({length:teams},(_,t)=>`<div class="md-bd-cell md-bd-th ${t===_md.userTeam?'md-bd-me':''}">${t===_md.userTeam?'You':'T'+(t+1)}</div>`).join('')}</div>`;
    const rows = Array.from({length:rounds},(_,r)=>{
        const rd = r+1;
        const cells = Array.from({length:teams},(_,t)=>{
            const p = cell[`${rd}-${t}`];
            const onClock = (p == null && _mdSnakeTeam((rd-1)*teams + (rd%2===1?t:teams-1-t), teams) === t); // best-effort
            if (!p) return `<div class="md-bd-cell md-bd-empty ${t===_md.userTeam?'md-bd-me':''}"></div>`;
            return `<div class="md-bd-cell ${t===_md.userTeam?'md-bd-me':''}" style="border-left:3px solid ${_MD_POS_COLOR[p.pos]||'var(--border-mid)'}" title="${_escFan(p.name)}">
                <span class="md-bd-pos" style="color:${_MD_POS_COLOR[p.pos]}">${p.pos}</span><span class="md-bd-name">${_escFan(p.name.split(' ').slice(-1)[0])}</span></div>`;
        }).join('');
        return `<div class="md-bd-row"><div class="md-bd-rd">${rd}</div>${cells}</div>`;
    }).join('');
    return `<div class="md-board"><div class="md-board-scroll">${head}${rows}</div></div>`;
}

// ── Render: complete + deep analysis ──────────────────────────
function _mdTeamValue(roster) {
    // crude projected value: sum of (poolSize - adjRank) so better players score higher
    return roster.reduce((a, p) => a + Math.max(0, 300 - _mdAdjRank(p)), 0);
}
// D-064: file-scope so both the live complete screen and the saved-draft replay
// screen (_mdRenderReplay) can share it — was a local closure inside _mdRenderComplete.
function _mdOrd(n) { return (n%10===1&&n%100!==11)?'st':(n%10===2&&n%100!==12)?'nd':(n%10===3&&n%100!==13)?'rd':'th'; }

function _mdRenderComplete() {
    const grid = document.getElementById('playersGrid');
    const roster = _md.rosters[_md.userTeam];
    const userPicks = _md.picks.filter(pk => pk.team === _md.userTeam);
    const totalValue = userPicks.reduce((a, pk) => a + (pk.overall - pk.player.adp), 0);
    const avg = userPicks.length ? totalValue / userPicks.length : 0;
    const grade = avg > 8 ? 'A+' : avg > 4 ? 'A' : avg > 1 ? 'B+' : avg > -1 ? 'B' : avg > -4 ? 'C' : 'D';

    // projected finish: rank all teams by total roster value
    const teamVals = _md.rosters.map((r, i) => ({ i, v: _mdTeamValue(r) })).sort((a, b) => b.v - a.v);
    const finish = teamVals.findIndex(t => t.i === _md.userTeam) + 1;
    const ord = _mdOrd;

    // positional rank vs league
    const posRank = {};
    _MD_POS.forEach(pos => {
        const vals = _md.rosters.map((r, i) => ({ i, v: r.filter(p=>p.pos===pos).reduce((a,p)=>a+Math.max(0,300-_mdAdjRank(p)),0) })).sort((a,b)=>b.v-a.v);
        posRank[pos] = vals.findIndex(t => t.i === _md.userTeam) + 1;
    });

    // best value / biggest reach
    const sortedByVal = userPicks.slice().sort((a,b)=>(b.overall-b.player.adp)-(a.overall-a.player.adp));
    const bestVal = sortedByVal[0], reach = sortedByVal[sortedByVal.length-1];

    // starter check
    const start = _mdStartReq();
    const unfilled = _MD_POS.filter(pos => roster.filter(p=>p.pos===pos).length < (start[pos]||0));
    _md.summary = { grade, finish, avg, posRank, bestVal, reach, unfilled };

    grid.innerHTML = `
      <div class="md-wrap md-complete">
        <h1 class="md-title">Draft complete</h1>
        <div class="md-grade-card">
          <div class="md-grade">${grade}</div>
          <div class="md-grade-meta">
            <strong>Projected finish: ${finish}${ord(finish)} of ${_md.teams}</strong>
            <span class="md-note">Avg value vs ADP: ${avg>=0?'+':''}${avg.toFixed(1)} picks ${avg>=0?'(value)':'(reaches)'}</span>
          </div>
        </div>

        <div class="md-analysis">
          <div class="md-an-card">
            <h3>Positional strength <span class="md-note">(rank in league)</span></h3>
            <div class="md-an-pos">${_MD_POS.map(pos=>`<div class="md-an-prow"><span style="color:${_MD_POS_COLOR[pos]}">${pos}</span><span class="md-an-rank">${posRank[pos]}${ord(posRank[pos])}</span></div>`).join('')}</div>
          </div>
          <div class="md-an-card">
            <h3>Draft highlights</h3>
            ${bestVal?`<p class="md-an-line"><span class="md-an-tag md-an-tag--good">Best value</span> ${_escFan(bestVal.player.name)} — pick ${bestVal.overall} vs ADP ${bestVal.player.adp}</p>`:''}
            ${reach && reach!==bestVal?`<p class="md-an-line"><span class="md-an-tag md-an-tag--bad">Biggest reach</span> ${_escFan(reach.player.name)} — pick ${reach.overall} vs ADP ${reach.player.adp}</p>`:''}
            <p class="md-an-line">${unfilled.length?`<span class="md-an-tag md-an-tag--bad">Lineup gap</span> Missing starter${unfilled.length>1?'s':''}: ${unfilled.join(', ')}`:`<span class="md-an-tag md-an-tag--good">Lineup</span> All starters filled`}</p>
          </div>
        </div>

        <div class="md-final-roster">
          ${_MD_POS.map(pos => { const ps = roster.filter(p=>p.pos===pos); return ps.length?`<div class="md-fr-group"><div class="md-fr-pos" style="color:${_MD_POS_COLOR[pos]}">${pos}</div>${ps.map(p=>`<div class="md-fr-row">${_escFan(p.name)} <span class="md-rl-team">${p.team}</span> <span class="md-row-adp">ADP ${p.adp}</span></div>`).join('')}</div>`:''; }).join('')}
        </div>
        <div class="md-head-actions" style="justify-content:center">
          <button class="md-btn md-btn--primary" onclick="shareMyDraft(this)">Share your draft</button>
          <button class="md-btn md-btn--ghost" id="mdViewBoard">View full board</button>
          <button class="md-btn md-btn--ghost" onclick="loadMockDraft()">New draft</button>
        </div>
        <p class="md-note" id="mdSaveStatus" style="margin-top:0.6rem;text-align:center">${
            (typeof AuthState !== 'undefined' && AuthState.status === 'signed-in')
                ? '<span class="md-an-tag md-an-tag--good">Saving…</span>'
                : 'Sign in to save this draft and come back to it later — <button class="md-btn md-btn--ghost" style="padding:0.1rem 0.5rem;font-size:0.75rem" onclick="openAuthSheet({type:\'save_draft\'})">sign in</button>'
        }</p>
        <div id="mdCompleteBoard"></div>
      </div>`;
    const vb = grid.querySelector('#mdViewBoard');
    if (vb) vb.addEventListener('click', () => {
        const host = grid.querySelector('#mdCompleteBoard');
        host.innerHTML = host.innerHTML ? '' : _mdBoardHtml();
    });

    // D-064: silent auto-save when already signed in. The signed-out case instead
    // shows the inline "sign in" prompt above, which replays this same save via
    // auth.js's {type:'save_draft'} sign-in intent once sign-in completes -- _md is
    // still in memory at that point (the sign-in sheet is a modal overlay, not a
    // navigation), so nothing about the just-finished draft is lost.
    if (typeof AuthState !== 'undefined' && AuthState.status === 'signed-in' && typeof _mdSaveDraft === 'function') {
        _mdSaveDraft();
    }
}

function _escFan(s) { return typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s); }

// ============================================================
// Draft History (D-064) — save a finished Mock Draft for signed-in users, list +
// replay it later. Trimmed storage shape only: the user's own picks + config + the
// summary _mdRenderComplete() already computes, never the full multi-team board or
// player-pool/VBD debug data (see ISSUES.md D-064, Axiom's feasibility note).
// ============================================================
let _mdSavedDrafts = [];

function _mdTrimPick(pk) {
    if (!pk) return null;
    return { overall: pk.overall, name: pk.player.name, pos: pk.player.pos, team: pk.player.team, adp: pk.player.adp };
}

function _mdSaveableResult() {
    const roster = _md.rosters[_md.userTeam];
    const s = _md.summary;
    return {
        config: { teams: _md.teams, rounds: _md.rounds, scoring: _md.scoring, superflex: _md.superflex, slot: _md.slot },
        grade: s.grade,
        finish: s.finish,
        avg: +s.avg.toFixed(2),
        posRank: s.posRank,
        bestVal: _mdTrimPick(s.bestVal),
        reach: s.reach !== s.bestVal ? _mdTrimPick(s.reach) : null,
        unfilled: s.unfilled,
        roster: roster.map(p => ({ name: p.name, pos: p.pos, team: p.team, adp: p.adp })),
    };
}

async function _mdSaveDraft() {
    if (typeof AuthState === 'undefined' || AuthState.status !== 'signed-in' || !_md || !_md.summary) return;
    const statusEl = document.getElementById('mdSaveStatus');
    try {
        const res = await fetch('/api/draftHistory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(_mdSaveableResult()),
        });
        if (!res.ok) throw new Error('save_failed');
        if (statusEl) statusEl.innerHTML = '<span class="md-an-tag md-an-tag--good">Saved to My Drafts</span>';
    } catch (e) {
        if (typeof Logger !== 'undefined') Logger.warn('Draft save failed', e, 'NFL');
        if (statusEl) statusEl.innerHTML = '<span class="md-an-tag md-an-tag--bad">Couldn\'t save</span> — your share card above still works';
    }
}

function _mdFmtDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadNFLMyDrafts() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = ''; grid.style.cssText = '';
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('nfl-mydrafts', null);

    if (typeof AuthState === 'undefined' || AuthState.status !== 'signed-in') {
        grid.innerHTML = _hqStrip('nfl-mydrafts') + `
          <div class="md-wrap">
            <div class="md-empty">
              <h2 class="md-title" style="font-size:1.4rem">My Drafts</h2>
              <p class="md-sub">Sign in to save every Mock Draft you run and come back to it later — nothing else on this page ever requires an account.</p>
              <button class="md-btn md-btn--primary" onclick="openAuthSheet({type:'reload_view', view:'nfl-mydrafts'})">Sign in</button>
            </div>
          </div>`;
        return;
    }

    grid.innerHTML = _hqStrip('nfl-mydrafts') + `<div class="md-wrap"><div class="md-loading">
        <div class="skeleton-line" style="height:32px;width:40%;margin:0 auto 1.5rem"></div>
        <div class="skeleton-line" style="height:64px;margin:0.6rem 0"></div>
        <div class="skeleton-line" style="height:64px;margin:0.6rem 0"></div>
        <div class="skeleton-line" style="height:64px;margin:0.6rem 0"></div>
    </div></div>`;

    try {
        const res = await fetch('/api/draftHistory', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('fetch_failed');
        const { drafts } = await res.json();
        _renderMyDraftsList(grid, drafts || []);
    } catch (e) {
        if (typeof Logger !== 'undefined') Logger.warn('Draft history fetch failed', e, 'NFL');
        grid.innerHTML = _hqStrip('nfl-mydrafts') + `<div class="md-wrap"><div class="md-empty"><p>Couldn't load your saved drafts. Try again.</p><button class="md-btn" onclick="loadNFLMyDrafts()">Retry</button></div></div>`;
    }
}

function _renderMyDraftsList(grid, drafts) {
    _mdSavedDrafts = drafts;
    grid.innerHTML = _hqStrip('nfl-mydrafts') + `
      <div class="md-wrap">
        <h1 class="md-title" style="font-size:1.5rem;text-align:center;margin-bottom:0.25rem">My Drafts</h1>
        <p class="md-sub" style="text-align:center;margin-bottom:1.5rem">Saved automatically each time you finish a Mock Draft.</p>
        ${!drafts.length
            ? `<div class="md-empty"><p>No saved drafts yet.</p><button class="md-btn md-btn--primary" onclick="navigateTo('nfl-mock')">Start a Mock Draft</button></div>`
            : `<div style="display:flex;flex-direction:column;gap:0.6rem;max-width:640px;margin:0 auto">
                ${drafts.map((d, i) => `
                  <div class="md-an-card" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;cursor:pointer" onclick="_mdOpenSavedDraft(${i})">
                    <div>
                      <strong>${d.config.teams}-team ${_escFan(d.config.scoring)}${d.config.superflex ? ' · Superflex' : ''}</strong>
                      <div class="md-note">${_mdFmtDate(d.created_at)} · Finished ${d.finish}${_mdOrd(d.finish)} of ${d.config.teams}</div>
                    </div>
                    <div class="md-grade md-grade--sm">${_escFan(d.grade)}</div>
                  </div>`).join('')}
              </div>`}
      </div>`;
}

function _mdOpenSavedDraft(i) {
    const d = _mdSavedDrafts[i];
    if (!d) return;
    _mdRenderReplay(d);
}

// Read-only replay of a saved draft's complete screen. Deliberately reuses
// _mdRenderComplete()'s own markup pieces (Kael's spec, ISSUES.md D-064) so a past
// draft looks like the same screen, not a lesser one. No "View full board" or share
// button here -- neither the full multi-team board nor the live _md share flow is
// part of what got saved (explicit v1 scope cut, ISSUES.md D-064).
function _mdRenderReplay(d) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.innerHTML = _hqStrip('nfl-mydrafts') + `
      <div class="md-wrap md-complete">
        <div style="text-align:left;margin-bottom:1rem"><button class="md-btn md-btn--ghost" onclick="loadNFLMyDrafts()">← Back to My Drafts</button></div>
        <h1 class="md-title">${d.config.teams}-team ${_escFan(d.config.scoring)}${d.config.superflex ? ' · Superflex' : ''}</h1>
        <p class="md-note">${_mdFmtDate(d.created_at)}</p>
        <div class="md-grade-card">
          <div class="md-grade">${_escFan(d.grade)}</div>
          <div class="md-grade-meta">
            <strong>Projected finish: ${d.finish}${_mdOrd(d.finish)} of ${d.config.teams}</strong>
            <span class="md-note">Avg value vs ADP: ${d.avg>=0?'+':''}${d.avg} picks ${d.avg>=0?'(value)':'(reaches)'}</span>
          </div>
        </div>

        <div class="md-analysis">
          <div class="md-an-card">
            <h3>Positional strength <span class="md-note">(rank in league)</span></h3>
            <div class="md-an-pos">${_MD_POS.map(pos=>`<div class="md-an-prow"><span style="color:${_MD_POS_COLOR[pos]}">${pos}</span><span class="md-an-rank">${d.posRank[pos]}${_mdOrd(d.posRank[pos])}</span></div>`).join('')}</div>
          </div>
          <div class="md-an-card">
            <h3>Draft highlights</h3>
            ${d.bestVal?`<p class="md-an-line"><span class="md-an-tag md-an-tag--good">Best value</span> ${_escFan(d.bestVal.name)} — pick ${d.bestVal.overall} vs ADP ${d.bestVal.adp}</p>`:''}
            ${d.reach?`<p class="md-an-line"><span class="md-an-tag md-an-tag--bad">Biggest reach</span> ${_escFan(d.reach.name)} — pick ${d.reach.overall} vs ADP ${d.reach.adp}</p>`:''}
            <p class="md-an-line">${d.unfilled.length?`<span class="md-an-tag md-an-tag--bad">Lineup gap</span> Missing starter${d.unfilled.length>1?'s':''}: ${d.unfilled.join(', ')}`:`<span class="md-an-tag md-an-tag--good">Lineup</span> All starters filled`}</p>
          </div>
        </div>

        <div class="md-final-roster">
          ${_MD_POS.map(pos => { const ps = d.roster.filter(p=>p.pos===pos); return ps.length?`<div class="md-fr-group"><div class="md-fr-pos" style="color:${_MD_POS_COLOR[pos]}">${pos}</div>${ps.map(p=>`<div class="md-fr-row">${_escFan(p.name)} <span class="md-rl-team">${p.team}</span> <span class="md-row-adp">ADP ${p.adp}</span></div>`).join('')}</div>`:''; }).join('')}
        </div>
      </div>`;
}

// ============================================================
// Draft Kit — value rankings, tiers, sleepers/traps, cheat sheet (D-028)
// Reuses the value engine + the Sleeper ADP pool. Standalone view (nfl-draftkit).
// ============================================================
let _dk = { scoring: 'PPR', superflex: false, teams: 12, pos: 'ALL' };

async function loadDraftKit() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = ''; grid.style.cssText = '';
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('nfl-draftkit', null);
    grid.innerHTML = `<div class="md-loading"><div class="skeleton-line" style="height:40px;width:55%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Building value board…</p></div>`;
    try { await _mdFetchPool(); } catch (e) {
        grid.innerHTML = `<div class="md-empty"><p>Couldn't load the value board. Try again.</p><button class="md-btn" onclick="loadDraftKit()">Retry</button></div>`;
        return;
    }
    _dkRender();
}

function _dkBuild() {
    const rep = (_vbd && _vbd.ok) ? _vbdReplacement(_dk.scoring, _dk.teams, _dk.superflex) : null;
    const rows = (_mdPool || []).map(p => {
        const proj = p._fp ? _vbdProj(p._fp, _dk.scoring) : null;
        const imp = (proj == null && rep) ? _vbdImplied(p, _dk.scoring) : null;
        const eff = proj != null ? proj : imp;
        const vorp = (eff != null && rep) ? Math.round(eff - (rep[p.pos] || 0)) : null;
        return { id: p.id, name: p.name, pos: p.pos, team: p.team, adp: p.adp, tier: p.tier,
                 proj: eff != null ? Math.round(eff) : null, vorp, imp: proj == null && imp != null };
    });
    const valued = rows.filter(r => r.vorp != null).sort((a, b) => b.vorp - a.vorp);
    valued.forEach((r, i) => { r.valRank = i + 1; });
    const unvalued = rows.filter(r => r.vorp == null).sort((a, b) => a.adp - b.adp);
    return { valued, unvalued, all: valued.concat(unvalued) };
}

function _dkRender() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = ''; grid.style.cssText = '';
    const { valued, all } = _dkBuild();
    const ok = _vbd && _vbd.ok;
    const season = (_vbd && _vbd.season) || '';

    // sleepers = ADP later than value (gap +), traps = ADP earlier than value (gap -)
    // Implied (market-priced) rows are excluded: their value ≈ ADP by construction,
    // so a sleeper/trap signal from them would be circular.
    const pool = valued.filter(r => r.adp <= 180 && !r.imp);
    // Rank within the draftable pool, not the full 600-player model — global
    // value ranks made gap chips read as noise ("-927") (D-038).
    const _poolRank = new Map(pool.slice().sort((a, b) => b.vorp - a.vorp).map((r, i) => [r.id, i + 1]));
    const gap = r => r.adp - _poolRank.get(r.id);
    const sleepers = pool.slice().sort((a, b) => gap(b) - gap(a)).slice(0, 6);
    const traps    = pool.slice().sort((a, b) => gap(a) - gap(b)).slice(0, 6);

    const chip = f => `<button class="md-pos-btn ${f === _dk.pos ? 'md-pos-btn--on' : ''}" data-dkpos="${f}">${f}</button>`;
    const board = (_dk.pos === 'ALL' ? all : all.filter(r => r.pos === _dk.pos)).slice(0, 200);

    const card = (r, kind) => `<button class="dk-st-card" onclick="navigateTo('nfl-player-${r.id}')">
        <span class="dk-st-pos" style="color:${_MD_POS_COLOR[r.pos] || 'var(--text-muted)'}">${r.pos}</span>
        <span class="dk-st-name">${_escFan(r.name)}</span>
        <span class="dk-st-gap ${kind}">${kind === 'sleep' ? '+' : ''}${gap(r)}</span>
        <span class="dk-st-sub">ADP ${r.adp} · Val #${_poolRank.get(r.id)} of ${pool.length}</span>
    </button>`;

    grid.innerHTML = _hqStrip('nfl-draftkit') + `
      <div class="dk-wrap">
        <div class="dk-head">
          <div><h1 class="md-title" style="margin:0">Draft Kit</h1>
          <p class="md-note">Value over replacement from ${ok ? season + ' production' : 'ADP'} · rookies &amp; no-data players market-priced from ADP (<span class="dk-est">est</span>) · ADP from Sleeper${ok ? '' : ' · (production data unavailable — showing ADP)'}</p></div>
          <button class="md-btn md-btn--ghost" onclick="window.print()">Print cheat sheet</button>
        </div>
        <div class="dk-controls">
          <label>Scoring<select id="dkScoring">${['PPR','Half-PPR','Standard'].map(s=>`<option ${s===_dk.scoring?'selected':''}>${s}</option>`).join('')}</select></label>
          <label>Teams<select id="dkTeams">${[8,10,12,14].map(n=>`<option ${n===_dk.teams?'selected':''}>${n}</option>`).join('')}</select></label>
          <label class="md-check"><input type="checkbox" id="dkSF" ${_dk.superflex?'checked':''}> Superflex</label>
          <div class="md-pos-filters" style="margin-left:auto">${['ALL','QB','RB','WR','TE'].map(chip).join('')}</div>
        </div>

        ${ok ? `<div class="dk-st-grid">
          <section class="dk-st"><h3 class="team-section__title">Sleepers <span class="team-section__count">value &gt; ADP</span></h3>${sleepers.map(r=>card(r,'sleep')).join('')||'<p class="md-note">—</p>'}</section>
          <section class="dk-st"><h3 class="team-section__title">Traps <span class="team-section__count">ADP &gt; value</span></h3>${traps.map(r=>card(r,'trap')).join('')||'<p class="md-note">—</p>'}</section>
        </div>` : ''}

        <section class="dk-board-sec">
          <h3 class="team-section__title">Value Rankings <span class="team-section__count">${_dk.scoring}${_dk.superflex?' · SF':''}</span></h3>
          <div class="dk-board">
            <div class="dk-row dk-row--head"><span class="dk-c-rk">#</span><span class="dk-c-pos">POS</span><span class="dk-c-name">Player</span><span class="dk-c-team">TM</span><span class="dk-c-tier">TIER</span><span class="dk-c-num">PROJ</span><span class="dk-c-num">VORP</span><span class="dk-c-num">ADP</span></div>
            ${board.map((r,i)=>`<div class="dk-row" onclick="navigateTo('nfl-player-${r.id}')">
              <span class="dk-c-rk">${i+1}</span>
              <span class="dk-c-pos" style="color:${_MD_POS_COLOR[r.pos]||'var(--text-muted)'}">${r.pos}</span>
              <span class="dk-c-name">${_escFan(r.name)}${r.imp?' <span class="dk-est" title="No prior-season production — market-priced from ADP neighbors at the position">est</span>':''}</span>
              <span class="dk-c-team">${r.team}${_nflVenueBadge(r.team)}</span>
              <span class="dk-c-tier">${r.tier?'T'+r.tier:'—'}</span>
              <span class="dk-c-num${r.imp?' dk-val--est':''}">${r.proj!=null?(r.imp?'~':'')+r.proj:'—'}</span>
              <span class="dk-c-num${r.imp?' dk-val--est':''}" style="color:${r.vorp!=null&&!r.imp?(r.vorp>0?'var(--color-win)':'var(--text-subtle)'):'var(--text-subtle)'};font-weight:700">${r.vorp!=null?(r.imp?'~':'')+(r.vorp>0?'+':'')+r.vorp:'—'}</span>
              <span class="dk-c-num">${r.adp}</span>
            </div>`).join('')}
          </div>
        </section>
      </div>`;

    grid.querySelector('#dkScoring').addEventListener('change', e => { _dk.scoring = e.target.value; _dkRender(); });
    grid.querySelector('#dkTeams').addEventListener('change', e => { _dk.teams = +e.target.value; _dkRender(); });
    grid.querySelector('#dkSF').addEventListener('change', e => { _dk.superflex = e.target.checked; _dkRender(); });
    grid.querySelectorAll('[data-dkpos]').forEach(b => b.addEventListener('click', () => { _dk.pos = b.dataset.dkpos; _dkRender(); }));
}

if (typeof window !== 'undefined') {
    window.loadMockDraft = loadMockDraft;
    window.loadDraftKit = loadDraftKit;
    window.loadNFLMyDrafts = loadNFLMyDrafts;
    window._mdOpenSavedDraft = _mdOpenSavedDraft;
    window._mdSaveDraft = _mdSaveDraft;
}

// ── Shareable mock-draft result card (viral loop, draft season) ──
// Reads _md + _md.summary (stashed by _mdRenderComplete). Fixed hex, theme-
// invariant (Kael P3-027). Rendered by shareCardElement() in shareCard.js.
function _mdBuildShareCard() {
    const s = _md.summary || {};
    const roster = (_md.rosters && _md.rosters[_md.userTeam]) || [];
    const BG='#0b1526', SURF='#0e1c33', BORDER='#2a3850', TEXT='#f0f4fa', MUTED='#7fa5c8', SUBTLE='#556d8f', ACCENT='#ff8100', ACCENT2='#ffd200', GOOD='#34d399', BAD='#f87171';
    const ord = n => (n%10===1&&n%100!==11)?'st':(n%10===2&&n%100!==12)?'nd':(n%10===3&&n%100!==13)?'rd':'th';
    const fmt = `${_md.teams}-team ${_escFan(_md.scoring)}${_md.superflex?' Superflex':''} · Pick ${_md.slot}`;
    const finishLine = s.finish ? `Projected finish ${s.finish}${ord(s.finish)} of ${_md.teams}` : '';
    const valLine = (s.avg!=null) ? `${s.avg>=0?'+':''}${s.avg.toFixed(1)} value vs ADP` : '';
    const rosterHtml = _MD_POS.map(pos => {
        const ps = roster.filter(p=>p.pos===pos);
        if (!ps.length) return '';
        const col = _MD_POS_COLOR[pos]||MUTED;
        const names = ps.map(p=>`<span style="color:${TEXT}">${_escFan(p.name)}</span> <span style="color:${SUBTLE};font-size:12px">${_escFan(p.team)}</span>`).join(`<span style="color:${BORDER}">  ·  </span>`);
        return `<div style="display:flex;gap:12px;padding:8px 0;border-top:1px solid ${BORDER};align-items:baseline"><span style="flex:0 0 36px;font-weight:800;font-size:13px;color:${col}">${pos}</span><span style="flex:1;font-size:14px;line-height:1.55">${names}</span></div>`;
    }).join('');
    const bv = s.bestVal;
    const bestLine = bv ? `<span style="color:${ACCENT2};font-weight:800">★ Best value</span> <span style="color:${TEXT}">${_escFan(bv.player.name)}</span> <span style="color:${MUTED}">— pick ${bv.overall} vs ADP ${bv.player.adp}</span>` : '';
    const card = document.createElement('div');
    card.className = 'shc-md-card';
    card.innerHTML = `
      <div style="padding:26px 28px 18px;background:linear-gradient(135deg,#12243f,${BG})">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
          <div><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${ACCENT};font-weight:800">My Mock Draft</div><div style="font-size:15px;color:${MUTED};margin-top:6px">${fmt}</div></div>
          ${s.grade?`<div style="flex:0 0 auto;width:72px;height:72px;border-radius:16px;background:${ACCENT};color:${BG};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800">${_escFan(s.grade)}</div>`:''}
        </div>
        ${(finishLine||valLine)?`<div style="margin-top:14px;font-size:15px;color:${TEXT};font-weight:700">${finishLine}${finishLine&&valLine?` <span style="color:${SUBTLE}">·</span> `:''}${valLine?`<span style="color:${s.avg>=0?GOOD:BAD}">${valLine}</span>`:''}</div>`:''}
      </div>
      <div style="padding:4px 28px 14px;background:${BG}">${rosterHtml}</div>
      ${bestLine?`<div style="padding:12px 28px;background:${SURF};font-size:14px;border-top:1px solid ${BORDER}">${bestLine}</div>`:''}
      <div style="padding:16px 28px;background:${SURF};border-top:1px solid ${BORDER};display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-size:19px;font-weight:800;color:${TEXT};letter-spacing:.3px">SPORT<span style="color:${ACCENT}">STRATA</span></div><div style="font-size:12px;color:${MUTED};margin-top:3px">Mock draft in 60s · no login</div></div>
        <div style="font-size:14px;color:${MUTED};font-weight:700">${typeof SITE_DOMAIN!=='undefined'?SITE_DOMAIN:location.hostname}</div>
      </div>`;
    return card;
}

function shareMyDraft(btn) {
    if (!_md || !_md.summary) return;
    const g = _md.summary.grade || '';
    shareCardElement({
        cardEl: _mdBuildShareCard(),
        fileName: `sportstrata-mock-draft${g?'-'+g.replace('+','plus'):''}.png`,
        title: 'My SportStrata mock draft',
        text: `My ${_md.teams}-team ${_md.scoring} mock draft${g?` — graded ${g}`:''}. Build yours free, no login: ${typeof SITE_DOMAIN!=='undefined'?SITE_DOMAIN:location.hostname}`,
        btn,
    });
}
if (typeof window !== 'undefined') { window.shareMyDraft = shareMyDraft; }

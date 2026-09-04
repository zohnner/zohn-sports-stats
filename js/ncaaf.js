// ============================================================
// NCAA Football (college-football) — preview surface (D-042)
// ESPN public API via same-origin /api/ncaaf Pages Function.
// Phase-1 scope: Scores landing (offseason-aware). Standings /
// Teams / Rankings are the P2 remainder — routed but not built yet.
// Season model mirrors nfl.js. No keys, no D1.
// ============================================================

const _ncaafNow = new Date();
// CFB runs late Aug → mid-Jan (CFP title game). Jan belongs to the prior year's season.
const NCAAF_SEASON = (_ncaafNow.getMonth() + 1 >= 8) ? _ncaafNow.getFullYear()
    : (_ncaafNow.getMonth() === 0 ? _ncaafNow.getFullYear() - 1 : _ncaafNow.getFullYear());

// In-season: Sep–Dec + Jan (bowls/CFP). Aug = kicking off. Feb–Jul = offseason.
function _ncaafIsOffseason() {
    const m = new Date().getMonth() + 1; // 1=Jan
    return m >= 2 && m <= 7;
}

async function espnNCAAFFetch(path, params = {}, ttl = ApiCache.TTL.SHORT) {
    const url = new URL('/api/ncaaf', location.origin);
    url.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `ncaaf:${path}:${url.searchParams.toString()}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`NCAAF → ${url.pathname}`, undefined, 'NCAAF');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(tid);
    }
    if (!res.ok) throw new Error(`NCAAF API ${res.status}: ${res.statusText}`);
    let json;
    try { json = await res.json(); } catch { throw new Error(`NCAAF API returned non-JSON (${path})`); }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

// Records + linescores mirror NFL's _nflRecordSummary/_nflLinescores (nfl.js) —
// live-confirmed 2026-08-30 that ESPN's CFB scoreboard carries the exact same
// competitor.records ([{name,type,summary}]) and competitor.linescores
// ([{value,period}]) shapes, just never parsed here before.
function _ncaafRecordSummary(competitor) {
    const recs = competitor?.records;
    if (!Array.isArray(recs) || !recs.length) return '';
    const total = recs.find(r => r.type === 'total') || recs.find(r => r.name === 'overall') || recs[0];
    return total?.summary || '';
}
function _ncaafLinescores(competitor) {
    if (!Array.isArray(competitor?.linescores)) return [];
    return competitor.linescores.map(l => Number(l.value ?? l.displayValue ?? 0) || 0);
}

async function fetchNCAAFScoreboard(opts = {}) {
    // D-135: without groups=80 (ESPN's FBS classification group id), the CFB
    // scoreboard endpoint silently caps at 25 events and skews toward ranked
    // matchups -- live-confirmed (2026-09-03): the plain "Today" default AND
    // every week-based query both returned exactly 25 events, EVERY one of
    // them involving a ranked team, while the same query plus groups=80
    // returned the real 99-event week with 74 unranked-only games. Isolated
    // groups=80 from a separately-tried limit=400 (limit alone made zero
    // difference; groups=80 alone was the whole fix) and confirmed it still
    // includes an FBS-vs-FCS crossover game (UAPB @ MIZ), so this isn't an
    // FBS-only filter that would drop real games -- just the one param that
    // was missing this entire time, on both Scores and (with it) the home
    // hero and news-adjacent surfaces that share this same fetch.
    const params = { groups: 80 };
    if (opts.seasontype) params.seasontype = opts.seasontype;
    if (opts.week)       params.week = opts.week;
    if (opts.season)     params.dates = opts.season;
    const data = await espnNCAAFFetch('/scoreboard', params, ApiCache.TTL.SHORT);
    return (data.events || []).map(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors?.find(c => c.homeAway === 'home');
        const away = comp.competitors?.find(c => c.homeAway === 'away');
        const status = comp.status;
        const stName = status?.type?.name || 'STATUS_SCHEDULED';
        const isFinal = stName.startsWith('STATUS_FINAL');
        // D-129: was `stName === 'STATUS_IN_PROGRESS' || stName === 'STATUS_HALFTIME'` --
        // live-verified 2026-09-03 against a real in-progress game (UAPB @ MIZ,
        // event 401856663) that ESPN uses other `type.name` values too during a
        // still-live game (STATUS_END_PERIOD at every quarter break, confirmed;
        // presumably STATUS_END_OF_HALF and similar too) that this enum silently
        // missed -- meaning isLive went false, and the LIVE badge/hero-eligibility/
        // situation line all dropped, for several minutes every single quarter
        // break of every NCAAF game. ESPN's own `type.state` is the canonical
        // pre/in/post classification built for exactly this and doesn't have that
        // gap (confirmed against a live 'in', a real 'post'-final, and a 'pre'-
        // scheduled game in the same check) -- strictly a superset of the old
        // match, so this can only fix missed-live cases, not un-match real ones.
        const isLive  = status?.type?.state === 'in';
        const mk = (t) => ({
            id:     t?.team?.id || '',
            abbr:   t?.team?.abbreviation || '?',
            name:   t?.team?.displayName  || '',
            logo:   t?.team?.logo || '',
            // Raw hex, no '#' -- same shape displayNCAAFTeamDetail already parses
            // off the /teams/{id} payload; live-confirmed present on scoreboard
            // competitor.team too (2026-08-30), so no separate color map needed
            // the way NFL's 32-team _NFL_TEAM_COLOR is (CFB has 130+ FBS teams).
            color:  t?.team?.color || '',
            score:  parseInt(t?.score || '0', 10),
            rank:   t?.curatedRank?.current && t.curatedRank.current <= 25 ? t.curatedRank.current : null,
            winner: t?.winner === true,
            record: _ncaafRecordSummary(t),
        });
        return {
            id: ev.id, name: ev.name, date: ev.date,
            homeTeam: mk(home), awayTeam: mk(away),
            isFinal, isLive,
            statusText: status?.type?.shortDetail || status?.type?.description || '',
            period: status?.period || 0,
            // D-043 3a: same shape as NFL's, verified live 2026-08-02.
            broadcast: comp.broadcasts?.[0]?.names?.[0] || '',
            // Quarter-by-quarter scoring for the Game Flow chart (mirrors NFL's
            // D-104) — comp.leaders (game-wide stat leaders) is confirmed ABSENT
            // from the CFB scoreboard payload (checked live against a completed
            // game), unlike NFL's, so there's no leaders row here — an honest
            // gap, not an oversight.
            linescores: { home: _ncaafLinescores(home), away: _ncaafLinescores(away) },
            // Home-hero live-detail. Live-verified 2026-09-03 (D-129) against a real
            // in-progress game (UAPB @ MIZ, event 401856663): comp.situation carries
            // the same down/yardLine/distance/possession/isRedZone/downDistanceText
            // shape NFL's does, BUT there is no raw `.text` field on it the way the
            // first-draft comment above assumed -- this line originally just passed
            // comp.situation through untouched, so `g.situation.text` (read by
            // js/app.js's _heroNCAAFLiveDetail) was always undefined and the
            // live-detail line silently never rendered since it shipped. Fixed to
            // synthesize `text` the same way NFL's fetchNFLScoreboard already does
            // (js/nfl.js) -- team abbr + shortDownDistanceText -- rather than
            // assuming ESPN provides a pre-built display string.
            situation: (() => {
                const sit = comp.situation;
                if (!isLive || !sit || typeof sit.down !== 'number' || sit.down < 1 || !sit.shortDownDistanceText) return null;
                const possAbbr = sit.possession && home?.team?.id === sit.possession ? (home?.team?.abbreviation || '')
                    : sit.possession && away?.team?.id === sit.possession ? (away?.team?.abbreviation || '')
                    : '';
                return {
                    text: possAbbr ? `${possAbbr} · ${sit.shortDownDistanceText}` : sit.shortDownDistanceText,
                    isRedZone: !!sit.isRedZone,
                };
            })(),
        };
    }).filter(Boolean);
}

// D-130: raw situation + team-id pair for the live game viewer's field
// graphic (js/ncaafLiveGame.js), mirroring js/nfl.js's fetchNFLLiveSituation
// exactly — including bypassing espnNCAAFFetch's ApiCache layer with a plain
// fetch(). This polls every 20s while a game is live; ApiCache.TTL.SHORT is
// 5 minutes, so going through the cached helper would re-serve the same
// stale situation for 5 minutes at a time instead of tracking the live play.
// Deliberately separate from fetchNCAAFScoreboard's own `situation` field
// above (D-129) — that one is a synthesized display string for the
// home-hero's plain-text line; the field viewer needs the raw numeric
// down/yardLine/distance/possession fields to draw the actual graphic.
async function fetchNCAAFLiveSituation(eventId) {
    // D-135: same groups=80 fix as fetchNCAAFScoreboard -- without it this call
    // was subject to the same ~25-event ranked-leaning cap, meaning a live game
    // between two unranked teams could fail to be found in `events` at all,
    // silently returning null and leaving the field viewer with no situation
    // data. UAPB@MIZ (this session's whole test game) happened to include a
    // ranked team (#25 MIZ) so it always appeared regardless -- an unranked-
    // vs-unranked live game would have been the one this bug actually broke,
    // and wasn't available to test against tonight.
    const r = await fetch('/api/ncaaf?path=/scoreboard&groups=80');
    if (!r.ok) return null;
    const data = await r.json();
    const ev = (data.events || []).find(e => e.id === eventId);
    const comp = ev?.competitions?.[0];
    if (!comp) return null;
    const home = comp.competitors?.find(c => c.homeAway === 'home');
    const away = comp.competitors?.find(c => c.homeAway === 'away');
    return {
        situation:  comp.situation || null,
        homeTeamId: home?.team?.id || null,
        awayTeamId: away?.team?.id || null,
    };
}

function _ncaafOffseasonState() {
    const glyph = (typeof _NFL_OFFSEASON_GLYPH === 'string') ? _NFL_OFFSEASON_GLYPH
        : '<div class="nfl-offseason-glyph" aria-hidden="true">🏈</div>';
    return `<div class="nfl-offseason">
        ${glyph}
        <h2 class="nfl-offseason-title">College football is in the offseason</h2>
        <p class="nfl-offseason-text">Live scores, conference standings, teams and the AP/CFP polls populate here when the ${NCAAF_SEASON} season kicks off in late August. This is a preview surface — full standings, teams and rankings are on the way.</p>
        <div class="nfl-offseason-actions">
            <button class="nfl-offseason-btn" onclick="switchSport('mlb')">MLB is live now</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('home')">Back to home</button>
        </div>
    </div>`;
}

// ── Scores week/season navigator (2026-08-30, mirrors nfl.js's
// _renderNFLScoresNav) — the zero-param /scoreboard call only ever returns
// whatever narrow "current week" window ESPN feels like, with no way to
// browse a different one. CFB's own calendar shape is NOT the same as NFL's
// though (live-confirmed 2026-08-30 against ESPN's leagues[0].calendar):
// regular season is 15 numbered weeks, but postseason is two NAMED groups —
// "Bowls" (value=1) and "CFP" (value=999) — not sequential week numbers, so
// postseason gets its own two-pill row instead of a week-count range.
const _NCAAF_SEASONTYPES = [
    { type: 2, label: 'Regular Season', weeks: 15 },
    { type: 3, label: 'Postseason', postseasonGroups: [{ value: 1, label: 'Bowls' }, { value: 999, label: 'CFP' }] },
];
// null = ESPN's own "today" default; else { seasontype, week, season }.
let _ncaafScoresFilter = null;

function _renderNCAAFScoresNav() {
    const grid = document.getElementById('playersGrid');
    const main = document.querySelector('main');
    if (!grid || !main) return;
    document.getElementById('ncaafScoresNav')?.remove();

    const f = _ncaafScoresFilter;
    const activeType = f ? f.seasontype : 2;
    const season = f ? f.season : NCAAF_SEASON;
    const typeMeta = _NCAAF_SEASONTYPES.find(t => t.type === activeType) || _NCAAF_SEASONTYPES[0];

    const pillStyle = (active) => `padding:0.32rem 0.78rem;border-radius:var(--radius-full);
        border:1px solid ${active ? 'var(--accent)' : 'var(--border-default)'};
        background:${active ? 'var(--accent)' : 'transparent'};
        color:${active ? '#0b0b0d' : 'var(--text-secondary)'};
        font-weight:700;font-size:0.74rem;cursor:pointer;white-space:nowrap;flex-shrink:0`;

    const todayBtn = `<button data-ncaaf-stoday="1" style="${pillStyle(!f)}">Today</button>`;
    const typeBtns = _NCAAF_SEASONTYPES.map(t =>
        `<button data-ncaaf-stype="${t.type}" style="${pillStyle(!!f && t.type === activeType)}">${t.label}</button>`
    ).join('');

    const subPillStyle = (active) => `padding:0.3rem 0.66rem;border-radius:var(--radius-full);
        border:1px solid ${active ? 'var(--accent)' : 'var(--border-default)'};
        background:${active ? 'var(--accent)' : 'transparent'};
        color:${active ? '#0b0b0d' : 'var(--text-secondary)'};
        font-weight:600;font-size:0.7rem;cursor:pointer;white-space:nowrap;flex-shrink:0`;
    const subBtns = typeMeta.postseasonGroups
        ? typeMeta.postseasonGroups.map(g => `<button data-ncaaf-sweek="${g.value}" style="${subPillStyle(!!f && f.week === g.value)}">${g.label}</button>`).join('')
        : Array.from({ length: typeMeta.weeks }, (_, i) => i + 1)
            .map(w => `<button data-ncaaf-sweek="${w}" style="${subPillStyle(!!f && f.week === w)}">Wk ${w}</button>`).join('');

    const nav = document.createElement('div');
    nav.id = 'ncaafScoresNav';
    nav.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;padding:0 0.25rem 0.9rem';
    nav.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem">
            ${todayBtn}${typeBtns}
            <span style="margin-left:auto;font-size:0.7rem;color:var(--text-muted)">${season}</span>
        </div>
        <div class="nfl-week-scroll" style="display:flex;align-items:center;gap:0.35rem;overflow-x:auto;padding-bottom:2px">${subBtns}</div>
    `;
    main.insertBefore(nav, grid);

    nav.querySelector('[data-ncaaf-stoday]').onclick = () => { _ncaafScoresFilter = null; displayNCAAFScores(); };
    nav.querySelectorAll('[data-ncaaf-stype]').forEach(btn => {
        btn.onclick = () => {
            const type = parseInt(btn.dataset.ncaafStype, 10);
            const meta = _NCAAF_SEASONTYPES.find(t => t.type === type);
            const firstWeek = meta.postseasonGroups ? meta.postseasonGroups[0].value : 1;
            _ncaafScoresFilter = { seasontype: type, week: firstWeek, season: NCAAF_SEASON };
            displayNCAAFScores();
        };
    });
    nav.querySelectorAll('[data-ncaaf-sweek]').forEach(btn => {
        btn.onclick = () => {
            _ncaafScoresFilter = { seasontype: activeType, week: parseInt(btn.dataset.ncaafSweek, 10), season };
            displayNCAAFScores();
        };
    });
}

// D-104-style rework (2026-08-30): moved off the compact home-page
// `.home-game-card` markup onto the same `.game-card`/`.game-team`/
// `.game-matchup` component MLB/NFL's own Scores pages use — per-team click-
// through to the team page, inline W-L records, and a Game Flow quarter chart
// (all three fields live-confirmed present on the CFB scoreboard payload,
// 2026-08-30). No stat-leaders row: comp.leaders is confirmed absent for CFB,
// unlike NFL's feed — an honest gap, not a card that silently does less.
function _ncaafGameCard(g) {
    const hs = g.homeTeam.score, as = g.awayTeam.score;
    const hasScore = g.isFinal || g.isLive || hs > 0 || as > 0;
    const statusCls = g.isFinal ? 'game-status--final' : g.isLive ? 'game-status--live' : 'game-status--sched';

    let dateStr = '';
    if (g.date) {
        try { dateStr = new Date(g.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (_) {}
    }

    const teamBlock = (t, won, extraCls) => `
        <div class="game-team ${extraCls || ''} ${won ? 'game-team--winner' : ''}" ${t.id ? `onclick="event.stopPropagation(); navigateTo('ncaaf-team-${_escHtml(String(t.id))}')" role="button" tabindex="0"` : ''} aria-label="${_escHtml(t.name || t.abbr)}">
            <div class="game-team-logo" ${t.color ? `style="background:linear-gradient(135deg,#${_escHtml(t.color)}cc,#${_escHtml(t.color)}55)"` : ''}>
                ${t.logo ? `<img class="game-logo-img" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="game-logo-text">${_escHtml(t.abbr)}</span>
            </div>
            <div class="game-team-abbr">${t.rank ? `<span class="game-team-rank">#${t.rank}</span> ` : ''}${_escHtml(t.abbr)}</div>
            <div class="game-team-name" title="${_escHtml(t.name || '')}">${_escHtml(t.name || '')}</div>
            ${t.record ? `<div class="game-team-rec">${_escHtml(t.record)}</div>` : ''}
        </div>`;

    const homeLS = g.linescores?.home || [];
    const awayLS = g.linescores?.away || [];
    const numPeriods = Math.max(homeLS.length, awayLS.length);
    let flowHtml = '';
    if (numPeriods > 0 && (g.isFinal || g.isLive)) {
        const homeColor = g.homeTeam.color ? `#${g.homeTeam.color}` : 'var(--text-secondary)';
        const awayColorRaw = g.awayTeam.color ? `#${g.awayTeam.color}` : null;
        const awayColor = (awayColorRaw && awayColorRaw !== homeColor) ? awayColorRaw : 'var(--text-muted)';
        const maxVal = Math.max(1, ...homeLS, ...awayLS);
        const periodLabel = (i) => i < 4 ? `Q${i + 1}` : (numPeriods - i <= 1 ? 'OT' : `OT${i - 3}`);
        const bars = Array.from({ length: numPeriods }, (_, i) => {
            const hv = Number(homeLS[i]) || 0, av = Number(awayLS[i]) || 0;
            const hh = Math.max(3, Math.round((hv / maxVal) * 40));
            const ah = Math.max(3, Math.round((av / maxVal) * 40));
            return `
            <div class="game-flow-q">
                <div class="game-flow-bars">
                    <div class="game-flow-bar" style="height:${hh}px;background:${homeColor}" title="${_escHtml(g.homeTeam.abbr)} ${periodLabel(i)}: ${hv}"></div>
                    <div class="game-flow-bar" style="height:${ah}px;background:${awayColor}" title="${_escHtml(g.awayTeam.abbr)} ${periodLabel(i)}: ${av}"></div>
                </div>
                <span class="game-flow-q-label">${periodLabel(i)}</span>
            </div>`;
        }).join('');
        flowHtml = `
        <div class="game-flow">
            <div class="game-flow-label">Game Flow · Points by Quarter</div>
            <div class="game-flow-chart">${bars}</div>
            <div class="game-flow-legend">
                <span><i style="background:${homeColor}"></i>${_escHtml(g.homeTeam.abbr)}</span>
                <span><i style="background:${awayColor}"></i>${_escHtml(g.awayTeam.abbr)}</span>
            </div>
        </div>`;
    }

    const ghostHtml = g.homeTeam.color
        ? `<div class="game-card-ghost-logo" style="background:radial-gradient(circle, #${_escHtml(g.homeTeam.color)} 0%, transparent 70%)"></div>`
        : '';

    return `<div class="game-card${g.isLive ? ' game-card--live' : ''}" style="cursor:pointer" onclick="navigateTo('ncaaf-game-${_escHtml(String(g.id))}')">
        ${ghostHtml}
        <div class="game-card-header">
            <span class="game-date">${_escHtml(dateStr)}${g.broadcast ? ` · ${_escHtml(g.broadcast)}` : ''}</span>
            <span class="game-status ${statusCls}">${g.isLive ? '<span class="live-dot"></span>' : ''}${_escHtml(g.statusText || (g.isFinal ? 'Final' : 'Scheduled'))}</span>
        </div>
        <div class="game-matchup">
            ${teamBlock(g.homeTeam, g.homeTeam.winner)}
            <div class="game-scores">
                <span class="game-score ${g.homeTeam.winner ? 'game-score--win' : hasScore && !g.homeTeam.winner ? 'game-score--loss' : ''}">${hasScore ? hs : '—'}</span>
                <span class="game-scores-sep">:</span>
                <span class="game-score ${g.awayTeam.winner ? 'game-score--win' : hasScore && !g.awayTeam.winner ? 'game-score--loss' : ''}">${hasScore ? as : '—'}</span>
            </div>
            ${teamBlock(g.awayTeam, g.awayTeam.winner, 'game-team--away')}
        </div>
        ${flowHtml}
    </div>`;
}

async function displayNCAAFScores() {
    const grid = document.getElementById('playersGrid');
    const main = document.querySelector('main');
    if (!grid || !main) return;
    if (window.setBreadcrumb) setBreadcrumb('ncaaf-scores', null);

    _renderNCAAFScoresNav();

    grid.className = 'games-grid';
    grid.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton-card" style="min-height:200px"></div>`).join('');

    try {
        const games = await fetchNCAAFScoreboard(_ncaafScoresFilter || {});
        AppState.ncaafGames = games;

        if (!games.length) {
            grid.className = '';
            // The offseason full-page state only applies to the real "Today"
            // default — a user who explicitly browsed to a past/future week
            // that happens to have no games (or hasn't been scheduled yet)
            // shouldn't be told the whole sport is dormant.
            grid.innerHTML = (!_ncaafScoresFilter && _ncaafIsOffseason())
                ? _ncaafOffseasonState()
                : `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">No games in this window — try a different week.</p></div>`;
            if (!_ncaafScoresFilter && typeof updateNCAAFTicker === 'function') updateNCAAFTicker(games);
            return;
        }

        const liveCount = games.filter(g => g.isLive).length;
        const liveHead = liveCount
            ? `<div class="nfl-gameday-head" style="grid-column:1/-1"><span class="nlg-livebadge">● LIVE NOW</span> ${liveCount} game${liveCount > 1 ? 's' : ''} in progress</div>`
            : '';
        const rank = (game) => game.isLive ? 0 : (!game.isFinal ? 1 : 2);
        const ordered = games.slice().sort((a, b) => rank(a) - rank(b));
        grid.innerHTML = liveHead + ordered.map(_ncaafGameCard).join('');

        // Only the real "Today" default feeds the site-wide ticker — browsing a
        // past/future week shouldn't push those scores into the header ticker
        // (mirrors nfl.js's loadNFLGames).
        if (!_ncaafScoresFilter && typeof updateNCAAFTicker === 'function') updateNCAAFTicker(games);
    } catch (err) {
        Logger.warn('NCAAF scoreboard failed', err, 'NCAAF');
        grid.className = '';
        grid.innerHTML = `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">Couldn't load college scores. <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="displayNCAAFScores()">Retry</button></p></div>`;
    }
}

function updateNCAAFTicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;
    const scored = (games || []).filter(g => g.isFinal || g.isLive || g.homeTeam.score > 0 || g.awayTeam.score > 0);
    if (!scored.length) {
        ticker.classList.add('ticker--idle');
        ticker.innerHTML = `<div class="ticker__item">No college scores — season runs late Aug–Jan</div>`;
        return;
    }
    const items = [...scored, ...scored]
        .map(g => Scorebug.renderTickerItem(Scorebug.normalizeNCAAFGame(g)))
        .join('');
    ticker.classList.remove('ticker--idle');
    ticker.innerHTML = items;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
    }));
}

function _renderNCAAFView(view) {
    if (window.StatsCharts && StatsCharts.destroyAll) StatsCharts.destroyAll();
    if (view.startsWith('ncaaf-player-')) { showNCAAFPlayer(view.slice('ncaaf-player-'.length)); return; }
    if (view.startsWith('ncaaf-team-')) { showNCAAFTeam(view.slice('ncaaf-team-'.length)); return; }
    if (view.startsWith('ncaaf-game-')) { if (typeof showNCAAFGame === 'function') showNCAAFGame(view.slice('ncaaf-game-'.length)); return; }
    if (window.setBreadcrumb) setBreadcrumb(view, null);
    switch (view) {
        case 'ncaaf-standings': displayNCAAFStandings(); break;
        case 'ncaaf-teams':     displayNCAAFTeams();     break;
        case 'ncaaf-rankings':  displayNCAAFRankings();  break;
        case 'ncaaf-leaders':   displayNCAAFLeaders();   break;
        case 'ncaaf-scores':
        default:                displayNCAAFScores();
    }
}

// ── Season model for standings/rankings (last completed season) ──
// July 2026 → 2025; in-season (Aug–Dec) → current year; Jan → prior year's season.
const NCAAF_LAST_SEASON = (_ncaafNow.getMonth() + 1 >= 8) ? _ncaafNow.getFullYear() : _ncaafNow.getFullYear() - 1;
const _ncaaf = { season: NCAAF_LAST_SEASON, poll: 0 };

// ── Rankings (AP / Coaches / CFP polls) ───────────────────────
async function fetchNCAAFRankings() {
    const data = await espnNCAAFFetch('/rankings', {}, ApiCache.TTL.LONG);
    // FBS product: keep AP / Coaches (FBS) / Playoff Committee; drop FCS + Div II/III polls.
    const _fbsPoll = (n) => !!n && !/\bFCS\b|Div(ision)?\s*(II|III)\b/i.test(n);
    return (data.rankings || []).filter(r => _fbsPoll(r.shortName || r.name)).map(r => ({
        name: r.shortName || r.name || 'Poll',
        headline: r.headline || '',
        occurrence: r.occurrence?.displayValue || '',
        ranks: (r.ranks || []).map(rk => {
            const t = rk.team || {};
            return {
                current: rk.current,
                previous: rk.previous,
                trend: rk.trend || '',
                record: rk.recordSummary || '',
                points: rk.points,
                name: t.nickname || t.name || t.location || t.displayName || '?',
                abbr: t.abbreviation || '',
                logo: (t.logos && t.logos[0] && t.logos[0].href) || t.logo || '',
            };
        }),
    })).filter(p => p.ranks.length);
}

async function displayNCAAFRankings() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs" id="ncaafPollTabs"></div>
        <div id="ncaafRankBody"><div class="skeleton-line" style="height:340px;border-radius:var(--radius-md)"></div></div>`;
    let polls;
    try { polls = await fetchNCAAFRankings(); }
    catch (err) {
        Logger.warn('NCAAF rankings failed', err, 'NCAAF');
        document.getElementById('ncaafRankBody').innerHTML = _ncaafErr('Couldn\'t load the polls.', 'displayNCAAFRankings');
        return;
    }
    if (!polls.length) {
        grid.innerHTML = `<div class="standings-container">${_ncaafOffseasonState()}</div>`;
        return;
    }
    if (_ncaaf.poll >= polls.length) _ncaaf.poll = 0;
    const tabs = document.getElementById('ncaafPollTabs');
    tabs.innerHTML = polls.map((p, i) =>
        `<button class="standings-tab${i === _ncaaf.poll ? ' active' : ''}" data-poll="${i}">${_escHtml(p.name)}</button>`).join('');
    tabs.querySelectorAll('.standings-tab').forEach(b => b.addEventListener('click', () => {
        _ncaaf.poll = parseInt(b.dataset.poll, 10); displayNCAAFRankings();
    }));
    const p = polls[_ncaaf.poll];
    const rows = p.ranks.map(rk => {
        const move = rk.previous && rk.current
            ? (rk.previous === 0 ? '<span class="standings-streak--win">NEW</span>'
               : rk.previous > rk.current ? `<span class="standings-streak--win">▲${rk.previous - rk.current}</span>`
               : rk.previous < rk.current ? `<span class="standings-streak--loss">▼${rk.current - rk.previous}</span>`
               : '<span class="standings-gb">—</span>')
            : '';
        return `<tr class="standings-row">
            <td class="standings-rank-cell"><span class="standings-rank">${rk.current}</span></td>
            <td class="standings-team-cell">
                ${rk.logo ? `<img class="standings-logo" src="${_escHtml(rk.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="standings-team-name" title="${_escHtml(rk.name)}">${_escHtml(rk.name)}</span>
            </td>
            <td class="standings-num">${_escHtml(rk.record)}</td>
            <td class="standings-num standings-split">${move}</td>
        </tr>`;
    }).join('');
    document.getElementById('ncaafRankBody').innerHTML = `
        <div class="standings-table-wrap">
            <table class="standings-table">
                <thead><tr><th class="standings-th-rank">#</th><th class="standings-th-team">Team</th><th>Record</th><th>Move</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="standings-legend">${_escHtml(p.name)}${p.occurrence ? ' · ' + _escHtml(p.occurrence) : ''}. Source: ESPN. ▲/▼ = movement vs the previous poll.</p>`;
}

// ── Standings + Teams (shared site.web.api conference tree) ────
function _ncaafStandingRow(e) {
    const t = e.team || {};
    const stat = (names) => (e.stats || []).find(x => names.includes(x.name) || names.includes(x.type)) || null;
    const num  = (names) => { const x = stat(names); return x ? (x.value != null ? x.value : parseFloat(x.displayValue)) : null; };
    const disp = (names) => { const x = stat(names); return x ? (x.displayValue || '') : ''; };
    const w = num(['wins']), l = num(['losses']);
    // pf/pa/diff/streak: same raw stat names ESPN returns for NFL standings
    // (js/nflStandings.js's _nstdStat) — confirmed present in the NCAAF payload
    // too, just not parsed out before this. Feeds the team-detail "Team Record"
    // card (_renderTeamPage) without any new data source.
    const pf = num(['pointsFor']), pa = num(['pointsAgainst']), diff = num(['pointDifferential']);
    return {
        id: t.id || '',
        name: t.displayName || t.name || t.location || '?',
        abbr: t.abbreviation || '',
        logo: (t.logos && t.logos[0] && t.logos[0].href) || t.logo || '',
        overall: (w != null && l != null) ? `${w}-${l}` : (disp(['overall', 'total']) || '—'),
        conf: disp(['vsConf', 'conferenceRecord', 'vsConference']) || '',
        winPct: num(['winPercent']),
        wins: w, losses: l,
        pf: pf != null ? Math.round(pf) : null,
        pa: pa != null ? Math.round(pa) : null,
        diff: diff != null ? Math.round(diff) : null,
        streak: disp(['streak']) || '',
    };
}

function _ncaafCollectConfs(node, trail, out) {
    const nm = node.name || node.abbreviation;
    const t2 = nm ? [...trail, nm] : trail;
    const entries = (node.standings && node.standings.entries) || [];
    if (entries.length) {
        const label = t2.join(' — ') || nm || 'Conference';
        out.push({ name: label, teams: entries.map(_ncaafStandingRow).filter(Boolean) });
    }
    for (const c of (node.children || [])) _ncaafCollectConfs(c, t2, out);
}

async function fetchNCAAFStandings(season) {
    const cacheKey = `ncaaf:standings:${season}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;
    const res = await fetch(`/api/ncaafstandings?season=${season}`);
    if (!res.ok) throw new Error(`NCAAF standings ${res.status}`);
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.reason || 'standings unavailable');
    const confs = [];
    for (const c of (data.children || [])) _ncaafCollectConfs(c, [], confs);
    const out = confs.filter(c => c.teams.length);
    ApiCache.set(cacheKey, out, ApiCache.TTL.LONG);
    return out;
}

function _ncaafSeasonSelect() {
    const yrs = [];
    for (let y = NCAAF_LAST_SEASON; y >= NCAAF_LAST_SEASON - 5; y--) yrs.push(y);
    return `<select id="ncaafSeasonSel" class="standings-tab" style="cursor:pointer">${
        yrs.map(y => `<option value="${y}"${y === _ncaaf.season ? ' selected' : ''}>${y} season</option>`).join('')}</select>`;
}

async function displayNCAAFStandings() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_ncaafSeasonSelect()}</div>
        <div id="ncaafStdBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('ncaafSeasonSel').addEventListener('change', (ev) => {
        _ncaaf.season = parseInt(ev.target.value, 10); displayNCAAFStandings();
    });
    let confs;
    try { confs = await fetchNCAAFStandings(_ncaaf.season); }
    catch (err) {
        Logger.warn('NCAAF standings failed', err, 'NCAAF');
        document.getElementById('ncaafStdBody').innerHTML = _ncaafErr('Standings are unavailable for this season.', 'displayNCAAFStandings');
        return;
    }
    if (!confs.length) {
        document.getElementById('ncaafStdBody').innerHTML = _ncaafErr('No standings returned for the ' + _ncaaf.season + ' season.', 'displayNCAAFStandings');
        return;
    }
    document.getElementById('ncaafStdBody').innerHTML = confs.map(c => `
        <section class="mlb-division-panel" style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.5rem">${_escHtml(c.name)}</h2>
            <div class="standings-table-wrap">
                <table class="standings-table">
                    <thead><tr><th class="standings-th-team">Team</th><th>Conf</th><th>Overall</th></tr></thead>
                    <tbody>${c.teams.map(t => `<tr class="standings-row">
                        <td class="standings-team-cell">
                            ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : ''}
                            <span class="standings-team-name" title="${_escHtml(t.name)}">${_escHtml(t.name)}</span>
                        </td>
                        <td class="standings-num standings-pct">${_escHtml(t.conf || '—')}</td>
                        <td class="standings-num">${_escHtml(t.overall)}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </section>`).join('') +
        `<p class="standings-legend">${_escHtml(String(_ncaaf.season))} FBS conference standings. Source: ESPN. Conf = record within the conference.</p>`;
}

async function displayNCAAFTeams() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'standings-container';
    grid.innerHTML = `<div class="standings-tabs">${_ncaafSeasonSelect()}</div>
        <div id="ncaafTeamsBody"><div class="skeleton-line" style="height:360px;border-radius:var(--radius-md)"></div></div>`;
    document.getElementById('ncaafSeasonSel').addEventListener('change', (ev) => {
        _ncaaf.season = parseInt(ev.target.value, 10); displayNCAAFTeams();
    });
    let confs;
    try { confs = await fetchNCAAFStandings(_ncaaf.season); }
    catch (err) {
        Logger.warn('NCAAF teams failed', err, 'NCAAF');
        document.getElementById('ncaafTeamsBody').innerHTML = _ncaafErr('Teams are unavailable for this season.', 'displayNCAAFTeams');
        return;
    }
    if (!confs.length) {
        document.getElementById('ncaafTeamsBody').innerHTML = _ncaafErr('No teams returned for the ' + _ncaaf.season + ' season.', 'displayNCAAFTeams');
        return;
    }
    // D-135: 130+ FBS teams across ~10 conferences meant finding one specific
    // team meant scrolling past every conference before it — no search, no
    // jump nav. A quick-jump pill row (scroll to a conference) plus a live
    // text filter (narrow straight to a team by name, the more direct ask)
    // both address it; built both since they're cheap together and solve
    // slightly different real usage patterns (knowing the conference vs. not).
    const jumpPills = confs.map((c, i) =>
        `<button type="button" class="ncaaf-conf-jump-pill" onclick="document.getElementById('ncaaf-conf-${i}').scrollIntoView({behavior:'smooth',block:'start'})">${_escHtml(c.name)}</button>`
    ).join('');

    document.getElementById('ncaafTeamsBody').innerHTML =
        `<div class="search-input-wrap ncaaf-team-filter-wrap">
            <span class="search-icon"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
            <input type="text" id="ncaafTeamFilter" class="ncaaf-team-filter-input" placeholder="Find a team…" oninput="_ncaafFilterTeams(this.value)">
        </div>
        <div class="ncaaf-conf-jump-row">${jumpPills}</div>
        <p id="ncaafTeamFilterEmpty" class="nfl-offseason-text" style="display:none;padding:var(--space-4) 0">No team matches "<span id="ncaafTeamFilterEmptyQuery"></span>".</p>` +
        confs.map((c, i) => {
        // Alphabetical within each conference — the standings API returns teams
        // in whatever order ESPN's tree happened to list them, not sorted, which
        // made a 15-18 team conference tedious to scan for one specific team.
        const sorted = c.teams.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        return `
        <section id="ncaaf-conf-${i}" class="ncaaf-conf-section" style="margin-bottom:var(--space-4)">
            <h2 class="standings-team-name" style="font-family:var(--font-display);font-size:1.02rem;margin:0 0 0.6rem">${_escHtml(c.name)} <span class="standings-gb" style="font-size:0.8rem">· ${c.teams.length}</span></h2>
            <div class="ncaaf-team-grid">${sorted.map(t => {
                // Overall record is already parsed by _ncaafStandingRow for the Standings
                // view (t.overall) — the Teams grid just never rendered it. "0-0" reads as
                // real data before kickoff, so it's suppressed the same way the team-detail
                // Team Record card already suppresses an all-zero preseason row.
                const hasRecord = t.overall && t.overall !== '—' && !/^0-0$/.test(t.overall);
                return `<div class="ncaaf-team-chip${t.id ? ' ncaaf-team-chip--link' : ''}" data-team-name="${_escHtml((t.name || '').toLowerCase())}"${t.id ? ` role="button" tabindex="0" aria-label="${_escHtml(t.name)}" onclick="navigateTo('ncaaf-team-${_escHtml(String(t.id))}')"` : ''}>
                ${t.logo ? `<img class="standings-logo" src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>` : '<span class="standings-logo"></span>'}
                <div class="ncaaf-team-chip-info">
                    <span class="ncaaf-team-chip-name">${_escHtml(t.name)}</span>
                    ${hasRecord ? `<span class="ncaaf-team-chip-record">${_escHtml(t.overall)}</span>` : ''}
                </div>
            </div>`;
            }).join('')}</div>
        </section>`;
    }).join('') +
        `<p class="standings-legend">FBS teams grouped by conference (${_escHtml(String(_ncaaf.season))}). Source: ESPN.</p>`;
}

// D-135: live filter for the Teams grid above — hides non-matching chips and
// any conference section left with zero visible chips, rather than a full
// re-render (this runs on every keystroke, so it stays a pure DOM show/hide
// pass, no re-fetch or innerHTML rebuild).
function _ncaafFilterTeams(query) {
    const q = query.trim().toLowerCase();
    const sections = document.querySelectorAll('.ncaaf-conf-section');
    let anyVisible = false;
    sections.forEach(section => {
        let sectionHasMatch = false;
        section.querySelectorAll('.ncaaf-team-chip').forEach(chip => {
            const match = !q || (chip.dataset.teamName || '').includes(q);
            chip.style.display = match ? '' : 'none';
            if (match) sectionHasMatch = true;
        });
        section.style.display = sectionHasMatch ? '' : 'none';
        if (sectionHasMatch) anyVisible = true;
    });
    const jumpRow = document.querySelector('.ncaaf-conf-jump-row');
    if (jumpRow) jumpRow.style.display = q ? 'none' : '';
    const emptyState = document.getElementById('ncaafTeamFilterEmpty');
    if (emptyState) {
        emptyState.style.display = (q && !anyVisible) ? '' : 'none';
        const qEl = document.getElementById('ncaafTeamFilterEmptyQuery');
        if (qEl) qEl.textContent = query.trim();
    }
}

function _ncaafErr(msg, retryFn) {
    return `<div class="nfl-offseason" style="grid-column:1/-1"><p class="nfl-offseason-text">${_escHtml(msg)}</p><div class="nfl-offseason-actions"><button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="${retryFn}()">Retry</button></div></div>`;
}

// ── Leaders (real season stats via /api/ncaafstats) ──────────
const _NCF_LCOLORS = ['#c8452b','#3b7dd8','#2e9e6b','#b0842f','#8b5cf6','#d6455f','#0d9488','#c2410c','#6366f1','#0891b2'];

async function displayNCAAFLeaders() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'players-grid';
    grid.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton-card" style="min-height:240px"></div>`).join('');
    let data;
    try {
        const cacheKey = `ncaaf:leaders:${_ncaaf.season}`;
        data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/ncaafstats?season=${_ncaaf.season}`);
            if (!res.ok) throw new Error('leaders ' + res.status);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
    } catch (err) {
        Logger.warn('NCAAF leaders failed', err, 'NCAAF');
        grid.className = 'standings-container';
        grid.innerHTML = _ncaafErr("Couldn't load college leaders.", 'displayNCAAFLeaders');
        return;
    }
    if (!data.categories || !data.categories.length) {
        grid.className = 'standings-container';
        grid.innerHTML = _ncaafOffseasonState();
        return;
    }
    grid.innerHTML = data.categories.map((cat, ci) => {
        const color = _NCF_LCOLORS[ci % _NCF_LCOLORS.length];
        const rows = cat.leaders.map((l, i) => `
            <div class="nfl-lrow nfl-lrow--link" role="button" tabindex="0" aria-label="${_escHtml(l.name)}${l.pos ? ', ' + _escHtml(l.pos) : ''}" onclick="navigateTo('ncaaf-player-${_escHtml(String(l.id))}')">
                <span class="nfl-lrow-rank">${i + 1}</span>
                <div class="nfl-lrow-av">${l.headshot ? `<img src="${_escHtml(l.headshot)}" alt="" loading="lazy" data-hide-on-error>` : ''}</div>
                <div class="nfl-lrow-main">
                    <div class="nfl-lrow-name">${_escHtml(l.name)}</div>
                    <div class="nfl-lrow-meta">${_escHtml(l.team)}${l.pos ? ' · ' + _escHtml(l.pos) : ''}</div>
                </div>
                <span class="nfl-lrow-val" style="color:${color}">${_escHtml(String(l.value))}</span>
            </div>`).join('');
        return `<div class="card" style="padding:0;overflow:hidden;border-left:3px solid ${color}">
            <div class="nfl-card-head" style="justify-content:space-between">
                <span>${_escHtml(cat.label)}</span><span style="color:${color};font-size:0.64rem">${_escHtml(cat.unit)}</span>
            </div>${rows}</div>`;
    }).join('');
}

// ── Player detail on the shared frame (D-044) ────────────────
async function showNCAAFPlayer(id) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    AppState.currentView = 'ncaaf-player-' + id;
    grid.className = 'player-detail-container';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:320px"></div>`;
    let data;
    try {
        const cacheKey = `ncaaf:athlete:${id}:${_ncaaf.season}`;
        data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/ncaafathlete?id=${encodeURIComponent(id)}&season=${_ncaaf.season}`);
            if (!res.ok) throw new Error('athlete ' + res.status);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
    } catch (err) {
        Logger.warn('NCAAF athlete failed', err, 'NCAAF');
        grid.innerHTML = _ncaafErr("Couldn't load this player.", 'displayNCAAFLeaders');
        return;
    }
    displayNCAAFPlayerDetail(data);
}

function displayNCAAFPlayerDetail(data) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'player-detail-container';
    const bio = (data && data.bio) || {};
    if (!bio.name) { grid.innerHTML = _ncaafErr('Player not found.', 'displayNCAAFLeaders'); return; }
    if (window.setBreadcrumb) setBreadcrumb('ncaaf-leaders', _escHtml(bio.name));

    const accent = (typeof SPORTS_META !== 'undefined' && SPORTS_META.ncaaf && SPORTS_META.ncaaf.accent) || '#c8452b';
    const initials = bio.name.split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const headshotImg = bio.headshot ? `<img class="player-headshot" src="${_escHtml(bio.headshot)}" alt="" loading="lazy" data-hide-on-error>` : '';
    const teamRow = `${bio.teamLogo ? `<img src="${_escHtml(bio.teamLogo)}" alt="" class="player-hero-team-logo" loading="lazy" data-hide-on-error>` : ''}<span>${_escHtml(bio.team || '')}</span>`;

    const header = detailHeader({
        back: { view: 'ncaaf-leaders', label: 'Leaders' },
        actions: [{ label: 'Share', onclick: "window._shareCurrentPage && window._shareCurrentPage()", title: 'Copy link' }],
        avatar: { headshotHtml: headshotImg, initials, accent, className: 'nfl-hero-avatar' },
        name: bio.name,
        chips: [
            ...(bio.pos ? [{ text: bio.pos }] : []),
            ...((data.id && typeof renderFollowStar === 'function') ? [{ html: renderFollowStar('ncaaf', 'player', data.id) }] : []),
        ],
        teamRow,
        meta: [`${data.season} College Football${data.gp ? ` · ${_escHtml(String(data.gp))} GP` : ''}`],
    });

    const bioRows = [
        ['Position', bio.pos], ['Class', bio.classYr], ['Jersey', bio.jersey ? '#' + bio.jersey : ''],
        ['Height', bio.height], ['Weight', bio.weight], ['Team', bio.team],
    ].filter(r => r[1]).map(([l, v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${_escHtml(String(v))}</span></div>`).join('');
    const profile = detailSection({ title: 'Player Profile', body: `<div class="player-details detail-bio-wide">${bioRows}</div>` });

    const statSections = (data.groups || []).map(g => {
        const cells = g.stats.map(([l, v]) => `<div class="ncf-stat"><span class="ncf-stat-v">${_escHtml(String(v))}</span><span class="ncf-stat-l">${_escHtml(l)}</span></div>`).join('');
        return detailSection({ title: g.label, body: `<div class="ncf-statline">${cells}</div>` });
    }).join('');

    const noStats = (!data.groups || !data.groups.length)
        ? detailSection({ title: 'Season Stats', body: `<p class="detail-prose">No ${data.season} season stats for ${_escHtml(bio.name)} yet — common for reserves and early-career players.</p>` })
        : '';

    grid.innerHTML = header + profile + statSections +
        `<div id="ncaaf-radar-host"></div>` + noStats +
        `<div id="ncaaf-gamelog-host"></div>` +
        `<p class="detail-note" style="margin-top:0.75rem">${data.season} regular season · Source: ESPN.</p>`;
    if (typeof _loadNCAAFRadar === 'function') _loadNCAAFRadar(data.groups);
    if (typeof _loadNCAAFGameLog === 'function') _loadNCAAFGameLog(data.id, data.season);
}

// ── Team detail (D-044 P4) — banner + team leaders ───────────
async function showNCAAFTeam(id) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    AppState.currentView = 'ncaaf-team-' + id;
    grid.className = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:360px"></div>`;
    let team;
    try {
        const data = await espnNCAAFFetch(`/teams/${id}`, {}, ApiCache.TTL.LONG);
        team = data && data.team;
    } catch (err) {
        Logger.warn('NCAAF team failed', err, 'NCAAF');
        grid.innerHTML = _ncaafErr("Couldn't load this team.", 'displayNCAAFTeams');
        return;
    }
    if (!team) { grid.innerHTML = _ncaafErr('Team not found.', 'displayNCAAFTeams'); return; }
    let roster = [], sched = [], stats = null, stdRow = null;
    try { const rd = await espnNCAAFFetch(`/teams/${id}/roster`, {}, ApiCache.TTL.LONG); roster = (rd && rd.athletes) || []; } catch (err) { Logger.warn('NCAAF roster fetch failed', err, 'NCAAF'); }
    try { const sd = await espnNCAAFFetch(`/teams/${id}/schedule`, {}, ApiCache.TTL.MEDIUM); sched = (sd && sd.events) || []; } catch (err) { Logger.warn('NCAAF schedule fetch failed', err, 'NCAAF'); }
    try { stats = await fetch(`/api/ncaafstats?season=${_ncaaf.season}`).then(r => r.json()); } catch (err) { Logger.warn('NCAAF team stats fetch failed', err, 'NCAAF'); }
    // Team Record card (mirrors MLB's _mlbTeamStatsCard) — reuses the same
    // fetchNCAAFStandings() the Standings view already calls, ApiCache-backed,
    // no new data source. A miss here (team not found, or preseason with no
    // real standings yet) just omits the card — never an error on the page.
    try {
        const confs = await fetchNCAAFStandings(_ncaaf.season);
        for (const c of confs) {
            const found = c.teams.find(t => t.id === team.id || t.abbr === team.abbreviation);
            if (found) { stdRow = found; break; }
        }
    } catch (err) { Logger.warn('NCAAF standings fetch failed (team detail)', err, 'NCAAF'); }
    displayNCAAFTeamDetail(team, roster, sched, stats, stdRow);
}

function displayNCAAFTeamDetail(team, roster, sched, stats, stdRow) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = '';
    if (window.setBreadcrumb) setBreadcrumb('ncaaf-teams', _escHtml(team.displayName || team.name || 'Team'));
    const color   = '#' + String(team.color || 'c8452b').replace('#', '');
    const abbr    = team.abbreviation || '';
    const summary = team.standingSummary || '';
    const conf    = (summary.match(/\bin\s+(.+)$/) || [])[1] || '';
    const record  = (team.record && team.record.items && team.record.items[0] && team.record.items[0].summary) || '';

    const GLABEL = { offense: 'Offense', defense: 'Defense', specialTeam: 'Special Teams' };
    const mapItem = p => ({
        id: p.id, name: p.fullName || p.displayName || '',
        pos: (p.position && p.position.abbreviation) || '', number: p.jersey || '',
        starter: false, injury: '', headshot: (p.headshot && p.headshot.href) || '',
    });
    const groups = (roster || []).map(g => ({
        label: GLABEL[g.position] || g.position || 'Squad',
        players: (g.items || []).map(mapItem),
    })).filter(g => g.players.length);
    const rosterCount = groups.reduce((n, g) => n + g.players.length, 0);

    const seen = new Set(), assets = [];
    if (stats && stats.categories) {
        stats.categories.forEach(cat => (cat.leaders || []).forEach(l => {
            if (l.team === abbr && !seen.has(l.id)) {
                seen.add(l.id);
                assets.push({ id: l.id, name: l.name, pos: l.pos || '', number: '', adp: null, posColor: color, headshot: l.headshot || '' });
            }
        }));
    }

    let scheduleHtml;
    const nowMs = Date.now();
    const upcoming = (sched || []).map(ev => {
        const comp = ev.competitions && ev.competitions[0];
        const d = ev.date ? new Date(ev.date).getTime() : 0;
        return { ev, comp, d };
    }).filter(x => x.comp && x.d >= nowMs - 6 * 3600 * 1000).sort((a, b) => a.d - b.d)[0];
    if (upcoming) {
        const comps = upcoming.comp.competitors || [];
        const me  = comps.find(c => c.team && c.team.id === team.id) || comps.find(c => c.homeAway === 'home');
        const opp = comps.find(c => c !== me) || {};
        const home = me && me.homeAway === 'home';
        const ot = opp.team || {};
        let dateStr = '';
        try { dateStr = new Date(upcoming.ev.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (_) {}
        scheduleHtml = `<section class="stats-card" style="grid-column:1/-1"><h3 class="detail-section-title">Schedule</h3>
            <div class="team-next-card"><span class="team-next-card__label">Next game</span>
            <span class="team-next-card__matchup">${home ? 'vs' : '@'} ${(ot.logos && ot.logos[0]) ? `<img src="${_escHtml(ot.logos[0].href)}" alt="" loading="lazy" data-hide-on-error>` : ''}<strong>${_escHtml(ot.abbreviation || ot.displayName || 'TBD')}</strong></span>
            ${dateStr ? `<span class="team-next-card__date">${_escHtml(dateStr)}</span>` : ''}</div></section>`;
    } else {
        scheduleHtml = `<section class="stats-card" style="grid-column:1/-1"><h3 class="detail-section-title">Schedule</h3><div class="team-empty">The ${_ncaaf.season} schedule appears here once released.</div></section>`;
    }

    // Team Record card (mirrors MLB's Team Batting/Pitching card) — only built
    // when the standings lookup found this team AND at least one game's worth
    // of real data exists. Before kickoff ESPN still returns a standings row
    // for every team, just all zeros (0-0, PF 0, PA 0) — confirmed live against
    // /api/ncaafstandings?season=2026 while building this. Rendering that would
    // look like a broken/empty card, not "no data yet", so it's suppressed the
    // same way a null stdRow already is.
    const stdHasPlayed = stdRow && ((stdRow.wins || 0) > 0 || (stdRow.losses || 0) > 0 || (stdRow.pf || 0) > 0 || (stdRow.pa || 0) > 0);
    const recordChips = stdHasPlayed ? [
        ['Record', stdRow.overall || '—'],
        ...(stdRow.conf ? [['Conf', stdRow.conf]] : []),
        ...(stdRow.pf != null ? [['PF', stdRow.pf]] : []),
        ...(stdRow.pa != null ? [['PA', stdRow.pa]] : []),
        ...(stdRow.diff != null ? [['Diff', stdRow.diff > 0 ? `+${stdRow.diff}` : String(stdRow.diff)]] : []),
        ...(stdRow.streak ? [['Streak', stdRow.streak]] : []),
    ] : [];

    const model = {
        sport: 'ncaaf', abbr, name: team.displayName || team.name || 'Team',
        logo: (team.logos && team.logos[0] && team.logos[0].href) || '', teamColor: color,
        division: conf, record,
        seasonLabel: record ? '' : (summary || `${_ncaaf.season} season`),
        facts: [
            { label: 'Players', value: rosterCount },
            ...groups.map(g => ({ label: g.label, value: g.players.length })),
            ...(conf ? [{ label: 'Conference', value: conf }] : []),
        ],
        recordChips, recordSeasonLabel: recordChips.length ? `${_ncaaf.season} Season` : '',
        assets: assets.slice(0, 6), assetsTitle: 'Team Leaders', assetsCountLabel: String((stats && stats.season) || _ncaaf.season),
        groups, rosterEmpty: 'Roster data unavailable for this team right now.',
        scheduleHtmlTop: scheduleHtml, backView: 'ncaaf-teams', backLabel: 'Teams', playerPrefix: 'ncaaf-player-',
    };

    grid.className = 'player-detail-container';
    grid.innerHTML = (typeof _renderTeamPage === 'function')
        ? _renderTeamPage(model)
        : `<div class="ncf-team-banner" style="--team:${color}"><button onclick="navigateTo('ncaaf-teams')" class="back-button">\u2190 Teams</button><h1 class="player-detail-name">${_escHtml(model.name)}</h1><p class="player-detail-meta">${_escHtml(abbr)}${summary ? ' \u00b7 ' + _escHtml(summary) : ''}</p></div>`;
}

// ── Player season profile radar (honest: % of FBS leader per stat) ──
async function _loadNCAAFRadar(groups) {
    const host = document.getElementById('ncaaf-radar-host');
    if (!host || !groups || !groups.length || !window.Chart || !(window.StatsCharts && StatsCharts.radarProfile)) return;
    const raw = {};
    groups.forEach(g => Object.assign(raw, g.raw || {}));
    if (!Object.keys(raw).length) return;
    let stats;
    try {
        const cacheKey = `ncaaf:leaders:${_ncaaf.season}`;
        stats = ApiCache.get(cacheKey);
        if (!stats) { stats = await fetch(`/api/ncaafstats?season=${_ncaaf.season}`).then(r => r.json()); ApiCache.set(cacheKey, stats, ApiCache.TTL.DAILY); }
    } catch (_) { return; }
    const max = {};
    (stats.categories || []).forEach(cat => {
        const top = (cat.leaders || [])[0];
        if (top) { const v = parseFloat(String(top.value).replace(/[^0-9.]/g, '')); if (v > 0) max[cat.key] = v; }
    });
    const AXES = [
        ['passingYards', 'Pass Yds'], ['passingTouchdowns', 'Pass TD'],
        ['rushingYards', 'Rush Yds'], ['rushingTouchdowns', 'Rush TD'],
        ['receivingYards', 'Rec Yds'], ['receivingTouchdowns', 'Rec TD'], ['receptions', 'Rec'],
        ['totalTackles', 'Tackles'], ['sacks', 'Sacks'], ['interceptions', 'INT'],
    ];
    const labels = [], values = [];
    for (const [k, lab] of AXES) {
        if (raw[k] != null && max[k]) { labels.push(lab); values.push(Math.min(100, Math.round((raw[k] / max[k]) * 100))); }
    }
    if (labels.length < 3) return;
    if (!document.body.contains(host)) return;
    const accent = (typeof SPORTS_META !== 'undefined' && SPORTS_META.ncaaf && SPORTS_META.ncaaf.accent) || '#c8452b';
    host.innerHTML = detailSection({
        title: 'Season Profile', id: 'ncaaf-radar-sec',
        body: `<div style="position:relative;height:260px"><canvas id="ncaaf-radar-chart"></canvas></div>` +
              `<p class="detail-note" style="margin-top:0.4rem">Each axis is this player's ${_ncaaf.season} total as a % of the FBS leader in that stat.</p>`,
    });
    const chart = StatsCharts.radarProfile('ncaaf-radar-chart', labels, values, accent);
    if (!chart) { const sec = document.getElementById('ncaaf-radar-sec'); if (sec) sec.remove(); }
}

// ── Player game log (D-044 follow-on) — per-game table via /api/ncaafgamelog ──
async function _loadNCAAFGameLog(id, season) {
    const host = document.getElementById('ncaaf-gamelog-host');
    if (!host || !id) return;
    let data;
    try {
        const cacheKey = `ncaaf:gamelog:${id}:${season}`;
        data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/ncaafgamelog?id=${encodeURIComponent(id)}&season=${season}`);
            if (!res.ok) return;
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
    } catch (_) { return; }
    if (!data || !data.found || !data.games || !data.games.length) return;
    if (!document.body.contains(host)) return;
    const cols = data.columns || [];
    const head = `<th class="gl-l">Date</th><th class="gl-l">Opp</th><th class="gl-l">Res</th>` +
        cols.map(c => `<th>${_escHtml(c.label)}</th>`).join('');
    const rows = data.games.map(g => {
        let dt = '';
        try { dt = new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) {}
        const resCls = /^w/i.test(g.res) ? 'gl-res--w' : /^l/i.test(g.res) ? 'gl-res--l' : '';
        return `<tr>
            <td class="gl-l">${_escHtml(dt)}</td>
            <td class="gl-l">${_escHtml(g.atVs || '')}${g.atVs ? ' ' : ''}${_escHtml(g.opp || '')}</td>
            <td class="gl-l ${resCls}">${_escHtml(g.res || '')} ${_escHtml(g.score || '')}</td>
            ${(g.stats || []).map(v => `<td>${_escHtml(String(v))}</td>`).join('')}
        </tr>`;
    }).join('');
    const tableSection = detailSection({
        title: 'Game Log',
        body: `<div class="table-wrapper" style="overflow-x:auto"><table class="stats-table gl-table" style="white-space:nowrap"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`,
    });
    const canChart = (window.StatsCharts && typeof StatsCharts.nflGameTrend === 'function' && window.Chart);
    const chartSection = canChart
        ? detailSection({ title: 'Game Trend', id: 'ncaaf-gl-trend', body: `<div style="position:relative;height:220px"><canvas id="ncaaf-gl-chart"></canvas></div>` })
        : '';
    host.innerHTML = chartSection + tableSection;
    if (canChart) {
        const accent = (typeof SPORTS_META !== 'undefined' && SPORTS_META.ncaaf && SPORTS_META.ncaaf.accent) || '#c8452b';
        const chart = StatsCharts.nflGameTrend('ncaaf-gl-chart', data.games, cols, accent);
        if (!chart) { const sec = document.getElementById('ncaaf-gl-trend'); if (sec) sec.remove(); }
    }
}

window._loadNCAAFRadar      = _loadNCAAFRadar;
window._loadNCAAFGameLog    = _loadNCAAFGameLog;
window.fetchNCAAFScoreboard = fetchNCAAFScoreboard;
window.displayNCAAFScores   = displayNCAAFScores;
window.displayNCAAFRankings = displayNCAAFRankings;
window.displayNCAAFStandings = displayNCAAFStandings;
window.displayNCAAFTeams    = displayNCAAFTeams;
window.displayNCAAFLeaders  = displayNCAAFLeaders;
window.showNCAAFPlayer      = showNCAAFPlayer;
window.showNCAAFTeam        = showNCAAFTeam;
window._renderNCAAFView     = _renderNCAAFView;
window.updateNCAAFTicker    = updateNCAAFTicker;

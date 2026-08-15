// ============================================================
// NFL — teams, scores, standings, leaders
// ESPN public API: https://site.api.espn.com/apis/site/v2/sports/football/nfl
// ============================================================

const NFL_ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

// ── NFL season model — single source of truth; auto-rolls every year ──
// STATS  = latest season with completed/accumulating stats (Sep–Feb window).
// FANTASY = the season ADP / drafts / player profiles refer to (upcoming or in-progress).
const _nflNow = new Date();
const NFL_STATS_SEASON       = (_nflNow.getMonth() + 1 >= 9) ? _nflNow.getFullYear() : _nflNow.getFullYear() - 1;
const NFL_FANTASY_SEASON     = (_nflNow.getMonth() + 1 >= 3) ? _nflNow.getFullYear() : _nflNow.getFullYear() - 1;
const NFL_LEADERS_MIN_SEASON = 2000;  // ESPN core-API leaders depth
const NFL_NGS_MIN_SEASON     = 2016;  // Next Gen Stats depth

// ── Season phase model (P3-029, refined D-063) ──────────────────
// Four real phases, not one binary offseason flag. The old rule lumped the
// four weeks of real August preseason games in with the genuine no-games
// offseason — which is exactly why the site told visitors "NFL is between
// seasons" on the same day a real, final preseason score (CAR 33–30 ARI,
// Aug 6 2026) was sitting right there, correctly fetched, with nowhere
// accurate to say so. See D-063.
//
//   offseason  -> mid-Feb through July: no games of any kind.
//   preseason  -> August through the first week of September: real games
//                 air, but they never count toward the official record.
//   regular    -> rest of September through December.
//   postseason -> January through the Super Bowl (~mid-Feb).
//
// Boundaries are calendar-day heuristics, not a per-year lookup, chosen
// against NFL scheduling rules that don't move year to year: the season
// opener is always the Thursday after Labor Day (never before Sep 4), and
// the Super Bowl has been held in February every year since the league
// last moved off a January date — day<=14 clears every actual Super Bowl
// Sunday in the modern era without needing a lookup table.
function _nflSeasonPhase() {
    const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    if (m === 1) return 'postseason';
    if (m === 2 && day <= 14) return 'postseason';
    if ((m === 2 && day > 14) || (m >= 3 && m <= 7)) return 'offseason';
    if (m === 8 || (m === 9 && day <= 8)) return 'preseason';
    return 'regular';
}
// Narrow yes/no signal for call sites that only need "is there genuinely
// nothing to show" (fallback components, empty-state gates). Narrower than
// before: August no longer counts as offseason, since real preseason games
// are on the board.
function _nflIsOffseason() { return _nflSeasonPhase() === 'offseason'; }
// Deliberately separate from _nflIsOffseason() — official W-L records and
// real standings are genuinely still 0-0/empty through BOTH the offseason
// AND preseason (preseason results never count toward them), so any call
// site explaining an empty record/standings needs this broader check, not
// the narrower one above.
function _nflHasNoOfficialRecord() {
    const p = _nflSeasonPhase();
    return p === 'offseason' || p === 'preseason';
}

const _NFL_OFFSEASON_GLYPH = '<svg class="nfl-offseason-glyph" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="5.6" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7M10.6 7.4l1.4 1.4M7.4 10.6l1.4 1.4"/></svg>';

function _nflOffseasonState(surface) {
    const copy = {
        standings: `Standings populate once the ${NFL_FANTASY_SEASON} regular season is underway. Until kickoff in September, browse the upcoming schedule and all 32 teams.`,
        scores:    `No games on the board right now. The ${NFL_FANTASY_SEASON} schedule appears here the moment the league releases it — until then, get a head start on the draft.`,
        generic:   `Live ${NFL_FANTASY_SEASON} data returns when the regular season kicks off in September. In the meantime, the fantasy tools are open year-round.`,
    };
    const actions = {
        standings: `<button class="nfl-offseason-btn" onclick="navigateTo('nfl-games')">View schedule</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('nfl-teams')">Browse teams</button>`,
        scores:    `<button class="nfl-offseason-btn" onclick="navigateTo('nfl-mock')">Mock draft</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('nfl-teams')">Browse teams</button>`,
        generic:   `<button class="nfl-offseason-btn" onclick="navigateTo('nfl-players')">Browse players</button>
            <button class="nfl-offseason-btn nfl-offseason-btn--ghost" onclick="navigateTo('nfl-rankings')">Rankings</button>`,
    };
    const s = copy[surface] ? surface : 'generic';
    return `<div class="nfl-offseason">
        ${_NFL_OFFSEASON_GLYPH}
        <h2 class="nfl-offseason-title">NFL is in the offseason</h2>
        <p class="nfl-offseason-text">${copy[s]}</p>
        <div class="nfl-offseason-actions">${actions[s]}</div>
    </div>`;
}

// ── Fetch helper ──────────────────────────────────────────────

async function espnNFLFetch(path, params = {}, ttl = ApiCache.TTL.MEDIUM) {
    // Route through our same-origin Pages Function proxy (functions/api/nfl.js):
    // a server-side fetch fixes ESPN's browser CORS on /teams and /leaders.
    const url = new URL('/api/nfl', location.origin);
    url.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `nfl:${path}:${url.searchParams.toString()}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`NFL → ${url.pathname}`, undefined, 'NFL');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(tid);
    }
    if (!res.ok) throw new Error(`NFL API ${res.status}: ${res.statusText}`);

    let json;
    try { json = await res.json(); } catch { throw new Error(`NFL API returned non-JSON (${path})`); }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

// ── Logo helpers ──────────────────────────────────────────────

function getNFLTeamLogoUrl(abbr) {
    return abbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png` : null;
}

function getNFLPlayerHeadshotUrl(espnId) {
    return espnId ? `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png` : null;
}

// ── API functions ─────────────────────────────────────────────

async function fetchNFLTeams() {
    const data = await espnNFLFetch('/teams', { limit: 32 }, ApiCache.TTL.LONG);
    return (data.sports?.[0]?.leagues?.[0]?.teams || []).map(t => {
        const team = t.team;
        return {
            id:        team.id,
            abbr:      team.abbreviation,
            name:      team.displayName,
            shortName: team.shortDisplayName || team.name,
            color:     '#' + (team.color || '334155'),
            altColor:  '#' + (team.alternateColor || '64748b'),
            logo:      team.logos?.[0]?.href || getNFLTeamLogoUrl(team.abbreviation),
            record:    team.record?.items?.[0]?.summary || '',
        };
    });
}

// opts: { seasontype, week, season } — all optional. Empty/omitted opts preserve the
// original zero-param call (ESPN's own "today/current week" default), which every
// pre-existing call site still relies on. seasontype: 1=preseason, 2=regular,
// 3=postseason; season is the year, sent as ESPN's own `dates` param — same three
// names already proven live in nflStandings.js's fetchNFLPostseason().
async function fetchNFLScoreboard(opts = {}) {
    const params = {};
    if (opts.seasontype) params.seasontype = opts.seasontype;
    if (opts.week)       params.week = opts.week;
    if (opts.season)     params.dates = opts.season;
    const data = await espnNFLFetch('/scoreboard', params, ApiCache.TTL.SHORT);
    return (data.events || []).map(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors?.find(c => c.homeAway === 'home');
        const away = comp.competitors?.find(c => c.homeAway === 'away');
        const status = comp.status;
        const stName = status?.type?.name || 'STATUS_SCHEDULED';
        const isFinal = stName.startsWith('STATUS_FINAL');
        const isLive  = stName === 'STATUS_IN_PROGRESS' || stName === 'STATUS_HALFTIME';
        // 2026-08-14 live-debug pass (D-096): comp.situation carries real down/distance/
        // possession/red-zone data on every live game -- already present in every
        // /scoreboard response the Scores grid already fetches, just never parsed.
        // ESPN's sentinel for "no current down" (right after a score/timeout/kickoff)
        // is down: -1, so only build a situation object when there's a real down to
        // show -- an empty/undefined line beats a nonsensical "0th & 0".
        const sit = comp.situation;
        let situation = null;
        if (isLive && sit && typeof sit.down === 'number' && sit.down >= 1 && sit.shortDownDistanceText) {
            const possAbbr = sit.possession && home?.team?.id === sit.possession ? (home?.team?.abbreviation || '')
                : sit.possession && away?.team?.id === sit.possession ? (away?.team?.abbreviation || '')
                : '';
            situation = {
                text: possAbbr ? `${possAbbr} · ${sit.shortDownDistanceText}` : sit.shortDownDistanceText,
                isRedZone: !!sit.isRedZone,
            };
        }
        return {
            id:       ev.id,
            name:     ev.name,
            date:     ev.date,
            homeTeam: {
                abbr:   home?.team?.abbreviation || '?',
                name:   home?.team?.displayName  || '',
                logo:   home?.team?.logo || getNFLTeamLogoUrl(home?.team?.abbreviation),
                score:  parseInt(home?.score || '0', 10),
                winner: home?.winner === true,
            },
            awayTeam: {
                abbr:   away?.team?.abbreviation || '?',
                name:   away?.team?.displayName  || '',
                logo:   away?.team?.logo || getNFLTeamLogoUrl(away?.team?.abbreviation),
                score:  parseInt(away?.score || '0', 10),
                winner: away?.winner === true,
            },
            isFinal,
            isLive,
            statusText: status?.type?.shortDetail || status?.type?.description || '',
            period: status?.period || 0,
            clock:  status?.displayClock || '',
            // D-043 3a: national network, when ESPN has one (verified live 2026-08-02 —
            // competitions[].broadcasts[] = [{market, names:[...]}]).
            // D-097: now also rendered on the Scores grid card itself (previously
            // parsed but never consumed anywhere — dead data). Strictly market:
            // 'national' only -- live-checked against real preseason games and a
            // local-only broadcast (comp.broadcasts[0] when there's no national
            // feed) returns team-network/affiliate strings like "Bengals Preseason
            // TV Network" or "WUSA9": too long for the date line and not a signal
            // a national audience recognizes. No national feed => no caption,
            // same "absent degrades to nothing" rule the field always had.
            broadcast: comp.broadcasts?.find(b => b.market === 'national')?.names?.[0] || '',
            // D-096: down/distance + possession + red-zone, live games only, null otherwise.
            situation,
        };
    }).filter(Boolean);
}

// fetchNFLStandings/loadNFLStandings/displayNFLStandings removed 2026-08-02 (Finn,
// live-verify pass): dead code since D-029 shipped js/nflStandings.js, which loads
// after this file and intentionally redefines all three names in global scope (see
// that file's own header comment). This block called the ESPN /standings endpoint
// that D-029's comment notes is a dead stub returning only a fullViewLink — confirmed
// live that window.displayNFLStandings on production resolves to nflStandings.js's
// version, never this one. See ISSUES.md N-5 for the full writeup.

// ── Display: Teams ────────────────────────────────────────────

async function loadNFLTeams() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';
    if (window.setBreadcrumb) setBreadcrumb('nfl-teams', null);

    grid.innerHTML = Array.from({ length: 8 }, () =>
        `<div class="skeleton-card" style="min-height:120px"></div>`
    ).join('');

    try {
        if (!AppState.nflTeams.length) AppState.nflTeams = await fetchNFLTeams();
        displayNFLTeams(AppState.nflTeams);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLTeams, { tag: 'NFL', title: 'Failed to Load NFL Teams' });
    }
}

function displayNFLTeams(teams) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';

    if (!teams?.length) {
        ErrorHandler.renderEmptyState(grid, 'No NFL team data available', '🏈');
        return;
    }

    const confs = { AFC: { East: [], North: [], South: [], West: [] }, NFC: { East: [], North: [], South: [], West: [] } };
    const other = [];
    teams.forEach(t => {
        const d = _NFL_DIVISIONS[t.abbr];
        if (!d) { other.push(t); return; }
        const [conf, div] = d.split(' ');
        (confs[conf] && confs[conf][div] ? confs[conf][div] : other).push(t);
    });

    const card = t => `
        <button class="team-pick" style="--team:${t.color || 'var(--accent)'}" onclick="navigateTo('nfl-team-${t.abbr}')">
            <img class="team-pick__logo" src="${t.logo}" alt="${_escHtml(t.shortName)}" loading="lazy" data-hide-on-error>
            <span class="team-pick__name">${_escHtml(t.shortName)}</span>
            <span class="team-pick__abbr">${_escHtml(t.abbr)}${t.record ? ' · ' + _escHtml(t.record) : ''}</span>
        </button>`;

    const divOrder = ['East', 'North', 'South', 'West'];
    const confHtml = conf => `
        <section class="teams-conf">
            <h2 class="teams-conf__title">${conf}</h2>
            <div class="teams-divs">
                ${divOrder.map(div => {
                    const list = (confs[conf][div] || []).slice().sort((a, b) => (a.shortName || '').localeCompare(b.shortName || ''));
                    if (!list.length) return '';
                    return `<div class="teams-div">
                        <h3 class="teams-div__title">${conf} ${div}</h3>
                        <div class="teams-div__list">${list.map(card).join('')}</div>
                    </div>`;
                }).join('')}
            </div>
        </section>`;

    const offNote = (_nflHasNoOfficialRecord() && teams.every(t => !t.record))
        ? `<div class="nfl-teams-note">Records show 0–0 until the ${NFL_FANTASY_SEASON} season starts.</div>` : '';

    let html = `<div class="teams-page">${offNote}${confHtml('AFC')}${confHtml('NFC')}`;
    if (other.length) {
        html += `<section class="teams-conf"><h2 class="teams-conf__title">Other</h2><div class="teams-div__list" style="max-width:280px">${other.map(card).join('')}</div></section>`;
    }
    html += '</div>';
    grid.innerHTML = html;
}

// ── Display: Scores ───────────────────────────────────────────

// ── Scores week/season navigator (2026-08-09) ───────────────────
// ESPN's zero-param /scoreboard only ever returns whatever narrow "today"
// window the upstream feels like -- as of this build that's a single
// preseason game, with no way for a visitor to see anything else. The fix
// isn't a smarter default, it's letting people browse: season-type tabs +
// a scrollable week-pill row, reusing the exact seasontype/week/dates params
// nflStandings.js's fetchNFLPostseason() already proves work in production.
const _NFL_SEASONTYPES = [
    { type: 1, label: 'Preseason', weeks: 3 },
    { type: 2, label: 'Regular Season', weeks: 18 },
    { type: 3, label: 'Postseason', weeks: 5 },
];
// Reuses the round mapping already established in nflStandings.js's own header
// comment (week 4 is the Pro Bowl, not a real round -- kept only so the pill
// row has no numbering gap).
const _NFL_POSTSEASON_WEEK_LABELS = { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf. Champ', 4: 'Pro Bowl', 5: 'Super Bowl' };

// null = "Today" (the original zero-param/current-week ESPN default). Set to
// { seasontype, week, season } once the user explicitly picks a tab/week.
let _nflScoresFilter = null;

function _nflScoresNavDefaults() {
    const phase = _nflSeasonPhase();
    if (phase === 'postseason') return { type: 3, season: NFL_STATS_SEASON };
    if (phase === 'preseason')  return { type: 1, season: NFL_FANTASY_SEASON };
    return { type: 2, season: NFL_FANTASY_SEASON };
}

function _renderNFLScoresNav() {
    const grid = document.getElementById('playersGrid');
    const main = document.querySelector('main');
    if (!grid || !main) return;
    document.getElementById('nflScoresNav')?.remove();

    const f = _nflScoresFilter;
    const defaults = _nflScoresNavDefaults();
    const activeType = f ? f.seasontype : defaults.type;
    const season = f ? f.season : defaults.season;
    const typeMeta = _NFL_SEASONTYPES.find(t => t.type === activeType) || _NFL_SEASONTYPES[1];

    const pillStyle = (active) => `padding:0.32rem 0.78rem;border-radius:var(--radius-full);
        border:1px solid ${active ? 'var(--accent)' : 'var(--border-default)'};
        background:${active ? 'var(--accent)' : 'transparent'};
        color:${active ? '#0b0b0d' : 'var(--text-secondary)'};
        font-weight:700;font-size:0.74rem;cursor:pointer;white-space:nowrap;flex-shrink:0`;

    const todayBtn = `<button data-nfl-stoday="1" style="${pillStyle(!f)}">Today</button>`;
    const typeBtns = _NFL_SEASONTYPES.map(t =>
        `<button data-nfl-stype="${t.type}" style="${pillStyle(!!f && t.type === activeType)}">${t.label}</button>`
    ).join('');

    const weekLabel = (w) => activeType === 3 ? (_NFL_POSTSEASON_WEEK_LABELS[w] || `Wk ${w}`) : `Wk ${w}`;
    const weeks = Array.from({ length: typeMeta.weeks }, (_, i) => i + 1);
    const weekBtns = weeks.map(w => {
        const active = !!f && f.week === w;
        return `<button data-nfl-sweek="${w}" style="padding:0.3rem 0.66rem;border-radius:var(--radius-full);
            border:1px solid ${active ? 'var(--accent)' : 'var(--border-default)'};
            background:${active ? 'var(--accent)' : 'transparent'};
            color:${active ? '#0b0b0d' : 'var(--text-secondary)'};
            font-weight:600;font-size:0.7rem;cursor:pointer;white-space:nowrap;flex-shrink:0">${weekLabel(w)}</button>`;
    }).join('');

    const nav = document.createElement('div');
    nav.id = 'nflScoresNav';
    nav.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;padding:0 0.25rem 0.9rem';
    nav.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem">
            ${todayBtn}${typeBtns}
            <span style="margin-left:auto;font-size:0.7rem;color:var(--text-muted)">${season}</span>
        </div>
        <div class="nfl-week-scroll" style="display:flex;align-items:center;gap:0.35rem;overflow-x:auto;padding-bottom:2px">${weekBtns}</div>
    `;
    main.insertBefore(nav, grid);

    nav.querySelector('[data-nfl-stoday]').onclick = () => { _nflScoresFilter = null; loadNFLGames(); };
    nav.querySelectorAll('[data-nfl-stype]').forEach(btn => {
        btn.onclick = () => {
            const type = parseInt(btn.dataset.nflStype, 10);
            const s = type === 3 ? NFL_STATS_SEASON : NFL_FANTASY_SEASON;
            _nflScoresFilter = { seasontype: type, week: 1, season: s };
            loadNFLGames();
        };
    });
    nav.querySelectorAll('[data-nfl-sweek]').forEach(btn => {
        btn.onclick = () => {
            _nflScoresFilter = { seasontype: activeType, week: parseInt(btn.dataset.nflSweek, 10), season };
            loadNFLGames();
        };
    });
}

// ── NFL season opener (≈ Thursday after Labor Day) + countdown ──
function _nflKickoffDate() {
    const y = NFL_FANTASY_SEASON;
    const sep1 = new Date(y, 8, 1);
    const firstThu = 1 + ((4 - sep1.getDay() + 7) % 7);
    return new Date(y, 8, firstThu + 7);
}
function _nflDaysToKickoff() {
    return Math.max(0, Math.ceil((_nflKickoffDate() - new Date()) / 86400000));
}

// loadNFLHome() (season-aware NFL home) lived here — removed 2026-08-09 (D-076).
// Confirmed unreachable: renderCurrentView() intercepts every `{sport}-home` view via
// the D-045 _renderSportLanding route before _renderNFLView's switch is ever reached,
// so the `case 'nfl-home':` branch that called this function could never run either
// (also removed, js/navigation.js). D-063 added real phase-aware copy to this function
// without noticing the route change had already orphaned it — see D-063's own
// live-verification note and D-076. The one genuinely load-bearing piece (the
// phase-aware seasonal line) now lives in js/app.js as _nflLandingTag(), feeding the
// route that actually renders.
async function loadNFLGames() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';
    if (window.setBreadcrumb) setBreadcrumb('nfl-games', null);

    _renderNFLScoresNav();

    grid.innerHTML = Array.from({ length: 6 }, () =>
        `<div class="skeleton-card" style="min-height:160px"></div>`
    ).join('');

    try {
        const games = await fetchNFLScoreboard(_nflScoresFilter || {});
        AppState.nflGames = games;
        displayNFLGames(games);
        // Only the real "Today" default feeds the header ticker -- a user
        // browsing Week 3 of a past preseason shouldn't push those scores
        // into the site-wide live ticker.
        if (!_nflScoresFilter) updateNFLTicker(games);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLGames, { tag: 'NFL', title: 'Failed to Load NFL Scores' });
    }
}

function displayNFLGames(games) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';

    if (!games?.length) {
        grid.className = '';
        grid.innerHTML = _nflIsOffseason()
            ? _nflOffseasonState('scores')
            : '';
        if (!_nflIsOffseason()) ErrorHandler.renderEmptyState(grid, 'No NFL games scheduled right now.', '🏈');
        return;
    }

    const rank = (g) => g.isLive ? 0 : (!g.isFinal ? 1 : 2);
    const ordered = games.slice().sort((a, b) => rank(a) - rank(b));
    const liveCount = games.filter(g => g.isLive).length;
    const fragment = document.createDocumentFragment();
    if (liveCount) {
        const h = document.createElement('div');
        h.className = 'nfl-gameday-head';
        h.innerHTML = `<span class="nlg-livebadge">● LIVE NOW</span> ${liveCount} game${liveCount > 1 ? 's' : ''} in progress`;
        fragment.appendChild(h);
    }
    ordered.forEach(game => fragment.appendChild(_createNFLGameCard(game)));
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

function _createNFLGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card' + (game.isLive ? ' game-card--live' : '');
    card.dataset.gameId = game.id;
    card.style.cursor = 'pointer';
    card.onclick = () => navigateTo('nfl-game-' + game.id);

    const hs = game.homeTeam.score;
    const as = game.awayTeam.score;
    const hasScore = game.isFinal || game.isLive || hs > 0 || as > 0;

    const statusCls = game.isFinal ? 'game-status--final' : game.isLive ? 'game-status--live' : 'game-status--sched';

    let dateStr = '';
    if (game.date) {
        try { dateStr = new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (_) {}
    }

    card.innerHTML = `
        <div class="game-date">${dateStr}${game.broadcast ? ` · ${_escHtml(game.broadcast)}` : ''}</div>
        <div class="game-teams">
            <div class="game-team ${game.awayTeam.winner ? 'game-team--winner' : ''}">
                <div class="game-team-logo">
                    <img src="${game.awayTeam.logo}" alt="${_escHtml(game.awayTeam.abbr)}" class="game-logo-img" loading="lazy" data-hide-on-error>
                </div>
                <span class="game-team-abbr">${_escHtml(game.awayTeam.abbr)}</span>
                ${hasScore ? `<span class="game-score ${game.awayTeam.winner ? 'game-score--win' : ''}">${as}</span>` : ''}
            </div>
            <div class="game-vs">@</div>
            <div class="game-team ${game.homeTeam.winner ? 'game-team--winner' : ''}">
                ${hasScore ? `<span class="game-score ${game.homeTeam.winner ? 'game-score--win' : ''}">${hs}</span>` : ''}
                <span class="game-team-abbr">${_escHtml(game.homeTeam.abbr)}</span>
                <div class="game-team-logo">
                    <img src="${game.homeTeam.logo}" alt="${_escHtml(game.homeTeam.abbr)}" class="game-logo-img" loading="lazy" data-hide-on-error>
                </div>
            </div>
        </div>
        <div class="game-status ${statusCls}">
            ${_escHtml(game.statusText || (game.isFinal ? 'Final' : 'Scheduled'))}
            ${game.isLive && game.clock ? ` · ${_escHtml(game.clock)}` : ''}
        </div>
        ${game.isLive && game.situation ? `<div class="game-situation${game.situation.isRedZone ? ' game-situation--redzone' : ''}">${_escHtml(game.situation.text)}</div>` : ''}
    `;
    return card;
}

// ── Sleeper player pool (validated NFL player source) ─────────
// ESPN's site API exposes no working /leaders or roster path, so player-level
// NFL data comes from Sleeper's public API via the same-origin /api/sleeper proxy.
let _nflPool    = null;     // active fantasy players sorted by ADP (search_rank)
let _nflPoolMap = null;     // { [sleeper_id]: rawPlayer }
let _nflPosFilter = sessionStorage.getItem('ss_nfl_pos_filter') || 'ALL';

const _NFL_POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];
// NFL team primary colors (curated for visibility on the dark UI) — drives player
// card + profile accents so they read as the team, not the position.
const _NFL_TEAM_COLOR = {
    ARI: '#C41E3A', ATL: '#E31837', BAL: '#5B43A8', BUF: '#0E63D6', CAR: '#0085CA',
    CHI: '#E64100', CIN: '#FB4F14', CLE: '#FF6A00', DAL: '#2A6FDB', DEN: '#FB4F14',
    DET: '#0095DB', GB: '#FFB612', HOU: '#E31837', IND: '#0A5BD6', JAX: '#00A39B',
    KC: '#E31837', LV: '#C4CDD3', LAC: '#0080C6', LAR: '#FFA300', MIA: '#00B2BE',
    MIN: '#7A5BC2', NE: '#C8102E', NO: '#D3BC8D', NYG: '#1A45C2', NYJ: '#1C8A5B',
    PHI: '#1A8C8C', PIT: '#FFB612', SEA: '#69BE28', SF: '#C8102E', TB: '#D50A0A',
    TEN: '#4B92DB', WAS: '#C9243F',
};
const _NFL_TEAM_COLOR_ALIAS = { OAK: 'LV', SD: 'LAC', STL: 'LAR', LA: 'LAR', WSH: 'WAS', ARZ: 'ARI', JAC: 'JAX' };
function getNFLTeamColor(abbr) {
    if (!abbr) return null;
    const a = String(abbr).toUpperCase();
    return _NFL_TEAM_COLOR[_NFL_TEAM_COLOR_ALIAS[a] || a] || null;
}
const _NFL_POS_COLOR = { QB: 'var(--nfl-pos-qb)', RB: 'var(--nfl-pos-rb)', WR: 'var(--nfl-pos-wr)', TE: 'var(--nfl-pos-te)', K: 'var(--nfl-pos-k)' };
const _nflAlpha = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

async function fetchNFLSleeperPool() {
    if (_nflPool) return _nflPool;
    const res = await fetch('/api/sleeper?path=/v1/players/nfl');
    if (!res.ok) throw new Error(`Sleeper players ${res.status}`);
    const raw = await res.json();
    _nflPoolMap = raw;
    _nflPool = Object.values(raw)
        .filter(p => p && p.active && p.full_name && Array.isArray(p.fantasy_positions)
                     && p.fantasy_positions.length && p.search_rank && p.search_rank < 9999)
        .sort((a, b) => a.search_rank - b.search_rank);
    _nflPool.forEach((p, i) => { p._adp = i + 1; });  // dense ADP (search_rank has ties)
    return _nflPool;
}

function getNFLSleeperHeadshot(id) {
    return id ? `https://sleepercdn.com/content/nfl/players/${id}.jpg` : null;
}

// ── Display: Players (reuses the .player-card component) ───────
async function loadNFLPlayers() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-players', null);

    grid.innerHTML = Array.from({ length: 8 }, () =>
        `<div class="skeleton-card" style="min-height:240px"></div>`
    ).join('');

    try {
        await fetchNFLSleeperPool();
        displayNFLPlayers();
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLPlayers, { tag: 'NFL', title: 'Failed to Load NFL Players' });
    }
}

function displayNFLPlayers() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';

    const pool = _nflPool || [];
    if (!pool.length) {
        ErrorHandler.renderEmptyState(grid, 'No NFL player data available', '🏈');
        return;
    }

    const filtered = _nflPosFilter === 'ALL'
        ? pool
        : pool.filter(p => p.fantasy_positions.includes(_nflPosFilter));
    const shown = filtered.slice(0, 120);

    const chip = (f) => {
        const active = f === _nflPosFilter;
        return `<button data-nfl-pos="${f}" style="padding:0.32rem 0.74rem;border-radius:var(--radius-full);
            border:1px solid ${active ? 'var(--accent)' : 'var(--border-default)'};
            background:${active ? 'var(--accent)' : 'transparent'};
            color:${active ? '#0b0b0d' : 'var(--text-secondary)'};
            font-weight:700;font-size:0.72rem;cursor:pointer">${f}</button>`;
    };
    const bar = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem;padding:0 0.25rem 0.85rem">
        ${_NFL_POS_FILTERS.map(chip).join('')}
        <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted)">Top ${shown.length} by ADP</span>
    </div>`;

    const cards = document.createElement('div');
    cards.className = 'players-grid';
    shown.forEach(p => cards.appendChild(_createNFLPlayerCard(p)));

    grid.innerHTML = bar;
    grid.appendChild(cards);

    grid.querySelectorAll('[data-nfl-pos]').forEach(btn => {
        btn.addEventListener('click', () => { _nflPosFilter = btn.dataset.nflPos; sessionStorage.setItem('ss_nfl_pos_filter', _nflPosFilter); displayNFLPlayers(); });
    });
}

function _createNFLPlayerCard(p) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.style.cursor = 'pointer';
    card.onclick = () => navigateTo('nfl-player-' + p.player_id);

    const pos      = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
    const posColor = getNFLTeamColor(p.team) || _NFL_POS_COLOR[pos] || 'var(--accent)';
    card.style.borderTop = `3px solid ${_nflAlpha(posColor, 80)}`;

    const initials = (p.full_name || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const headshot = getNFLSleeperHeadshot(p.player_id);
    const inches   = parseInt(p.height, 10);
    const htStr    = (!isNaN(inches) && inches > 0) ? `${Math.floor(inches / 12)}'${inches % 12}"` : (p.height || '—');

    const rows = [
        ['POS',     pos || '—'],
        ['TEAM',    p.team || 'FA'],
        ['AGE',     p.age != null ? p.age : '—'],
        ['EXP',     p.years_exp != null ? (p.years_exp === 0 ? 'Rookie' : `${p.years_exp} yr`) : '—'],
        ['HT / WT', `${htStr}${p.weight ? ' · ' + p.weight : ''}`],
        ['COLLEGE', p.college || '—'],
    ].map(([l, v]) =>
        `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${_escHtml(String(v))}</span></div>`
    ).join('');

    const rankBadge = `<span class="player-rank-badge ${p._adp <= 12 ? 'player-rank-badge--top' : ''}">#${p._adp} ADP</span>`;
    const inj = p.injury_status
        ? `<div class="player-team" style="color:var(--color-loss);font-size:0.68rem">${_escHtml(p.injury_status)}</div>`
        : '';

    card.innerHTML = `
        <div class="player-card-top">
            ${rankBadge}
            ${typeof renderFollowStar === 'function' ? renderFollowStar('nfl', 'player', p.player_id, { cardCorner: true }) : ''}
            <div class="player-avatar nfl-pos-grad" style="--pc:${posColor}">
                ${headshot ? `<img class="player-headshot" src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="avatar-text">${initials}</span>
            </div>
            <div class="player-name">${_escHtml(p.full_name)}</div>
            <div class="player-team">${p.team ? _escHtml(p.team) + ' · ' : ''}${_escHtml(pos)}${p.number ? ' · #' + p.number : ''}</div>
            ${inj}
        </div>
        <div class="player-details">${rows}</div>
        <div class="card-cta">VIEW PROFILE →</div>
    `;
    return card;
}

// ── Display: Trending (fantasy add/drop — reuses leaderboard panel) ──
async function loadNFLLeaderboards() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-trending', null);

    grid.innerHTML = Array.from({ length: 2 }, () =>
        `<div class="skeleton-card" style="min-height:360px"></div>`
    ).join('');

    try {
        await fetchNFLSleeperPool();
        const [adds, drops] = await Promise.all([
            fetch('/api/sleeper?path=/v1/players/nfl/trending/add').then(r => r.json()),
            fetch('/api/sleeper?path=/v1/players/nfl/trending/drop').then(r => r.json()),
        ]);
        displayNFLTrending(adds, drops);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLLeaderboards, { tag: 'NFL', title: 'Failed to Load NFL Trending' });
    }
}

function displayNFLTrending(adds, drops) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    grid.innerHTML = (typeof _hqStrip === 'function') ? _hqStrip('nfl-trending') : '';

    const panel = (title, icon, list, accent) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'padding:0;overflow:hidden';
        const items = (list || []).slice(0, 12);
        const rows = items.map((e, i) => {
            const p    = _nflPoolMap?.[e.player_id];
            const name = p ? p.full_name : 'Unknown player';
            const meta = p ? `${p.team || 'FA'}${p.position ? ' · ' + p.position : ''}` : '';
            const hs   = getNFLSleeperHeadshot(e.player_id);
            const clickAttr = p ? ` onclick="navigateTo('nfl-player-${e.player_id}')"` : '';
            return `
            <div${clickAttr} class="nfl-lrow${p ? ' nfl-lrow--link' : ''}">
                <span class="nfl-lrow-rank">${i + 1}</span>
                <div class="nfl-lrow-av"><img src="${hs || ''}" alt="" loading="lazy" data-hide-on-error></div>
                <div class="nfl-lrow-main">
                    <div class="nfl-lrow-name">${_escHtml(name)}</div>
                    <div class="nfl-lrow-meta">${_escHtml(meta)}</div>
                </div>
                <span class="nfl-lrow-val" style="color:${accent}">${Number(e.count || 0).toLocaleString()}</span>
            </div>`;
        }).join('');
        card.innerHTML = `
            <div class="nfl-card-head" style="gap:0.4rem">
                <span>${icon}</span> ${title}
            </div>
            ${rows || '<div style="padding:1rem;color:var(--text-muted);text-align:center;font-size:0.82rem">No trending data</div>'}`;
        return card;
    };

    const note = document.createElement('div');
    note.style.cssText = 'grid-column:1/-1;font-size:0.74rem;color:var(--text-muted);padding:0 0.25rem 0.4rem';
    note.textContent = 'Most-added and most-dropped players across fantasy leagues in the last 24 hours. Source: Sleeper.';

    grid.appendChild(note);
    grid.appendChild(panel('Trending Adds', '📈', adds, 'var(--color-win)'));
    grid.appendChild(panel('Trending Drops', '📉', drops, 'var(--color-loss)'));
}

// ── Display: Injury Report (N-17) — cross-team, grouped by status ──
// Pure client-side filter/group over the already-cached Sleeper pool, same
// data _renders_ inline elsewhere (roster rows, player cards) but was never
// browsable league-wide before this. Reuses .nfl-lrow (Trending's row shape)
// and _NFL_POS_FILTERS (Players' filter pills) rather than inventing either.
const _NFL_INJ_STATUS_ORDER = ['Questionable', 'IR', 'PUP', 'DNR', 'Sus'];
let _nflInjPosFilter = 'ALL';

async function loadNFLInjuries() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-injuries', null);
    grid.innerHTML = (typeof _hqStrip === 'function' ? _hqStrip('nfl-injuries') : '') +
        Array.from({ length: 3 }, () => `<div class="skeleton-card" style="min-height:200px"></div>`).join('');
    try {
        await fetchNFLSleeperPool();
        displayNFLInjuries();
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLInjuries, { tag: 'NFL', title: 'Failed to Load Injury Report' });
    }
}

function displayNFLInjuries() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';

    // Rostered players only — an unassigned injury_status entry (free agent /
    // inactive DB record) isn't a "current" injury anyone can act on. Confirmed
    // live 2026-08-02: ~44% of raw injury_status entries have no team.
    const pool = Object.values(_nflPoolMap || {})
        .filter(p => p && p.active && p.team && p.injury_status);

    const filtered = _nflInjPosFilter === 'ALL'
        ? pool
        : pool.filter(p => p.position === _nflInjPosFilter);

    const chip = (f) => {
        const active = f === _nflInjPosFilter;
        return `<button data-nfl-inj-pos="${f}" style="padding:0.32rem 0.74rem;border-radius:var(--radius-full);
            border:1px solid ${active ? 'var(--accent)' : 'var(--border-default)'};
            background:${active ? 'var(--accent)' : 'transparent'};
            color:${active ? '#0b0b0d' : 'var(--text-secondary)'};
            font-weight:700;font-size:0.72rem;cursor:pointer">${f}</button>`;
    };
    const bar = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem;padding:0 0.25rem 0.85rem">
        ${_NFL_POS_FILTERS.map(chip).join('')}
        <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted)">${filtered.length} reported</span>
    </div>`;

    let html = (typeof _hqStrip === 'function' ? _hqStrip('nfl-injuries') : '') + bar;

    if (!filtered.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'grid-column:1/-1';
        ErrorHandler.renderEmptyState(empty, 'No injuries currently reported league-wide.', '🩺');
        grid.innerHTML = html;
        grid.appendChild(empty);
        grid.querySelectorAll('[data-nfl-inj-pos]').forEach(btn => {
            btn.addEventListener('click', () => { _nflInjPosFilter = btn.dataset.nflInjPos; displayNFLInjuries(); });
        });
        return;
    }

    const grouped = {};
    filtered.forEach(p => { (grouped[p.injury_status] || (grouped[p.injury_status] = [])).push(p); });
    const order = [..._NFL_INJ_STATUS_ORDER, ...Object.keys(grouped).filter(s => !_NFL_INJ_STATUS_ORDER.includes(s))];

    order.forEach(status => {
        const rows = grouped[status];
        if (!rows || !rows.length) return;
        rows.sort((a, b) => (a.search_rank || 1e9) - (b.search_rank || 1e9) || (a.full_name || '').localeCompare(b.full_name || ''));
        const color = 'var(--color-loss)';
        const rowsHtml = rows.map(p => {
            const hs = getNFLSleeperHeadshot(p.player_id);
            const detail = [p.injury_body_part, p.injury_notes].filter(Boolean).join(' · ');
            return `
            <div onclick="navigateTo('nfl-player-${p.player_id}')" class="nfl-lrow nfl-lrow--link">
                <div class="nfl-lrow-av"><img src="${hs || ''}" alt="" loading="lazy" data-hide-on-error></div>
                <div class="nfl-lrow-main">
                    <div class="nfl-lrow-name">${_escHtml(p.full_name)}</div>
                    <div class="nfl-lrow-meta">${_escHtml(p.team || 'FA')}${p.position ? ' · ' + _escHtml(p.position) : ''}${detail ? ' · ' + _escHtml(detail) : ''}</div>
                </div>
                <span class="nfl-lrow-val" style="color:${color};font-size:0.7rem">${_escHtml(status)}</span>
            </div>`;
        }).join('');
        html += `<div class="card" style="padding:0;overflow:hidden;grid-column:1/-1">
            <div class="nfl-card-head" style="gap:0.4rem"><span>${_escHtml(status)}</span> <span class="team-section__count">${rows.length}</span></div>
            ${rowsHtml}
        </div>`;
    });

    grid.innerHTML = html;
    grid.querySelectorAll('[data-nfl-inj-pos]').forEach(btn => {
        btn.addEventListener('click', () => { _nflInjPosFilter = btn.dataset.nflInjPos; displayNFLInjuries(); });
    });
}

// ── Display: Waiver Wire (N-18) — trending adds, curated for pickups ──
// Adds-only (Trending keeps drops — no content duplication between the two
// pages). Checked live before designing: search_rank is NOT a usable filter
// here (every real trending-add entry carries Sleeper's 999/9999999 "no ADP"
// sentinel, since by definition these are undrafted deep-roster names). The
// real differentiator is a same-team/same-position injury_status join (N-17
// data) that surfaces WHY a name might be trending, which a raw add-count
// list can't. No login/roster on this site (D-031, not started), so this
// can't know "your" bench — it's a discovery tool, not a personalized one.
let _nflWaiverPosFilter = 'ALL';

async function loadNFLWaivers() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-waivers', null);
    grid.innerHTML = (typeof _hqStrip === 'function' ? _hqStrip('nfl-waivers') : '') +
        Array.from({ length: 3 }, () => `<div class="skeleton-card" style="min-height:200px"></div>`).join('');
    try {
        await fetchNFLSleeperPool();
        const adds = await fetch('/api/sleeper?path=/v1/players/nfl/trending/add').then(r => r.json());
        displayNFLWaivers(adds);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLWaivers, { tag: 'NFL', title: 'Failed to Load Waiver Wire' });
    }
}

function displayNFLWaivers(adds) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';

    const byTeamPos = {};
    Object.values(_nflPoolMap || {}).forEach(p => {
        if (p && p.active && p.team && p.position) (byTeamPos[p.team + '|' + p.position] || (byTeamPos[p.team + '|' + p.position] = [])).push(p);
    });

    const enriched = (adds || []).map(e => {
        const p = _nflPoolMap?.[e.player_id];
        if (!p) return null;
        const teammate = (byTeamPos[p.team + '|' + p.position] || []).find(t => t.player_id !== p.player_id && t.injury_status);
        return { p, count: e.count, teammate };
    }).filter(Boolean);

    const filtered = _nflWaiverPosFilter === 'ALL'
        ? enriched
        : enriched.filter(e => e.p.position === _nflWaiverPosFilter);
    const shown = filtered.slice(0, 24);

    const chip = (f) => {
        const active = f === _nflWaiverPosFilter;
        return `<button data-nfl-wv-pos="${f}" style="padding:0.32rem 0.74rem;border-radius:var(--radius-full);
            border:1px solid ${active ? 'var(--accent)' : 'var(--border-default)'};
            background:${active ? 'var(--accent)' : 'transparent'};
            color:${active ? '#0b0b0d' : 'var(--text-secondary)'};
            font-weight:700;font-size:0.72rem;cursor:pointer">${f}</button>`;
    };
    const bar = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem;padding:0 0.25rem 0.85rem">
        ${_NFL_POS_FILTERS.map(chip).join('')}
        <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted)">Top ${shown.length} adds, last 24h · Source: Sleeper</span>
    </div>`;

    let html = (typeof _hqStrip === 'function' ? _hqStrip('nfl-waivers') : '') + bar;

    if (!shown.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'grid-column:1/-1';
        ErrorHandler.renderEmptyState(empty, 'No trending waiver adds right now.', '📈');
        grid.innerHTML = html;
        grid.appendChild(empty);
        grid.querySelectorAll('[data-nfl-wv-pos]').forEach(btn => {
            btn.addEventListener('click', () => { _nflWaiverPosFilter = btn.dataset.nflWvPos; displayNFLWaivers(adds); });
        });
        return;
    }

    const rowsHtml = shown.map(({ p, count, teammate }) => {
        const hs = getNFLSleeperHeadshot(p.player_id);
        const hint = teammate ? `<div class="nfl-lrow-meta">↳ possible opportunity: ${_escHtml(teammate.full_name)} (${_escHtml(teammate.injury_status)})</div>` : '';
        return `
        <div onclick="navigateTo('nfl-player-${p.player_id}')" class="nfl-lrow nfl-lrow--link" style="align-items:flex-start">
            <div class="nfl-lrow-av"><img src="${hs || ''}" alt="" loading="lazy" data-hide-on-error></div>
            <div class="nfl-lrow-main">
                <div class="nfl-lrow-name">${_escHtml(p.full_name)}</div>
                <div class="nfl-lrow-meta">${_escHtml(p.team || 'FA')}${p.position ? ' · ' + _escHtml(p.position) : ''}</div>
                ${hint}
            </div>
            <span class="nfl-lrow-val" style="color:var(--color-win)">+${Number(count || 0).toLocaleString()}</span>
        </div>`;
    }).join('');

    html += `<div class="card" style="padding:0;overflow:hidden;grid-column:1/-1">${rowsHtml}</div>`;

    grid.innerHTML = html;
    grid.querySelectorAll('[data-nfl-wv-pos]').forEach(btn => {
        btn.addEventListener('click', () => { _nflWaiverPosFilter = btn.dataset.nflWvPos; displayNFLWaivers(adds); });
    });
}

// ── Ticker ────────────────────────────────────────────────────

function updateNFLTicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;

    const scored = (games || []).filter(g => g.isFinal || g.isLive || g.homeTeam.score > 0 || g.awayTeam.score > 0);

    if (!scored.length) {
        ticker.classList.add('ticker--idle');
        // Distinguish "no games today" (a real in-season/preseason gap
        // between games) from "season hasn't started" (true Mar-Aug
        // offseason) -- flagged live 2026-08-13/14 during the preseason
        // debugging session (ISSUES.md "Live NFL preseason debugging
        // session"): the old copy was flatly wrong the moment a preseason
        // week is underway and today just happens to have no live/final
        // game yet. See DECISIONS.md D-094.
        const phase = (typeof _nflSeasonPhase === 'function') ? _nflSeasonPhase() : null;
        const idleMsg = (phase === 'preseason' || phase === 'regular' || phase === 'postseason')
            ? 'No NFL games today — check back soon'
            : 'No NFL scores — season runs Sep–Feb';
        ticker.innerHTML = `<div class="ticker__item">${idleMsg}</div>`;
        return;
    }

    const items = [...scored, ...scored]
        .map(g => Scorebug.renderTickerItem(Scorebug.normalizeNFLGame(g)))
        .join('');

    ticker.classList.remove('ticker--idle');
    ticker.innerHTML = items;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
    }));
}

// ── Display: Stat Leaders (real season stats via /api/nflstats) ──
const _NFL_STAT_COLORS = ['var(--nfl-cat-1)','var(--nfl-cat-2)','var(--nfl-cat-3)','var(--nfl-cat-4)','var(--nfl-cat-5)','var(--nfl-cat-6)','var(--nfl-cat-7)','var(--nfl-cat-8)','var(--nfl-cat-9)'];

let _nflLeaderSeason = null;  // null = current season (server auto-detects)

async function loadNFLStatLeaders() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-leaders', null);

    grid.innerHTML = Array.from({ length: 6 }, () =>
        `<div class="skeleton-card" style="min-height:260px"></div>`
    ).join('');

    try {
        const qs = _nflLeaderSeason ? `?season=${_nflLeaderSeason}` : '';
        const cacheKey = `nfl:statleaders:${_nflLeaderSeason || 'cur'}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch('/api/nflstats' + qs);
            if (!res.ok) throw new Error(`Stat leaders ${res.status}`);
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        if (!data.categories || !data.categories.length) {
            ErrorHandler.renderEmptyState(grid, 'Stat leaders are unavailable right now.', '🏈');
            return;
        }
        try { await fetchNFLSleeperPool(); } catch (err) { Logger.warn('Sleeper pool fetch failed on leaders load', err, 'NFL'); }
        displayNFLStatLeaders(data);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLStatLeaders, { tag: 'NFL', title: 'Failed to Load NFL Leaders' });
    }
}

function displayNFLStatLeaders(data) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.style.cssText = '';
    grid.innerHTML = '';

    const bar = document.createElement('div');
    bar.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;padding:0 0.25rem 0.6rem';
    let opts = '';
    for (let y = NFL_STATS_SEASON; y >= NFL_LEADERS_MIN_SEASON; y--) opts += `<option value="${y}" ${y === data.season ? 'selected' : ''}>${y}</option>`;
    bar.innerHTML = `
        <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.78rem;color:var(--text-secondary);font-weight:700">
            Season
            <select id="nflLeaderSeason" style="background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-sm,6px);padding:0.3rem 0.5rem;font-weight:700;cursor:pointer">${opts}</select>
        </label>
        <span style="font-size:0.74rem;color:var(--text-muted)">${data.season} regular-season leaders · Source: ESPN</span>`;
    grid.appendChild(bar);
    bar.querySelector('#nflLeaderSeason').addEventListener('change', e => { _nflLeaderSeason = e.target.value; loadNFLStatLeaders(); });

    const _nflLeaderNrm = x => (x || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
    const _nflLeaderNameIdx = {}; (_nflPool || []).forEach(pl => { _nflLeaderNameIdx[_nflLeaderNrm(pl.full_name)] = pl.player_id; });

    data.categories.forEach((cat, ci) => {
        const color = _NFL_STAT_COLORS[ci % _NFL_STAT_COLORS.length];
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = `padding:0;overflow:hidden;border-left:3px solid ${color}`;
        const rows = cat.leaders.map((l, i) => {
            const _sid = _nflLeaderNameIdx[_nflLeaderNrm(l.name)];
            const _clk = _sid ? ` onclick="navigateTo('nfl-player-${_sid}')"` : '';
            return `
            <div${_clk} class="nfl-lrow${_sid ? ' nfl-lrow--link' : ''}">
                <span class="nfl-lrow-rank">${i + 1}</span>
                <div class="nfl-lrow-av"><img src="${l.headshot}" alt="" loading="lazy" data-hide-on-error></div>
                <div class="nfl-lrow-main">
                    <div class="nfl-lrow-name">${_escHtml(l.name)}</div>
                    <div class="nfl-lrow-meta">${_escHtml(l.team)}${l.pos ? ' · ' + _escHtml(l.pos) : ''}</div>
                </div>
                <span class="nfl-lrow-val" style="color:${color}">${_escHtml(String(l.value))}</span>
            </div>`;
        }).join('');
        card.innerHTML = `
            <div class="nfl-card-head" style="justify-content:space-between">
                <span>${_escHtml(cat.label)}</span><span style="color:${color};font-size:0.64rem">${_escHtml(cat.unit)}</span>
            </div>
            ${rows}`;
        grid.appendChild(card);
    });
}

// ── Team abbr alias: ESPN → Sleeper (Washington + legacy Oakland differ) ──
function _nflSleeperAbbr(abbr) {
    return ({ WSH: 'WAS', OAK: 'LV' })[abbr] || abbr;
}

// ── Player detail (reuses the .player-detail-* component) ─────
async function showNFLPlayerDetail(id) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'player-detail-container';
    grid.style.cssText = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:320px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('nfl-player', null);
    try {
        await fetchNFLSleeperPool();
    } catch (err) {
        ErrorHandler.handle(grid, err, () => showNFLPlayerDetail(id), { tag: 'NFL', title: 'Failed to Load Player' });
        return;
    }
    const p = _nflPoolMap && _nflPoolMap[id];
    if (!p) { ErrorHandler.renderEmptyState(grid, 'Player not found', '🏈'); return; }
    _renderNFLPlayerDetail(p);
}

function _renderNFLPlayerDetail(p) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'player-detail-container';
    grid.style.cssText = '';

    const pos      = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
    const posColor = _NFL_POS_COLOR[pos] || 'var(--accent)';
    const teamColor = getNFLTeamColor(p.team) || posColor;
    const headshot = getNFLSleeperHeadshot(p.player_id);
    const initials = (p.full_name || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const inches   = parseInt(p.height, 10);
    const htStr    = (!isNaN(inches) && inches > 0) ? `${Math.floor(inches / 12)}'${inches % 12}"` : (p.height || '—');
    const teamLogo = p.team ? getNFLTeamLogoUrl(p.team) : null;
    const headshotImg = headshot ? `<img class="player-headshot" src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : '';

    const bio = [
        ['Age',         p.age != null ? p.age : '—'],
        ['Experience',  p.years_exp != null ? (p.years_exp === 0 ? 'Rookie' : `${p.years_exp} yr`) : '—'],
        ['Height',      htStr],
        ['Weight',      p.weight ? p.weight + ' lb' : '—'],
        ['College',     p.college || '—'],
        ['Jersey',      p.number ? '#' + p.number : '—'],
        ['Depth Chart', p.depth_chart_order ? `${p.depth_chart_position || pos} ${p.depth_chart_order}` : '—'],
        ['Status',      p.injury_status || p.status || '—'],
    ].map(([l, v]) =>
        `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${_escHtml(String(v))}</span></div>`
    ).join('');

    const adpBadge = p._adp ? `<span class="player-hero-pos" style="background:${posColor};color:#0b0b0d">#${p._adp} ADP</span>` : '';
    const teamBtn = p.team
        ? `<button onclick="navigateTo('nfl-team-${_escHtml(p.team)}')" style="background:none;border:none;padding:0;color:var(--text-secondary);cursor:pointer;font-size:inherit;font-family:inherit;text-decoration:underline;text-underline-offset:3px">${_escHtml(p.team)}</button>`
        : '<span style="color:var(--text-secondary)">Free Agent</span>';

    const _exp = (typeof p.years_exp === 'number') ? p.years_exp : 1;
    const _rookieSeason = Math.max(2000, NFL_STATS_SEASON - Math.max(0, _exp - 1));
    let _seasonOpts = '';
    for (let _y = NFL_STATS_SEASON; _y >= _rookieSeason; _y--) _seasonOpts += `<option value="${_y}" ${_y === NFL_STATS_SEASON ? 'selected' : ''}>${_y}</option>`;

    const _nflHeader = detailHeader({
        back: { view: 'nfl-players', label: 'Players' },
        actions: [{ label: 'Share', onclick: "window._shareCurrentPage && window._shareCurrentPage()", title: 'Copy link' }],
        avatar: { headshotHtml: headshotImg, initials, accent: teamColor, className: 'nfl-hero-avatar' },
        name: p.full_name,
        chips: [
            { html: `<span class="player-hero-pos" style="background:${_nflAlpha(posColor, 20)};color:${posColor}">${_escHtml(pos)}</span>` },
            ...(adpBadge ? [{ html: adpBadge }] : []),
            ...(typeof renderFollowStar === 'function' ? [{ html: renderFollowStar('nfl', 'player', p.player_id) }] : []),
        ],
        teamRow: `${teamLogo ? `<img src="${teamLogo}" alt="" class="player-hero-team-logo" loading="lazy" data-hide-on-error>` : ''}${teamBtn}`,
        meta: [`${NFL_FANTASY_SEASON} NFL Season \u00b7 Fantasy profile`],
    });

    const _profileBody = `<div class="player-details detail-bio-wide">${bio}</div>`;
    const _seasonRow = `<div class="detail-season-row">
            <span class="detail-season-label">Stats season</span>
            <select onchange="_nflChangeDetailSeason(this.value)" class="detail-season-select">${_seasonOpts}</select>
        </div>`;
    const _fantasyBody = `<p class="detail-prose">
                ${_escHtml(p.full_name)} enters ${NFL_FANTASY_SEASON} ${p._adp ? `as the <strong>#${p._adp}</strong> player off the board by Sleeper ADP` : 'as an undrafted-tier option'}${p.fantasy_positions && p.fantasy_positions.length ? `, eligible at <strong>${_escHtml(p.fantasy_positions.join(', '))}</strong>` : ''}.${p.depth_chart_order === 1 ? ' Currently atop the depth chart.' : p.depth_chart_order ? ` Listed ${_escHtml((p.depth_chart_position || pos) + ' ' + p.depth_chart_order)} on the depth chart.` : ''}${p.injury_status ? ` <span style="color:var(--color-loss)">Injury watch: ${_escHtml(p.injury_status)}.</span>` : ''}
            </p>
            <p class="detail-note">Fantasy/ADP and depth chart via Sleeper; season stats via ESPN.</p>`;

    grid.innerHTML = `
        ${_nflHeader}
        ${detailSection({ title: 'Player Profile', body: _profileBody })}
        ${_seasonRow}
        <div id="nfl-advanced"></div>
        <div id="nfl-stat-line"></div>
        <div id="nfl-gamelog"></div>
        <div id="nfl-career"></div>
        ${detailSection({ title: 'Fantasy Outlook', body: _fantasyBody })}
    `;

    _nflDetailPlayer = p;
    _nflEspnId = null;
    _nflDetailSeason = NFL_STATS_SEASON;
    _nflCareerEspnId = null;
    _loadNFLPlayerStats(p, NFL_STATS_SEASON);
    _loadNFLAdvanced(p, NFL_STATS_SEASON);
}

let _nflDetailPlayer = null, _nflDetailSeason = null, _nflCareerEspnId = null, _nflEspnId = null, _nflEspnSeason = null;
// Player-detail season switch — drives the stats / game log / advanced cards.
function _nflChangeDetailSeason(season) {
    season = String(season);
    _nflDetailSeason = season;
    const _sel = document.querySelector('#playersGrid select[onchange*="_nflChangeDetailSeason"]');
    if (_sel && String(_sel.value) !== season) _sel.value = season;
    ['nfl-advanced', 'nfl-stat-line', 'nfl-gamelog'].forEach(id => { const e = document.getElementById(id); if (e) { e.className = ''; e.innerHTML = ''; } });
    if (_nflDetailPlayer) { _loadNFLPlayerStats(_nflDetailPlayer, season); _loadNFLAdvanced(_nflDetailPlayer, season); }
}

// Stat groups/categories that make sense per position — a QB never shows kicking,
// a kicker never shows receiving. Falls back to the full set if filtering empties it.
const _NFL_STAT_POS = {
    QB:['passing','rushing'],
    RB:['rushing','receiving'], FB:['rushing','receiving'],
    WR:['receiving','rushing'], TE:['receiving','rushing'],
    K:['kicking','scoring'],
    DL:['defense','defensive'], DE:['defense','defensive'], DT:['defense','defensive'], NT:['defense','defensive'],
    LB:['defense','defensive'], DB:['defense','defensive'], CB:['defense','defensive'], S:['defense','defensive'],
};
function _nflStatByPos(items, pos, keyOf) {
    const allow = _NFL_STAT_POS[pos];
    if (!allow) return items;
    const f = items.filter(x => allow.includes(keyOf(x)));
    return f.length ? f : items;
}

// Career year-by-year table (ESPN /api/nflcareer) — season-independent.
async function _loadNFLCareer(espnId, pos) {
    if (!espnId) return;
    const host = document.getElementById('nfl-career');
    if (!host) return;
    try {
        const cacheKey = `nfl:career:${espnId}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nflcareer?id=${encodeURIComponent(espnId)}`);
            if (!res.ok) return;
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        if (!data.found || !data.categories || !data.categories.length) return;
        if (!document.body.contains(host)) return;

        const tables = _nflStatByPos(data.categories, pos, c => c.name).map(c => {
            const head = `<th class="nfl-tbl-sticky-head">SZN</th><th class="nfl-tbl-left">TM</th>` +
                (c.labels || []).map(l => `<th>${_escHtml(l)}</th>`).join('');
            const rows = (c.seasons || []).map(sn => `<tr onclick="_nflCareerRowClick('${sn.year}')" style="cursor:pointer">
                <td class="nfl-tbl-sticky-cell">${_escHtml(String(sn.year || ''))}</td>
                <td class="nfl-tbl-muted">${_escHtml(sn.team || '')}</td>
                ${(sn.stats || []).map(v => `<td class="nfl-tbl-center">${_escHtml(String(v))}</td>`).join('')}
            </tr>`).join('');
            const totals = `<tr class="nfl-tbl-totals-row">
                <td class="nfl-tbl-sticky-plain">Career</td><td></td>
                ${(c.totals || []).map(v => `<td class="nfl-tbl-center">${_escHtml(String(v))}</td>`).join('')}
            </tr>`;
            return `<div class="nfl-tbl-group">
                <div class="nfl-tbl-group-title">${_escHtml(c.displayName)}</div>
                <div class="table-wrapper" style="overflow-x:auto"><table class="stats-table" style="min-width:max-content;white-space:nowrap"><thead><tr>${head}</tr></thead><tbody>${rows}${totals}</tbody></table></div>
            </div>`;
        }).join('');

        host.className = 'stats-card';
        host.innerHTML = `<h2 class="detail-section-title">Career</h2>${tables}<p class="nfl-tbl-note">Regular season · tap a row to load that season above · Source: ESPN.</p>`;
    } catch (e) { Logger.warn('NFL career load failed', e, 'NFL'); }
}

const _NFL_STAT_GROUP_COLOR = { passing:'var(--nfl-stat-passing)', rushing:'var(--nfl-stat-rushing)', receiving:'var(--nfl-stat-receiving)', defense:'var(--nfl-stat-defense)', kicking:'var(--nfl-stat-kicking)' };

// Explicit placeholder when the Sleeper->ESPN name match yields no stats, so a
// real player never shows a blank stat area with no explanation (N-1).
function _nflStatsUnavailable(host, name) {
    if (!host || !document.body.contains(host)) return;
    host.className = 'stats-card';
    host.innerHTML = `<h2 class="detail-section-title">Season Stats</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0;line-height:1.5">Season stats aren't available for ${_escHtml(name || 'this player')} right now — we couldn't match this player to a stats source. This is common for free agents and recent roster moves.</p>`;
}

// Season stat line on the player-detail page. Sleeper has no game stats, so we
// bridge to ESPN via /api/nflplayer (team roster name-match -> athlete stats).
async function _loadNFLPlayerStats(p, season) {
    season = season || NFL_STATS_SEASON;
    const host = document.getElementById('nfl-stat-line');
    if (!host) return;
    if (!p || !p.team) { _nflStatsUnavailable(host, p && p.full_name); return; }
    try {
        const cacheKey = `nfl:pstats2:${p.player_id}:${season}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nflplayer?name=${encodeURIComponent(p.full_name)}&team=${encodeURIComponent(p.team)}&season=${season}`);
            if (!res.ok) { Logger.warn('NFL player stats fetch ' + res.status, null, 'NFL'); _nflStatsUnavailable(host, p.full_name); return; }
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        // Read back data.season, not the requested `season` param: /api/nflplayer can now
        // silently fall back to last season's real stats when the current season's aren't
        // populated yet (season-flip gap, see that Function's own comment) -- without this,
        // the stat line above would correctly show last season's numbers while the game log
        // right below it kept requesting the current, still-empty season.
        if (data.espnId) _loadNFLGameLog(data.espnId, data.season);
        if (data.espnId && _nflCareerEspnId !== data.espnId) { _nflCareerEspnId = data.espnId; _loadNFLCareer(data.espnId, p.position); }
        if (!data.found || !data.groups || !data.groups.length) { _nflStatsUnavailable(host, p.full_name); return; }
        if (!document.body.contains(host)) return;  // user navigated away

        const _statPos = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
        const groupsHtml = _nflStatByPos(data.groups, _statPos, g => g.key).map(g => {
            const color = _NFL_STAT_GROUP_COLOR[g.key] || 'var(--accent)';
            const chips = g.stats.map(([l, v]) =>
                `<div style="text-align:center;min-width:54px">
                    <div style="font-size:1.05rem;font-weight:800;color:var(--text-primary)">${_escHtml(String(v))}</div>
                    <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.5px;color:var(--text-muted)">${_escHtml(l)}</div>
                </div>`).join('');
            return `<div style="margin-bottom:0.9rem">
                <div style="font-size:0.68rem;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;color:${color};margin-bottom:0.4rem">${_escHtml(g.label)}</div>
                <div style="display:flex;flex-wrap:wrap;gap:0.6rem 1.1rem">${chips}</div>
            </div>`;
        }).join('');

        host.className = 'stats-card';
        host.innerHTML = `
            <h2 class="detail-section-title">${data.season} Season Stats${data.gp ? ` · ${_escHtml(String(data.gp))} GP` : ''}</h2>
            ${groupsHtml}
            <p style="color:var(--text-muted);font-size:0.72rem;margin:0.25rem 0 0">Source: ESPN.</p>
        `;
    } catch (e) { Logger.warn('NFL player stats load failed', e, 'NFL'); _nflStatsUnavailable(host, p.full_name); }
}

// Game-by-game log on the player-detail page (ESPN, via the resolved athlete id).
async function _loadNFLGameLog(espnId, season) {
    if (!espnId) return;
    const host = document.getElementById('nfl-gamelog');
    if (!host) return;
    try {
        const cacheKey = `nfl:gamelog:${espnId}:${season}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nflgamelog?id=${encodeURIComponent(espnId)}&season=${encodeURIComponent(season)}`);
            if (!res.ok) return;
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        if (!data.found || !data.games || !data.games.length) return;
        if (!document.body.contains(host)) return;

        const cols = data.columns || [];
        const head = `<th class="nfl-tbl-sticky-head">WK</th>` +
            `<th class="nfl-tbl-left">OPP</th><th>RES</th>` +
            cols.map(c => `<th title="${_escHtml(c.full)}">${_escHtml(c.label)}</th>`).join('');
        const rows = data.games.map(gm => {
            const resColor = gm.res === 'W' ? 'var(--color-win)' : gm.res === 'L' ? 'var(--color-loss)' : 'var(--text-muted)';
            const wk = gm.post ? 'P' : (gm.wk != null ? gm.wk : '');
            const statTds = (gm.stats || []).map(v => `<td class="nfl-tbl-center">${_escHtml(String(v))}</td>`).join('');
            return `<tr>
                <td class="nfl-tbl-sticky-cell">${_escHtml(String(wk))}</td>
                <td class="nfl-opp-cell">${gm.atVs === '@' ? '@' : 'vs'} <strong>${_escHtml(gm.opp)}</strong></td>
                <td class="nfl-res-cell"><span class="nfl-res" style="--rc:${resColor}">${_escHtml(gm.res)}</span> <span class="nfl-res-score">${_escHtml(gm.score)}</span></td>
                ${statTds}
            </tr>`;
        }).join('');

        host.className = 'stats-card';
        host.innerHTML = `
            <h2 class="detail-section-title">${data.season} Game Log</h2>
            <div id="nfl-gl-chart-wrap" class="nfl-gl-chart-host"><canvas id="nfl-gl-chart"></canvas></div>
            <div class="table-wrapper" style="overflow-x:auto">
                <table class="stats-table" style="min-width:max-content;white-space:nowrap">
                    <thead><tr>${head}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <p class="nfl-tbl-note nfl-tbl-note--gl">Game-by-game · Source: ESPN.</p>`;
        const _glChart = (window.StatsCharts && StatsCharts.nflGameTrend) ? StatsCharts.nflGameTrend('nfl-gl-chart', data.games, data.columns) : null;
        if (!_glChart) { const w = document.getElementById('nfl-gl-chart-wrap'); if (w) w.remove(); }
    } catch (e) { Logger.warn('NFL game log load failed', e, 'NFL'); }
}

const _NFL_NGS_LABEL = { receiving: 'receivers', passing: 'passers', rushing: 'rushers' };

// Advanced metrics card (Next Gen Stats via nflverse) with league percentile bars.
async function _loadNFLAdvanced(p, season) {
    if (!p || !p.full_name) return;
    season = season || NFL_STATS_SEASON;
    const host = document.getElementById('nfl-advanced');
    if (!host) return;
    const pos = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
    if (!['QB', 'RB', 'FB', 'WR', 'TE'].includes(pos)) return;  // NGS covers skill positions only
    try {
        const cacheKey = `nfl:adv:${p.player_id}:${season}`;
        let data = ApiCache.get(cacheKey);
        if (!data) {
            const res = await fetch(`/api/nfladv?name=${encodeURIComponent(p.full_name)}&team=${encodeURIComponent(p.team || '')}&pos=${encodeURIComponent(pos)}&season=${season}`);
            if (!res.ok) return;
            data = await res.json();
            ApiCache.set(cacheKey, data, ApiCache.TTL.DAILY);
        }
        if (!data.found || !data.metrics || !data.metrics.length) return;
        if (!document.body.contains(host)) return;

        const fmt = v => { const n = +v; if (!isFinite(n)) return '—'; return Number.isInteger(n) ? String(n) : n.toFixed(1); };
        const ord = n => (n % 10 === 1 && n % 100 !== 11) ? 'st' : (n % 10 === 2 && n % 100 !== 12) ? 'nd' : (n % 10 === 3 && n % 100 !== 13) ? 'rd' : 'th';
        const pool = _NFL_NGS_LABEL[data.type] || 'players';
        const rows = data.metrics.map(m => {
            const display = `${_escHtml(fmt(m.value))}${m.unit ? ` <span style="font-size:0.7em;color:var(--text-muted)">${_escHtml(m.unit)}</span>` : ''}`;
            if (m.pct == null) {
                return `<div class="pct-row pct-row--plain"><span class="pct-label">${_escHtml(m.label)}</span><span class="pct-value">${display}</span></div>`;
            }
            const color = (typeof _pctColor === 'function') ? _pctColor(m.pct) : 'var(--accent)';
            return `<div class="pct-row" role="img" aria-label="${_escHtml(m.label)}: ${m.pct}${ord(m.pct)} percentile of qualified ${_escHtml(pool)}" title="${m.pct}${ord(m.pct)} percentile of qualified ${_escHtml(pool)}">
                <span class="pct-label">${_escHtml(m.label)}</span>
                <div class="pct-track"><div class="pct-fill" style="width:${m.pct}%;background:${color}"></div><span class="pct-bubble" style="left:${m.pct}%;background:${color}">${m.pct}</span></div>
                <span class="pct-value">${display}</span>
            </div>`;
        }).join('');

        const _reqSeason = Number(season) || NFL_STATS_SEASON;
        const _ngsLag = (data.season && Number(data.season) < _reqSeason) ? ' (latest available)' : '';
        host.className = 'stats-card';
        host.innerHTML = `
            <h2 class="detail-section-title">Key Metrics · Next Gen Stats</h2>
            ${rows}
            <p class="pct-caption">${data.season}${_ngsLag} season · percentile vs ${data.qualifiedPlayers} qualified ${_escHtml(pool)} · red = elite · Data via nflverse Next Gen Stats (CC-BY)</p>`;
    } catch (e) { Logger.warn('NFL advanced stats load failed', e, 'NFL'); }
}

// ── Team detail (header + roster grouped by position) ─────────
// N-16 (2026-08-02): 9 individual-position groups, broadcast-familiar order,
// instead of the original 3 broad units — lets a fan answer "who's their WR2"
// without scanning a mixed 18-player Offense list. Each entry's 2nd element
// is a "side" tag ('off'/'def'/'st') so the hero fact grid (below) can still
// roll these up into Offense/Defense/Special-Teams counts without hardcoding
// array indices against a group list that's no longer 3 long.
const _NFL_ROSTER_GROUPS = [
    ['QB', ['QB'], 'off'],
    ['RB', ['RB', 'FB'], 'off'],
    ['WR', ['WR'], 'off'],
    ['TE', ['TE'], 'off'],
    ['OL', ['OL', 'OT', 'T', 'G', 'OG', 'C'], 'off'],
    ['DL', ['DL', 'DE', 'DT', 'NT'], 'def'],
    ['LB', ['LB'], 'def'],
    ['DB', ['DB', 'CB', 'S'], 'def'],
    ['K/P', ['K', 'P', 'LS'], 'st'],
];

async function showNFLTeamDetail(abbr) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:360px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('nfl-teams', null);
    let stdRow = null;
    try {
        if (!AppState.nflTeams.length) AppState.nflTeams = await fetchNFLTeams();
        await fetchNFLSleeperPool();
        if (!AppState.nflGames || !AppState.nflGames.length) { try { AppState.nflGames = await fetchNFLScoreboard(); } catch (err) { Logger.warn('Scoreboard fetch failed in team detail', err, 'NFL'); } }
        // Team Record card (mirrors MLB's Team Batting/Pitching card) — reuses
        // the same memoized fetch + fetchNFLStandings() the Standings view
        // already calls (js/nflStandings.js), no new data source. NFL_STATS_SEASON
        // and _nstd/fetchNFLStandings load after this file in the script chain but
        // are resolved at call time here, not at parse time, so that's safe.
        if (typeof fetchNFLStandings === 'function') {
            try {
                const season = (typeof NFL_STATS_SEASON !== 'undefined') ? NFL_STATS_SEASON : new Date().getFullYear();
                if (!_nstd.bySeason[season]) _nstd.bySeason[season] = await fetchNFLStandings(season);
                stdRow = (_nstd.bySeason[season] || []).find(r => r.abbr === abbr) || null;
            } catch (err) { Logger.warn('NFL standings fetch failed (team detail)', err, 'NFL'); }
        }
    } catch (err) {
        ErrorHandler.handle(grid, err, () => showNFLTeamDetail(abbr), { tag: 'NFL', title: 'Failed to Load Team' });
        return;
    }
    _renderNFLTeamDetail(abbr, stdRow);
}

// Conference/division is stable NFL data, not in the ESPN team payload and empty
// in the offseason standings — a small static map keeps the team hero populated year-round.
const _NFL_DIVISIONS = {
    BUF:'AFC East', MIA:'AFC East', NE:'AFC East', NYJ:'AFC East',
    BAL:'AFC North', CIN:'AFC North', CLE:'AFC North', PIT:'AFC North',
    HOU:'AFC South', IND:'AFC South', JAX:'AFC South', TEN:'AFC South',
    DEN:'AFC West', KC:'AFC West', LV:'AFC West', LAC:'AFC West',
    DAL:'NFC East', NYG:'NFC East', PHI:'NFC East', WSH:'NFC East',
    CHI:'NFC North', DET:'NFC North', GB:'NFC North', MIN:'NFC North',
    ATL:'NFC South', CAR:'NFC South', NO:'NFC South', TB:'NFC South',
    ARI:'NFC West', LAR:'NFC West', SF:'NFC West', SEA:'NFC West',
};

// Generic, sport-agnostic team landing page (P3-030). Feed it a normalized model
// and NHL/NBA can reuse it; team color drives accents via the --team custom prop.
function _renderTeamPage(m) {
    const esc = _escHtml;
    const color = m.teamColor || 'var(--accent)';
    const logo = m.logo;
    const initials = s => (s || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');

    // Hero — mirrors MLB _mlbTeamHeader: chipped avatar + bio-grid facts.
    const skip = new Set(['Division', 'Conference']); // shown in the meta line already
    const factItems = [];
    if (m.record) factItems.push(`<div class="player-bio-item"><span class="bio-label">Record</span><span class="bio-value" style="font-weight:800">${esc(m.record)}</span></div>`);
    (m.facts || []).forEach(f => { if (skip.has(f.label)) return; factItems.push(`<div class="player-bio-item"><span class="bio-label">${esc(f.label)}</span><span class="bio-value">${esc(String(f.value))}</span></div>`); });
    const factGrid = factItems.length ? `<div class="player-bio-grid" style="margin-top:0.75rem">${factItems.join('')}</div>` : '';

    const header = `
        <div class="player-detail-header" style="background:radial-gradient(ellipse at top left,${color}1a 0%,var(--bg-card) 55%);border-top:3px solid ${color}88">
            <button class="back-button" onclick="navigateTo('${m.backView}')">← ${esc(m.backLabel || 'Back')}</button>
            <div class="player-hero">
                <div class="player-detail-avatar" style="background:linear-gradient(135deg,${color}cc,${color}55);color:#fff;font-size:1.5rem;font-weight:800">
                    ${logo ? `<img class="player-headshot player-headshot--detail" src="${esc(logo)}" alt="${esc(m.name)}" loading="lazy" style="object-fit:contain;object-position:center;padding:10px" data-hide-on-error>` : esc(m.abbr || '?')}
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${esc(m.name)}</h1>
                        ${m.abbr ? `<span class="player-hero-pos">${esc(m.abbr)}</span>` : ''}
                        ${(m.sport && m.abbr && typeof renderFollowStar === 'function') ? renderFollowStar(m.sport, 'team', m.abbr) : ''}
                    </div>
                    ${m.division ? `<p class="player-detail-meta" style="color:var(--color-text-secondary)">${esc(m.division)}</p>` : ''}
                    ${m.seasonLabel ? `<p class="player-detail-meta" style="color:var(--color-text-muted)">${esc(m.seasonLabel)}</p>` : ''}
                    ${factGrid}
                </div>
            </div>
        </div>`;

    // Team Record card — mirrors MLB's Team Batting/Team Pitching card
    // (_mlbTeamStatsCard): a .stats-card of .player-bio-item chips positioned
    // right after the header, before roster/assets. Omitted entirely when the
    // caller has no recordChips (standings lookup missed, or nothing real to
    // show yet) — same graceful-omit convention as MLB's.
    const recordCard = (m.recordChips && m.recordChips.length)
        ? `<div class="stats-card" style="grid-column:1/-1">
            <h3 class="detail-section-title">Team Record${m.recordSeasonLabel ? ` <span class="team-section__count">${esc(m.recordSeasonLabel)}</span>` : ''}</h3>
            <div class="player-bio-grid" style="margin-top:0.5rem">${m.recordChips.map(([lbl, val]) =>
                `<div class="player-bio-item"><span class="bio-label">${esc(lbl)}</span><span class="bio-value">${esc(String(val))}</span></div>`
            ).join('')}</div>
        </div>`
        : '';

    const assets = (m.assets || []).map(a =>
        `<button class="team-asset" style="--pc:${a.posColor}" onclick="navigateTo('${m.playerPrefix}${a.id}')">
            <div class="team-asset__av">${a.headshot ? `<img src="${esc(a.headshot)}" alt="" loading="lazy" data-hide-on-error>` : ''}</div>
            <div class="team-asset__name">${esc(a.name)}</div>
            <div class="team-asset__meta">${esc(a.pos)}${a.number ? ' · #' + esc(String(a.number)) : ''}</div>
            ${a.adp ? `<div class="team-asset__adp">#${esc(String(a.adp))} ADP</div>` : ''}
            ${a.injury ? `<div class="team-asset__inj">${esc(a.injury)}</div>` : ''}
        </button>`
    ).join('');
    const assetsCard = assets ? `<div class="stats-card" style="grid-column:1/-1;--team:${color}"><h3 class="detail-section-title">${esc(m.assetsTitle || 'Top Fantasy Assets')} <span class="team-section__count">${esc(m.assetsCountLabel || 'by ADP')}</span></h3><div class="team-assets">${assets}</div></div>` : '';

    const groups = (m.groups || []).map(grp => {
        if (!grp.players.length) return '';
        const rows = grp.players.map(p =>
            `<div class="roster-row" role="button" tabindex="0" style="cursor:pointer" onclick="navigateTo('${m.playerPrefix}${p.id}')" onkeydown="if(event.key==='Enter')this.click()">
                <div class="roster-avatar" style="background:linear-gradient(135deg,${color}cc,${color}44);position:relative;overflow:hidden">
                    ${p.headshot ? `<img src="${esc(p.headshot)}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;z-index:1" data-hide-on-error>` : ''}
                    <span style="position:relative">${esc(initials(p.name))}</span>
                </div>
                <div class="roster-info">
                    <span class="roster-name">${esc(p.name)}${p.starter ? ` <span style="color:${color}" title="Projected starter">★</span>` : ''}${p.injury ? ` <span class="roster-il-badge">${esc(p.injury)}</span>` : ''}</span>
                    <span class="roster-meta">${esc(p.pos)}${p.number ? ' · #' + esc(String(p.number)) : ''}</span>
                </div>
            </div>`
        ).join('');
        return `<h3 class="detail-section-title" style="font-size:0.9rem;margin-top:1.1rem">${esc(grp.label)} <span class="team-section__count">${grp.players.length}</span></h3><div class="roster-list">${rows}</div>`;
    }).join('');
    const rosterCard = groups
        ? `<div class="stats-card mlb-roster-card" style="grid-column:1/-1"><h2 class="detail-section-title">Roster</h2>${groups}</div>`
        : (m.rosterEmpty ? `<div class="stats-card" style="grid-column:1/-1"><h2 class="detail-section-title">Roster</h2><p style="color:var(--color-text-muted);text-align:center;padding:2rem">${esc(m.rosterEmpty)}</p></div>` : '');

    return `${header}${recordCard}${assetsCard}${rosterCard}${m.scheduleHtml || ''}`;
}

function _renderNFLTeamDetail(abbr, stdRow) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'player-detail-container';
    grid.style.cssText = '';

    const team = (AppState.nflTeams || []).find(t => t.abbr === abbr)
        || { abbr, name: abbr, logo: getNFLTeamLogoUrl(abbr), color: '#334155', record: '' };
    if (window.setBreadcrumb) setBreadcrumb('nfl-teams', team.name || abbr);
    const sAbbr  = _nflSleeperAbbr(abbr);
    const roster = Object.values(_nflPoolMap || {})
        .filter(p => p && p.active && p.team === sAbbr && p.position && p.position !== 'DEF');

    const sortFn = (a, b) =>
        (a.depth_chart_order || 99) - (b.depth_chart_order || 99) ||
        (a.search_rank || 1e9) - (b.search_rank || 1e9) ||
        (a.full_name || '').localeCompare(b.full_name || '');

    const groups = _NFL_ROSTER_GROUPS.map(([label, positions, side]) => ({
        label, side,
        players: roster.filter(p => positions.includes(p.position)).sort(sortFn).map(p => ({
            id: p.player_id, name: p.full_name, pos: p.position, number: p.number,
            starter: p.depth_chart_order === 1, injury: p.injury_status,
            headshot: getNFLSleeperHeadshot(p.player_id),
        })),
    }));
    // Sum by side-of-ball rather than fixed indices — N-16 widened this from 3
    // groups to 9, so groups[0]/[1]/[2] no longer mean Offense/Defense/ST.
    const _sideCount = s => groups.filter(g => g.side === s).reduce((n, g) => n + g.players.length, 0);

    const assets = roster
        .filter(p => p.search_rank && p.search_rank < 9999)
        .sort((a, b) => a.search_rank - b.search_rank)
        .slice(0, 6)
        .map(p => ({
            id: p.player_id, name: p.full_name, pos: p.position, number: p.number,
            adp: p._adp, injury: p.injury_status,
            posColor: _NFL_POS_COLOR[p.position] || 'var(--accent)',
            headshot: getNFLSleeperHeadshot(p.player_id),
        }));

    let nextGame = null;
    const g = (AppState.nflGames || []).find(x => x.homeTeam.abbr === abbr || x.awayTeam.abbr === abbr);
    if (g) {
        const home = g.homeTeam.abbr === abbr;
        const opp  = home ? g.awayTeam : g.homeTeam;
        let dateStr = '';
        try { dateStr = new Date(g.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (_) {}
        nextGame = { home, oppAbbr: opp.abbr, oppLogo: getNFLTeamLogoUrl(opp.abbr), dateStr };
    }

    const division = _NFL_DIVISIONS[abbr] || '';
    const scheduleHtml = `<section class="stats-card" style="grid-column:1/-1">
        <h3 class="detail-section-title">Schedule</h3>
        ${nextGame
            ? `<div class="team-next-card">
                 <span class="team-next-card__label">Next game</span>
                 <span class="team-next-card__matchup">${nextGame.home ? 'vs' : '@'}
                   <img src="${nextGame.oppLogo}" alt="" loading="lazy" data-hide-on-error>
                   <strong>${_escHtml(nextGame.oppAbbr)}</strong></span>
                 ${nextGame.dateStr ? `<span class="team-next-card__date">${_escHtml(nextGame.dateStr)}</span>` : ''}
               </div>`
            : `<div class="team-empty">Full schedule & results post once the ${NFL_FANTASY_SEASON} season nears.</div>`}
    </section>`;

    // Team Record card (mirrors MLB's Team Batting/Pitching card). stdRow is
    // whatever season fetchNFLStandings() resolved to (NFL_STATS_SEASON — the
    // most recently COMPLETED season Sep-Feb, else prior year), so in the
    // offseason this is honestly last season's real record, not a fake current
    // one — recordSeasonLabel makes that explicit rather than implying it's live.
    // stdHasPlayed guards the same all-zero-preseason-row case confirmed live
    // on the NCAAF standings feed (see ncaaf.js) — belt-and-suspenders here
    // since NFL_STATS_SEASON should already point at a completed season.
    const stdHasPlayed = stdRow && ((stdRow.wins || 0) > 0 || (stdRow.losses || 0) > 0 || (stdRow.pf || 0) > 0 || (stdRow.pa || 0) > 0);
    const recordChips = stdHasPlayed ? [
        ['Record', `${stdRow.wins}-${stdRow.losses}${stdRow.ties ? '-' + stdRow.ties : ''}`],
        ['PCT',    stdRow.pct != null ? stdRow.pct.toFixed(3).replace(/^0\./, '.') : '—'],
        ['PF',     stdRow.pf ?? '—'],
        ['PA',     stdRow.pa ?? '—'],
        ['Diff',   stdRow.diff != null ? (stdRow.diff > 0 ? `+${stdRow.diff}` : String(stdRow.diff)) : '—'],
        ...(stdRow.streak ? [['Streak', stdRow.streak]] : []),
        ...(stdRow.homeRec ? [['Home', stdRow.homeRec]] : []),
        ...(stdRow.awayRec ? [['Away', stdRow.awayRec]] : []),
    ] : [];
    const recordSeason = (typeof NFL_STATS_SEASON !== 'undefined') ? NFL_STATS_SEASON : '';

    grid.innerHTML = _renderTeamPage({
        sport: 'nfl', abbr, name: team.name, logo: team.logo, teamColor: team.color,
        division, record: team.record || '',
        seasonLabel: team.record ? '' : `Enters the ${NFL_FANTASY_SEASON} season`,
        facts: [
            { label: 'Players',       value: roster.length },
            { label: 'Offense',       value: _sideCount('off') },
            { label: 'Defense',       value: _sideCount('def') },
            { label: 'Special Teams', value: _sideCount('st') },
            ...(division ? [{ label: 'Division', value: division }] : []),
        ],
        recordChips, recordSeasonLabel: recordChips.length ? `${recordSeason} Season` : '',
        assets, groups,
        rosterEmpty: 'Roster data unavailable for this team right now.',
        scheduleHtml,
        backView: 'nfl-teams', backLabel: 'Teams', playerPrefix: 'nfl-player-',
    });
}

// ── Display: Rankings (Sleeper ADP — overall + positional ranks + tiers) ──
let _nflRankPos = 'ALL';

async function loadNFLRankings() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-rankings', null);
    grid.innerHTML = `<div class="skeleton-card" style="min-height:420px"></div>`;
    try {
        await fetchNFLSleeperPool();
        displayNFLRankings();
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLRankings, { tag: 'NFL', title: 'Failed to Load NFL Rankings' });
    }
}

function displayNFLRankings() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    const pool = _nflPool || [];
    if (!pool.length) { ErrorHandler.renderEmptyState(grid, 'No NFL ranking data available', '🏈'); return; }

    const posCount = {};
    const ranked = pool.map((p, i) => {
        const pos = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
        posCount[pos] = (posCount[pos] || 0) + 1;
        return { p, overall: i + 1, pos, posRank: posCount[pos] };
    });
    const isAll = _nflRankPos === 'ALL';
    const filtered = isAll ? ranked : ranked.filter(r => r.pos === _nflRankPos || (r.p.fantasy_positions || []).includes(_nflRankPos));
    const shown = filtered.slice(0, 200);

    const chip = f => {
        const a = f === _nflRankPos;
        return `<button data-nfl-rank-pos="${f}" style="padding:0.32rem 0.74rem;border-radius:var(--radius-full);border:1px solid ${a ? 'var(--accent)' : 'var(--border-default)'};background:${a ? 'var(--accent)' : 'transparent'};color:${a ? '#0b0b0d' : 'var(--text-secondary)'};font-weight:700;font-size:0.72rem;cursor:pointer">${f}</button>`;
    };

    let html = `<div style="max-width:760px;margin:0 auto">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem;padding:0 0.25rem 0.85rem">
            ${['ALL', 'QB', 'RB', 'WR', 'TE', 'K'].map(chip).join('')}
            <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted)">${NFL_FANTASY_SEASON} rankings · ADP via Sleeper</span>
        </div>`;

    let lastTier = null;
    shown.forEach(r => {
        const tier = isAll ? Math.ceil(r.overall / 12) : Math.ceil(r.posRank / 6);
        if (tier !== lastTier) {
            lastTier = tier;
            const label = isAll ? `Round ${tier}` : `${_escHtml(_nflRankPos)} Tier ${tier}`;
            html += `<div style="font-size:0.66rem;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;color:var(--accent);margin:0.9rem 0 0.35rem;padding-bottom:0.2rem;border-bottom:1px solid var(--border-mid)">${label}</div>`;
        }
        const pos = r.pos, pc = _NFL_POS_COLOR[pos] || 'var(--accent)';
        const hs = getNFLSleeperHeadshot(r.p.player_id);
        const rankNum = isAll ? r.overall : r.posRank;
        const posTag = (isAll && pos) ? `${_escHtml(pos)}${r.posRank}` : '';
        const inj = r.p.injury_status ? ` <span style="color:var(--color-loss);font-size:0.62rem;font-weight:700">${_escHtml(r.p.injury_status)}</span>` : '';
        html += `<div onclick="navigateTo('nfl-player-${r.p.player_id}')" style="display:flex;align-items:center;gap:0.7rem;padding:0.4rem 0.5rem;border-bottom:1px solid var(--border-subtle);cursor:pointer">
            <span style="width:28px;text-align:right;font-weight:800;font-size:0.95rem;color:var(--text-primary)">${rankNum}</span>
            <div style="width:30px;height:30px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-subtle);border:1px solid var(--border-subtle)">
                <img src="${hs}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" data-hide-on-error>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:0.85rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(r.p.full_name)}${inj}</div>
                <div style="font-size:0.68rem;color:var(--text-muted)">${_escHtml(r.p.team || 'FA')}</div>
            </div>
            ${posTag ? `<span style="font-size:0.7rem;font-weight:800;color:${pc};min-width:38px;text-align:right">${posTag}</span>` : ''}
            <span style="font-size:0.72rem;color:var(--text-secondary);min-width:56px;text-align:right">ADP ${r.p._adp}</span>
        </div>`;
    });
    html += `</div>`;
    grid.innerHTML = ((typeof _hqStrip === 'function') ? _hqStrip('nfl-rankings') : '') + html;
    grid.querySelectorAll('[data-nfl-rank-pos]').forEach(b => b.addEventListener('click', () => { _nflRankPos = b.dataset.nflRankPos; displayNFLRankings(); }));
}

// ── Player Compare (two-player side-by-side; reuses .cmp-* + /api/nflplayer) ──
const _NFL_CMP_A = '#ff8100';
const _NFL_CMP_B = '#60a5fa';

async function loadNFLCompare() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-compare', null);
    grid.innerHTML = (typeof _hqStrip === 'function' ? _hqStrip('nfl-compare') : '') +
        `<div class="skeleton-card" style="min-height:300px"></div>`;
    try {
        await fetchNFLSleeperPool();
        _renderNFLCompareView();
    } catch (err) {
        ErrorHandler.handle(grid, err, loadNFLCompare, { tag: 'NFL', title: 'Failed to Load Compare' });
    }
}

function _renderNFLCompareView() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = '';
    const top = (_nflPool || []).slice(0, 300);
    const opts = '<option value="">— Select player —</option>' +
        top.map(p => `<option value="${p.player_id}">${_escHtml(p.full_name)} · ${_escHtml(p.team || 'FA')} ${_escHtml(p.position || '')}</option>`).join('');
    grid.innerHTML = (typeof _hqStrip === 'function' ? _hqStrip('nfl-compare') : '') + `
        <div class="cmp-page-wrap">
            <div class="cmp-page-hdr"><h1 class="cmp-page-title">Player Compare</h1></div>
            <div class="cmp-selects-row">
                <div class="cmp-player-slot"><label class="cmp-slot-label">Player A</label><select id="nfl-cmp-a" class="cmp-select">${opts}</select></div>
                <div class="cmp-vs-badge">VS</div>
                <div class="cmp-player-slot"><label class="cmp-slot-label">Player B</label><select id="nfl-cmp-b" class="cmp-select">${opts}</select></div>
            </div>
            <div id="nfl-cmp-results" class="cmp-results" style="display:none"></div>
        </div>`;
    const a = document.getElementById('nfl-cmp-a'), b = document.getElementById('nfl-cmp-b');
    a.addEventListener('change', _updateNFLCompare);
    b.addEventListener('change', _updateNFLCompare);
    const m = location.hash.replace('#', '').match(/^nfl-compare-([A-Za-z0-9]+)-([A-Za-z0-9]+)$/);
    if (m) { a.value = m[1]; b.value = m[2]; _updateNFLCompare(); }
}

async function _updateNFLCompare() {
    const selA = document.getElementById('nfl-cmp-a'), selB = document.getElementById('nfl-cmp-b');
    const results = document.getElementById('nfl-cmp-results');
    if (!selA || !selB || !results) return;
    const idA = selA.value, idB = selB.value;
    if (!idA || !idB || idA === idB) { results.style.display = 'none'; return; }
    const pA = _nflPoolMap && _nflPoolMap[idA], pB = _nflPoolMap && _nflPoolMap[idB];
    if (!pA || !pB) { results.style.display = 'none'; return; }
    history.replaceState(null, '', `#nfl-compare-${idA}-${idB}`);
    results.style.display = '';
    results.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:1.5rem">Loading…</div>`;

    const fetchStats = async p => {
        try { const r = await fetch(`/api/nflplayer?name=${encodeURIComponent(p.full_name)}&team=${encodeURIComponent(p.team || '')}`); return r.ok ? await r.json() : null; }
        catch { return null; }
    };
    const [dA, dB] = await Promise.all([fetchStats(pA), fetchStats(pB)]);
    if (!document.body.contains(results)) return;

    const flat = d => { const m = {}; (d && d.groups || []).forEach(g => g.stats.forEach(([l, v]) => { m[`${g.label} · ${l}`] = v; })); return m; };
    const mA = flat(dA), mB = flat(dB);
    const keys = [...Object.keys(mA), ...Object.keys(mB).filter(k => !(k in mA))];
    const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; };

    const headCard = (p, d, color) => `
        <div style="flex:1;text-align:center;min-width:0">
            <div style="width:54px;height:54px;border-radius:50%;overflow:hidden;margin:0 auto 0.4rem;border:2px solid ${color};background:var(--bg-subtle)"><img src="${getNFLSleeperHeadshot(p.player_id)}" alt="" style="width:100%;height:100%;object-fit:cover" data-hide-on-error></div>
            <div style="font-weight:800;font-size:0.9rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(p.full_name)}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">${_escHtml(p.team || 'FA')} · ${_escHtml(p.position || '')}${d && d.gp ? ' · ' + _escHtml(String(d.gp)) + ' GP' : ''}</div>
        </div>`;

    const rows = keys.map(k => {
        const va = mA[k], vb = mB[k], na = num(va), nb = num(vb);
        let barA = 50, barB = 50;
        if (na != null && nb != null && (na + nb) > 0) { barA = Math.round(na / (na + nb) * 100); barB = 100 - barA; }
        const aWin = na != null && nb != null && na > nb, bWin = nb != null && na != null && nb > na;
        return `<div style="display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;gap:0.6rem;padding:0.35rem 0;border-bottom:1px solid var(--border-subtle)">
            <span style="text-align:right;font-weight:${aWin ? '800' : '600'};color:${aWin ? 'var(--text-primary)' : 'var(--text-secondary)'};font-size:0.84rem">${va != null ? _escHtml(String(va)) : '—'}</span>
            <div style="min-width:0">
                <div style="font-size:0.62rem;text-align:center;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px">${_escHtml(k.split(' · ')[1])}</div>
                <div style="display:flex;height:7px;border-radius:4px;overflow:hidden;background:var(--bg-subtle)"><div style="width:${barA}%;background:${_NFL_CMP_A}"></div><div style="width:${barB}%;background:${_NFL_CMP_B}"></div></div>
            </div>
            <span style="text-align:left;font-weight:${bWin ? '800' : '600'};color:${bWin ? 'var(--text-primary)' : 'var(--text-secondary)'};font-size:0.84rem">${vb != null ? _escHtml(String(vb)) : '—'}</span>
        </div>`;
    }).join('');

    results.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:0.5rem;margin-bottom:0.8rem">${headCard(pA, dA, _NFL_CMP_A)}<div style="align-self:center;font-weight:900;color:var(--text-muted);font-size:0.8rem">VS</div>${headCard(pB, dB, _NFL_CMP_B)}</div>
        ${keys.length ? rows : '<p style="text-align:center;color:var(--text-muted);padding:1rem">No season stats to compare for these players.</p>'}
        <p style="color:var(--text-muted);font-size:0.7rem;margin:0.7rem 0 0;text-align:center">${NFL_STATS_SEASON} season · bar = share of each stat · Source: ESPN</p>`;
}

// Career-row click dispatcher — works on the Sleeper detail and the all-time (ESPN) detail.
function _nflCareerRowClick(year) {
    if (_nflEspnId) _nflEspnSetSeason(year);
    else _nflChangeDetailSeason(year);
}

function _nflEspnSetSeason(season) {
    _nflEspnSeason = String(season);
    const sel = document.querySelector('#playersGrid select[onchange*="_nflEspnSetSeason"]');
    if (sel && String(sel.value) !== String(season)) sel.value = season;
    const g = document.getElementById('nfl-gamelog'); if (g) { g.className = ''; g.innerHTML = ''; }
    if (_nflEspnId) _loadNFLGameLog(_nflEspnId, season);
}

// All-time player detail (any current or retired player, keyed by ESPN athlete id).
async function showNFLEspnPlayer(espnId) {
    espnId = String(espnId).replace(/[^0-9]/g, '');
    const grid = document.getElementById('playersGrid');
    grid.className = 'player-detail-container';
    grid.style.cssText = '';
    grid.innerHTML = `<div class="skeleton-card" style="min-height:320px"></div>`;
    if (window.setBreadcrumb) setBreadcrumb('nfl-player', null);
    _nflDetailPlayer = null;
    _nflEspnId = espnId;

    let prof = {}, career = null;
    try {
        const [pr, cr] = await Promise.all([
            fetch(`/api/nflathlete?id=${espnId}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/nflcareer?id=${espnId}`).then(r => r.ok ? r.json() : null),
        ]);
        prof = pr || {}; career = cr;
    } catch (err) { Logger.warn('ESPN player profile/career fetch failed', err, 'NFL'); }
    if (!prof.found) { ErrorHandler.renderEmptyState(grid, 'Player not found', '🏈'); return; }

    const years = [];
    (career && career.categories || []).forEach(c => (c.seasons || []).forEach(sn => { if (sn.year && years.indexOf(sn.year) < 0) years.push(sn.year); }));
    years.sort((a, b) => b - a);
    _nflEspnSeason = years[0] || NFL_STATS_SEASON;

    const pos = prof.pos || '';
    const posColor = _NFL_POS_COLOR[pos] || 'var(--accent)';
    const initials = (prof.name || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const retired = prof.statusType && prof.statusType !== 'active';
    const bits = [prof.team, (prof.height && prof.weight) ? `${prof.height}, ${prof.weight}` : '', prof.college, prof.debutYear ? `Debut ${prof.debutYear}` : '', prof.jersey ? '#' + prof.jersey : ''].filter(Boolean);
    const yearOpts = years.map(y => `<option value="${y}" ${y === _nflEspnSeason ? 'selected' : ''}>${y}</option>`).join('');

    grid.innerHTML = `
        <div class="player-detail-header">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <button onclick="navigateTo('nfl-players')" class="back-button">← Players</button>
                ${retired ? '<span class="player-hero-pos" style="background:var(--bg-elevated);color:var(--text-muted)">Retired</span>' : ''}
            </div>
            <div class="player-hero">
                <div class="player-detail-avatar nfl-hero-avatar" style="--pc:${teamColor}">
                    ${prof.headshot ? `<img class="player-headshot" src="${prof.headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}<span class="avatar-text">${initials}</span>
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${_escHtml(prof.name)}</h1>
                        <span class="player-hero-pos" style="background:${_nflAlpha(posColor, 20)};color:${posColor}">${_escHtml(pos)}</span>
                    </div>
                    <p class="player-detail-meta" style="color:var(--text-muted)">${_escHtml(bits.join(' · '))}</p>
                </div>
            </div>
        </div>
        <div id="nfl-career"></div>
        ${years.length ? `<div style="display:flex;align-items:center;gap:0.5rem;margin:0.6rem 0 0.45rem;padding:0 0.1rem">
            <span style="font-size:0.74rem;font-weight:700;color:var(--text-secondary)">Game log season</span>
            <select onchange="_nflEspnSetSeason(this.value)" style="background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-sm,6px);padding:0.3rem 0.5rem;font-weight:700;cursor:pointer">${yearOpts}</select>
        </div>` : ''}
        <div id="nfl-gamelog"></div>
        <p style="color:var(--text-muted);font-size:0.72rem;margin:0.6rem 0 0;text-align:center">All-time player data · Source: ESPN</p>
    `;
    _loadNFLCareer(espnId, (prof && prof.pos) || '');
    if (years.length) _loadNFLGameLog(espnId, _nflEspnSeason);
}

if (typeof window !== 'undefined') {
    window.loadNFLTeams        = loadNFLTeams;
    window.showNFLEspnPlayer   = showNFLEspnPlayer;
    window.loadNFLRankings     = loadNFLRankings;
    window.loadNFLCompare      = loadNFLCompare;
    window.showNFLPlayerDetail = showNFLPlayerDetail;
    window.showNFLTeamDetail   = showNFLTeamDetail;
    window.displayNFLTeams     = displayNFLTeams;
    window.loadNFLGames        = loadNFLGames;
    window.displayNFLGames     = displayNFLGames;
    // loadNFLStandings/displayNFLStandings intentionally NOT assigned here — the
    // functions were removed (see the comment above ~line 148); nflStandings.js
    // (D-029, loaded after this file) is the sole source of both globals.
    window.loadNFLLeaderboards = loadNFLLeaderboards;
    window.displayNFLTrending  = displayNFLTrending;
    window.loadNFLInjuries     = loadNFLInjuries;
    window.displayNFLInjuries  = displayNFLInjuries;
    window.loadNFLWaivers      = loadNFLWaivers;
    window.displayNFLWaivers   = displayNFLWaivers;
    window.loadNFLStatLeaders  = loadNFLStatLeaders;
    window.displayNFLStatLeaders = displayNFLStatLeaders;
    window.loadNFLPlayers      = loadNFLPlayers;
    window.displayNFLPlayers   = displayNFLPlayers;
    window.updateNFLTicker     = updateNFLTicker;
}

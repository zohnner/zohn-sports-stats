Logger.info('Initializing SportStrata…', undefined, 'APP');

// Ticker — SCORES button navigates to scores for the active sport
(function setupTickerNav() {
    document.getElementById('tickerScoresBtn')?.addEventListener('click', () => {
        const sportViews = { nba: 'games', mlb: 'mlb-games', nfl: 'nfl-games', nhl: 'nhl-games' };
        navigateTo(sportViews[AppState.currentSport] || 'games');
    });
})();


// Season selector — switches CURRENT_SEASON and reloads the current view
(function setupSeasonSelector() {
    const sel = document.getElementById('seasonSelect');
    if (!sel) return;
    sel.value = String(CURRENT_SEASON);
    sel.addEventListener('change', () => {
        const year = parseInt(sel.value, 10);
        if (year === CURRENT_SEASON) return;
        CURRENT_SEASON = year;
        // Clear all season-specific state — forces a fresh load for the new season
        AppState.allPlayers      = [];
        AppState.filteredPlayers = [];
        AppState.playerStats     = {};
        AppState.allGames        = [];
        AppState.nbaStatsMap     = null;
        AppState._nbaStatsSeason = null;
        // MLB season state
        AppState.mlbPlayers      = { hitting: [], pitching: [] };
        AppState.mlbPlayerStats  = { hitting: {}, pitching: {} };
        AppState.mlbTeams        = [];
        AppState.mlbGames        = [];
        AppState.mlbStandings    = null;
        AppState.mlbLeaderSplits = null;
        if (typeof _clearMLBLeaderSplitsCache === 'function') _clearMLBLeaderSplitsCache();
        // Sync the MLB module's own season variable
        if (typeof setMLBSeason === 'function') setMLBSeason(year);
        // Teams data is season-independent; keep allTeams
        Logger.info(`Season → ${year}–${String(year + 1).slice(-2)}`, undefined, 'APP');
        renderCurrentView(AppState.currentView);
    });
})();

// Bust the localStorage cache when the season changes so stale data
// from a previous season never blocks the new one.
(function bustCacheOnSeasonChange() {
    const key = 'zs_season';
    const stored = localStorage.getItem(key);
    if (stored !== String(CURRENT_SEASON)) {
        ApiCache.invalidate('');
        localStorage.setItem(key, String(CURRENT_SEASON));
        Logger.info(`Season changed to ${CURRENT_SEASON} — cache cleared`, undefined, 'APP');
    }
})();

const _SPORT_LANDING = {
    mlb:   { tag: 'Broadcast-grade baseball analytics — the receipt on every number.', cards: [
        ['mlb-leaders', 'bars', 'Leaders', 'AVG · OPS · ERA · FIP · wRC+'],
        ['mlb-standings', 'table', 'Standings & Odds', 'Divisions + Monte Carlo playoff odds'],
        ['mlb-players', 'player', 'Players', 'Statcast profiles, splits, compare'],
        ['mlb-prep', 'clipboard', 'Game Prep', 'Matchups · lineups · print-ready'] ] },
    nfl:   { tag: _nflLandingTag, cards: [
        ['nfl-mock', 'board', 'Mock Draft', 'Live Monte Carlo + value board'],
        ['nfl-draftkit', 'clipboard', 'Draft HQ', 'VORP rankings, tiers, sleepers'],
        ['nfl-standings', 'table', 'Standings', 'Divisions, seeds, playoff picture'],
        ['nfl-games', 'scores', 'Scores', 'Live scoreboard + game viewer'] ] },
    ncaaf: { tag: 'College football, the whole board — free, no login.', cards: [
        ['ncaaf-rankings', 'trophy', 'Rankings', 'AP · Coaches · CFP polls'],
        ['ncaaf-standings', 'table', 'Standings', 'Every conference, one page'],
        ['ncaaf-leaders', 'bars', 'Leaders', 'Passing · rushing · receiving · defense'],
        ['ncaaf-scores', 'scores', 'Scores', 'Top 25 scoreboard'] ] },
    // D-052: player leaders/detail deferred, so only 3 real cards — a 4th slot
    // pointing at Teams keeps the grid's usual 4-card rhythm without implying
    // a player surface exists yet.
    ncaab: { tag: 'College basketball, every conference — free, no login.', cards: [
        ['ncaab-rankings', 'trophy', 'Rankings', 'AP · Coaches polls'],
        ['ncaab-standings', 'table', 'Standings', 'Every conference, one page'],
        ['ncaab-scores', 'scores', 'Scores', 'Live scoreboard'],
        ['ncaab-teams', 'player', 'Teams', 'Browse by conference'] ] },
    // D-092 follow-up: no poll/rankings surface exists for a pro league (unlike
    // NCAAF/NCAAB), but player-level stat Leaders (distinct from a poll) turned
    // out fully viable on a live data-depth check — 4 real cards.
    wnba: { tag: 'Every WNBA conference — free, no login.', cards: [
        ['wnba-leaders', 'bars', 'Leaders', 'PPG · RPG · APG · SPG · BPG'],
        ['wnba-standings', 'table', 'Standings', 'Eastern & Western, one page'],
        ['wnba-scores', 'scores', 'Scores', 'Live scoreboard'],
        ['wnba-teams', 'player', 'Teams', 'Browse by conference'] ] },
};

// NFL landing seasonal line (D-045 said "one hero + seasonal line" but the line was a
// static string, not actually seasonal — this is the fix flagged and left open by D-063's
// own verification note: loadNFLHome() had real phase-aware copy but is unreachable, since
// renderCurrentView() routes every `{sport}-home` through _renderSportLanding before that
// function's dispatch is ever reached. Porting the whole richer loadNFLHome() layout here
// would break D-045's "clean, generic across sports" scope; the seasonal line alone is the
// piece _renderSportLanding was always meant to carry.
function _nflLandingTag() {
    const phase = (typeof _nflSeasonPhase === 'function') ? _nflSeasonPhase() : 'offseason';
    if (phase === 'preseason') return 'Preseason is live — no-login fantasy tools that give you the edge for kickoff.';
    if (phase === 'regular' || phase === 'postseason') return 'Live scores, standings, and stat leaders — the season is on.';
    const days = (typeof _nflDaysToKickoff === 'function') ? _nflDaysToKickoff() : null;
    return (days > 0)
        ? `${days} day${days === 1 ? '' : 's'} to kickoff — build your board before your league does.`
        : 'No-login fantasy tools that give you the edge.';
}

// Broadcast-grade inline card icons (16x16 stroke, match the home feature cards).
// Replaces emoji that mojibake'd to "U0001F3C6" from invalid \U escapes.
const _SL_ICON = {
    bars:      '<path d="M2 14V9M7 14V6M12 14V2"/><path d="M1 14h14" opacity=".5"/>',
    table:     '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6.5h12M6 3v10"/>',
    player:    '<circle cx="8" cy="5.5" r="2.5"/><path d="M3.5 13.5c0-2.8 2-4.2 4.5-4.2s4.5 1.4 4.5 4.2"/>',
    clipboard: '<rect x="3.5" y="3" width="9" height="11" rx="1.5"/><path d="M6 3V2.2a2 2 0 0 1 4 0V3"/><path d="M6 8h4M6 11h2.5"/>',
    board:     '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5.5 6h5M5.5 9h5M5.5 12h3"/>',
    scores:    '<rect x="2" y="4" width="12" height="8.5" rx="1.5"/><path d="M8 4v8.5M4.5 7.7h1.5M10 7.7h1.5"/>',
    trophy:    '<path d="M4.5 3h7v2.5a3.5 3.5 0 0 1-7 0V3z"/><path d="M4.5 4H2.6v.8A2.2 2.2 0 0 0 4.8 7M11.5 4h1.9v.8A2.2 2.2 0 0 1 11.2 7M6.5 11h3M5.5 13.5h5"/>',
};

// Editorial landing architecture (NFL-originated, generalized when ported to
// NCAAF/MLB/NCAAB/WNBA): a wide 2-column grid -- primary column (Spotlight
// hero, optional Latest-news editorial, scoreboard, stat leaders) + a right
// rail (quick links, a "Signature" module, and NFL-only Fantasy Pulse/Your
// Matchup) -- replacing the narrow single-column hero+cards shape every sport
// not yet ported still uses. `_EDITORIAL_SLOTS` says which optional slots a
// sport's markup includes (only the sports listed here use this branch at
// all -- everything else still falls through to the generic shape below);
// `_EDITORIAL_LOADERS` says which functions populate them. Adding a sport
// here is a data change, not a copy-pasted markup block.
// Must sit above the "Boot renders..." block below (like _SPORT_LANDING/
// _SL_ICON already do): setupNavigation() -> _loadFromHash() ->
// renderCurrentView() -> _renderSportLanding() runs synchronously at that
// call, and a `const` defined after it is still in the temporal dead zone at
// that point even though the *function* referencing it is hoisted -- this
// TDZ bug hit exactly that path on first load until moved here.
const _EDITORIAL_SLOTS = {
    // photoHero: real per-side player headshots in the Spotlight hero
    // (Sleeper for NFL; nothing else has an equivalent player-photo pipeline,
    // so every other sport's hero is logo-only -- see each sport's own
    // Spotlight loader for the specific reasoning).
    // fantasyPulse/matchup are fantasy-football concepts with no equivalent
    // data anywhere else (D-125 ruled out NCAAF injury data; no other sport
    // has a fantasy feature at all) -- correctly false everywhere but NFL,
    // not a gap to fill.
    nfl:   { photoHero: true,  news: true, games: true, leaders: true,  signature: true, fantasyPulse: true,  matchup: true },
    // NCAAF (Phase 2 of the port): no Sleeper-backed player photos, no
    // fantasy feature, no injury/depth data anywhere (D-125) -- rail is just
    // quick links + the existing AP/Coaches rankings Signature module.
    ncaaf: { photoHero: false, news: true, games: true, leaders: true,  signature: true, fantasyPulse: false, matchup: false },
    // MLB (Phase 3): no fantasy feature, so rail is quick links + Signature
    // only, same as NCAAF. Signature carries two sections (Pennant Races +
    // Power Rankings) instead of one, mirroring NFL's own two-section
    // Signature module -- see _loadMLBLandingSignature.
    mlb:   { photoHero: false, news: true, games: true, leaders: true,  signature: true, fantasyPulse: false, matchup: false },
    // NCAAB (Phase 4): no player-leaders data anywhere (a real gap, not
    // deferred-but-present -- confirmed by this session's audit), so
    // `leaders: true` here points #slLeaders at a Conference Leaders teaser
    // (team standings, honestly labeled) rather than an invented stat.
    ncaab: { photoHero: false, news: true, games: true, leaders: true,  signature: true, fantasyPulse: false, matchup: false },
    // WNBA (Phase 5): unlike NCAAB, real player leaders exist (D-092
    // Resolution 5), so #slLeaders is a genuine stat-leaders module here, not
    // a team-standings substitute.
    wnba:  { photoHero: false, news: true, games: true, leaders: true,  signature: true, fantasyPulse: false, matchup: false },
};
const _EDITORIAL_LOADERS = {
    nfl: () => {
        if (typeof _loadFootballLandingData === 'function') _loadFootballLandingData('nfl');
        if (typeof _loadNFLLandingSpotlight === 'function') _loadNFLLandingSpotlight();
        if (typeof _loadNFLLandingSignature === 'function') _loadNFLLandingSignature();
        if (typeof _loadNFLLandingFantasyPulse === 'function') _loadNFLLandingFantasyPulse();
        if (typeof _loadNFLLandingMatchup === 'function') _loadNFLLandingMatchup();
        if (typeof _loadSportLandingNews === 'function') _loadSportLandingNews('nfl', 'Latest NFL');
    },
    ncaaf: () => {
        if (typeof _loadFootballLandingData === 'function') _loadFootballLandingData('ncaaf');
        if (typeof _loadNCAAFLandingSpotlight === 'function') _loadNCAAFLandingSpotlight();
        if (typeof _loadPollRankingsSignature === 'function') _loadPollRankingsSignature(fetchNCAAFRankings, 'ncaaf-rankings', 'NCAAF');
        if (typeof _loadSportLandingNews === 'function') _loadSportLandingNews('ncaaf', 'Latest NCAAF');
    },
    mlb: () => {
        if (typeof _loadMLBLandingSpotlight === 'function') _loadMLBLandingSpotlight();
        if (typeof _loadMLBLandingGames === 'function') _loadMLBLandingGames();
        if (typeof _loadMLBLandingLeaders === 'function') _loadMLBLandingLeaders();
        if (typeof _loadMLBLandingSignature === 'function') _loadMLBLandingSignature();
        if (typeof _loadSportLandingNews === 'function') _loadSportLandingNews('mlb', 'Latest MLB');
    },
    ncaab: () => {
        if (typeof _loadNCAABLandingSpotlight === 'function') _loadNCAABLandingSpotlight();
        if (typeof _loadNCAABLandingGames === 'function') _loadNCAABLandingGames();
        if (typeof _loadNCAABLandingConferenceLeaders === 'function') _loadNCAABLandingConferenceLeaders();
        if (typeof _loadPollRankingsSignature === 'function') _loadPollRankingsSignature(fetchNCAABRankings, 'ncaab-rankings', 'NCAAB');
        if (typeof _loadSportLandingNews === 'function') _loadSportLandingNews('ncaab', 'Latest NCAAB');
    },
    wnba: () => {
        if (typeof _loadWNBALandingSpotlight === 'function') _loadWNBALandingSpotlight();
        if (typeof _loadWNBALandingGames === 'function') _loadWNBALandingGames();
        if (typeof _loadWNBALandingLeaders === 'function') _loadWNBALandingLeaders();
        if (typeof _loadWNBALandingSignature === 'function') _loadWNBALandingSignature();
        if (typeof _loadSportLandingNews === 'function') _loadSportLandingNews('wnba', 'Latest WNBA');
    },
};

// Cross-sport home-hero "guest" config (home redesign, 2026-09-07) — every
// sport except MLB, which stays a bespoke flow below (it's handed `games`
// directly instead of fetching, uses _heroFromGame/_heroFromStandings
// instead of a per-sport hero function, and has no candidate-array entry of
// its own). Config-driven rather than a 4th/5th copy-pasted candidate block:
// _renderHomeHero was already repeating near-identical NFL/NCAAF blocks, and
// adding NCAAB/WNBA the same additive way would have left 5 nearly-identical
// live/upcoming blocks. Must sit above the "Boot renders..." block (like
// _SPORT_LANDING/_EDITORIAL_SLOTS above it) for the same reason those do —
// setupNavigation() reaches loadHome() -> _loadHomeTodayGames() ->
// _renderHomeHero() synchronously on first boot, before a `const` placed
// near its own call site would have executed.
const _HOME_HERO_GUEST_SPORTS = {
    nfl:   { fetch: () => fetchNFLScoreboard(),   cache: 'nflGames',   leverage: _nflLeverage,   marquee: _nflMarquee,   heroFn: _heroFromNFLGame },
    ncaaf: { fetch: () => fetchNCAAFScoreboard(), cache: 'ncaafGames', leverage: _ncaafLeverage, marquee: _ncaafMarquee, heroFn: _heroFromNCAAFGame },
    ncaab: { fetch: () => fetchNCAABScoreboard(), cache: 'ncaabGames', leverage: _ncaabLeverage, marquee: _ncaabMarquee, heroFn: _heroFromNCAABGame },
    wnba:  { fetch: () => fetchWNBAScoreboard(),  cache: 'wnbaGames',  leverage: _wnbaLeverage,  marquee: _wnbaMarquee,  heroFn: _heroFromWNBAGame },
};

function _renderEditorialLanding(sport, meta, cfg, st) {
    const grid = document.getElementById('playersGrid');
    const slots = _EDITORIAL_SLOTS[sport];
    const skel = (h, r) => `<div class="skeleton-line" style="height:${h}px;width:100%;border-radius:${r}"></div>`;
    grid.className = 'sport-landing sport-landing--editorial';
    grid.innerHTML = `
        <div class="sl-hero-strip" id="slHero" style="--sport-accent:${meta.accent}">
            <span class="sl-hero-strip-icon" aria-hidden="true">${_iconSvg(meta.icon)}</span>
            <span class="sl-hero-strip-title">${_escHtml(meta.label)}</span>
            <span class="sl-hero-strip-status sl-hero-status--${st.cls}"><span class="sl-status-dot"></span>${_escHtml(st.label)}</span>
        </div>
        <div class="sl-layout">
            <div class="sl-primary">
                <div class="sl-spotlight" id="slSpotlight">${skel(280, 'var(--radius-sm)')}</div>
                ${slots.news ? `<div id="slNews"></div>` : ''}
                ${slots.games ? `<div id="slGames"></div>` : ''}
                ${slots.leaders ? `<div id="slLeaders"></div>` : ''}
            </div>
            <div class="sl-rail">
                <nav class="sl-linklist" aria-label="${_escHtml(meta.label)} quick links">
                    ${cfg.cards.map(([v, ic, t, d]) => `
                        <a class="sl-link" href="#${v}" onclick="event.preventDefault();navigateTo('${v}')">
                            <span class="sl-link-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${_SL_ICON[ic] || ''}</svg></span>
                            <span class="sl-link-body"><span class="sl-link-title">${_escHtml(t)}</span><span class="sl-link-desc">${_escHtml(d)}</span></span>
                        </a>`).join('')}
                </nav>
                ${slots.signature ? `<div class="sl-signature" id="slSignature">${skel(90, 'var(--radius-sm)')}</div>` : ''}
                ${slots.fantasyPulse ? `<div class="sl-fantasy-pulse" id="slFantasyPulse">${skel(120, '0px')}</div>` : ''}
                ${slots.matchup ? `<div class="sl-matchup" id="slMatchup"></div>` : ''}
            </div>
        </div>`;
    if (window.setBreadcrumb) setBreadcrumb(sport + '-home', null);
    const loader = _EDITORIAL_LOADERS[sport];
    if (typeof loader === 'function') loader();
}

// Boot renders the home view synchronously (setupNavigation -> _loadFromHash -> loadHome), so
// any module state loadHome touches must be initialized before this call, or it hits the
// const/let temporal dead zone. _homeNewsCache is read by _renderHomeHeadlines on first paint (F1).
let _homeNewsCache = null;

// setupNavigation calls _loadFromHash which handles initial view + player loading
setupNavigation();


// Populate the ticker independently so it works on first load
// (games tab may not have been visited yet)
(async () => {
    // Show shimmer skeleton while games are fetching to eliminate empty-ticker flicker
    const tickerEl = document.getElementById('scoreTicker');
    if (tickerEl) {
        tickerEl.innerHTML = Array.from({ length: 6 }, () =>
            `<div class="ticker__item" style="opacity:0.35">
                <span class="ticker-team" style="display:inline-block;width:28px;height:10px;
                    background:var(--border-mid);border-radius:4px;vertical-align:middle"></span>
                <span class="ticker-score" style="display:inline-block;width:20px;height:10px;
                    background:var(--border-mid);border-radius:4px;vertical-align:middle;margin:0 4px"></span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score" style="display:inline-block;width:20px;height:10px;
                    background:var(--border-mid);border-radius:4px;vertical-align:middle;margin:0 4px"></span>
                <span class="ticker-team" style="display:inline-block;width:28px;height:10px;
                    background:var(--border-mid);border-radius:4px;vertical-align:middle"></span>
            </div>`
        ).join('');
    }

    // Home is sport-agnostic (D-042) — seed the merged cross-sport ticker instead
    // of the MLB-only default (ISSUES.md "Home — Cross-sport score ticker").
    // _loadFromHash (called by setupNavigation() above) has already set
    // AppState.currentView synchronously by this point.
    if (AppState.currentView === 'home' && typeof _updateHomeTicker === 'function') {
        try {
            await _updateHomeTicker();
            Logger.info('Home ticker initialised', undefined, 'APP');
        } catch (error) {
            Logger.warn('Home ticker init failed', error.message, 'APP');
            if (tickerEl) tickerEl.innerHTML = `<div class="ticker__item">No scores available</div>`;
        }
        return;
    }

    // Cold/deep-linked load into a non-home view (bookmark, shared link, SEO
    // landing page) -- seed the ticker for whatever sport that view actually
    // belongs to, not always MLB. Found live 2026-08-14 during a real NFL
    // preseason debugging pass (DECISIONS.md D-094): this branch used to be
    // unconditionally MLB regardless of AppState.currentSport, racing the
    // view's own per-sport ticker seed (e.g. loadNFLGames -> updateNFLTicker)
    // and leaving the WRONG sport's scores in the ticker for up to 60s, until
    // the live-poll loop happened to correct it -- reproduced on a fresh
    // #nfl-games / #nfl-home load with 3 real NFL games live while the
    // ticker still showed 200+ MLB games. AppState.currentSport is already
    // set synchronously by _loadFromHash before this IIFE runs (see comment
    // above), same guarantee the home branch relies on. _seedSportTicker
    // (js/navigation.js) is the same function switchSport() uses for its
    // in-app path -- reused here rather than reimplemented.
    const _coldSport = AppState.currentSport || 'mlb';
    if (typeof _seedSportTicker === 'function') {
        _seedSportTicker(_coldSport);
        Logger.info(`${_coldSport.toUpperCase()} ticker seed dispatched (cold load)`, undefined, 'APP');
    } else {
        try {
            const games = await fetchMLBSchedule(7);
            if (AppState.mlbGames.length === 0) AppState.mlbGames = games;
            updateMLBTicker(games);
            Logger.info('MLB ticker initialised', { count: games.length }, 'APP');
        } catch (error) {
            Logger.warn('Ticker init failed', error.message, 'APP');
            if (tickerEl) tickerEl.innerHTML = `<div class="ticker__item">No scores available</div>`;
        }
    }
})();



// Live score polling — MLB (60s; same pattern as NBA above)
(function setupMLBLivePolling() {
    // 30s satisfies the ≤30s live-refresh target (D-046 P1). The poll early-returns
    // when no games are live, so idle ticks cost nothing.
    const INTERVAL = 30_000;

    async function _poll() {
        try {
            if (AppState.currentSport !== 'mlb') return;
            const cached = AppState.mlbGames || [];
            const hasLive = cached.some(g => g.status?.abstractGameState === 'Live');
            if (cached.length > 0 && !hasLive) return;
            ApiCache.invalidate('/schedule');
            const games = await fetchMLBSchedule(7);
            AppState.mlbGames = games;
            // Home owns #scoreTicker via setupHomeTickerPolling's merged render while
            // the user is there — this loop would otherwise stomp it with MLB-only.
            if (AppState.currentView !== 'home') updateMLBTicker(games);
            // If user is on the games view, refresh via loadMLBGames so date nav stays intact
            if (AppState.currentView === 'mlb-games' && typeof loadMLBGames === 'function') {
                loadMLBGames();
            }
            // If user is on the home view, refresh today's game cards
            if (AppState.currentView === 'home' && document.getElementById('homeTodayGrid')) {
                _loadHomeTodayGames();
            }
            const liveCount = games.filter(g => g.status?.abstractGameState === 'Live').length;
            if (liveCount > 0) Logger.info(`MLB live poll: ${liveCount} live`, undefined, 'POLL');
        } catch (err) {
            Logger.warn('MLB live poll failed', err.message, 'POLL');
        }
    }

    setInterval(_poll, INTERVAL);
})();

// ── Ticker click → game detail ────────────────────────────────
// Live score polling — NFL (60s; mirrors MLB)
(function setupNFLLivePolling() {
    // Bug found live 2026-08-13 during a real preseason kickoff window (see
    // ISSUES.md "Live NFL preseason debugging session"): the "skip when
    // nothing's live" guard below trusted AppState.nflGames's OWN current
    // (possibly stale) belief to decide whether to bother fetching. Once the
    // client happened to load before any of today's games had kicked off
    // (trivially common -- or simply any gap between games), hasLive was
    // false, the guard returned early every tick, and NOTHING ever refetched
    // to discover the games had since gone live -- a permanent stall, not a
    // slow refresh. Reproduced directly: injected an all-non-live snapshot,
    // waited 100s (past the 60s tick twice), it never self-healed.
    // Fix: bound the skip to FORCE_REFRESH_MS so the loop can never wedge
    // itself shut for longer than one cache cycle (matches
    // fetchNFLScoreboard's own ApiCache.TTL.SHORT), while still skipping
    // most idle ticks during a genuinely dead offseason -- preserving the
    // original intent of the guard, just no longer trusting stale data to
    // stay accurate forever.
    const FORCE_REFRESH_MS = 5 * 60 * 1000;
    let _lastFetchAt = 0;
    async function _poll() {
        try {
            if (AppState.currentSport !== 'nfl') return;
            if (typeof fetchNFLScoreboard !== 'function') return;
            const cached = AppState.nflGames || [];
            const hasLive = cached.some(g => g.isLive);
            const dueForRecheck = (Date.now() - _lastFetchAt) >= FORCE_REFRESH_MS;
            if (cached.length > 0 && !hasLive && !dueForRecheck) return;
            const games = await fetchNFLScoreboard();
            _lastFetchAt = Date.now();
            AppState.nflGames = games;
            // Same home-ownership rule as the MLB loop above — merged ticker owns
            // #scoreTicker while on Home.
            if (AppState.currentView !== 'home' && typeof updateNFLTicker === 'function') updateNFLTicker(games);
            if (AppState.currentView === 'nfl-games' && typeof displayNFLGames === 'function') displayNFLGames(games);
            const liveCount = games.filter(g => g.isLive).length;
            if (liveCount > 0 && window.Logger) Logger.info(`NFL live poll: ${liveCount} live`, undefined, 'POLL');
        } catch (err) { if (window.Logger) Logger.warn('NFL live poll failed', err.message, 'POLL'); }
    }
    setInterval(_poll, 60000);
})();

// Live score polling — NCAAF (60s; mirrors NFL). A real, previously-unnoticed
// gap: MLB and NFL have both had a live-poll loop for a while (ISSUES.md
// "Home — Cross-sport score ticker" flagged this exact absence in passing),
// but nothing ever refreshed AppState.ncaafGames or re-rendered the Scores
// view/ticker on a live game day — a user sitting on ncaaf-scores during a
// live game would never see it update without manually navigating away and
// back. Surfaced while reworking the Scores page itself (2026-08-30) to add
// live game cards/badges that would otherwise have nothing to refresh them.
(function setupNCAAFLivePolling() {
    const FORCE_REFRESH_MS = 5 * 60 * 1000;
    let _lastFetchAt = 0;
    async function _poll() {
        try {
            if (AppState.currentSport !== 'ncaaf') return;
            if (typeof fetchNCAAFScoreboard !== 'function') return;
            const cached = AppState.ncaafGames || [];
            const hasLive = cached.some(g => g.isLive);
            const dueForRecheck = (Date.now() - _lastFetchAt) >= FORCE_REFRESH_MS;
            if (cached.length > 0 && !hasLive && !dueForRecheck) return;

            if (AppState.currentView === 'ncaaf-scores' && typeof displayNCAAFScores === 'function') {
                // displayNCAAFScores() already does fetch + nav rebuild + (when the
                // filter is the "Today" default) the ticker update in one place —
                // re-running it beats duplicating that logic here. The fetch inside
                // it lands on fetchNCAAFScoreboard's own ApiCache.TTL.SHORT (5 min)
                // entry for these exact params, so this isn't a second real
                // network round-trip, just a second cache read.
                await displayNCAAFScores();
            } else {
                const games = await fetchNCAAFScoreboard(_ncaafScoresFilter || {});
                AppState.ncaafGames = games;
                // Same home-ownership rule as the MLB/NFL loops — merged ticker owns
                // #scoreTicker while on Home, and only the real "Today" default
                // feeds it (mirrors displayNCAAFScores' own ticker rule).
                if (AppState.currentView !== 'home' && !_ncaafScoresFilter && typeof updateNCAAFTicker === 'function') updateNCAAFTicker(games);
            }
            _lastFetchAt = Date.now();
            const liveCount = (AppState.ncaafGames || []).filter(g => g.isLive).length;
            if (liveCount > 0 && window.Logger) Logger.info(`NCAAF live poll: ${liveCount} live`, undefined, 'POLL');
        } catch (err) { if (window.Logger) Logger.warn('NCAAF live poll failed', err.message, 'POLL'); }
    }
    setInterval(_poll, 60000);
})();

// Live score polling — Home's merged cross-sport ticker (ISSUES.md "Home —
// Cross-sport score ticker"). Runs only while AppState.currentView === 'home';
// the MLB/NFL loops above skip their own ticker render in that state so the
// two never fight over the shared #scoreTicker element.
(function setupHomeTickerPolling() {
    const INTERVAL = 30_000;
    async function _poll() {
        if (AppState.currentView !== 'home') return;
        if (typeof _updateHomeTicker !== 'function') return;
        try {
            await _updateHomeTicker();
        } catch (err) {
            if (window.Logger) Logger.warn('Home ticker poll failed', err.message, 'POLL');
        }
    }
    setInterval(_poll, INTERVAL);
})();

(function setupTickerClicks() {
    const tickerEl = document.getElementById('scoreTicker');
    if (!tickerEl) return;
    tickerEl.addEventListener('click', e => {
        const item = e.target.closest('[data-game-id],[data-game-pk]');
        if (!item) return;
        const sport = item.dataset.sport;
        if (sport === 'mlb') {
            const gamePk = parseInt(item.dataset.gamePk, 10);
            if (!gamePk) return;
            if (AppState.currentSport !== 'mlb') switchSport('mlb');
            if (typeof openMLBGame === 'function') openMLBGame(gamePk, item.classList.contains('ticker__item--live'));
            else if (typeof showMLBGameDetail === 'function') showMLBGameDetail(gamePk);
        } else if (sport === 'nfl') {
            const gid = item.dataset.gameId;
            if (AppState.currentSport !== 'nfl') switchSport('nfl');
            if (gid) navigateTo('nfl-game-' + gid);
            else navigateTo('nfl-games');
        } else if (sport === 'ncaaf') {
            if (AppState.currentSport !== 'ncaaf') switchSport('ncaaf');
            navigateTo('ncaaf-scores');
        } else if (sport === 'wnba') {
            const gid = item.dataset.gameId;
            if (AppState.currentSport !== 'wnba') switchSport('wnba');
            if (gid) navigateTo('wnba-game-' + gid);
            else navigateTo('wnba-scores');
        } else if (sport === 'nhl') {
            if (AppState.currentSport !== 'nhl') switchSport('nhl');
            else navigateTo('nhl-games');
        }
    });
})();

Logger.info('App bootstrap complete', undefined, 'APP');

// Back-to-top button — show after 400px scroll
(function setupBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;
    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
})();

// ── Home / Landing page ───────────────────────────────────────

function _homeSkeletonCards(n = 6) {
    return Array.from({length: n}, () => `
        <div class="home-game-card home-game-card--skeleton" aria-hidden="true">
            <div class="hgc-row">
                <span class="skeleton-line" style="width:28px;height:28px;border-radius:50%;flex-shrink:0"></span>
                <span class="skeleton-line" style="width:36px;height:13px"></span>
                <span class="skeleton-line" style="width:18px;height:16px;margin-left:auto"></span>
            </div>
            <div class="hgc-row">
                <span class="skeleton-line" style="width:28px;height:28px;border-radius:50%;flex-shrink:0"></span>
                <span class="skeleton-line" style="width:36px;height:13px"></span>
                <span class="skeleton-line" style="width:18px;height:16px;margin-left:auto"></span>
            </div>
            <div class="hgc-card-footer">
                <span class="skeleton-line" style="width:48px;height:11px"></span>
            </div>
        </div>
    `).join('');
}

// ── Home cross-sport ticker (ISSUES.md "Home — Cross-sport score ticker") ──
// Home is the sport-agnostic front door (D-042); #scoreTicker should reflect
// that instead of showing whatever AppState.currentSport happens to still be
// set to. Merges MLB/NFL/NCAAF through Scorebug's already-normalized model
// (D-047 S2) — a data-merge over fetches every sport already makes elsewhere,
// not a new component. NCAAB has no Scorebug normalizer yet (D-052 shipped
// its own standalone ticker fn) and NHL is preview-only — both out of scope.
async function _updateHomeTicker() {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker || typeof Scorebug === 'undefined') return;

    const [mlbGames, nflGames, ncaafGames] = await Promise.all([
        (async () => {
            try {
                const g = await fetchMLBSchedule(7);
                if (AppState.mlbGames && AppState.mlbGames.length === 0) AppState.mlbGames = g;
                return g;
            } catch (_) { return AppState.mlbGames || []; }
        })(),
        (async () => {
            if (typeof fetchNFLScoreboard !== 'function') return AppState.nflGames || [];
            try {
                const g = await fetchNFLScoreboard();
                AppState.nflGames = g;
                return g;
            } catch (_) { return AppState.nflGames || []; }
        })(),
        (async () => {
            if (typeof fetchNCAAFScoreboard !== 'function') return AppState.ncaafGames || [];
            try {
                const g = await fetchNCAAFScoreboard();
                AppState.ncaafGames = g;
                return g;
            } catch (_) { return AppState.ncaafGames || []; }
        })(),
    ]);

    // The view may have moved on while these fetches were in flight — don't
    // stomp whatever's showing now (e.g. a sport-specific ticker after a
    // fast navigation away from Home).
    if (AppState.currentView !== 'home') return;

    // This is the one place all three sports' fresh game data lands at once —
    // piggyback the sport-picker's live/today counts on it rather than adding
    // a second fetch cycle just for the picker cards.
    if (typeof _renderSportPicker === 'function') _renderSportPicker();

    const entries = [];
    (mlbGames || []).forEach(g => {
        // Same Preview-exclusion updateMLBTicker already applies, so 0-0
        // not-yet-started games don't flood the ticker.
        if (g.status?.abstractGameState === 'Preview') return;
        if (g.teams?.home?.score == null || g.teams?.away?.score == null) return;
        entries.push({ model: Scorebug.normalizeMLBGame(g), ts: g.gameDate ? new Date(g.gameDate).getTime() : 0, sport: 'mlb' });
    });
    // Football scoreboard fetchers already scope to the relevant week/day, so
    // no extra date filtering is needed — just normalize.
    (nflGames || []).forEach(g => {
        entries.push({ model: Scorebug.normalizeNFLGame(g), ts: g.date ? new Date(g.date).getTime() : 0, sport: 'nfl' });
    });
    (ncaafGames || []).forEach(g => {
        entries.push({ model: Scorebug.normalizeNCAAFGame(g), ts: g.date ? new Date(g.date).getTime() : 0, sport: 'ncaaf' });
    });

    if (entries.length === 0) {
        ticker.classList.add('ticker--idle');
        ticker.innerHTML = `<div class="ticker__item">No scores right now — check back soon</div>`;
        return;
    }

    // Followed teams pin first regardless of sport (generalizes the MLB-only
    // pinning updateMLBTicker already does), then live games, then chronological.
    const isFav = e => typeof _isFollowed === 'function' &&
        (_isFollowed(e.sport, 'team', e.model.home.abbr) || _isFollowed(e.sport, 'team', e.model.away.abbr));
    entries.sort((a, b) => {
        const favA = isFav(a) ? 0 : 1, favB = isFav(b) ? 0 : 1;
        if (favA !== favB) return favA - favB;
        const liveA = a.model.status === 'live' ? 0 : 1, liveB = b.model.status === 'live' ? 0 : 1;
        if (liveA !== liveB) return liveA - liveB;
        return a.ts - b.ts;
    });

    const items = [...entries, ...entries].map(e => Scorebug.renderTickerItem(e.model)).join('');
    ticker.classList.remove('ticker--idle');
    ticker.innerHTML = items;

    // Proportional scroll speed — same logic updateMLBTicker already uses.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
    }));
}

function loadHome() {
    if (typeof _applySportUI === 'function') _applySportUI('home');
    if (typeof _updateHomeTicker === 'function') _updateHomeTicker();
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'home-container';

    // D-043 3a: sport-tab choice persists within the session (Vera). Initialize
    // once per page-session, before the first _loadHomeTodayGames() render needs it.
    if (AppState._homeSportTab === undefined) {
        let saved = null;
        try { saved = sessionStorage.getItem('zs_home_sport_tab'); } catch (_) {}
        AppState._homeSportTab = (saved && ['all', 'mlb', 'nfl', 'ncaaf'].includes(saved)) ? saved : 'all';
    }

    const dateStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
    });

    // Structured skeleton cards that match the real game card layout — also
    // reused on a football tab's first lazy fetch (D-043 3a), so it's a
    // top-level helper rather than a one-off local const.
    const skelCards = _homeSkeletonCards(6);

    const isFirstVisit = !localStorage.getItem('zs_seen_welcome');
    if (isFirstVisit) localStorage.setItem('zs_seen_welcome', '1');

    // Home redesign Phase 0 (2026-09-07): the flat single-column stack this
    // used to be is now a 2-column sl-layout/sl-primary/sl-rail shell -- the
    // same visual system the 5 sport-landing pages already use
    // (_renderEditorialLanding above) -- rather than a home-only one-off.
    // Tonight's Starting Pitchers, Hot Right Now, On This Day, and the
    // feature strip are retired outright in this same phase, not carried
    // into the new shell and cut later: all four are MLB-only with no
    // cross-sport equivalent, and wrapping them in a shell whose whole
    // premise is "neutral across 5 sports" would be a more visible
    // contradiction than today's plain inconsistency. They're real
    // candidates for mlb-home's own future signature module, not deleted
    // forever -- just not part of the neutral cross-sport home page.
    grid.innerHTML = `
        ${isFirstVisit ? `
        <div class="home-welcome">
            <strong class="home-welcome-headline">Serious stats for serious fans — no login, ever.</strong>
            <span class="home-welcome-sub">Broadcast-grade analytics across MLB, NFL, NCAAF, NCAAB, and WNBA — the receipt on every number, plus no-login NFL draft tools that give you an edge. Free, no account, no ads.</span>
        </div>` : ''}
        <div class="sl-layout home-hub-layout">
            <div class="sl-primary">
                <!-- Data-Story hero (D-046 P2, cross-sport across all 5 since the
                     home redesign) — the day's focal narrative; hidden until populated -->
                <div class="home-hero" id="homeHero" hidden></div>

                <!-- Search prompt bar (P2-004) — pre-existing bug, unrelated to D-103,
                     caught live 2026-08-15: this referenced a #searchBtn id that has
                     never existed (the real open-search-modal trigger has always been
                     #globalSearchBtn — see index.html/js/search.js). getElementById
                     silently returned null so ?.click() no-op'd — clicking this bar
                     visually focused nothing and the search modal never opened. -->
                <button class="home-search-bar" onclick="document.getElementById('globalSearchBtn')?.click()" aria-label="Search players">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <span class="home-search-bar-text">Search players, teams, stats…</span>
                    <kbd class="home-search-kbd">⌘K</kbd>
                </button>

                <!-- Seasonal promo band (D-040 1a / D-043 3b) — one calendar-driven
                     marketing CTA (e.g. NFL season live, draft season). Pennant Races
                     used to share this host; its tightest-gap signal now competes as
                     an MLB candidate in the Insights engine below instead (Phase 1). -->
                <div class="home-moment" id="homeMoment" hidden></div>

                <!-- Today's Games — still MLB/NFL/NCAAF only; the sport-preview hub
                     (a later phase) subsumes this with one card per sport instead -->
                <div class="home-today home-zone" id="homeTodayGames">
                    <div class="home-section-hdr">
                        <span class="home-section-title">Today's Games</span>
                        <span class="home-section-date">${dateStr}</span>
                        <span class="home-updated" id="homeUpdatedAt"></span>
                        <button class="home-section-link" onclick="navigateTo('mlb-games')">All scores →</button>
                    </div>
                    <!-- D-043 3a: sport tabs, .standings-tabs vocabulary (Kael) -->
                    <div class="standings-tabs" id="homeSportTabs" role="tablist" aria-label="Filter today's games by sport">
                        <button class="standings-tab" data-sporttab="all" role="tab" aria-selected="false">All</button>
                        <button class="standings-tab" data-sporttab="mlb" role="tab" aria-selected="false">MLB</button>
                        <button class="standings-tab" data-sporttab="nfl" role="tab" aria-selected="false">NFL</button>
                        <button class="standings-tab" data-sporttab="ncaaf" role="tab" aria-selected="false">NCAAF</button>
                    </div>
                    <div class="home-today-grid" id="homeTodayGrid">${skelCards}</div>
                </div>

                <!-- Insights + Headlines rail (D-046 P3, home redesign Phase 1) —
                     Insights leads: real computed cross-sport stat depth ESPN/CBS/
                     Yahoo's wire-copy headlines can't show, the actual differentiation
                     play. Headlines (also now cross-sourced across all 5 sports) is
                     the secondary tab, not the default. -->
                <div class="home-rail home-zone" id="homeRail">
                    <div class="home-section-hdr">
                        <span class="home-section-title">The Latest</span>
                        <div class="rail-tabs" role="tablist" aria-label="Insights and news">
                            <button class="rail-tab active" data-tab="insights" role="tab" aria-selected="true">Insights</button>
                            <button class="rail-tab" data-tab="headlines" role="tab" aria-selected="false">Headlines</button>
                        </div>
                    </div>
                    <div class="rail-panel" id="railInsights" role="tabpanel">
                        ${[0,1,2].map(() => `<div class="skeleton-line" style="height:34px;border-radius:var(--radius-sm);margin-bottom:6px"></div>`).join('')}
                    </div>
                    <div class="rail-panel" id="railHeadlines" role="tabpanel" hidden>
                        ${[0,1,2,3,4].map(() => `<div class="skeleton-line" style="height:34px;border-radius:var(--radius-sm);margin-bottom:6px"></div>`).join('')}
                    </div>
                </div>
            </div>
            <div class="sl-rail">
                <!-- Sport-picker band (D-042) — interim; retired once the
                     sport-preview hub ships in a later phase -->
                <div class="home-sport-picker home-zone" id="homeSportPicker" role="group" aria-label="Choose a sport"></div>

                <div class="home-starred home-zone" id="homeStarred"></div>
                <div class="home-recents home-zone" id="homeRecents"></div>
            </div>
        </div>

        <footer class="home-footer">
            <span>Scores &amp; stats: MLB Stats API &amp; Baseball Savant (MLB), ESPN (NFL, NCAAF, NCAAB, WNBA). This site is not endorsed by or affiliated with any league or team.</span>
            <span>Press &amp; partnerships: <a href="mailto:sportstrata@proton.me">sportstrata@proton.me</a></span>
            <span>&copy; ${new Date().getFullYear()} SportStrata</span>
        </footer>
    `;

    _renderHomeMoment();
    _renderSportPicker();
    _renderHomeRecents();
    _renderHomeStarred();
    _syncHomeSportTabUI();
    _loadHomeTodayGames();
    _wireHomeSportTabs();
    _wireRailTabs();
    _renderHomeHeadlines();
    _renderHomeInsights();

    // Background-load leaderboard data for the Insights rail if not yet cached
    if (!AppState.mlbLeaderSplits && typeof _fetchMLBLeaderSplits === 'function') {
        _fetchMLBLeaderSplits(MLB_SEASON)
            .then(() => {
                _renderHomeInsights();
            }).catch(err => {
                Logger.warn('Leader splits failed', err, 'APP');
            });
    }
}

// Home redesign Phase 0 (2026-09-07): dropped the `r.sport === 'mlb'` filter
// -- verified via addRecent() (js/search.js) that recents already carry a
// real `sport` field and are already written for NFL views too (not just
// MLB), so this was a wrong filter, not a missing-infra gap. The click
// handler below is now sport-aware for the same reason: it was safe to
// always call showMLBPlayerDetail/showMLBTeamDetail before only because
// every recent WAS an MLB one; that stops being true the moment the filter
// comes off.
function _renderHomeRecents() {
    const el = document.getElementById('homeRecents');
    if (!el) return;
    let recents = [];
    try { recents = JSON.parse(localStorage.getItem('zs_recents') || '[]'); } catch (_) {}
    if (!recents.length) { el.innerHTML = ''; return; }

    const chips = recents.slice(0, 8).map(r => `
            <button class="home-recent-chip" data-id="${r.id}" data-sport="${r.sport}" data-type="${r.type || 'player'}">
                <span class="home-recent-badge home-recent-badge--${_escHtml(r.sport)}">${_escHtml(r.badge || r.sport.toUpperCase())}</span>
                <span class="home-recent-name">${_escHtml(r.name)}</span>
                <span class="home-recent-sub">${_escHtml(r.sub || '')}</span>
            </button>
        `).join('');

    el.innerHTML = `
        <div class="home-section-hdr">
            <span class="home-section-title">Recently Viewed</span>
        </div>
        <div class="home-recents-grid">${chips}</div>
    `;

    const _RECENT_DETAIL_FN = {
        mlb: { player: 'showMLBPlayerDetail', team: 'showMLBTeamDetail' },
        nfl: { player: 'showNFLPlayerDetail' },
    };
    el.querySelectorAll('.home-recent-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id     = parseInt(chip.dataset.id, 10);
            const type   = chip.dataset.type;
            const sport  = chip.dataset.sport;
            const fnName = _RECENT_DETAIL_FN[sport]?.[type];
            if (fnName && typeof window[fnName] === 'function') window[fnName](id);
        });
    });
}

function _renderHomeStarred() {
    const el = document.getElementById('homeStarred');
    if (!el) return;
    // AuthState.follows keys are "sport:entityType:entityId" (see js/auth.js); pull out
    // the numeric id for every followed MLB player. Was AppState.mlbFavorites before the
    // 2026-08-05 merge into the unified follow-star system.
    const favIds = AuthState.follows
        ? [...AuthState.follows].filter(k => k.startsWith('mlb:player:')).map(k => Number(k.split(':')[2]))
        : [];
    if (!favIds.length) { el.innerHTML = ''; return; }

    const chips = favIds.map(id => {
        const player = [...(AppState.mlbPlayers?.hitting || []), ...(AppState.mlbPlayers?.pitching || [])]
            .find(p => p.id === id);
        if (!player) return null;
        const hitSt = AppState.mlbPlayerStats?.hitting?.[id];
        const pitSt = AppState.mlbPlayerStats?.pitching?.[id];
        const stat  = hitSt?.avg ? `AVG ${hitSt.avg}` : pitSt?.era ? `ERA ${pitSt.era}` : '';
        return `
            <button class="home-recent-chip" data-id="${id}">
                <span class="home-recent-badge home-recent-badge--mlb">♥</span>
                <span class="home-recent-name">${_escHtml(player.fullName)}</span>
                <span class="home-recent-sub">${_escHtml(player.teamAbbr || '')}${stat ? ' · ' + stat : ''}</span>
            </button>`;
    }).filter(Boolean);

    if (!chips.length) { el.innerHTML = ''; return; }

    el.innerHTML = `
        <div class="home-section-hdr">
            <span class="home-section-title">Starred Players</span>
        </div>
        <div class="home-recents-grid">${chips.join('')}</div>
    `;

    el.querySelectorAll('.home-recent-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = parseInt(chip.dataset.id, 10);
            if (typeof showMLBPlayerDetail === 'function') showMLBPlayerDetail(id);
        });
    });
}

function _renderHotStrip() {
    const container = document.getElementById('homeHotStrip');
    const grid      = document.getElementById('homeHotGrid');
    if (!container || !grid) return;

    const hitting  = AppState.mlbLeaderSplits?.hitting  || [];
    const pitching = AppState.mlbLeaderSplits?.pitching || [];
    if (!hitting.length && !pitching.length) return;

    const _fmtAvgLocal = v => v >= 1 ? v.toFixed(2) : ('.' + String(Math.round(v * 1000)).padStart(3, '0'));
    const _top = (splits, sortKey, desc = true) => {
        const sorted = [...splits]
            .filter(s => s.stat?.[sortKey] != null && !isNaN(parseFloat(s.stat[sortKey])))
            .sort((a, b) => {
                const av = parseFloat(a.stat[sortKey]), bv = parseFloat(b.stat[sortKey]);
                return desc ? bv - av : av - bv;
            });
        return sorted[0] || null;
    };

    // Qualified pools for rate leaders (MLB standard: 3.1 PA / 1 IP per team game),
    // so a 1-for-1 line can't appear as the batting-average or OPS "leader".
    const _teamG  = Math.max(0, ...hitting.map(s => parseInt(s.stat?.gamesPlayed, 10) || 0));
    const _paQual = Math.round(3.1 * _teamG);
    const _ipQual = _teamG;
    const _qh = hitting.filter(s => (parseFloat(s.stat?.plateAppearances) || 0) >= _paQual);
    const _qp = pitching.filter(s => (parseFloat(s.stat?.inningsPitched) || 0) >= _ipQual);
    const qHit = _qh.length ? _qh : hitting;
    const qPit = _qp.length ? _qp : pitching;

    const spots = [
        { split: _top(hitting, 'homeRuns'),  key: 'homeRuns',  label: 'Home Runs',  unit: 'HR',  fmt: v => String(v) },
        { split: _top(qHit, 'avg'),           key: 'avg',       label: 'Batting Avg', unit: 'AVG', fmt: v => _fmtAvgLocal(v) },
        { split: _top(qPit, 'era', false),    key: 'era',       label: 'ERA Leader',  unit: 'ERA', fmt: v => parseFloat(v).toFixed(2) },
        { split: _top(qHit, 'ops'),           key: 'ops',       label: 'OPS Leader',  unit: 'OPS', fmt: v => _fmtAvgLocal(v) },
    ].filter(s => s.split);

    if (!spots.length) return;

    grid.innerHTML = spots.map(({ split, key, label, unit, fmt }) => {
        const val    = fmt(parseFloat(split.stat[key]));
        const name   = split.player?.fullName || '—';
        const abbr   = split.team?.abbreviation || '';
        const pid    = split.player?.id;
        const colors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(abbr) : { primary: '#7c8df0' };
        const headshot = pid && typeof getMLBPlayerHeadshotUrl === 'function' ? getMLBPlayerHeadshotUrl(pid) : null;
        const initials = name.split(' ').map(w => w[0] || '').slice(0, 2).join('');
        return `
            <button class="home-hot-tile" data-pid="${pid || ''}" style="--team-color:${colors.primary}">
                <div class="home-hot-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                    ${headshot ? `<img src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}
                    <span class="home-hot-initials">${initials}</span>
                </div>
                <div class="home-hot-body">
                    <span class="home-hot-label">${label}</span>
                    <span class="home-hot-name">${_escHtml(name)}</span>
                    <span class="home-hot-team">${_escHtml(abbr)}</span>
                </div>
                <div class="home-hot-stat">${val}<span class="home-hot-unit">${unit}</span></div>
            </button>`;
    }).join('');

    grid.querySelectorAll('.home-hot-tile[data-pid]').forEach(tile => {
        const pid = parseInt(tile.dataset.pid, 10);
        if (!pid) return;
        tile.addEventListener('click', () => {
            if (typeof showMLBPlayerDetail === 'function') showMLBPlayerDetail(pid);
        });
    });

    container.style.display = '';
}

function _renderTonightSPSection() {
    const el = document.getElementById('homeTonightSP');
    if (!el) return;

    const games    = AppState._homeGames || [];
    const pitSplits = AppState.mlbLeaderSplits?.pitching || [];
    if (!games.length || !pitSplits.length) return;

    // Index pitching splits by player ID for O(1) lookup
    const statsById = {};
    pitSplits.forEach(s => { if (s.player?.id) statsById[s.player.id] = s.stat; });

    // Only scheduled/live today's games that have at least one probable pitcher
    const todayET = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const upcoming = games.filter(g => {
        if ((g.gameDate || '').slice(0, 10) !== todayET) return false;
        if (g.status?.abstractGameState === 'Final') return false;
        return g.teams?.away?.probablePitcher?.id || g.teams?.home?.probablePitcher?.id;
    }).slice(0, 8);

    if (!upcoming.length) { el.style.display = 'none'; return; }

    const _fmt = (val, dec) => val != null && !isNaN(parseFloat(val)) ? parseFloat(val).toFixed(dec) : '—';
    const _fmtAvgLocal = v => { const n = parseFloat(v); return isNaN(n) ? '—' : n >= 1 ? n.toFixed(2) : '.' + String(Math.round(n * 1000)).padStart(3, '0'); };

    const _spCard = (pp, teamAbbr, align, oppTeamId) => {
        if (!pp?.id) {
            return `<div class="sp-pitcher sp-pitcher--${align} sp-pitcher--tbd"><span class="sp-tbd">TBD</span></div>`;
        }
        const s       = statsById[pp.id] || {};
        const colors  = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(teamAbbr) : { primary: '#7c8df0' };
        const headshot = typeof getMLBPlayerHeadshotUrl === 'function' ? getMLBPlayerHeadshotUrl(pp.id) : '';
        const initials = (pp.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
        const wl      = (s.wins != null && s.losses != null) ? `${s.wins}–${s.losses}` : '';
        const era     = _fmt(s.era, 2);
        const whip    = _fmt(s.whip, 2);
        const k9      = _fmt(s.strikeoutsPer9Inn, 1);
        const pid     = pp.id;

        // Home redesign pass (2026-08-19): compact visual bars backing the
        // existing ERA/K-9 numbers -- decoration, not a new claim (the
        // printed number stays the source of truth, DESIGN.md's receipts
        // pattern). Fixed reference scale, not opponent-relative: ERA 1.00
        // (elite) -> 6.00 (replacement level), inverted since lower is
        // better; K/9 0 -> 14 (elite), direct. Clamped so a real outlier
        // doesn't collapse or blow out the bar.
        const eraNum = parseFloat(s.era);
        const k9Num  = parseFloat(s.strikeoutsPer9Inn);
        const eraPct = !isNaN(eraNum) ? Math.max(0.06, Math.min(1, 1 - (eraNum - 1) / 5)) : null;
        const k9Pct  = !isNaN(k9Num)  ? Math.max(0.06, Math.min(1, k9Num / 14)) : null;
        // Amended same day, live-verified after push: team color (colors.primary)
        // was the original fill, but a dark team color (e.g. the Athletics'
        // #003831) all but disappears against the dark card -- a real
        // legibility bug, not just a style choice. Quality-threshold color
        // fixes the contrast and adds real signal (DESIGN.md already sanctions
        // borrowing win/loss colors for thresholded values, same rule D-096's
        // red-zone coloring used).
        const _statQualityColor = (pct) => pct >= 0.65 ? 'var(--color-win)' : pct <= 0.3 ? 'var(--color-loss)' : 'var(--text-muted)';
        const _statBar = (pct) => pct == null ? '' :
            `<span class="sp-stat-bar" style="--sp-bar-pct:${(pct * 100).toFixed(0)}%;--sp-bar-c:${_statQualityColor(pct)}"></span>`;

        const lastName = (pp.fullName || '').split(' ').slice(1).join(' ') || pp.fullName || 'TBD';

        return `
            <div class="sp-pitcher sp-pitcher--${align}" role="button" tabindex="0"
                 data-pitcher-id="${pid}" data-opp-team-id="${oppTeamId || ''}"
                 onclick="showMLBPlayerDetail(${pid},'pitching')"
                 onkeydown="if(event.key==='Enter')showMLBPlayerDetail(${pid},'pitching')"
                 title="${_escHtml(pp.fullName || '')}">
                <div class="sp-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                    ${headshot ? `<img src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}
                    <span class="sp-avatar-initials">${_escHtml(initials)}</span>
                </div>
                <div class="sp-info">
                    <span class="sp-name">${_escHtml(lastName)}</span>
                    <span class="sp-team" style="color:${colors.primary}">${_escHtml(teamAbbr)}</span>
                    <div class="sp-statline">
                        <span>${era} ERA${_statBar(eraPct)}</span>
                        <span>${whip} WHIP</span>
                        <span>${k9} K/9${_statBar(k9Pct)}</span>
                        ${wl ? `<span>${wl}</span>` : ''}
                    </div>
                    ${oppTeamId ? `<div class="vs-opp-row" data-vs-placeholder="1"><span class="skeleton-line" style="height:9px;width:120px;display:inline-block"></span></div>` : ''}
                    <div class="vs-opp-row" data-ha-placeholder="1"><span class="skeleton-line" style="height:9px;width:90px;display:inline-block"></span></div>
                </div>
            </div>`;
    };

    const cards = upcoming.map(g => {
        const awayAbbr = g.teams?.away?.team?.abbreviation || '';
        const homeAbbr = g.teams?.home?.team?.abbreviation || '';
        const awayPP   = g.teams?.away?.probablePitcher;
        const homePP   = g.teams?.home?.probablePitcher;
        const d        = new Date(g.gameDate || '');
        const etH      = (d.getUTCHours() - 4 + 24) % 24;
        const etM      = d.getUTCMinutes();
        const timeStr  = isNaN(etH) ? '' : `${etH % 12 || 12}:${String(etM).padStart(2,'0')} ${etH >= 12 ? 'PM' : 'AM'} ET`;

        const awayTeamId = g.teams?.away?.team?.id;
        const homeTeamId = g.teams?.home?.team?.id;

        return `
            <div class="sp-card">
                ${_spCard(awayPP, awayAbbr, 'away', homeTeamId)}
                <div class="sp-vs">
                    <span class="sp-vs-text">vs</span>
                    ${timeStr ? `<span class="sp-time">${timeStr}</span>` : ''}
                </div>
                ${_spCard(homePP, homeAbbr, 'home', awayTeamId)}
            </div>`;
    }).join('');

    el.innerHTML = `
        <div class="home-section-hdr">
            <span class="home-section-title">Tonight's Starters</span>
            <button class="home-section-link" onclick="navigateTo('mlb-prep')">Game Prep →</button>
        </div>
        <div class="sp-grid">${cards}</div>
    `;
    el.style.display = '';

    // Async enrichment: populate vs-opponent career stats for each SP
    el.querySelectorAll('[data-pitcher-id][data-opp-team-id]').forEach(async pitcherEl => {
        const pid    = parseInt(pitcherEl.dataset.pitcherId);
        const oppId  = parseInt(pitcherEl.dataset.oppTeamId);
        const rowEl  = pitcherEl.querySelector('[data-vs-placeholder]');
        if (!pid || !oppId || !rowEl) return;

        try {
            const data = await mlbFetch(`/people/${pid}`, {
                hydrate: `stats(group=[pitching],type=vsTeamTotal,opposingTeamId=${oppId})`
            }, ApiCache.TTL.LONG);

            const split = data.people?.[0]?.stats?.[0]?.splits?.[0]?.stat;
            if (!split || !split.gamesPlayed) { rowEl.remove(); return; }

            const opp    = data.people?.[0]?.stats?.[0]?.splits?.[0]?.opponent?.abbreviation || '';
            const baa    = split.avg ? split.avg.replace(/^0/, '') : null;
            const k      = split.strikeOuts;
            const bb     = split.baseOnBalls;
            const starts = split.gamesPlayed;
            const qual   = starts < 3 ? '(small sample)' : `(${starts} starts)`;

            if (!baa) { rowEl.remove(); return; }

            rowEl.removeAttribute('data-vs-placeholder');
            rowEl.innerHTML =
                `<span class="vs-opp-row__label">${_escHtml(opp)} career</span>` +
                `<span class="vs-opp-row__val">${_escHtml(baa)} BAA</span>` +
                `<span class="vs-opp-row__sep">·</span>` +
                `<span class="vs-opp-row__val">${k} K</span>` +
                `<span class="vs-opp-row__sep">·</span>` +
                `<span class="vs-opp-row__val">${bb} BB</span>` +
                `<span class="vs-opp-row__caveat">${_escHtml(qual)}</span>`;
        } catch (_) {
            rowEl.remove();
        }
    });

    // Async enrichment: home/away ERA split for each confirmed SP
    el.querySelectorAll('[data-pitcher-id]').forEach(pitcherEl => {
        const pid   = parseInt(pitcherEl.dataset.pitcherId);
        const haRow = pitcherEl.querySelector('[data-ha-placeholder]');
        if (!pid || !haRow) return;
        mlbFetch(`/people/${pid}`, {
            hydrate: `stats(group=[pitching],type=homeAndAway,season=${MLB_SEASON})`
        }, ApiCache.TTL.LONG).then(data => {
            const splits = data.people?.[0]?.stats?.[0]?.splits || [];
            const home = splits.find(s => s.split?.code === 'H')?.stat;
            const away = splits.find(s => s.split?.code === 'A')?.stat;
            if (!home || !away) { haRow.remove(); return; }
            const hEra = home.era != null ? parseFloat(home.era).toFixed(2) : null;
            const aEra = away.era != null ? parseFloat(away.era).toFixed(2) : null;
            if (!hEra && !aEra) { haRow.remove(); return; }
            haRow.removeAttribute('data-ha-placeholder');
            haRow.innerHTML =
                `<span class="vs-opp-row__label">Home</span>` +
                `<span class="vs-opp-row__val">${_escHtml(hEra || '—')} ERA</span>` +
                `<span class="vs-opp-row__sep">·</span>` +
                `<span class="vs-opp-row__label">Away</span>` +
                `<span class="vs-opp-row__val">${_escHtml(aEra || '—')} ERA</span>`;
        }).catch(() => haRow.remove());
    });
}

// ── Team favorites (D-046 P5) ── merged 2026-08-05 into the unified follow-star
// system (js/auth.js) per explicit direction: one star going forward instead of
// three separate favorite mechanisms. `_gameHasFav` now reads AuthState.follows
// (mlb:team:{abbr}) via `_isFollowed` instead of its own localStorage set.
function _gameHasFav(g) {
    if (typeof _isFollowed !== 'function') return false;
    return _isFollowed('mlb', 'team', g.teams?.home?.team?.abbreviation)
        || _isFollowed('mlb', 'team', g.teams?.away?.team?.abbreviation);
}

// Re-renders the pieces whose SORT ORDER (not just star visual state) depends on
// which teams are followed -- today's-games grid and the ticker both pin favorite
// teams to the front, so a toggle has to re-run their sort, not just repaint a star.
// auth.js's toggleFollow() dispatches this event after every follow/unfollow;
// the generic per-star repaint already happened by the time this fires.
window.addEventListener('ss:follow-changed', (e) => {
    if (!e.detail || e.detail.sport !== 'mlb') return;
    if (e.detail.entityType === 'team') {
        if (typeof _loadHomeTodayGames === 'function' && document.getElementById('homeTodayGrid')) {
            _loadHomeTodayGames();
        }
        if (AppState.currentView === 'home' && typeof _updateHomeTicker === 'function') {
            _updateHomeTicker();
        } else if (typeof updateMLBTicker === 'function' && AppState.mlbGames) {
            updateMLBTicker(AppState.mlbGames);
        }
    }
    // Home "Starred Players" chips (mlb:player follows) and the team-follow surfaces
    // above both live on the same home render -- refresh on either kind of change.
    if (typeof _renderHomeStarred === 'function') _renderHomeStarred();
});

// Settings' Manage Follows list can also be the trigger (its own unfollow button), or a
// follow star elsewhere while the drawer happens to be open -- keep it in sync either way.
window.addEventListener('ss:follow-changed', () => {
    const panel = document.getElementById('settingsPanel');
    if (panel && !panel.hidden && typeof _renderSettingsFollowsList === 'function') {
        _renderSettingsFollowsList();
    }
    // Dashboard section list (2026-08-17): unfollowing the last team/player in a sport
    // should drop that sport's checkbox immediately, same "keep it in sync either way"
    // reasoning as the Following list above.
    if (panel && !panel.hidden && typeof _renderSettingsDashboardSections === 'function') {
        _renderSettingsDashboardSections();
    }
});

// D-043 3a: sport-tab bar. A static element (part of loadHome()'s one-shot
// template), so its click listener is bound once, guarded like _wireRailTabs.
function _syncHomeSportTabUI() {
    const bar = document.getElementById('homeSportTabs');
    if (!bar) return;
    const active = AppState._homeSportTab || 'all';
    bar.querySelectorAll('.standings-tab').forEach(t => {
        const on = t.dataset.sporttab === active;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}

function _wireHomeSportTabs() {
    const bar = document.getElementById('homeSportTabs');
    if (!bar || bar._wired) return;
    bar._wired = true;
    bar.addEventListener('click', e => {
        const tab = e.target.closest('.standings-tab');
        if (!tab) return;
        const sport = tab.dataset.sporttab;
        if (!sport || sport === AppState._homeSportTab) return;
        AppState._homeSportTab = sport;
        try { sessionStorage.setItem('zs_home_sport_tab', sport); } catch (_) {}
        _syncHomeSportTabUI();
        _loadHomeTodayGames();
    });
}

// Generalized click routing for home-grid cards, sport-aware via the
// `data-game-key` prefix Scorebug's normalizers already write (mlb-/nfl-/
// ncaaf-). Mirrors setupTickerClicks' per-sport routing above — NCAAF has no
// per-game detail view, so it routes to the scores list, same as the ticker.
function _wireHomeGameCardClicks(gridEl) {
    gridEl.querySelectorAll('.home-game-card').forEach(card => {
        const open = () => {
            const key = card.dataset.gameKey || '';
            if (key.startsWith('mlb-')) {
                const id = parseInt(key.slice(4), 10);
                if (!id) return;
                if (AppState.currentSport !== 'mlb') switchSport('mlb');
                if (typeof openMLBGame === 'function') openMLBGame(id, card.classList.contains('home-game-card--live'));
                else if (typeof showMLBGameDetail === 'function') showMLBGameDetail(id);
            } else if (key.startsWith('nfl-')) {
                const id = key.slice(4);
                if (AppState.currentSport !== 'nfl') switchSport('nfl');
                if (id) navigateTo('nfl-game-' + id); else navigateTo('nfl-games');
            } else if (key.startsWith('ncaaf-')) {
                if (AppState.currentSport !== 'ncaaf') switchSport('ncaaf');
                navigateTo('ncaaf-scores');
            }
        };
        card.addEventListener('click', open);
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
}

// D-043 3a: single-sport football tab (NFL/NCAAF) — lazy-fetched independent
// of the MLB path below, cached in AppState for the rest of the session so
// switching back doesn't re-fetch, and so the "All" tab can union it in once
// it exists. Does not touch the MLB-only hero/tonight's-SP/freshness wiring
// (Axiom's explicit scoping call, D-043 3a gates in ISSUES.md).
async function _renderHomeFootballTab(sport, gridEl) {
    document.querySelectorAll('#homeTodayGames .home-live-badge').forEach(el => el.remove());
    gridEl.parentNode.querySelectorAll('.home-filter-bar').forEach(el => el.remove());

    const cacheKey  = sport === 'nfl' ? '_homeNFLGames' : '_homeNCAAFGames';
    const fetchFn   = sport === 'nfl'
        ? (typeof fetchNFLScoreboard === 'function' ? fetchNFLScoreboard : null)
        : (typeof fetchNCAAFScoreboard === 'function' ? fetchNCAAFScoreboard : null);
    const normalize = sport === 'nfl' ? Scorebug.normalizeNFLGame : Scorebug.normalizeNCAAFGame;
    const isOffseason = sport === 'nfl'
        ? (typeof _nflIsOffseason === 'function' && _nflIsOffseason())
        : (typeof _ncaafIsOffseason === 'function' && _ncaafIsOffseason());
    const label = sport === 'nfl' ? 'NFL' : 'NCAAF';

    if (!AppState[cacheKey]) gridEl.innerHTML = _homeSkeletonCards(4);

    try {
        const games = fetchFn ? await fetchFn() : [];
        AppState[cacheKey] = games;
        // Tab may have changed again while the fetch was in flight.
        if (!gridEl.isConnected || AppState._homeSportTab !== sport) return;

        if (!games.length) {
            gridEl.innerHTML = isOffseason
                ? (sport === 'nfl' ? _nflOffseasonState('scores') : _ncaafOffseasonState())
                : `<p class="home-no-games">No ${label} games today.</p>`;
            return;
        }

        const sorted = [...games].sort((a, b) => (b.isLive === true) - (a.isLive === true)).slice(0, 15);
        gridEl.innerHTML = sorted.map(g => Scorebug.renderScoreCard(normalize(g))).join('');
        _wireHomeGameCardClicks(gridEl);
    } catch (_) {
        if (gridEl.isConnected && AppState._homeSportTab === sport) {
            gridEl.innerHTML = `<p class="home-no-games">${label} scores unavailable.</p>`;
        }
    }
}

async function _loadHomeTodayGames() {
    const gridEl = document.getElementById('homeTodayGrid');
    if (!gridEl) return;
    const tab = AppState._homeSportTab || 'all';

    // Single-sport football tabs get their own dedicated, smaller render path.
    if (tab === 'nfl' || tab === 'ncaaf') return _renderHomeFootballTab(tab, gridEl);

    const _esc     = (s) => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);

    // D-047 S2: home grid cards are built by the shared Scorebug component
    // (js/scorebug.js) — one scorebug anatomy across sports. The favorites star
    // is passed as a hook so the builder stays sport-agnostic.
    const _favStar = (abbr) => (typeof renderFollowStar === 'function')
        ? renderFollowStar('mlb', 'team', abbr, { extraClass: 'auth-follow-star--hgc' }) : '';
    const _gameCard = (g) => (typeof Scorebug !== 'undefined')
        ? Scorebug.renderScoreCard(Scorebug.normalizeMLBGame(g), { favStar: _favStar })
        : '';

    try {
        const mlbResult = await fetchMLBSchedule(2).catch(() => null);
        if (mlbResult) { AppState._homeGames = mlbResult; AppState._homeGamesFetchedAt = Date.now(); }
        const cards = [];

        if (mlbResult) {
            // Favorite-team games pin first (D-046 P5) — but only today's/live ones,
            // so a favorite's prior-day finals in the ±2d window don't crowd the top.
            // Then live, then the rest. Stable sort preserves date-desc sub-order.
            const _todayET = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
            const rank = g => {
                const live = g.status?.abstractGameState === 'Live'
                    && !/final/i.test(g.status?.detailedState || '');
                const isToday = (g.officialDate || (g.gameDate || '').slice(0, 10)) === _todayET;
                if (_gameHasFav(g) && (isToday || live)) return 0;
                return live ? 1 : 2;
            };
            [...mlbResult]
                .sort((a, b) => rank(a) - rank(b))
                .slice(0, 15)
                .forEach(g => cards.push(_gameCard(g)));
        }

        if (!gridEl.isConnected) return;

        // D-043 3a "All" tab: union in whatever football data is already
        // cached this session (lazy — nothing fetched here). MLB-first block
        // order, not chronologically interleaved — honors the barbell framing
        // in the D-043 spec itself (MLB leads; football is additive, not equal
        // weight) rather than flattening every sport to the same visual rank.
        const extraCards = [];
        if (tab === 'all') {
            if (AppState._homeNFLGames && AppState._homeNFLGames.length) {
                [...AppState._homeNFLGames]
                    .sort((a, b) => (b.isLive === true) - (a.isLive === true))
                    .slice(0, 6)
                    .forEach(g => extraCards.push(Scorebug.renderScoreCard(Scorebug.normalizeNFLGame(g))));
            }
            if (AppState._homeNCAAFGames && AppState._homeNCAAFGames.length) {
                [...AppState._homeNCAAFGames]
                    .sort((a, b) => (b.isLive === true) - (a.isLive === true))
                    .slice(0, 6)
                    .forEach(g => extraCards.push(Scorebug.renderScoreCard(Scorebug.normalizeNCAAFGame(g))));
            }
        }

        if (cards.length === 0 && extraCards.length === 0) {
            gridEl.innerHTML = `<p class="home-no-games">No games scheduled today.</p>`;
            return;
        }

        gridEl.innerHTML = cards.join('') + extraCards.join('');

        // Home redesign pass (2026-08-19, team-routed external roadmap triage
        // -- see DECISIONS.md): mark the top-ranked MLB games as "marquee"
        // tiles (bigger, more visually dominant) while keeping every game
        // visible -- no accordion. `cards` is already rank-sorted (favorite +
        // today/live first, then live, then the rest), so the first 3
        // rendered nodes are already the right games to lift; this resolves
        // Vera's flagged tension with D-091's "Today's Games is already the
        // comprehensive view" rationale by never hiding anything.
        if (cards.length > 3) {
            gridEl.querySelectorAll('.home-game-card').forEach((card, i) => {
                if (i < 3) card.classList.add('home-game-card--marquee');
            });
        }

        // Update section header with live count badge + filter pills (idempotent)
        const liveCount = mlbResult ? mlbResult.filter(g => g.status?.abstractGameState === 'Live'
            && !/final/i.test(g.status?.detailedState || '')).length : 0;
        const hdrEl = document.querySelector('#homeTodayGames .home-section-hdr');
        if (hdrEl) {
            // Strip stale live badge before re-inserting
            hdrEl.querySelectorAll('.home-live-badge').forEach(el => el.remove());
            if (liveCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'home-live-badge';
                badge.textContent = `${liveCount} Live`;
                hdrEl.appendChild(badge);
            }

            // Remove stale filter bar before re-inserting
            gridEl.parentNode.querySelectorAll('.home-filter-bar').forEach(el => el.remove());
            const filterBar = document.createElement('div');
            filterBar.className = 'home-filter-bar';
            filterBar.innerHTML = `
                <button class="home-filter-pill active" data-filter="all">All</button>
                ${liveCount > 0 ? '<button class="home-filter-pill home-filter-pill--live" data-filter="live">Live</button>' : ''}
                <button class="home-filter-pill" data-filter="final">Final</button>
                <button class="home-filter-pill" data-filter="sched">Upcoming</button>
            `;
            gridEl.parentNode.insertBefore(filterBar, gridEl);

            filterBar.addEventListener('click', e => {
                const pill = e.target.closest('.home-filter-pill');
                if (!pill) return;
                filterBar.querySelectorAll('.home-filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                const filter = pill.dataset.filter;
                gridEl.querySelectorAll('.home-game-card').forEach(card => {
                    const visible = filter === 'all' || card.dataset.gameStatus === filter;
                    card.style.display = visible ? '' : 'none';
                });
            });
        }

        // Star clicks are handled globally by auth.js's document-level capture listener
        // (it stopPropagation()s the card's own click-to-navigate handler already); the
        // 'ss:follow-changed' listener above re-sorts this grid + the ticker afterward.

        _wireHomeGameCardClicks(gridEl);

        _renderHomeHero(mlbResult);
        _updateHomeFreshness();

    } catch (_) {
        if (gridEl.isConnected) {
            gridEl.innerHTML = `<p class="home-no-games">Scores unavailable.</p>`;
        }
    }
}

// ── Data-Story hero (D-046 P2) ────────────────────────────────
// One focal narrative per load, chosen by real signal, no licensed photos:
//   1) highest-leverage live game  2) marquee upcoming game today
//   3) fallback: tightest division race (standings). Hidden if nothing to show.
function _heroTeamInfo(side, g) {
    const tm     = g.teams?.[side]?.team || {};
    const abbr   = tm.abbreviation || '?';
    const colors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(abbr) : { primary: '#7c8df0' };
    const logo   = (typeof getMLBTeamLogoUrl === 'function' && tm.id) ? getMLBTeamLogoUrl(tm.id) : '';
    return { abbr, id: tm.id, name: colors.name || abbr, color: colors.primary,
             score: g.teams?.[side]?.score, logo };
}
function _heroBoard(g, showScore) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const row = (t, winner) => `
        <div class="hero-row${winner ? ' hero-row--win' : ''}" style="--tc:${t.color}">
            ${t.logo ? `<img class="hero-row-logo" src="${t.logo}" alt="${_esc(t.abbr)}" data-hide-on-error>` : `<span class="hero-row-logo"></span>`}
            <span class="hero-row-abbr">${_esc(t.abbr)}</span>
            <span class="hero-row-score">${showScore ? (t.score ?? 0) : ''}</span>
        </div>`;
    const a = _heroTeamInfo('away', g), h = _heroTeamInfo('home', g);
    const aw = showScore && (a.score ?? 0) > (h.score ?? 0);
    const hw = showScore && (h.score ?? 0) > (a.score ?? 0);
    return `<div class="hero-board">${row(a, aw)}${row(h, hw)}</div>`;
}
function _heroInningPhrase(ls) {
    if (!ls || !ls.currentInning) return 'the game';
    const ord = ls.currentInningOrdinal || `${ls.currentInning}`;
    if (/middle|end/i.test(ls.inningState || '')) return `the ${ord}-inning break`;
    return `the ${ls.isTopInning ? 'top' : 'bottom'} of the ${ord}`;
}
function _heroLiveHook(g) {
    const hs = g.teams?.home?.score ?? 0, as = g.teams?.away?.score ?? 0;
    const a = _heroTeamInfo('away', g), h = _heroTeamInfo('home', g);
    const where = _heroInningPhrase(g.linescore);
    const diff = Math.abs(hs - as);
    if (diff === 0) return `Tied ${as}–${hs} in ${where}`;
    const lead = hs > as ? h : a;
    if (diff === 1) return `${lead.name} lead by 1 in ${where}`;
    return `${lead.name} lead ${Math.max(hs, as)}–${Math.min(hs, as)} in ${where}`;
}
function _heroClockET(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const etH = (d.getUTCHours() - 4 + 24) % 24;
    return `${etH % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${etH >= 12 ? 'PM' : 'AM'} ET`;
}
function _openMLBGameFromHero(gamePk, live) {
    if (!gamePk) return;
    if (AppState.currentSport !== 'mlb' && typeof switchSport === 'function') switchSport('mlb');
    if (typeof openMLBGame === 'function') openMLBGame(gamePk, !!live);
    else if (typeof showMLBGameDetail === 'function') showMLBGameDetail(gamePk);
}
async function _heroFromStandings() {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    let divs = AppState.mlbStandings;
    if (!divs && typeof fetchMLBStandingsFull === 'function') {
        divs = await fetchMLBStandingsFull();
        AppState.mlbStandings = divs;
    }
    if (!Array.isArray(divs) || !divs.length) return null;
    let best = null;
    divs.forEach(d => {
        const teams = d.teams || [];
        if (teams.length < 2) return;
        const gb = parseFloat(teams[1].gb);
        if (!isFinite(gb)) return;
        if (!best || gb < best.gb) best = { div: d.division, leader: teams[0], second: teams[1], gb };
    });
    if (!best) return null;
    const logo = (typeof getMLBTeamLogoUrl === 'function' && best.leader.teamId) ? getMLBTeamLogoUrl(best.leader.teamId) : '';
    const colors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(best.leader.teamAbbr) : { primary: '#7c8df0' };
    const lead = best.gb <= 0 ? 'tied atop' : `${best.gb === 1 ? '1 game' : best.gb + ' games'} up in`;
    const headline = best.gb <= 0
        ? `${_esc(best.leader.teamName)} tied atop the ${_esc(best.div)}`
        : `${_esc(best.leader.teamName)} lead the ${_esc(best.div)}`;
    const hook = best.gb <= 0
        ? `Dead heat with ${_esc(best.second.teamName)} — ${_esc(best.leader.wins)}–${_esc(best.leader.losses)} apiece at the top`
        : `${best.gb === 1 ? '1 game' : best.gb + ' games'} clear of ${_esc(best.second.teamName)} at ${_esc(best.leader.wins)}–${_esc(best.leader.losses)}`;
    const html = `
        <div class="hero-main">
            <span class="hero-kicker hero-kicker--race">${_esc(best.div)} RACE</span>
            <h2 class="hero-headline">${headline}</h2>
            <p class="hero-hook">${hook}</p>
            <div class="hero-meta"><span class="hero-cta">See the standings →</span></div>
        </div>
        <div class="hero-visual">
            <div class="hero-standings" style="--tc:${colors.primary}">
                ${logo ? `<img class="hero-standings-logo" src="${logo}" alt="${_esc(best.leader.teamAbbr)}" data-hide-on-error>` : ''}
                <div class="hero-standings-rec"><span class="hero-standings-rank">1st</span><span class="hero-standings-wl">${_esc(best.leader.wins)}–${_esc(best.leader.losses)}</span></div>
            </div>
        </div>`;
    return { kind: 'race', html, onClick: () => navigateTo('mlb-standings') };
}
// Hoisted out of _renderHomeHero (2026-09-07, sport-landing port) so the MLB
// landing page's own Spotlight module can reuse the exact same live/marquee
// picker instead of re-deriving it -- same "shared top-level function" move
// already made for _nflLeverage/_ncaafLeverage (used by both the home hero
// and each sport's own landing Spotlight) and for _mlbPowerScore above.
// _renderHomeHero below now calls these instead of its own local closures.
function _mlbHeroLeverage(g) {
    const inn  = g.linescore?.currentInning || 1;
    const diff = Math.abs((g.teams?.home?.score ?? 0) - (g.teams?.away?.score ?? 0));
    const combinedPct = (parseFloat(g.teams?.away?.leagueRecord?.pct || 0) + parseFloat(g.teams?.home?.leagueRecord?.pct || 0));
    return inn + (5 - Math.min(diff, 5)) * 2 + combinedPct * 4
        + (_gameHasFav(g) ? 100 : 0);
}
function _mlbHeroMarquee(g) {
    const combinedPct = (parseFloat(g.teams?.away?.leagueRecord?.pct || 0) + parseFloat(g.teams?.home?.leagueRecord?.pct || 0));
    return combinedPct * 4
        + ((g.teams?.away?.team?.division?.id && g.teams?.away?.team?.division?.id === g.teams?.home?.team?.division?.id) ? 1.5 : 0)
        + (_gameHasFav(g) ? 100 : 0);
}
function _heroFromGame(g, kind) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const a = _heroTeamInfo('away', g), h = _heroTeamInfo('home', g);
    const matchupTitle = `${_esc(a.name)} at ${_esc(h.name)}`;
    let kicker, hook, board, cta, liveDetail = '';
    if (kind === 'live') {
        kicker = `<span class="hero-kicker hero-kicker--live">LIVE</span>`;
        hook   = _heroLiveHook(g);
        board  = _heroBoard(g, true);
        cta    = 'Watch live →';
        // D-047 S2 reuse: base/outs/count come from Scorebug's own normalized
        // model (same fragment the grid cards already render via .hgc-live) —
        // the hero previously showed zero live-state detail beyond the score.
        if (typeof Scorebug !== 'undefined' && typeof Scorebug.normalizeMLBGame === 'function') {
            const model = Scorebug.normalizeMLBGame(g);
            if (model.liveHtml) liveDetail = `<div class="hero-live-detail">${model.liveHtml}</div>`;
        }
    } else {
        const time = _heroClockET(g.gameDate);
        const awayPP = g.teams?.away?.probablePitcher?.fullName;
        const homePP = g.teams?.home?.probablePitcher?.fullName;
        const rivals = g.teams?.away?.team?.division?.id
            && g.teams?.away?.team?.division?.id === g.teams?.home?.team?.division?.id;
        kicker = `<span class="hero-kicker">TODAY · ${_esc(time)}</span>`;
        const ppStr = (awayPP && homePP) ? `${_esc(awayPP.split(' ').slice(-1)[0])} vs ${_esc(homePP.split(' ').slice(-1)[0])}` : '';
        hook = [ppStr, rivals ? 'division rivals' : ''].filter(Boolean).join(' · ') || 'First pitch soon';
        board = _heroBoard(g, false);
        cta = 'Game preview →';
    }
    const html = `
        <div class="hero-main">
            ${kicker}
            <h2 class="hero-headline">${matchupTitle}</h2>
            <p class="hero-hook">${_esc(hook)}</p>
            <div class="hero-meta"><span class="hero-cta">${cta}</span></div>
        </div>
        <div class="hero-visual">${board}${liveDetail}</div>`;
    return { kind, html, onClick: () => _openMLBGameFromHero(g.gamePk, kind === 'live') };
}
// Sport-aware hero (owner-scoped 2026-08-09, following up D-046 P2): the
// kicker/headline/game-of-the-day content becomes calendar-aware. Everything
// else about home stays exactly as D-042 established it -- the neutral brand
// (_applySportUI('home')), the sport-picker band, and every other home
// section (Today's Games, Tonight's Starters, Hot Right Now) all stay MLB.
// Owner explicitly chose calendar-phase over personalization or live
// cross-sport leverage scoring, and chose "hero copy only" over letting the
// hero adopt a sport's full visual identity -- both were real options,
// presented and decided, not defaulted to.
//
// MLB leads Mar-Oct -- the same boundary MLB_SEASON already uses for
// current-vs-previous-season detection, so this doesn't invent a new
// calendar rule. NFL leads Nov-Feb: MLB's offseason is NFL's regular
// season/playoffs/Super Bowl, its most exciting stretch, and the two
// windows don't need a tie-break because they don't overlap under this
// rule. The one edge this doesn't smooth over: mid/late Feb sits in NFL's
// own _nflSeasonPhase() 'offseason' (post-Super Bowl, pre-draft-buzz) --
// _renderHomeHeroNFL() finds no live/upcoming game and just hides the hero,
// same honest empty-state MLB's own branch already uses below. Not a
// regression from anything that exists today.
//
// D-100 (2026-08-15): SUPERSEDED. D-099 flagged that this fixed window kept
// the new NFL live-detail hero (situation/broadcast/leaders) unreachable in
// production for 9 months of the year, including a live preseason night this
// was flagged on. Owner chose cross-sport leverage scoring over widening the
// window or leaving it as-is (three options written up in DECISIONS.md
// D-099/D-100) -- _renderHomeHero() below no longer calls this. Left in
// place, unused, as the documented history of why NFL's hero window was
// ever calendar-shaped at all; nothing else in the codebase calls it
// (confirmed via grep before this change).
function _homeHeroSport() {
    const m = new Date().getMonth() + 1; // 1-12
    return (m === 11 || m === 12 || m === 1 || m === 2) ? 'nfl' : 'mlb';
}

function _heroNFLBoard(g, showScore) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const tc = abbr => (typeof getNFLTeamColor === 'function' && getNFLTeamColor(abbr)) || 'var(--accent)';
    const row = (t, winner) => `
        <div class="hero-row${winner ? ' hero-row--win' : ''}" style="--tc:${tc(t.abbr)}">
            ${t.logo ? `<img class="hero-row-logo" src="${_esc(t.logo)}" alt="${_esc(t.abbr)}" data-hide-on-error>` : `<span class="hero-row-logo"></span>`}
            <span class="hero-row-abbr">${_esc(t.abbr)}</span>
            <span class="hero-row-score">${showScore ? (t.score ?? 0) : ''}</span>
        </div>`;
    const aw = showScore && (g.awayTeam.score ?? 0) > (g.homeTeam.score ?? 0);
    const hw = showScore && (g.homeTeam.score ?? 0) > (g.awayTeam.score ?? 0);
    return `<div class="hero-board">${row(g.awayTeam, aw)}${row(g.homeTeam, hw)}</div>`;
}

// Editorial redesign (owner override of D-088 for this one surface, confirmed):
// real photography in the landing hero, not generated graphics only. D-088's
// actual concern was a *generic, uncaptioned* photo over live data reading as
// filler -- not photography itself -- so this deliberately does NOT try to
// match a news-article image to the specific matchup (fragile, frequently
// wrong). Instead it uses each team's most notable rostered player's real
// headshot (getNFLSleeperHeadshot, the same CDN source already used sitewide
// for every player page and the Fantasy Pulse strip) -- reliably available for
// essentially every real game, not a best-effort guess. _nflPool is already
// sorted by search_rank/ADP, so .find() returns the best-ranked skill player.
function _nflHeroNotablePlayer(abbr) {
    if (typeof _nflPool === 'undefined' || !_nflPool || !_nflPool.length) return null;
    const sAbbr = (typeof _nflSleeperAbbr === 'function') ? _nflSleeperAbbr(abbr) : abbr;
    const p = _nflPool.find(pl => pl.team === sAbbr);
    if (!p) return null;
    return { name: p.full_name, headshot: (typeof getNFLSleeperHeadshot === 'function') ? getNFLSleeperHeadshot(p.player_id) : '' };
}
function _nflAttachHeroPhotos(g) {
    if (g.homeTeam) g.homeTeam.notablePlayer = _nflHeroNotablePlayer(g.homeTeam.abbr);
    if (g.awayTeam) g.awayTeam.notablePlayer = _nflHeroNotablePlayer(g.awayTeam.abbr);
}
function _heroNFLPhotos(g) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const tc = abbr => (typeof getNFLTeamColor === 'function' && getNFLTeamColor(abbr)) || 'var(--accent)';
    const side = (t, align) => {
        const np = t.notablePlayer;
        return `<div class="hero-photo hero-photo--${align}" style="--tc:${tc(t.abbr)}">
            ${np && np.headshot
                ? `<img class="hero-photo-img" src="${_esc(np.headshot)}" alt="${_esc(np.name)}" data-hide-on-error>`
                : `<span class="hero-photo-img hero-photo-img--ph" aria-hidden="true"></span>`}
            <div class="hero-photo-meta">
                ${t.logo ? `<img class="hero-photo-logo" src="${_esc(t.logo)}" alt="" data-hide-on-error>` : ''}
                <span class="hero-photo-abbr">${_esc(t.abbr)}</span>
            </div>
        </div>`;
    };
    return `<div class="hero-photos">${side(g.awayTeam, 'away')}<span class="hero-photos-at" aria-hidden="true">@</span>${side(g.homeTeam, 'home')}</div>`;
}

function _openNFLGameFromHero(eventId) {
    if (!eventId) return;
    if (AppState.currentSport !== 'nfl' && typeof switchSport === 'function') switchSport('nfl');
    if (typeof showNFLGame === 'function') showNFLGame(eventId);
}

// D-099: reuses the exact .game-situation/.game-leaders markup the NFL Scores
// grid already ships (D-096/D-098) inside the hero's live-detail slot -- the
// same "one recipe, everywhere" move MLB's hero already made when it started
// reusing Scorebug's liveHtml (base/outs/count) instead of showing bare score.
// Zero new fetch beyond the scoreboard call _renderHomeHero() already makes
// (D-100) -- situation/broadcast/leaders are already on every game object it
// fetches, this was sitting unused in the hero this whole time, same class
// of gap as D-097's dead broadcast field.
function _heroNFLLiveDetail(g) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const sitHtml = g.situation
        ? `<div class="game-situation${g.situation.isRedZone ? ' game-situation--redzone' : ''}">${_esc(g.situation.text)}</div>`
        : '';
    const leadersHtml = g.leaders?.length
        ? `<div class="game-leaders">${g.leaders.map(l =>
            `<div class="game-leader-row"><span class="game-leader-cat">${_esc(l.cat)}</span> ${_esc(l.teamAbbr)} ${_esc(l.name)} — ${_esc(l.stat)}</div>`
          ).join('')}</div>`
        : '';
    return (sitHtml || leadersHtml) ? `<div class="hero-live-detail">${sitHtml}${leadersHtml}</div>` : '';
}
function _heroFromNFLGame(g, kind) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const matchupTitle = `${_esc(g.awayTeam.name || g.awayTeam.abbr)} at ${_esc(g.homeTeam.name || g.homeTeam.abbr)}`;
    let kicker, hook, board, cta, liveDetail = '';
    if (kind === 'live') {
        kicker = `<span class="hero-kicker hero-kicker--live">LIVE${g.broadcast ? ' · ' + _esc(g.broadcast) : ''}</span>`;
        const diff = Math.abs((g.homeTeam.score || 0) - (g.awayTeam.score || 0));
        const leadTeam = (g.homeTeam.score || 0) > (g.awayTeam.score || 0) ? g.homeTeam
            : ((g.awayTeam.score || 0) > (g.homeTeam.score || 0) ? g.awayTeam : null);
        hook = leadTeam
            ? `${_esc(leadTeam.name || leadTeam.abbr)} lead by ${diff} · ${_esc(g.statusText || '')}`
            : `Tied at ${g.homeTeam.score ?? 0} · ${_esc(g.statusText || '')}`;
        board = _heroNFLBoard(g, true);
        cta = 'Watch live →';
        liveDetail = _heroNFLLiveDetail(g);
    } else {
        const d = g.date ? new Date(g.date) : null;
        const time = d && !isNaN(d) ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
        kicker = `<span class="hero-kicker">${g.statusText ? _esc(g.statusText) : 'UPCOMING'}${time ? ' · ' + _esc(time) : ''}${g.broadcast ? ' · ' + _esc(g.broadcast) : ''}</span>`;
        hook = 'Kickoff soon';
        board = _heroNFLBoard(g, false);
        cta = 'Game preview →';
    }
    const html = `
        <div class="hero-main">
            ${kicker}
            <h2 class="hero-headline">${matchupTitle}</h2>
            <p class="hero-hook">${hook}</p>
            <div class="hero-meta"><span class="hero-cta">${cta}</span></div>
        </div>
        <div class="hero-visual">
            ${_heroNFLPhotos(g)}
            ${board}
            ${liveDetail}
        </div>`;
    return { kind, html, onClick: () => _openNFLGameFromHero(g.id) };
}

// 2026-09-03: NCAAF mirror of _heroNFLBoard/_heroNFLLiveDetail/
// _openNFLGameFromHero/_heroFromNFLGame — same shell markup (.hero-board/
// .hero-row/.hero-kicker/.hero-headline/etc.), so no new CSS is needed, only
// a #rank badge added next to a ranked team's abbreviation (a real CFB-
// specific signal NFL's board has no equivalent of). Renamed twice during
// the sport-landing port (2026-09-07): _heroNCAAFBoard -> _heroCollegeBoard
// (NCAAB's landing Spotlight reused it) -> _heroLogoBoard (WNBA's landing
// Spotlight reuses it too, and WNBA isn't college -- the body only ever read
// g.awayTeam/g.homeTeam's generic {abbr,logo,score,rank,color} shape, never
// anything sport-specific, so the name should describe what it draws: a
// logo-based board, as opposed to MLB/NFL's real-photo hero visual).
function _heroLogoBoard(g, showScore) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const tc = t => t.color ? `#${String(t.color).replace('#', '')}` : 'var(--accent)';
    const row = (t, winner) => `
        <div class="hero-row${winner ? ' hero-row--win' : ''}" style="--tc:${tc(t)}">
            ${t.logo ? `<img class="hero-row-logo" src="${_esc(t.logo)}" alt="${_esc(t.abbr)}" data-hide-on-error>` : `<span class="hero-row-logo"></span>`}
            <span class="hero-row-abbr">${t.rank ? `#${t.rank} ` : ''}${_esc(t.abbr)}</span>
            <span class="hero-row-score">${showScore ? (t.score ?? 0) : ''}</span>
        </div>`;
    const aw = showScore && (g.awayTeam.score ?? 0) > (g.homeTeam.score ?? 0);
    const hw = showScore && (g.homeTeam.score ?? 0) > (g.awayTeam.score ?? 0);
    return `<div class="hero-board">${row(g.awayTeam, aw)}${row(g.homeTeam, hw)}</div>`;
}

function _openNCAAFGameFromHero(eventId) {
    if (!eventId) return;
    if (AppState.currentSport !== 'ncaaf' && typeof switchSport === 'function') switchSport('ncaaf');
    if (typeof showNCAAFGame === 'function') showNCAAFGame(eventId);
}

// Same reuse-the-Scores-grid-recipe move D-099 made for NFL: g.situation is
// UNCONFIRMED for CFB (see fetchNCAAFScoreboard's own comment) so this reads
// only .text/.isRedZone defensively and renders nothing at all if the field
// or those two sub-fields are absent -- never a guessed/partial line.
function _heroNCAAFLiveDetail(g) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const sitHtml = g.situation?.text
        ? `<div class="game-situation${g.situation.isRedZone ? ' game-situation--redzone' : ''}">${_esc(g.situation.text)}</div>`
        : '';
    return sitHtml ? `<div class="hero-live-detail">${sitHtml}</div>` : '';
}

function _heroFromNCAAFGame(g, kind) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const matchupTitle = `${_esc(g.awayTeam.name || g.awayTeam.abbr)} at ${_esc(g.homeTeam.name || g.homeTeam.abbr)}`;
    let kicker, hook, board, cta, liveDetail = '';
    if (kind === 'live') {
        kicker = `<span class="hero-kicker hero-kicker--live">LIVE${g.broadcast ? ' · ' + _esc(g.broadcast) : ''}</span>`;
        const diff = Math.abs((g.homeTeam.score || 0) - (g.awayTeam.score || 0));
        const leadTeam = (g.homeTeam.score || 0) > (g.awayTeam.score || 0) ? g.homeTeam
            : ((g.awayTeam.score || 0) > (g.homeTeam.score || 0) ? g.awayTeam : null);
        hook = leadTeam
            ? `${_esc(leadTeam.name || leadTeam.abbr)} lead by ${diff} · ${_esc(g.statusText || '')}`
            : `Tied at ${g.homeTeam.score ?? 0} · ${_esc(g.statusText || '')}`;
        board = _heroLogoBoard(g, true);
        cta = 'Watch live →';
        liveDetail = _heroNCAAFLiveDetail(g);
    } else {
        const d = g.date ? new Date(g.date) : null;
        const time = d && !isNaN(d) ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
        kicker = `<span class="hero-kicker">${g.statusText ? _esc(g.statusText) : 'UPCOMING'}${time ? ' · ' + _esc(time) : ''}${g.broadcast ? ' · ' + _esc(g.broadcast) : ''}</span>`;
        hook = (g.homeTeam.rank && g.awayTeam.rank) ? `#${g.awayTeam.rank} vs #${g.homeTeam.rank}` : 'Kickoff soon';
        board = _heroLogoBoard(g, false);
        cta = 'Game preview →';
    }
    const html = `
        <div class="hero-main">
            ${kicker}
            <h2 class="hero-headline">${matchupTitle}</h2>
            <p class="hero-hook">${hook}</p>
            <div class="hero-meta"><span class="hero-cta">${cta}</span></div>
        </div>
        <div class="hero-visual">${board}${liveDetail}</div>`;
    return { kind, html, onClick: () => _openNCAAFGameFromHero(g.id) };
}

// NCAAB landing Game hero (Phase 4 of the sport-landing port) -- simpler than
// NFL/NCAAF's Spotlight picker (no leverage/marquee scoring model): NCAAB
// has no live-game-viewer page at all (Scores/Standings/Teams/Rankings only,
// per CLAUDE.md's scope), so this is deliberately the plainer of the two
// college-sport heroes, and its CTA goes to the Scores grid rather than a
// per-game detail view that doesn't exist. Reuses _heroLogoBoard (the
// generic board renderer originally written for NCAAF).
function _heroFromNCAABGame(g, kind) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const matchupTitle = `${_esc(g.awayTeam.name || g.awayTeam.abbr)} at ${_esc(g.homeTeam.name || g.homeTeam.abbr)}`;
    let kicker, hook, cta;
    if (kind === 'live') {
        kicker = `<span class="hero-kicker hero-kicker--live">LIVE</span>`;
        const diff = Math.abs((g.homeTeam.score || 0) - (g.awayTeam.score || 0));
        const leadTeam = (g.homeTeam.score || 0) > (g.awayTeam.score || 0) ? g.homeTeam
            : ((g.awayTeam.score || 0) > (g.homeTeam.score || 0) ? g.awayTeam : null);
        hook = leadTeam
            ? `${_esc(leadTeam.name || leadTeam.abbr)} lead by ${diff} · ${_esc(g.statusText || '')}`
            : `Tied at ${g.homeTeam.score ?? 0} · ${_esc(g.statusText || '')}`;
        cta = 'Watch on the scoreboard →';
    } else {
        const d = g.date ? new Date(g.date) : null;
        const time = d && !isNaN(d) ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
        kicker = `<span class="hero-kicker">${g.statusText && g.statusText !== 'TBD' ? _esc(g.statusText) : 'UPCOMING'}${time ? ' · ' + _esc(time) : ''}</span>`;
        hook = (g.homeTeam.rank && g.awayTeam.rank) ? `#${g.awayTeam.rank} vs #${g.homeTeam.rank}` : 'Tip-off soon';
        cta = 'Full scoreboard →';
    }
    const board = _heroLogoBoard(g, kind === 'live');
    const html = `
        <div class="hero-main">
            ${kicker}
            <h2 class="hero-headline">${matchupTitle}</h2>
            <p class="hero-hook">${hook}</p>
            <div class="hero-meta"><span class="hero-cta">${cta}</span></div>
        </div>
        <div class="hero-visual">${board}</div>`;
    return { kind, html, onClick: () => navigateTo('ncaab-scores') };
}

// WNBA landing Game hero (Phase 5 of the sport-landing port) -- same simple
// live-else-soonest-upcoming picker as NCAAB's (no leverage/marquee scoring
// model), but the CTA opens the real WNBA game panel (showWNBAGame) rather
// than just linking to the Scores grid -- WNBA has a real Live/Final Game
// panel (D-092 Resolution 6), unlike NCAAB. No `rank` field exists on WNBA's
// team shape (no poll for a pro league), so _heroLogoBoard's rank badge
// never renders here -- expected, not a missing-data bug.
function _heroFromWNBAGame(g, kind) {
    const _esc = s => typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s);
    const matchupTitle = `${_esc(g.awayTeam.name || g.awayTeam.abbr)} at ${_esc(g.homeTeam.name || g.homeTeam.abbr)}`;
    let kicker, hook, cta;
    if (kind === 'live') {
        kicker = `<span class="hero-kicker hero-kicker--live">LIVE</span>`;
        const diff = Math.abs((g.homeTeam.score || 0) - (g.awayTeam.score || 0));
        const leadTeam = (g.homeTeam.score || 0) > (g.awayTeam.score || 0) ? g.homeTeam
            : ((g.awayTeam.score || 0) > (g.homeTeam.score || 0) ? g.awayTeam : null);
        hook = leadTeam
            ? `${_esc(leadTeam.name || leadTeam.abbr)} lead by ${diff} · ${_esc(g.statusText || '')}`
            : `Tied at ${g.homeTeam.score ?? 0} · ${_esc(g.statusText || '')}`;
        cta = 'Watch live →';
    } else {
        const d = g.date ? new Date(g.date) : null;
        const time = d && !isNaN(d) ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
        kicker = `<span class="hero-kicker">${g.statusText && g.statusText !== 'TBD' ? _esc(g.statusText) : 'UPCOMING'}${time ? ' · ' + _esc(time) : ''}</span>`;
        hook = 'Tip-off soon';
        cta = 'Game preview →';
    }
    const board = _heroLogoBoard(g, kind === 'live');
    const html = `
        <div class="hero-main">
            ${kicker}
            <h2 class="hero-headline">${matchupTitle}</h2>
            <p class="hero-hook">${hook}</p>
            <div class="hero-meta"><span class="hero-cta">${cta}</span></div>
        </div>
        <div class="hero-visual">${board}</div>`;
    return { kind, html, onClick: () => { if (typeof showWNBAGame === 'function') showWNBAGame(g.id); } };
}

// _renderHomeHeroNFL(host) lived here -- removed 2026-08-15 (D-100). It was
// _homeHeroSport()'s NFL-only branch (calendar-gated, live-then-soonest-
// upcoming, no cross-sport comparison); _renderHomeHero() below now scores
// NFL's best live/upcoming candidate against MLB's on shared currency
// (_nflLeverage/_nflMarquee) and calls _heroFromNFLGame() directly when NFL
// wins, so this dedicated per-sport wrapper has no remaining caller.

// D-100: cross-sport favorite check, same shape as _gameHasFav below but for
// NFL team abbreviations -- _isFollowed() (js/auth.js) already takes a sport
// param, so this is a one-line mirror, not new follow-tracking machinery.
function _nflGameHasFav(g) {
    if (typeof _isFollowed !== 'function') return false;
    return _isFollowed('nfl', 'team', g.homeTeam?.abbr) || _isFollowed('nfl', 'team', g.awayTeam?.abbr);
}

// 2026-09-03: same one-line mirror as _nflGameHasFav, for NCAAF.
function _ncaafGameHasFav(g) {
    if (typeof _isFollowed !== 'function') return false;
    return _isFollowed('ncaaf', 'team', g.homeTeam?.abbr) || _isFollowed('ncaaf', 'team', g.awayTeam?.abbr);
}
// Home redesign (2026-09-07): same one-line mirror, for NCAAB/WNBA -- added
// so the cross-sport home hero (_renderHomeHero below) can go fully neutral
// across all 5 sports instead of stopping at MLB/NFL/NCAAF.
function _ncaabGameHasFav(g) {
    if (typeof _isFollowed !== 'function') return false;
    return _isFollowed('ncaab', 'team', g.homeTeam?.abbr) || _isFollowed('ncaab', 'team', g.awayTeam?.abbr);
}
function _wnbaGameHasFav(g) {
    if (typeof _isFollowed !== 'function') return false;
    return _isFollowed('wnba', 'team', g.homeTeam?.abbr) || _isFollowed('wnba', 'team', g.awayTeam?.abbr);
}
// NFL-side leverage/marquee scores, calibrated to land in roughly the same
// numeric range as MLB's leverage()/marquee() in _renderHomeHero() below
// (both ~1-27 pre-favorite-bonus, both +100 once a followed team is
// playing) using only data the hero already has in hand -- zero new fetch
// beyond the scoreboard call itself. `period` stands in for MLB's inning,
// scaled up (x2) since NFL only runs 4 quarters vs MLB's 9; point-diff
// closeness stands in for run-diff closeness, rescaled because NFL margins
// run much larger (one-score/two-score games, not 1-5 runs); and a national
// broadcast (already-parsed, D-097) stands in for MLB's combined-win-pct
// signal -- ESPN already curates which games get national coverage, a
// reasonable zero-fetch proxy for "marquee matchup" when team records
// themselves aren't part of the scoreboard payload the hero already holds.
function _nflLeverage(g) {
    const period = g.period || 1;
    const diff = Math.abs((g.homeTeam?.score ?? 0) - (g.awayTeam?.score ?? 0));
    const closeness = Math.max(0, 10 - diff * (10 / 16));
    return (period * 2) + closeness + (g.broadcast ? 4 : 0) + (g.situation?.isRedZone ? 2 : 0)
        + (_nflGameHasFav(g) ? 100 : 0);
}
function _nflMarquee(g) {
    return (g.broadcast ? 4 : 0) + (_nflGameHasFav(g) ? 100 : 0);
}

// 2026-09-03: same leverage/marquee mirror as NFL's, for NCAAF, calibrated to
// the same rough numeric range (period*2 + closeness + broadcast bonus, same
// as NFL -- CFB also runs 4 quarters, so no rescaling needed there). Marquee
// adds a ranked-matchup bonus NFL has no equivalent of (no Top 25 polls in
// the pros): +3 for one ranked team in the game, +3 more (6 total) when both
// are ranked -- a real, CFB-specific "this is the marquee game" signal
// that's already sitting on every scoreboard game object (homeTeam.rank/
// awayTeam.rank, from fetchNCAAFScoreboard's mk()) and was otherwise unused
// for hero purposes. No leaders-based signal (comp.leaders is confirmed
// absent from the CFB scoreboard, see fetchNCAAFScoreboard's own comment) --
// an honest gap, not an oversight, matching this file's existing NFL/MLB
// leverage functions' own "only score what's really there" discipline.
function _ncaafLeverage(g) {
    const period = g.period || 1;
    const diff = Math.abs((g.homeTeam?.score ?? 0) - (g.awayTeam?.score ?? 0));
    const closeness = Math.max(0, 10 - diff * (10 / 16));
    return (period * 2) + closeness + (g.broadcast ? 4 : 0) + (g.situation?.isRedZone ? 2 : 0)
        + (_ncaafGameHasFav(g) ? 100 : 0);
}
function _ncaafMarquee(g) {
    const rankedBonus = (g.homeTeam?.rank ? 3 : 0) + (g.awayTeam?.rank ? 3 : 0);
    return (g.broadcast ? 4 : 0) + rankedBonus + (_ncaafGameHasFav(g) ? 100 : 0);
}

// Home redesign (2026-09-07): NCAAB/WNBA leverage/marquee, completing cross-
// sport hero neutrality across all 5 sports. Deliberately simpler than NFL/
// NCAAF's -- fetchNCAABScoreboard/fetchWNBAScoreboard's mapped game shape
// carries no `period` or `broadcast` field (their consuming pages never
// needed them, so the fetchers never extracted them from the raw ESPN
// payload), so there's no quarter/national-broadcast signal to add here.
// Score closeness alone is still the real, honest signal a tied late game
// naturally outscores a blowout regardless of period data -- not a fake
// baseline invented to make these sports "compete" with NFL/NCAAF's richer
// scoring, just what's actually available (same "only score what's really
// there" discipline the NFL/NCAAF functions above already follow). NCAAB
// keeps a ranked-matchup bonus (Top 25 exists); WNBA has no poll, so it has
// none -- an honest absence, not a gap.
function _ncaabLeverage(g) {
    const diff = Math.abs((g.homeTeam?.score ?? 0) - (g.awayTeam?.score ?? 0));
    const closeness = Math.max(0, 10 - diff * (10 / 16));
    const rankedBonus = (g.homeTeam?.rank ? 2 : 0) + (g.awayTeam?.rank ? 2 : 0);
    return closeness + rankedBonus + (_ncaabGameHasFav(g) ? 100 : 0);
}
function _ncaabMarquee(g) {
    const rankedBonus = (g.homeTeam?.rank ? 3 : 0) + (g.awayTeam?.rank ? 3 : 0);
    return rankedBonus + (_ncaabGameHasFav(g) ? 100 : 0);
}
function _wnbaLeverage(g) {
    const diff = Math.abs((g.homeTeam?.score ?? 0) - (g.awayTeam?.score ?? 0));
    const closeness = Math.max(0, 10 - diff * (10 / 16));
    return closeness + (_wnbaGameHasFav(g) ? 100 : 0);
}
function _wnbaMarquee(g) {
    return (_wnbaGameHasFav(g) ? 100 : 0);
}
// D-100 (supersedes the _homeHeroSport() calendar gate above): whichever
// sport has the more compelling live game wins the hero slot, any day of the
// year, scored on a shared currency instead of gated by a fixed window. This
// means every home load now fetches the NFL scoreboard too, not just MLB's
// -- a real, deliberate cost (one extra proxied API call, ApiCache.TTL.SHORT
// same as the NFL Scores page itself) accepted in exchange for NFL's live
// action no longer being invisible on the homepage 9 months a year (D-099's
// finding: preseason and the first ~9 weeks of the regular season were
// locked out entirely under the old rule).
async function _renderHomeHero(games) {
    const host = document.getElementById('homeHero');
    if (!host) return;
    const list = Array.isArray(games) ? games : (AppState._homeGames || []);

    const isLive     = g => g.status?.abstractGameState === 'Live' && !/final/i.test(g.status?.detailedState || '');
    const isUpcoming = g => g.status?.abstractGameState === 'Preview';
    const mlbLeverage = _mlbHeroLeverage;
    const mlbMarquee = _mlbHeroMarquee;

    // Fetch every guest sport's scoreboard in parallel (was sequential
    // awaits per sport before NCAAB/WNBA were added -- fine at 2 extra
    // fetches, but sequential awaits for 4 would needlessly slow first
    // paint). Each entry reuses an already-warm AppState cache before
    // re-fetching, same pattern the original NFL/NCAAF blocks used.
    const guestGames = {};
    await Promise.all(Object.entries(_HOME_HERO_GUEST_SPORTS).map(async ([sport, cfg]) => {
        try {
            const cached = AppState[cfg.cache];
            guestGames[sport] = (cached && cached.length) ? cached : await cfg.fetch();
            AppState[cfg.cache] = guestGames[sport];
        } catch (err) {
            guestGames[sport] = [];
            Logger.warn(`${sport.toUpperCase()} hero candidate fetch failed`, err && err.message, 'APP');
        }
    }));

    let hero = null;
    const mlbLive = list.filter(isLive);
    const guestLive = {};
    Object.keys(_HOME_HERO_GUEST_SPORTS).forEach(sport => {
        guestLive[sport] = (guestGames[sport] || []).filter(g => g.isLive);
    });
    const anyLive = mlbLive.length || Object.values(guestLive).some(arr => arr.length);
    if (anyLive) {
        const candidates = [];
        if (mlbLive.length) {
            const g = mlbLive.slice().sort((x, y) => mlbLeverage(y) - mlbLeverage(x))[0];
            candidates.push({ sport: 'mlb', g, score: mlbLeverage(g), heroFn: _heroFromGame });
        }
        Object.entries(_HOME_HERO_GUEST_SPORTS).forEach(([sport, cfg]) => {
            const arr = guestLive[sport];
            if (!arr.length) return;
            const g = arr.slice().sort((x, y) => cfg.leverage(y) - cfg.leverage(x))[0];
            candidates.push({ sport, g, score: cfg.leverage(g), heroFn: cfg.heroFn });
        });
        const winner = candidates.sort((a, b) => b.score - a.score)[0];
        hero = winner.heroFn(winner.g, 'live');
    } else {
        const mlbUp = list.filter(isUpcoming);
        const candidates = [];
        if (mlbUp.length) {
            const g = mlbUp.slice().sort((x, y) => mlbMarquee(y) - mlbMarquee(x))[0];
            candidates.push({ sport: 'mlb', g, score: mlbMarquee(g), heroFn: _heroFromGame });
        }
        Object.entries(_HOME_HERO_GUEST_SPORTS).forEach(([sport, cfg]) => {
            const arr = (guestGames[sport] || []).filter(g => !g.isLive && !g.isFinal);
            if (!arr.length) return;
            const g = arr.slice().sort((x, y) => cfg.marquee(y) - cfg.marquee(x))[0];
            candidates.push({ sport, g, score: cfg.marquee(g), heroFn: cfg.heroFn });
        });
        if (candidates.length) {
            const winner = candidates.sort((a, b) => b.score - a.score)[0];
            hero = winner.heroFn(winner.g, 'upcoming');
        }
    }
    if (!hero) hero = await _heroFromStandings().catch(() => null);

    if (!hero) { host.hidden = true; host.innerHTML = ''; host.onclick = null; return; }
    host.className = `home-hero home-hero--${hero.kind}`;
    host.innerHTML = hero.html;
    host.hidden = false;
    if (hero.onClick) {
        host.setAttribute('role', 'button');
        host.tabIndex = 0;
        host.onclick = hero.onClick;
        host.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hero.onClick(); } };
    }
}

// ── Headlines + Insights rail (D-046 P3) ──────────────────────
// Headlines reuse the /api/news pipeline; Insights are templated data bullets
// computed from AppState.mlbLeaderSplits — no editorial staff, honest margins.
function _wireRailTabs() {
    const rail = document.getElementById('homeRail');
    if (!rail || rail._wired) return;
    rail._wired = true;
    rail.addEventListener('click', e => {
        const tab = e.target.closest('.rail-tab');
        if (!tab) return;
        const name = tab.dataset.tab;
        rail.querySelectorAll('.rail-tab').forEach(t => {
            const on = t === tab;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        const hl = document.getElementById('railHeadlines');
        const ins = document.getElementById('railInsights');
        if (hl)  hl.hidden  = name !== 'headlines';
        if (ins) ins.hidden = name !== 'insights';
    });
}

// Home redesign Phase 1 (2026-09-07): cross-sourced across all 5 sports
// instead of MLB's /api/news feed alone -- each of NFL/NCAAF/NCAAB/WNBA
// already has a real /api/news?sport= feed (NCAAB/WNBA added during the
// sport-landing port), so there's no reason Headlines stayed MLB-only.
// Merged and sorted by recency rather than kept in 5 separate lists, since
// the point is "what's new right now," not "what's new per sport."
async function _renderHomeHeadlines() {
    const host = document.getElementById('railHeadlines');
    if (!host) return;
    const _ago = typeof _newsTimeAgo === 'function' ? _newsTimeAgo : () => '';
    const sports = ['mlb', 'nfl', 'ncaaf', 'ncaab', 'wnba'];
    try {
        let data = _homeNewsCache;
        if (!data) {
            const results = await Promise.all(sports.map(async sport => {
                try {
                    const res = await fetch(`/api/news?sport=${sport}`);
                    if (!res.ok) return [];
                    const json = await res.json();
                    return ((json && json.articles) || []).map(a => ({ ...a, _sport: sport }));
                } catch (_) { return []; }
            }));
            data = { articles: results.flat() };
            _homeNewsCache = data;
        }
        const articles = ((data && data.articles) || [])
            .filter(a => a && a.headline && a.links?.web?.href)
            .sort((a, b) => new Date(b.published || b.lastModified) - new Date(a.published || a.lastModified))
            .slice(0, 8);
        if (!host.isConnected) return;
        if (!articles.length) { host.innerHTML = `<p class="pct-caption">No headlines right now.</p>`; return; }
        host.innerHTML = articles.map(a => {
            const when = _ago(a.published || a.lastModified);
            const meta = (typeof SPORTS_META !== 'undefined' && SPORTS_META[a._sport]) || {};
            return `<a class="rail-headline" href="${_escHtml(a.links.web.href)}" target="_blank" rel="noopener">
                <span class="rail-hl-sport" style="color:${meta.accent || 'var(--text-muted)'}">${_escHtml((a._sport || '').toUpperCase())}</span>
                <span class="rail-hl-text">${_escHtml(a.headline)}</span>
                ${when ? `<span class="rail-hl-time">${_escHtml(when)}</span>` : ''}
            </a>`;
        }).join('') + `<p class="pct-caption">Headlines via ESPN &amp; MLB Stats API · tap to read the full story</p>`;
    } catch (err) {
        if (window.Logger) Logger.warn('home headlines failed', err, 'APP');
        if (host.isConnected) host.innerHTML = `<p class="pct-caption">Headlines unavailable right now.</p>`;
    }
}

// ── Cross-sport stat-moment Insights engine (home redesign Phase 1) ────────
// Replaces the old MLB-only _renderHomeInsights with a candidate-gathering
// pass across all 5 sports, each candidate hand-scored on a common ~0-100
// "notability" scale using the same pragmatic hand-calibration approach the
// cross-sport hero already uses for its leverage/marquee scoring (D-100) --
// not a statistical/percentile model, since there's no real distribution to
// build one from, and it's not how this codebase solves cross-sport
// comparison anywhere else. This is the page's actual differentiation play
// (real computed depth ESPN/CBS/Yahoo's wire-copy headlines can't show),
// so it's promoted ahead of Headlines rather than living as its secondary tab.
function _notabilityFromMargin(gap, weight, base = 30, cap = 95) {
    if (gap == null || isNaN(gap) || gap <= 0) return base;
    return Math.min(cap, base + gap * weight);
}
function _notabilityFromTightness(gamesBack, cap = 90, floor = 20, decay = 15) {
    if (gamesBack == null || isNaN(gamesBack)) return floor;
    return Math.max(floor, cap - gamesBack * decay);
}
function _notabilityFromRankJump(jump, base = 20, weight = 8, cap = 95) {
    if (jump == null || isNaN(jump)) return base;
    return Math.min(cap, base + Math.abs(jump) * weight);
}

// MLB season-leader margin bullets -- same computation _renderHomeInsights
// used to do inline, now one candidate source among several sports'.
function _mlbLeaderStatMoments() {
    const out = [];
    const hitting  = AppState.mlbLeaderSplits?.hitting  || [];
    const pitching = AppState.mlbLeaderSplits?.pitching || [];
    if (!hitting.length && !pitching.length) return out;
    const _top2 = (arr, key, desc = true) => {
        const s = arr.filter(x => x.stat?.[key] != null && !isNaN(parseFloat(x.stat[key])))
            .sort((a, b) => { const av = parseFloat(a.stat[key]), bv = parseFloat(b.stat[key]); return desc ? bv - av : av - bv; });
        return [s[0], s[1]];
    };
    const teamG = Math.max(0, ...hitting.map(s => parseInt(s.stat?.gamesPlayed, 10) || 0));
    const qPit  = (() => { const q = pitching.filter(s => (parseFloat(s.stat?.inningsPitched) || 0) >= teamG); return q.length ? q : pitching; })();

    const counting = (arr, key, word, weight) => {
        const [a, b] = _top2(arr, key);
        if (!a) return;
        const lv = parseInt(a.stat[key], 10);
        if (!isFinite(lv) || lv <= 0) return;
        const nm = a.player?.fullName || '—', tm = a.team?.abbreviation || '';
        const gap = b ? lv - parseInt(b.stat[key], 10) : 0;
        const tail = gap > 0 ? ` — ${gap} clear of the field` : '';
        out.push({ sport: 'mlb', score: _notabilityFromMargin(gap, weight), view: 'mlb-leaders',
            text: `${nm} (${tm}) leads MLB with ${lv} ${word}${tail}` });
    };
    counting(pitching, 'strikeOuts', 'strikeouts', 2);
    counting(hitting, 'rbi', 'RBI', 1.5);
    counting(hitting, 'stolenBases', 'steals', 3);
    const [wa] = _top2(qPit, 'whip', false);
    if (wa && parseFloat(wa.stat.whip) > 0) {
        out.push({ sport: 'mlb', score: 45, view: 'mlb-leaders',
            text: `${wa.player?.fullName || '—'} (${wa.team?.abbreviation || ''}) owns the lowest WHIP among qualified starters at ${parseFloat(wa.stat.whip).toFixed(2)}` });
    }
    return out;
}

// Pennant Races' tightest-gap signal, folded in as an MLB candidate instead
// of a standalone always-shown widget (the old #homeMoment card). Same
// AppState.mlbStandings/mlbOdds this used to compute inline in
// _renderHomeMoment -- lifted, not re-derived.
async function _mlbPennantStatMoment() {
    try {
        if (!AppState.mlbStandings) AppState.mlbStandings = await fetchMLBStandingsFull();
    } catch (_) { return null; }
    const races = [];
    (AppState.mlbStandings || []).forEach(d => {
        const [lead, second] = d.teams || [];
        if (!lead || !second) return;
        const gb = parseFloat(second.gb);
        if (isNaN(gb)) return;
        races.push({ div: d.division, lead, second, gb });
    });
    if (!races.length) return null;
    races.sort((a, b) => a.gb - b.gb);
    const r = races[0];
    const tail = r.gb === 0
        ? `are tied atop the ${r.div}`
        : `lead the ${r.div} by ${r.gb === 1 ? '1 game' : r.gb + ' games'} over ${r.second.teamName}`;
    return { sport: 'mlb', score: _notabilityFromTightness(r.gb), view: 'mlb-standings',
        text: `${r.lead.teamName} ${tail}` };
}

// Last-7-days hot bat, folded in as an MLB candidate (was a separate always-
// appended _renderHomeTrending block). AppState.mlbHotStats is the exact
// last7Days split the Leaderboards page's Hot tab already fetches (mlb.js).
async function _mlbTrendingStatMoment() {
    const season = AppState.mlbLeaderSeason || MLB_SEASON;
    if (!AppState.mlbHotStats || AppState._mlbHotStatsSeason !== season) {
        if (typeof fetchMLBLeagueStats !== 'function') return null;
        try {
            const [hotHit, hotPit] = await Promise.all([
                fetchMLBLeagueStats('hitting',  season, 600, 'last7Days'),
                fetchMLBLeagueStats('pitching', season, 400, 'last7Days'),
            ]);
            hotHit.forEach(s => { if (s.stat && typeof _computeBattingRates === 'function') Object.assign(s.stat, _computeBattingRates(s.stat)); });
            hotPit.forEach(s => { if (s.stat && typeof _computePitchingRates === 'function') Object.assign(s.stat, _computePitchingRates(s.stat)); });
            if (typeof _enrichMLBTeamAbbr === 'function') await Promise.all([_enrichMLBTeamAbbr(hotHit, season), _enrichMLBTeamAbbr(hotPit, season)]);
            AppState.mlbHotStats = { hitting: hotHit, pitching: hotPit };
            AppState._mlbHotStatsSeason = season;
        } catch (_) { return null; }
    }
    const hot = AppState.mlbHotStats || {};
    const hitPool = (hot.hitting || []).filter(s => (parseInt(s.stat?.atBats, 10) || 0) >= 15);
    const _top1 = (arr, key, desc = true) => {
        const s = (arr || []).filter(x => x.stat?.[key] != null && !isNaN(parseFloat(x.stat[key])))
            .sort((a, b) => { const av = parseFloat(a.stat[key]), bv = parseFloat(b.stat[key]); return desc ? bv - av : av - bv; });
        return s[0];
    };
    const avgTop = _top1(hitPool, 'avg');
    if (!avgTop) return null;
    const avgVal = parseFloat(avgTop.stat.avg);
    const avgStr = avgVal.toFixed(3).replace(/^0\./, '.');
    // .400+ over a week is a real hot streak; .260 barely clears the qualifying floor.
    const score = Math.min(85, 20 + Math.max(0, avgVal - 0.25) * 300);
    return { sport: 'mlb', score, view: 'mlb-leaders',
        text: `${avgTop.player?.fullName || '—'} (${avgTop.team?.abbreviation || ''}) is hitting ${avgStr} over the last 7 days` };
}

// NFL: _nflPowerScore (js/nflStandings.js) margin between #1 and #2.
async function _nflStatMoment() {
    if (typeof fetchNFLStandings !== 'function' || typeof _nflPowerScore !== 'function') return null;
    try {
        const season = (typeof _nstdSeasonDefault === 'function') ? _nstdSeasonDefault() : undefined;
        const rows = (typeof _nstd !== 'undefined' && _nstd.bySeason[season]) || await fetchNFLStandings(season);
        if (typeof _nstd !== 'undefined') _nstd.bySeason[season] = rows;
        if (!rows || !rows.length) return null;
        const scored = rows.map(t => ({ ...t, _pwr: _nflPowerScore(t) })).sort((a, b) => b._pwr - a._pwr);
        const [top, second] = scored;
        if (!top) return null;
        const margin = second ? top._pwr - second._pwr : 0;
        return { sport: 'nfl', score: _notabilityFromMargin(margin * 100, 3, 35, 90), view: 'nfl-powerrankings',
            text: `${top.shortName || top.name} lead the NFL Power Rankings at ${top.wins}-${top.losses}` };
    } catch (_) { return null; }
}

// NCAAF/NCAAB: shared, since fetchNCAAFRankings/fetchNCAABRankings return the
// identical poll shape ({name, ranks:[{current, previous, ...}]}) -- one
// function parameterized by which fetch/view to use rather than two clones.
async function _pollJumpStatMoment(fetchFn, sport, view) {
    if (typeof fetchFn !== 'function') return null;
    try {
        const polls = await fetchFn();
        const ap = (polls || []).find(p => /\bAP\b/i.test(p.name)) || (polls || [])[0];
        if (!ap || !ap.ranks || !ap.ranks.length) return null;
        let best = null;
        ap.ranks.forEach(t => {
            if (t.previous == null || t.current == null) return;
            const jump = t.previous === 0 ? 5 : t.previous - t.current; // NEW entries count as a moderate jump
            if (!best || jump > best.jump) best = { ...t, jump };
        });
        if (!best || best.jump <= 0) return null;
        const label = best.previous === 0 ? `enters the poll at #${best.current}` : `jumped ${best.jump} spot${best.jump === 1 ? '' : 's'} to #${best.current}`;
        return { sport, score: _notabilityFromRankJump(best.jump), view,
            text: `${best.name} ${label} in the ${ap.name}` };
    } catch (_) { return null; }
}

// WNBA: player leader margin (mirrors MLB's leader-plus-margin bullets --
// same shape, different endpoint) and playoff-cutline tightness (mirrors
// MLB's pennant-gap candidate via the shared _notabilityFromTightness scale).
async function _wnbaStatMoments() {
    const out = [];
    const season = (typeof _wnba !== 'undefined') ? _wnba.season : undefined;
    try {
        const res = await fetch(`/api/wnbastats?season=${season}`);
        if (res.ok) {
            const data = await res.json();
            const cats = (data && data.categories) || [];
            const cat = cats.find(c => (c.unit || '').toUpperCase() === 'PPG') || cats[0];
            const [a, b] = (cat && cat.leaders) || [];
            if (a && a.value != null) {
                const gap = b && b.value != null ? a.value - b.value : 0;
                out.push({ sport: 'wnba', score: _notabilityFromMargin(gap, 8), view: 'wnba-leaders',
                    text: `${a.name} (${a.team}) leads the WNBA with ${a.value} ${cat.unit}${gap > 0 ? ` — ${gap.toFixed(1)} clear of the field` : ''}` });
            }
        }
    } catch (_) { /* honest absence, not a retry loop */ }
    try {
        if (typeof fetchWNBAStandings === 'function' && typeof _wnbaComputePlayoffField === 'function') {
            const confs = await fetchWNBAStandings(season);
            const all = _wnbaComputePlayoffField(confs);
            if (all.length > 8) {
                const eighth = all[7], ninth = all[8];
                if (eighth?.w != null && ninth?.w != null) {
                    const gb = ((eighth.w - eighth.l) - (ninth.w - ninth.l)) / 2;
                    out.push({ sport: 'wnba', score: _notabilityFromTightness(gb), view: 'wnba-playoffs',
                        text: `${ninth.name} trails the 8th playoff seed by ${gb.toFixed(1)} game${gb === 1 ? '' : 's'}` });
                }
            }
        }
    } catch (_) { /* honest absence */ }
    return out;
}

async function _statMomentCandidates() {
    const results = await Promise.all([
        Promise.resolve(_mlbLeaderStatMoments()),
        _mlbPennantStatMoment(),
        _mlbTrendingStatMoment(),
        _nflStatMoment(),
        _pollJumpStatMoment(typeof fetchNCAAFRankings === 'function' ? fetchNCAAFRankings : null, 'ncaaf', 'ncaaf-rankings'),
        _pollJumpStatMoment(typeof fetchNCAABRankings === 'function' ? fetchNCAABRankings : null, 'ncaab', 'ncaab-rankings'),
        _wnbaStatMoments(),
    ]);
    return results.flat().filter(Boolean);
}

async function _renderHomeInsights() {
    const host = document.getElementById('railInsights');
    if (!host) return;
    let candidates = [];
    try {
        candidates = await _statMomentCandidates();
    } catch (err) {
        Logger.warn('stat-moment engine failed', err && err.message, 'APP');
    }
    if (!host.isConnected) return;
    if (!candidates.length) return; // keep skeleton until at least one sport has data
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, 4);
    host.innerHTML = top.map(c => {
        const meta = (typeof SPORTS_META !== 'undefined' && SPORTS_META[c.sport]) || {};
        const color = meta.accent || 'var(--accent)';
        return `<div class="rail-insight" role="button" tabindex="0" onclick="navigateTo('${c.view}')" onkeydown="if(event.key==='Enter')navigateTo('${c.view}')">
            <span class="rail-insight-dot" style="--c:${color}"></span>
            <span class="rail-insight-text">${_escHtml(c.text)}</span>
        </div>`;
    }).join('') + `<p class="pct-caption">Today's sharpest numbers across MLB, NFL, NCAAF, NCAAB, and WNBA</p>`;
}

// ── Freshness signals (D-046 P4) — "Updated Nm ago" from real fetch time ──
function _homeAgo(ts) {
    if (!ts) return '';
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 45)   return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    return Math.round(s / 3600) + 'h ago';
}
function _updateHomeFreshness() {
    const el = document.getElementById('homeUpdatedAt');
    if (el && AppState._homeGamesFetchedAt) el.textContent = 'Updated ' + _homeAgo(AppState._homeGamesFetchedAt);
}
// Keep the relative label honest between polls (cheap; only touches text when on home).
setInterval(() => { if (AppState.currentView === 'home') _updateHomeFreshness(); }, 30_000);

// ── On This Day (ANN-005) ─────────────────────────────────────
// Fetches MLB games from today's date in the last 3 seasons,
// picks a completed game, grabs the box score, surfaces top performer.

async function _loadOnThisDay() {
    const today   = new Date();
    const mm      = String(today.getMonth() + 1).padStart(2, '0');
    const dd      = String(today.getDate()).padStart(2, '0');
    const curYear = today.getFullYear();
    const month   = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    for (let offset = 1; offset <= 3; offset++) {
        const year    = curYear - offset;
        const dateStr = `${year}-${mm}-${dd}`;

        let sched;
        try {
            sched = await mlbFetch('/schedule', {
                sportId: 1, startDate: dateStr, endDate: dateStr, hydrate: 'linescore',
            }, ApiCache.TTL.LONG);
        } catch (err) {
            Logger.warn(`OnThisDay: schedule fetch failed for ${dateStr}`, err?.message, 'APP');
            continue;
        }

        const container = document.getElementById('homeOnThisDay');
        if (!container || !container.isConnected) return;

        const games    = sched?.dates?.[0]?.games || [];
        const finished = games.filter(g => g.status?.abstractGameState === 'Final');
        if (finished.length === 0) continue;

        const game = finished.reduce((best, g) => {
            const runs  = (g.linescore?.teams?.home?.runs ?? 0) + (g.linescore?.teams?.away?.runs ?? 0);
            const bRuns = (best.linescore?.teams?.home?.runs ?? 0) + (best.linescore?.teams?.away?.runs ?? 0);
            return runs > bRuns ? g : best;
        });

        let players = [];
        try {
            const bs = await mlbFetch(`/game/${game.gamePk}/boxscore`, {}, ApiCache.TTL.LONG);
            if (bs) {
                players = [
                    ...Object.values(bs.teams?.home?.players || {}),
                    ...Object.values(bs.teams?.away?.players || {}),
                ]
                    .filter(p => p.stats?.batting?.atBats >= 2)
                    .map(p => ({
                        name: p.person?.fullName || '?',
                        h:   p.stats.batting.hits      ?? 0,
                        ab:  p.stats.batting.atBats    ?? 0,
                        hr:  p.stats.batting.homeRuns  ?? 0,
                        rbi: p.stats.batting.rbi       ?? 0,
                    }))
                    .sort((a, b) => (b.rbi - a.rbi) || (b.h - a.h) || (b.hr - a.hr));
            }
        } catch (err) {
            Logger.warn(`OnThisDay: boxscore fetch failed for ${game.gamePk}`, err?.message, 'APP');
        }

        const el = document.getElementById('homeOnThisDay');
        if (!el || !el.isConnected) return;

        const homeTeam   = game.teams?.home?.team?.abbreviation || '?';
        const awayTeam   = game.teams?.away?.team?.abbreviation || '?';
        const homeScore  = game.linescore?.teams?.home?.runs ?? game.teams?.home?.score ?? '?';
        const awayScore  = game.linescore?.teams?.away?.runs ?? game.teams?.away?.score ?? '?';
        const homeLogo   = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(homeTeam) : '';
        const awayLogo   = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(awayTeam) : '';
        const homeColors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(homeTeam) : { primary: 'var(--accent)' };

        const top = players[0] || null;
        let challengeHTML = '';

        if (top) {
            const parts = [`${top.h}-for-${top.ab}`];
            if (top.hr  > 0) parts.push(`${top.hr} HR`);
            if (top.rbi > 0) parts.push(`${top.rbi} RBI`);
            const clueLine = parts.join(' · ');

            const distractors = players.slice(1, 4);

            if (distractors.length >= 1) {
                // Multiple-choice mode: shuffle answer + distractors
                const pool = [{ ...top, correct: true }, ...distractors.map(p => ({ ...p, correct: false }))];
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
                window._otdChoices = pool;
                const choiceBtns = pool.map((c, i) =>
                    `<button class="otd-choice" onclick="_otdReveal(${i})">${_escHtml(c.name)}</button>`
                ).join('');
                challengeHTML = `
                    <div class="otd-challenge">
                        <p class="otd-prompt">Who had this game?</p>
                        <p class="otd-clue">${clueLine}</p>
                        <div class="otd-choices" id="otdChoices">${choiceBtns}</div>
                        <p class="otd-result" id="otdResult" hidden></p>
                    </div>`;
            } else {
                // Fallback: single reveal button
                window._otdChoices = [{ ...top, correct: true }];
                challengeHTML = `
                    <div class="otd-challenge">
                        <p class="otd-prompt">Star of the game</p>
                        <p class="otd-clue">${clueLine}</p>
                        <div class="otd-choices" id="otdChoices">
                            <button class="otd-choice otd-choice--reveal" onclick="_otdReveal(0)">Reveal player</button>
                        </div>
                        <p class="otd-result" id="otdResult" hidden></p>
                    </div>`;
            }
        }

        el.innerHTML = `
            <div class="home-section-hdr">
                <span class="home-section-title">On This Day</span>
                <span class="home-section-date">${month}, ${year}</span>
            </div>
            <div class="otd-card" style="border-left: 3px solid ${homeColors.primary}">
                <div class="otd-matchup">
                    ${awayLogo ? `<img class="otd-logo" src="${awayLogo}" alt="${_escHtml(awayTeam)}" data-hide-on-error>` : ''}
                    <span class="otd-team">${_escHtml(awayTeam)}</span>
                    <span class="otd-score">${awayScore}</span>
                    <span class="otd-sep">–</span>
                    <span class="otd-score">${homeScore}</span>
                    <span class="otd-team">${_escHtml(homeTeam)}</span>
                    ${homeLogo ? `<img class="otd-logo" src="${homeLogo}" alt="${_escHtml(homeTeam)}" data-hide-on-error>` : ''}
                </div>
                ${challengeHTML}
            </div>
            <button class="otd-arcade-link" onclick="navigateTo('arcade')">
                Play more games in Arcade
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.5h9M8 3 11 6.5 8 10"/></svg>
            </button>
        `;
        el.style.display = '';
        return;
    }
    Logger.debug('OnThisDay: no finished games found in last 3 years for this date', undefined, 'APP');
}

window._otdReveal = function(idx) {
    const choices   = window._otdChoices;
    if (!choices) return;
    const chosen    = choices[idx];
    const choicesEl = document.getElementById('otdChoices');
    const resultEl  = document.getElementById('otdResult');
    if (!choicesEl || !resultEl) return;

    const correct = choices.find(c => c.correct);

    if (choices.length === 1) {
        // Reveal-only mode: replace button with name
        choicesEl.innerHTML = `<span class="otd-revealed">${_escHtml(correct?.name || '?')}</span>`;
        return;
    }

    choicesEl.querySelectorAll('.otd-choice').forEach((btn, i) => {
        btn.disabled = true;
        if (choices[i].correct)   btn.classList.add('otd-choice--correct');
        else if (i === idx)       btn.classList.add('otd-choice--wrong');
        else                      btn.classList.add('otd-choice--dim');
    });

    resultEl.innerHTML = chosen.correct
        ? `<span class="otd-result--right">&#10003; Correct!</span>`
        : `<span class="otd-result--wrong">&#10007; It was <strong>${_escHtml(correct?.name || '?')}</strong></span>`;
    resultEl.hidden = false;
};

// Enter a sport from the home page — handles same-sport case
function enterSport(sport) {
    const defaultViews = { nba: 'players', mlb: 'mlb-players', nfl: 'nfl-players', nhl: 'nhl-players' };
    if (AppState.currentSport === sport) {
        navigateTo(defaultViews[sport] || 'players');
    } else {
        switchSport(sport);
    }
}

function _sportPickerStatus(id) {
    const m = new Date().getMonth() + 1; // 1=Jan
    if (id === 'mlb')   return (m >= 3 && m <= 10) ? { cls: 'active', label: 'Regular season' } : { cls: 'idle', label: 'Offseason' };
    if (id === 'nfl')   {
        // Sourced from _nflSeasonPhase() (js/nfl.js, loaded before app.js) instead
        // of a second, independent month-range check — a hardcoded calendar
        // boolean here was exactly the class of bug D-063 already fixed once for
        // NFL's own offseason state (CLAUDE.md explicitly warns against
        // reintroducing it); this function had quietly done it again under a
        // different name, showing "Draft season" through real August preseason
        // games rather than reflecting the actual live season phase.
        if (typeof _nflSeasonPhase === 'function') {
            const phase = _nflSeasonPhase();
            if (phase === 'regular')    return { cls: 'active', label: 'Season underway' };
            if (phase === 'postseason') return { cls: 'active', label: 'Playoffs' };
            if (phase === 'preseason')  return { cls: 'active', label: 'Preseason' };
            return { cls: 'idle', label: 'Offseason' };
        }
        if (m >= 9 || m === 1) return { cls: 'active', label: 'Season underway' };
        return { cls: 'idle', label: 'Offseason' };
    }
    if (id === 'ncaaf') { if (m >= 9 || m === 1) return { cls: 'active', label: 'Season underway' };
                          if (m === 8)           return { cls: 'active', label: 'Kicks off soon' };
                          return { cls: 'idle', label: 'Preview · starts Aug' }; }
    if (id === 'ncaab') { if (m <= 4 || m >= 11)  return { cls: 'active', label: 'Season underway' };
                          return { cls: 'idle', label: 'Preview · starts Nov' }; }
    if (id === 'wnba')  { if (m >= 4 && m <= 10)  return { cls: 'active', label: 'Season underway' };
                          return { cls: 'idle', label: 'Preview · starts April' }; }
    return { cls: 'idle', label: 'Explore' };
}

// Sport-picker live/today counts (ChatGPT-brief quick win 1) \u2014 reads whatever's
// already in AppState from _updateHomeTicker's fetches, no new network calls.
// NCAAB excluded on purpose: same reason it's absent from the merged ticker
// (D-087) \u2014 no fresh per-day game data reliably in AppState for it yet.
function _sportPickerCounts() {
    const todayET = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    const counts = {};

    const mlbToday = (AppState.mlbGames || []).filter(g =>
        (g.officialDate || (g.gameDate || '').slice(0, 10)) === todayET);
    counts.mlb = {
        today: mlbToday.length,
        live: mlbToday.filter(g => g.status?.abstractGameState === 'Live'
            && !/final/i.test(g.status?.detailedState || '')).length,
    };

    const _footballToday = games => (games || []).filter(g => {
        if (!g.date) return false;
        return new Date(new Date(g.date).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10) === todayET;
    });
    const nflToday = _footballToday(AppState.nflGames);
    counts.nfl = { today: nflToday.length, live: nflToday.filter(g => g.isLive).length };
    const ncaafToday = _footballToday(AppState.ncaafGames);
    counts.ncaaf = { today: ncaafToday.length, live: ncaafToday.filter(g => g.isLive).length };

    return counts;
}

function _renderSportPicker() {
    const el = document.getElementById('homeSportPicker');
    if (!el || typeof SPORTS === 'undefined') return;
    const counts = (typeof _sportPickerCounts === 'function') ? _sportPickerCounts() : {};
    el.innerHTML = SPORTS.map(s => {
        const st = _sportPickerStatus(s.id);
        const c = counts[s.id];
        const hasLive = c && c.live > 0;
        // Live overrides the season-phase pill for the dot/status color \u2014 reuses
        // the .sport-card--live pulse treatment that already existed in CSS but
        // had no JS path ever setting it.
        const cls = hasLive ? 'live' : st.cls;
        const statsLine = (c && c.today > 0)
            ? `<span class="sport-card-stats">${c.today} today${hasLive ? ` \u00b7 ${c.live} live` : ''}</span>` : '';
        const extraAria = (c && c.today > 0) ? `, ${c.today} game${c.today === 1 ? '' : 's'} today` : '';
        return `<button class="sport-card sport-card--${cls}" data-sport="${s.id}" style="--sport-accent:${s.accent}" aria-label="${_escHtml(s.label)} \u2014 ${_escHtml(st.label)}${extraAria}">
            <span class="sport-card-icon" aria-hidden="true">${_iconSvg(s.icon)}</span>
            <span class="sport-card-body">
                <span class="sport-card-name">${_escHtml(s.label)}</span>
                <span class="sport-card-status"><span class="sport-card-dot"></span>${_escHtml(st.label)}</span>
                ${statsLine}
            </span>
            <span class="sport-card-go" aria-hidden="true">\u2192</span>
        </button>`;
    }).join('');
    el.querySelectorAll('.sport-card').forEach(b => b.addEventListener('click', () => {
        const sp = b.dataset.sport;
        const meta = (typeof SPORTS_META !== 'undefined') ? SPORTS_META[sp] : null;
        // From the neutral home, currentSport may already equal sp (default 'mlb'),
        // which would make switchSport early-return. Apply the sport UI + go to its
        // default view directly in that case; otherwise switchSport does both.
        if (AppState.currentSport === sp) {
            if (typeof _applySportUI === 'function') _applySportUI(sp);
            navigateTo(meta ? meta.defaultView : sp + '-players');
        } else {
            switchSport(sp);
        }
    }));
}

// Clean per-sport landing (D-045): one hero + seasonal line + 4 entry cards. Nothing else.
function _renderSportLanding(sport) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    if (typeof _applySportUI === 'function') _applySportUI(sport);
    const meta = (typeof SPORTS_META !== 'undefined' && SPORTS_META[sport]) || { icon: 'house', label: sport.toUpperCase(), accent: 'var(--accent)' };
    const cfg = _SPORT_LANDING[sport] || { tag: '', cards: [] };
    const tag = (typeof cfg.tag === 'function') ? cfg.tag() : cfg.tag;
    const st = (typeof _sportPickerStatus === 'function') ? _sportPickerStatus(sport) : { cls: 'idle', label: '' };
    grid.className = 'sport-landing';
    grid.style.cssText = '';

    if (_EDITORIAL_SLOTS[sport]) {
        _renderEditorialLanding(sport, meta, cfg, st);
        return;
    }

    // Older, narrower shape: single-column hero + card grid, for sports not
    // yet ported to the editorial layout above (NCAAB/WNBA, until their own
    // port phases land). No football-shaped modules here any more, and no
    // MLB branch either -- NFL, NCAAF, and MLB all always take the
    // editorial branch above now.
    grid.innerHTML = `
        <div class="sl-hero" id="slHero" style="--sport-accent:${meta.accent}">
            <div class="sl-hero-icon" aria-hidden="true">${_iconSvg(meta.icon)}</div>
            <h1 class="sl-hero-title">${_escHtml(meta.label)}</h1>
            <p class="sl-hero-tag">${_escHtml(tag)}</p>
            <div class="sl-hero-status sl-hero-status--${st.cls}"><span class="sl-status-dot"></span>${_escHtml(st.label)}</div>
        </div>
        <div class="sl-cards">
            ${cfg.cards.map(([v, ic, t, d]) => `
                <button class="sl-card" style="--sport-accent:${meta.accent}" onclick="navigateTo('${v}')" aria-label="${_escHtml(t)}: ${_escHtml(d)}">
                    <span class="sl-card-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${_SL_ICON[ic] || ''}</svg></span>
                    <span class="sl-card-body"><span class="sl-card-title">${_escHtml(t)}</span><span class="sl-card-desc">${_escHtml(d)}</span></span>
                    <span class="sl-card-go" aria-hidden="true">→</span>
                </button>`).join('')}
        </div>
        <div class="sl-data" id="slData"></div>`;
    if (window.setBreadcrumb) setBreadcrumb(sport + '-home', null);
}

// MLB landing Games module (Phase 3 of the sport-landing port) -- split from
// the old combined-host _loadMLBLandingData when MLB moved to the editorial
// layout's separate #slGames/#slLeaders hosts (mirroring the split
// _loadFootballLandingData already does for NFL/NCAAF). Keeps MLB's own
// Scorebug card rendering (live inning/base-state, already richer than
// NFL/NCAAF's plain list) rather than downgrading it to match -- a
// deliberate per-sport variation, not an inconsistency.
async function _loadMLBLandingGames() {
    const host = document.getElementById('slGames');
    if (!host || typeof Scorebug === 'undefined') return;
    try {
        const games = await fetchMLBSchedule(1).catch(() => []);
        const todayET = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
        const todays = (games || []).filter(g => (g.officialDate || (g.gameDate || '').slice(0, 10)) === todayET);
        const liveFirst = g => (g.status?.abstractGameState === 'Live' && !/final/i.test(g.status?.detailedState || '')) ? 0 : 1;
        const pick = (todays.length ? todays : (games || [])).slice().sort((a, b) => liveFirst(a) - liveFirst(b)).slice(0, 6);
        const gamesHtml = pick.map(g => Scorebug.renderScoreCard(Scorebug.normalizeMLBGame(g))).join('');
        if (!host.isConnected) return;
        if (!gamesHtml) { host.remove(); return; }
        host.innerHTML = `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">Today's Games</span><button class="sl-section-link" onclick="navigateTo('mlb-games')">All scores →</button></div>
            <div class="sl-games">${gamesHtml}</div></section>`;
        host.querySelectorAll('.home-game-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt((card.dataset.gameKey || '').replace('mlb-', ''), 10);
                if (id && typeof openMLBGame === 'function') openMLBGame(id, card.classList.contains('home-game-card--live'));
            });
        });
    } catch (_) { host.remove(); }
}
// MLB landing Leaders module (Phase 3) -- same split as above, targeting
// #slLeaders. _mlbLandingLeaders() itself (the tile-string builder) is
// unchanged.
async function _loadMLBLandingLeaders() {
    const host = document.getElementById('slLeaders');
    if (!host) return;
    try {
        if (!AppState.mlbLeaderSplits && typeof _fetchMLBLeaderSplits === 'function') {
            await _fetchMLBLeaderSplits(MLB_SEASON).catch(() => {});
        }
        if (!host.isConnected) return;
        const leadersHtml = _mlbLandingLeaders();
        if (!leadersHtml) { host.remove(); return; }
        host.innerHTML = `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">League Leaders</span><button class="sl-section-link" onclick="navigateTo('mlb-leaders')">Full leaderboards →</button></div>
            <div class="sl-leaders">${leadersHtml}</div></section>`;
    } catch (_) { host.remove(); }
}
// MLB landing Game Spotlight (Phase 3) -- reuses the exact live/marquee
// picker + hero renderer _renderHomeHero() already uses for MLB
// (_mlbHeroLeverage/_mlbHeroMarquee/_heroFromGame, hoisted above for this
// reuse), scoped to MLB only and mounted on the landing page instead of the
// cross-sport home. Same {kind,html,onClick} contract as NFL/NCAAF's own
// landing Spotlight loaders -- live beats upcoming, remove if neither.
async function _loadMLBLandingSpotlight() {
    const host = document.getElementById('slSpotlight');
    if (!host) return;
    let games = [];
    try {
        games = await fetchMLBSchedule(1).catch(() => []);
    } catch (err) {
        Logger.warn('MLB landing spotlight fetch failed', err && err.message, 'APP');
    }
    if (!host.isConnected) return;
    const isLive = g => g.status?.abstractGameState === 'Live' && !/final/i.test(g.status?.detailedState || '');
    const isUpcoming = g => g.status?.abstractGameState === 'Preview';
    const live = (games || []).filter(isLive);
    const upcoming = (games || []).filter(isUpcoming);
    let hero = null;
    if (live.length) {
        const g = live.slice().sort((a, b) => _mlbHeroLeverage(b) - _mlbHeroLeverage(a))[0];
        hero = _heroFromGame(g, 'live');
    } else if (upcoming.length) {
        const g = upcoming.slice().sort((a, b) => _mlbHeroMarquee(b) - _mlbHeroMarquee(a))[0];
        hero = _heroFromGame(g, 'upcoming');
    }
    if (!hero) { host.remove(); return; }
    host.innerHTML = `<div class="home-hero home-hero--${hero.kind}" role="button" tabindex="0">${hero.html}</div>`;
    const card = host.querySelector('.home-hero');
    card.onclick = hero.onClick;
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hero.onClick(); } };
}
// MLB landing Signature module (Phase 3) -- surfaces two pieces of MLB infra
// that already existed elsewhere but were never shown on the landing page:
// the Pennant Races viz (lifted from _renderHomeMoment's #homeMoment widget
// on the home page -- identical computation, just relocated so the landing
// page doesn't depend on the home page's own moment-rail machinery) and a
// top-3 Power Rankings teaser (via _mlbComputePowerRankings, hoisted in
// js/mlb.js for this exact reuse), matching NFL's own two-section Signature
// module (Playoff Picture + Power Rankings chips). Both CTAs link to
// mlb-standings rather than a dedicated Power Rankings route -- unlike NFL,
// MLB's Power tab is a tab inside the Standings page, not its own routed
// view (no `mlb-powerrankings` case exists in _renderMLBView), so linking
// there and letting the visitor click the tab is the honest destination
// rather than inventing a new route for this port.
async function _loadMLBLandingSignature() {
    const host = document.getElementById('slSignature');
    if (!host) return;
    try {
        if (!AppState.mlbStandings) AppState.mlbStandings = await fetchMLBStandingsFull();
        if (typeof _mlbOddsEnsure === 'function') await _mlbOddsEnsure(AppState.mlbStandings);
        if (!host.isConnected) return;

        const races = [];
        (AppState.mlbStandings || []).forEach(d => {
            const [lead, second] = d.teams || [];
            if (!lead || !second) return;
            const gb = parseFloat(second.gb);
            if (isNaN(gb)) return;
            races.push({ div: d.division, lead, second, gb, divOdds: AppState.mlbOdds?.byTeam?.[lead.teamId]?.div });
        });
        races.sort((a, b) => a.gb - b.gb);
        const pennantRows = races.slice(0, 3).map(r => {
            const color = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(r.lead.teamAbbr).primary : 'var(--accent)';
            const logo  = (typeof getMLBTeamLogoUrl === 'function' && r.lead.teamId) ? getMLBTeamLogoUrl(r.lead.teamId) : '';
            const odds  = r.divOdds;
            const pctW  = (odds != null) ? Math.max(4, Math.min(100, odds)) : 50;
            const gapLbl = r.gb === 0 ? 'tied atop' : `+${r.gb} on ${_escHtml(r.second.teamAbbr)}`;
            const oddsBlock = (odds != null && typeof _oddsFmtPct === 'function')
                ? `<span class="pr-odds-pct">${_oddsFmtPct(odds)}%</span><span class="pr-odds-lbl">div odds</span>` : '';
            return `
                <button class="pennant-race" onclick="navigateTo('mlb-standings')" title="${_escHtml(r.div)}: ${_escHtml(r.second.teamName)} ${r.gb} back — full odds on the standings page">
                    <span class="pr-div">${_escHtml(r.div)}</span>
                    <span class="pr-lead">${logo ? `<img class="pr-logo" src="${logo}" alt="" data-hide-on-error>` : ''}<strong>${_escHtml(r.lead.teamAbbr)}</strong></span>
                    <span class="pr-bar" style="--tc:${color}"><span class="pr-bar-fill" style="width:${pctW}%"></span></span>
                    <span class="pr-stat">${oddsBlock}<span class="pr-gap">${gapLbl}</span></span>
                </button>`;
        }).join('');

        let powerHtml = '';
        if (typeof _mlbComputePowerRankings === 'function') {
            const allTeams = (AppState.mlbStandings || []).flatMap(d => d.teams.map(t => ({ ...t, division: d.division })));
            const top3 = _mlbComputePowerRankings(allTeams).slice(0, 3);
            const chips = top3.map((t, i) => `
                <button class="sl-power-chip" onclick="navigateTo('mlb-standings')">
                    <span class="sl-power-rank">${i + 1}</span>
                    <img src="${_escHtml(getMLBTeamLogoUrl(t.teamId))}" alt="" loading="lazy" data-hide-on-error>
                    <span>${_escHtml(t.teamAbbr)}</span>
                </button>`).join('');
            powerHtml = `<section class="sl-section">
                <div class="sl-section-hdr"><span class="eyebrow">Power Rankings</span><button class="sl-section-link" onclick="navigateTo('mlb-standings')">Full rankings →</button></div>
                <div class="sl-power-chips">${chips}</div></section>`;
        }

        if (!pennantRows && !powerHtml) { host.remove(); return; }
        host.innerHTML = (pennantRows ? `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">Pennant Races</span><button class="sl-section-link" onclick="navigateTo('mlb-standings')">All odds →</button></div>
            <div class="pennant-viz">${pennantRows}</div></section>` : '') + powerHtml;
    } catch (err) {
        Logger.warn('MLB landing signature module failed', err && err.message, 'APP');
        host.remove();
    }
}
function _mlbLandingLeaders() {
    const hitting = AppState.mlbLeaderSplits?.hitting || [];
    const pitching = AppState.mlbLeaderSplits?.pitching || [];
    if (!hitting.length && !pitching.length) return '';
    const top = (arr, key, desc = true) => arr
        .filter(x => x.stat?.[key] != null && !isNaN(parseFloat(x.stat[key])))
        .sort((a, b) => { const av = parseFloat(a.stat[key]), bv = parseFloat(b.stat[key]); return desc ? bv - av : av - bv; })[0];
    const teamG = Math.max(0, ...hitting.map(s => parseInt(s.stat?.gamesPlayed, 10) || 0));
    const qH = hitting.filter(s => (parseFloat(s.stat?.plateAppearances) || 0) >= 3.1 * teamG);
    const qP = pitching.filter(s => (parseFloat(s.stat?.inningsPitched) || 0) >= teamG);
    const fmtAvg = v => v >= 1 ? v.toFixed(2) : '.' + String(Math.round(v * 1000)).padStart(3, '0');
    const specs = [
        { s: top(hitting, 'homeRuns'), key: 'homeRuns', label: 'HR', fmt: v => String(v) },
        { s: top(qH.length ? qH : hitting, 'avg'), key: 'avg', label: 'AVG', fmt: fmtAvg },
        { s: top(qP.length ? qP : pitching, 'era', false), key: 'era', label: 'ERA', fmt: v => parseFloat(v).toFixed(2) },
        { s: top(pitching, 'strikeOuts'), key: 'strikeOuts', label: 'K', fmt: v => String(v) },
    ].filter(x => x.s);
    return specs.map(({ s, key, label, fmt }) => {
        const val = fmt(parseFloat(s.stat[key])); const nm = s.player?.fullName || '—';
        const abbr = s.team?.abbreviation || ''; const pid = s.player?.id;
        return `<button class="sl-leader"${pid ? ` onclick="showMLBPlayerDetail(${pid})"` : ''}>
            <span class="sl-leader-val">${val}<span class="sl-leader-unit">${label}</span></span>
            <span class="sl-leader-name">${_escHtml(nm)}</span>
            <span class="sl-leader-team">${_escHtml(abbr)}</span></button>`;
    }).join('');
}

// NFL / NCAAF landing enrichment — a This Week's Games strip (the "added when
// they open" follow-up this comment used to name, wired up now that a real
// game exists: 2026 preseason kicked off, and Week 1 is 2026-09-09) plus the
// existing Stat Leaders teaser. Games render via the same Scorebug cards the
// home page and My Dashboard already use — no bespoke card here. .sl-games
// grid styling was already sitting in css/main.css, unused, for this exact
// section.
async function _loadFootballLandingData(sport) {
    // Editorial redesign: NFL's landing splits games and leaders into two
    // separate hosts (#slGames higher up in the primary column, #slLeaders
    // lower, with the new Latest NFL module in between) instead of one
    // combined #slData block -- NCAAF doesn't have this pass yet, so it keeps
    // the original single-host behavior unchanged (graceful fallback below).
    const slGames = document.getElementById('slGames');
    const slLeaders = document.getElementById('slLeaders');
    const slData = document.getElementById('slData');
    if (!slGames && !slLeaders && !slData) return;
    const statsPath = sport === 'ncaaf' ? '/api/ncaafstats' : '/api/nflstats';
    const scoreFn = sport === 'ncaaf'
        ? (typeof fetchNCAAFScoreboard === 'function' ? fetchNCAAFScoreboard : null)
        : (typeof fetchNFLScoreboard === 'function' ? fetchNFLScoreboard : null);
    const normalize = (typeof Scorebug !== 'undefined')
        ? (sport === 'ncaaf' ? Scorebug.normalizeNCAAFGame : Scorebug.normalizeNFLGame)
        : null;
    const scoresView = sport === 'ncaaf' ? 'ncaaf-scores' : 'nfl-games';

    const [statsData, games] = await Promise.all([
        fetch(statsPath).then(r => r.ok ? r.json() : null).catch(err => { Logger.warn(`Football landing stats fetch failed (${sport})`, err, 'APP'); return null; }),
        scoreFn ? scoreFn().catch(err => { Logger.warn(`Football landing scoreboard fetch failed (${sport})`, err, 'APP'); return []; }) : Promise.resolve([]),
    ]);

    let gamesHtml = '';
    if (normalize && games && games.length) {
        const liveFirst = g => g.isLive ? 0 : 1;
        // NFL-scoped follow-aware sort (Phase 1 of 5, landing redesign) -- a
        // followed team's game sorts ahead of the plain live/scheduled order.
        // NCAAF keeps its pre-existing sort until its own pass.
        const favFirst = (sport === 'nfl' && typeof _nflGameHasFav === 'function') ? (g => _nflGameHasFav(g) ? 0 : 1) : (() => 1);
        const picked = games.slice().sort((a, b) => (favFirst(a) - favFirst(b)) || (liveFirst(a) - liveFirst(b))).slice(0, 6);
        // Structural redesign pass: the separate Primetime strip this used to
        // render here was a second, inconsistent render of the same data --
        // Scorebug.renderScoreCard's matchHtml already shows g.broadcast and its
        // pillLabel already formats kickoff time in ET (js/scorebug.js), so the
        // strip's browser-local `toLocaleTimeString` was actively wrong (showed
        // a different time than the card for the same game). One row of cards,
        // each carrying matchup/time/network/weather, matches how CBS/Yahoo's
        // NFL hubs actually show a game once, not three times in three formats.
        const showWeather = sport === 'nfl' || sport === 'ncaaf';
        const cards = picked.map(g => Scorebug.renderScoreCard(normalize(g), { showWeather })).filter(Boolean).join('');
        if (cards) {
            gamesHtml = `<section class="sl-section">
                <div class="sl-section-hdr"><span class="eyebrow">This Week's Games</span><button class="sl-section-link" onclick="navigateTo('${scoresView}')">All scores →</button></div>
                <div class="sl-games">${cards}</div></section>`;
        }
    }

    const cats = (statsData && statsData.categories) || [];
    let leadersHtml = '';
    if (cats.length) {
        const tiles = cats.slice(0, 4).map(cat => {
            const l = (cat.leaders || [])[0];
            if (!l || l.value == null) return '';
            const clk = (sport === 'ncaaf' && l.id)
                ? ` onclick="navigateTo('ncaaf-player-${_escHtml(String(l.id))}')"`
                : ` onclick="navigateTo('${sport}-leaders')"`;
            return `<button class="sl-leader"${clk}>
                <span class="sl-leader-val">${_escHtml(String(l.value))}<span class="sl-leader-unit">${_escHtml(cat.unit || '')}</span></span>
                <span class="sl-leader-name">${_escHtml(l.name || '')}</span>
                <span class="sl-leader-team">${_escHtml(l.team || '')}</span></button>`;
        }).filter(Boolean).join('');
        if (tiles) {
            leadersHtml = `<section class="sl-section">
                <div class="sl-section-hdr"><span class="eyebrow">Stat Leaders</span><button class="sl-section-link" onclick="navigateTo('${sport}-leaders')">Full leaderboards →</button></div>
                <div class="sl-leaders">${tiles}</div></section>`;
        }
    }

    if (!gamesHtml && !leadersHtml) return;
    const wired = [];
    if (slGames || slLeaders) {
        if (slGames && slGames.isConnected) { slGames.innerHTML = gamesHtml; wired.push(slGames); }
        if (slLeaders && slLeaders.isConnected) { slLeaders.innerHTML = leadersHtml; wired.push(slLeaders); }
    } else if (slData && slData.isConnected) {
        slData.innerHTML = gamesHtml + leadersHtml;
        wired.push(slData);
    }
    wired.forEach(host => {
        if (typeof _wireHomeGameCardClicks === 'function') _wireHomeGameCardClicks(host);
        if (sport === 'nfl' && typeof _injectNFLGameWeather === 'function') _injectNFLGameWeather(host);
        if (sport === 'ncaaf' && typeof _injectNCAAFGameWeather === 'function') _injectNCAAFGameWeather(host);
    });
}

// ── NFL landing Game Spotlight (Phase 1 of 5, NFL landing redesign) ────────
// The same leverage-scored live/marquee picker _renderHomeHero() already runs
// cross-sport (D-100), scoped to NFL only and mounted on the landing page
// instead of the cross-sport home. Reuses _heroFromNFLGame()'s exact
// .home-hero markup/CSS (js/app.js ~1549) -- zero new hero visual language,
// same click/keydown wiring _renderHomeHero() uses at its own hero mount
// (js/app.js ~1821-1829).
async function _loadNFLLandingSpotlight() {
    const host = document.getElementById('slSpotlight');
    if (!host) return;
    let games = [];
    try {
        // Editorial redesign: the hero now shows a real player headshot per
        // side (_nflAttachHeroPhotos), so the Sleeper pool needs to be warm
        // before building the hero, not just the scoreboard -- fetched in
        // parallel with the scoreboard call, not sequentially.
        const [gamesResult] = await Promise.all([
            (AppState.nflGames && AppState.nflGames.length) ? Promise.resolve(AppState.nflGames)
                : (typeof fetchNFLScoreboard === 'function' ? fetchNFLScoreboard() : Promise.resolve([])),
            (typeof fetchNFLSleeperPool === 'function') ? fetchNFLSleeperPool().catch(() => {}) : Promise.resolve(),
        ]);
        games = gamesResult || [];
        AppState.nflGames = games;
    } catch (err) {
        Logger.warn('NFL landing spotlight fetch failed', err && err.message, 'APP');
    }
    if (!host.isConnected) return;
    const live = (games || []).filter(g => g.isLive);
    const upcoming = (games || []).filter(g => !g.isLive && !g.isFinal);
    let hero = null;
    if (live.length) {
        const g = live.slice().sort((a, b) => _nflLeverage(b) - _nflLeverage(a))[0];
        _nflAttachHeroPhotos(g);
        hero = _heroFromNFLGame(g, 'live');
    } else if (upcoming.length) {
        const g = upcoming.slice().sort((a, b) => _nflMarquee(b) - _nflMarquee(a))[0];
        _nflAttachHeroPhotos(g);
        hero = _heroFromNFLGame(g, 'upcoming');
    }
    if (!hero) { host.remove(); return; }
    host.innerHTML = `<div class="home-hero home-hero--${hero.kind}" role="button" tabindex="0">${hero.html}</div>`;
    const card = host.querySelector('.home-hero');
    card.onclick = hero.onClick;
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hero.onClick(); } };
}

// ── NFL landing "Latest NFL" editorial module (editorial redesign) ─────────
// Real photography, licensing-safe: reuses the exact data contract the News
// view's _newsCard() already ships (js/news.js) -- a.images[0].url, real ESPN
// wire photos, attribution + link-out, decided copyright-safe under D-024 --
// just composed differently (one large lead story + a supporting headline
// list) since that's what an editorial module needs, not N identical cards.
// Reuses _newsCache/_newsTimeAgo from news.js rather than a parallel cache.
//
// The standalone Breaking News banner (a separate module, separate fetch of
// the exact same /api/news?sport=nfl data) has been folded in here rather
// than kept alongside it: a recency-qualifying story (_isNewsBreaking,
// js/news.js) is promoted to the lead slot with a BREAKING tag instead of
// duplicating the fetch and the "here's what's urgent" job in two places on
// one page. No breaking story -> the lead is just the newest article, same
// as before, no manufactured urgency.
// Generalized when ported to NCAAF (Phase 2): identical logic across every
// editorial-landing sport with a real /api/news feed, parameterized by
// `sport` (cache key + fetch param) and `label` (the eyebrow text) instead of
// re-cloned per sport -- same "shared function over copy-pasted markup"
// approach as _renderEditorialLanding above.
async function _loadSportLandingNews(sport, label) {
    const host = document.getElementById('slNews');
    if (!host) return;
    try {
        let data = (typeof _newsCache !== 'undefined') ? _newsCache[sport] : null;
        if (!data) {
            const res = await fetch(`/api/news?sport=${sport}`);
            if (!res.ok) throw new Error(`news ${res.status}`);
            data = await res.json();
            if (typeof _newsCache !== 'undefined') _newsCache[sport] = data;
        }
        if (!host.isConnected) return;
        const articles = ((data && data.articles) || []).filter(a => a && a.headline && a.links && a.links.web && a.links.web.href);
        if (!articles.length) { host.remove(); return; }
        const _ago = (typeof _newsTimeAgo === 'function') ? _newsTimeAgo : () => '';
        const breaking = articles
            .filter(a => typeof _isNewsBreaking === 'function' && _isNewsBreaking(a))
            .sort((a, b) => new Date(b.published || b.lastModified) - new Date(a.published || a.lastModified))[0];
        const lead = breaking || articles[0];
        const rest = articles.filter(a => a !== lead).slice(0, 4);
        const leadImg = (lead.images && lead.images[0] && lead.images[0].url) || '';
        const breakingTag = lead === breaking ? `<span class="editorial-breaking-tag">BREAKING</span>` : '';
        const leadHtml = `
            <a class="editorial-lead" href="${_escHtml(lead.links.web.href)}" target="_blank" rel="noopener">
                ${leadImg ? `<div class="editorial-lead__thumb"><img src="${_escHtml(leadImg)}" alt="" loading="lazy" data-hide-on-error></div>` : ''}
                <h3 class="editorial-lead__headline">${breakingTag}${_escHtml(lead.headline)}</h3>
                ${lead.description ? `<p class="editorial-lead__dek">${_escHtml(lead.description)}</p>` : ''}
                <span class="editorial-meta">${lead.byline ? _escHtml(lead.byline) + ' · ' : ''}${_escHtml(_ago(lead.published || lead.lastModified))}</span>
            </a>`;
        const restHtml = rest.map(a => `
            <a class="editorial-headline-row" href="${_escHtml(a.links.web.href)}" target="_blank" rel="noopener">
                <span class="editorial-headline-row__text">${_escHtml(a.headline)}</span>
                <span class="editorial-meta">${_escHtml(_ago(a.published || a.lastModified))}</span>
            </a>`).join('');
        host.innerHTML = `<section class="sl-section sl-section--flush">
            <div class="sl-section-hdr"><span class="eyebrow">${_escHtml(label)}</span><button class="sl-section-link" onclick="navigateTo('news')">More →</button></div>
            <div class="editorial-grid">${leadHtml}<div class="editorial-list">${restHtml}</div></div>
        </section>`;
    } catch (err) {
        Logger.warn(`${sport.toUpperCase()} landing news failed`, err && err.message, 'APP');
        host.remove();
    }
}

// ── NFL landing Signature module (Phase 1 of 5, NFL landing redesign) ──────
// A kickoff countdown + fantasy push before real games exist -- showing
// "seeds" against every team's 0-0 preseason record would be dishonest,
// exactly the case _nflHasNoOfficialRecord() (js/nfl.js) already exists to
// gate for the standings/teams empty-state notes. Once real records exist, a
// compact playoff-picture teaser reusing nflStandings.js's own seed math
// (_nstdSeed/_nstdCut/_nstdBadges/_nstdNav, and its _nstd.bySeason cache so a
// standings-page visit this session means zero extra fetch here) instead of
// re-deriving seeding logic in this file.
async function _loadNFLLandingSignature() {
    const host = document.getElementById('slSignature');
    if (!host) return;
    try {
        if (_nflHasNoOfficialRecord()) {
            const days = _nflDaysToKickoff();
            if (days == null || isNaN(days)) { host.remove(); return; }
            host.innerHTML = `
                <div class="sl-countdown">
                    <span class="sl-countdown-num">${days === 0 ? 'Today' : days}</span>
                    <span class="sl-countdown-label">${days === 0 ? 'Kickoff is today' : (days === 1 ? 'day to kickoff' : 'days to kickoff')}</span>
                    <button class="sl-countdown-cta" onclick="navigateTo('nfl-mock')">Get ahead — live Mock Draft →</button>
                </div>`;
            return;
        }
        const season = _nstdSeasonDefault();
        const rows = _nstd.bySeason[season] || (_nstd.bySeason[season] = await fetchNFLStandings(season));
        if (!host.isConnected) return;
        const confs = {};
        (rows || []).forEach(t => { (confs[t.conference] || (confs[t.conference] = [])).push(t); });
        const cut = _nstdCut(season);
        // Streak badge (Phase 2): _parseStreak (js/standings.js) already handles
        // "W3"/"L2"/falsy safely; same win/loss/muted thresholds that file's own
        // Power Rankings tab uses for NBA.
        const streakBadge = (t) => {
            const v = (typeof _parseStreak === 'function') ? _parseStreak(t.streak) : 0;
            if (!t.streak) return '';
            const c = v >= 2 ? 'var(--color-win)' : v <= -2 ? 'var(--color-loss)' : 'var(--text-muted)';
            return `<span class="sl-playoff-streak" style="color:${c}">${_escHtml(t.streak)}</span>`;
        };
        const confHtml = ['AFC', 'NFC'].filter(c => confs[c] && confs[c].length).map(conf => {
            const seeded = _nstdSeed(confs[conf]).slice(0, cut + 1);
            const rowsHtml = seeded.map(t => `
                <div class="sl-playoff-row${t.seed > cut ? ' sl-playoff-row--out' : ''}" style="--tc:${(typeof getNFLTeamColor === 'function' && getNFLTeamColor(t.abbr)) || 'var(--border-default)'}" onclick="${_nstdNav(t.abbr)}">
                    <img src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>
                    <span class="sl-playoff-name">${_nstdBadges(t, season)}${_escHtml(t.shortName)}</span>
                    <span class="sl-playoff-rec">${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''}</span>
                    ${streakBadge(t)}
                </div>`).join('');
            return `<div><h3 class="sl-playoff-conf-title">${conf}</h3>${rowsHtml}</div>`;
        }).join('');
        // Power Rankings teaser (Phase 2): top-3 by _nflPowerScore (js/nflStandings.js),
        // zero new fetch -- same `rows` this module already has in hand.
        let powerHtml = '';
        if (typeof _nflPowerScore === 'function' && rows && rows.length) {
            const top3 = rows.map(t => ({ ...t, _pwr: _nflPowerScore(t) })).sort((a, b) => b._pwr - a._pwr).slice(0, 3);
            const chips = top3.map((t, i) => `
                <button class="sl-power-chip" onclick="navigateTo('nfl-powerrankings')">
                    <span class="sl-power-rank">${i + 1}</span>
                    <img src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>
                    <span>${_escHtml(t.shortName)}</span>
                </button>`).join('');
            powerHtml = `<section class="sl-section">
                <div class="sl-section-hdr"><span class="eyebrow">Power Rankings</span><button class="sl-section-link" onclick="navigateTo('nfl-powerrankings')">Full rankings →</button></div>
                <div class="sl-power-chips">${chips}</div></section>`;
        }
        if (!confHtml && !powerHtml) { host.remove(); return; }
        host.innerHTML = (confHtml ? `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">Playoff Picture</span><button class="sl-section-link" onclick="navigateTo('nfl-standings')">Full standings →</button></div>
            <div class="sl-playoff-confs">${confHtml}</div></section>` : '') + powerHtml;
    } catch (err) {
        Logger.warn('NFL landing signature module failed', err && err.message, 'APP');
        host.remove();
    }
}

// ── NFL landing Fantasy Pulse strip (Phase 2) — Injuries + Trending ────────
// Both halves reuse fully-built features (js/nfl.js's Injury Report and
// Trending tabs) rather than re-deriving anything -- this is a compact
// teaser into each, not a parallel implementation. Reuses the .nfl-lrow row
// shape those pages already share with each other.
async function _loadNFLLandingFantasyPulse() {
    const host = document.getElementById('slFantasyPulse');
    if (!host) return;
    try {
        const [, trendRes] = await Promise.all([
            (typeof fetchNFLSleeperPool === 'function') ? fetchNFLSleeperPool() : Promise.resolve(null),
            fetch('/api/sleeper?path=/v1/players/nfl/trending/add').then(r => r.ok ? r.json() : []).catch(() => []),
        ]);
        if (!host.isConnected) return;

        const pool = Object.values((typeof _nflPoolMap !== 'undefined' && _nflPoolMap) || {})
            .filter(p => p && p.active && p.team && p.injury_status);
        const favFirst = p => (typeof _isFollowed === 'function' && _isFollowed('nfl', 'team', p.team)) ? 0 : 1;
        const injuries = pool.slice().sort((a, b) => (favFirst(a) - favFirst(b)) || ((a.search_rank || 1e9) - (b.search_rank || 1e9))).slice(0, 4);

        const trending = (Array.isArray(trendRes) ? trendRes : []).slice(0, 3).map(e => {
            const p = (typeof _nflPoolMap !== 'undefined' && _nflPoolMap) ? _nflPoolMap[e.player_id] : null;
            return { name: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : 'Unknown player', team: p?.team || '', count: e.count };
        });
        // Raw add counts run 5-6 digits (e.g. 249098) -- abbreviated even at
        // full rail width the number was still wider than it needed to be.
        const fmtCount = n => n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);

        if (!injuries.length && !trending.length) { host.remove(); return; }

        const injRows = injuries.map(p => `
            <div class="nfl-lrow" onclick="navigateTo('nfl-injuries')">
                <div class="nfl-lrow-main">
                    <div class="nfl-lrow-name">${_escHtml(`${p.first_name || ''} ${p.last_name || ''}`.trim())}</div>
                    <div class="nfl-lrow-meta">${_escHtml(p.team || '')} · ${_escHtml(p.position || '')}</div>
                </div>
                <span class="roster-il-badge${typeof _nflInjurySeverityClass === 'function' ? _nflInjurySeverityClass(p.injury_status) : ''}">${_escHtml(p.injury_status)}</span>
            </div>`).join('');
        const trendRows = trending.map(t => `
            <div class="nfl-lrow" onclick="navigateTo('nfl-trending')">
                <div class="nfl-lrow-main">
                    <div class="nfl-lrow-name">${_escHtml(t.name)}</div>
                    <div class="nfl-lrow-meta">${_escHtml(t.team)}</div>
                </div>
                <span class="sl-leader-unit" style="color:var(--color-win)">+${_escHtml(fmtCount(t.count))}</span>
            </div>`).join('');

        // Stacked, not side-by-side (was .sl-pulse-cols, a 1fr 1fr grid): the
        // rail is only ~360px wide, so splitting it in two left each row
        // ~151px -- barely enough for a name before it truncated to two
        // characters. Full rail width per list, matching how every other
        // rail module (Signature, Matchup) is already a single column.
        host.innerHTML = `<section class="sl-section">
            <div class="sl-pulse-stack">
                ${injRows ? `<div><div class="sl-section-hdr"><span class="eyebrow">Injury Watch</span><button class="sl-section-link" onclick="navigateTo('nfl-injuries')">Full report →</button></div>${injRows}</div>` : ''}
                ${trendRows ? `<div><div class="sl-section-hdr"><span class="eyebrow">Trending Adds</span><button class="sl-section-link" onclick="navigateTo('nfl-trending')">See more →</button></div>${trendRows}</div>` : ''}
            </div></section>`;
    } catch (err) {
        Logger.warn('NFL landing fantasy pulse failed', err && err.message, 'APP');
        host.remove();
    }
}

// ── NFL landing Your Matchup module (Phase 2) — signed-in + linked league only.
// No filler for anonymous visitors: the container is removed immediately for
// anyone not signed in or without a linked Sleeper league, matching the
// Signature module's "nothing renders when there's nothing real to show" rule.
async function _loadNFLLandingMatchup() {
    const host = document.getElementById('slMatchup');
    if (!host) return;
    try {
        if (typeof AuthState === 'undefined' || AuthState.status !== 'signed-in') { host.remove(); return; }
        const linkRes = await fetch('/api/sleeperLink', { credentials: 'same-origin' });
        if (!linkRes.ok) { host.remove(); return; }
        const linkBody = await linkRes.json();
        const link = linkBody && linkBody.link;
        if (!link || !link.league_id || !link.sleeper_user_id) { host.remove(); return; }
        if (!host.isConnected) return;

        const [state, rosters, users] = await Promise.all([
            fetch('/api/sleeper?path=/v1/state/nfl').then(r => r.ok ? r.json() : null),
            fetch(`/api/sleeper?path=${encodeURIComponent('/v1/league/' + link.league_id + '/rosters')}`).then(r => r.ok ? r.json() : []),
            fetch(`/api/sleeper?path=${encodeURIComponent('/v1/league/' + link.league_id + '/users')}`).then(r => r.ok ? r.json() : []),
        ]);
        const week = state && state.week;
        if (!week) { host.remove(); return; }
        const matchupList = await fetch(`/api/sleeper?path=${encodeURIComponent('/v1/league/' + link.league_id + '/matchups/' + week)}`).then(r => r.ok ? r.json() : []);
        if (!host.isConnected) return;

        const myRoster = (rosters || []).find(r => r.owner_id === link.sleeper_user_id);
        if (!myRoster) { host.remove(); return; }
        const myEntry = (matchupList || []).find(m => m.roster_id === myRoster.roster_id);
        if (!myEntry || myEntry.matchup_id == null) { host.remove(); return; }
        const oppEntry = (matchupList || []).find(m => m.matchup_id === myEntry.matchup_id && m.roster_id !== myRoster.roster_id);
        const oppRoster = oppEntry ? (rosters || []).find(r => r.roster_id === oppEntry.roster_id) : null;

        const userFor = rosterOwnerId => (users || []).find(u => u.user_id === rosterOwnerId);
        const myUser = userFor(myRoster.owner_id);
        const oppUser = oppRoster ? userFor(oppRoster.owner_id) : null;
        const teamName = (u, fallback) => (u && u.metadata && u.metadata.team_name) || (u && u.display_name) || fallback;

        host.innerHTML = `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">Your Matchup${link.league_name ? ' · ' + _escHtml(link.league_name) : ''}</span><button class="sl-section-link" onclick="navigateTo('nfl-myleague')">My League →</button></div>
            <div class="sl-matchup-row">
                <div class="sl-matchup-team">
                    <span class="sl-matchup-name">${_escHtml(teamName(myUser, 'Your Team'))}</span>
                    <span class="sl-matchup-pts">${myEntry.points != null ? myEntry.points.toFixed(2) : '—'}</span>
                </div>
                <span class="sl-matchup-vs">vs</span>
                <div class="sl-matchup-team">
                    <span class="sl-matchup-name">${oppEntry ? _escHtml(teamName(oppUser, 'Opponent')) : 'Bye week'}</span>
                    <span class="sl-matchup-pts">${oppEntry && oppEntry.points != null ? oppEntry.points.toFixed(2) : (oppEntry ? '—' : '')}</span>
                </div>
            </div>
            <p class="pct-caption">Week ${_escHtml(String(week))} · live scoring via Sleeper</p>
        </section>`;
    } catch (err) {
        Logger.warn('NFL landing matchup failed', err && err.message, 'APP');
        host.remove();
    }
}

// ── NCAAF landing Game Spotlight (Phase 3) — clone of _loadNFLLandingSpotlight
// swapping in the NCAAF-parallel hero picker functions (_heroFromNCAAFGame/
// _ncaafLeverage/_ncaafMarquee, js/app.js), already proven for the cross-sport
// home hero rotation (D-100) -- same {kind,html,onClick} shape, zero new logic.
async function _loadNCAAFLandingSpotlight() {
    const host = document.getElementById('slSpotlight');
    if (!host) return;
    let games = [];
    try {
        games = (AppState.ncaafGames && AppState.ncaafGames.length) ? AppState.ncaafGames
            : (typeof fetchNCAAFScoreboard === 'function' ? await fetchNCAAFScoreboard() : []);
        AppState.ncaafGames = games;
    } catch (err) {
        Logger.warn('NCAAF landing spotlight fetch failed', err && err.message, 'APP');
    }
    if (!host.isConnected) return;
    const live = (games || []).filter(g => g.isLive);
    const upcoming = (games || []).filter(g => !g.isLive && !g.isFinal);
    let hero = null;
    if (live.length) {
        const g = live.slice().sort((a, b) => _ncaafLeverage(b) - _ncaafLeverage(a))[0];
        hero = _heroFromNCAAFGame(g, 'live');
    } else if (upcoming.length) {
        const g = upcoming.slice().sort((a, b) => _ncaafMarquee(b) - _ncaafMarquee(a))[0];
        hero = _heroFromNCAAFGame(g, 'upcoming');
    }
    if (!hero) { host.remove(); return; }
    host.innerHTML = `<div class="home-hero home-hero--${hero.kind}" role="button" tabindex="0">${hero.html}</div>`;
    const card = host.querySelector('.home-hero');
    card.onclick = hero.onClick;
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hero.onClick(); } };
    // Structural redesign pass: a real game resolved into the Spotlight slot,
    // so it IS the hero now -- collapse the identity block above it to a slim
    // strip instead of leaving two full-weight hero-shaped blocks stacked with
    // no shared visual grammar (exactly the "garbled" complaint this fixed).
    document.getElementById('slHero')?.classList.add('sl-hero--slim');
}

// ── Sport-landing Poll Rankings Signature module — mounted into #slSignature
// for any sport with a real AP-style poll instead of a computed formula.
// Originated as an NCAAF-only "_loadNCAAFLandingRankings" (Phase 3) and
// generalized here for NCAAB (Phase 4), which has the identical
// fetchNCAABRankings() shape -- same "shared function over cloned markup"
// move already made for news. Replaces both a playoff-picture AND a Power
// Rankings module in one: neither college sport has a clean seed-by-formula
// bracket or a committee-free path to computed rankings, so the poll itself
// already carries the "who's in it, in what order" signal honestly. Reuses
// .sl-playoff-row/.sl-power-rank (Phase 1/2 CSS) rather than inventing a
// third row variant.
async function _loadPollRankingsSignature(fetchFn, view, logTag) {
    const host = document.getElementById('slSignature');
    if (!host) return;
    try {
        const polls = (typeof fetchFn === 'function') ? await fetchFn() : [];
        if (!host.isConnected) return;
        const ap = polls.find(p => /\bAP\b/i.test(p.name)) || polls[0];
        if (!ap || !ap.ranks || !ap.ranks.length) { host.remove(); return; }
        const top5 = ap.ranks.slice(0, 5);
        // No --tc team-color border here (unlike NFL's playoff-picture rows
        // reusing this same class) -- these poll entries carry no per-team
        // color field, and neither college sport has an NFL-style static
        // color table (100+ teams each). Falls back to .sl-playoff-row's
        // neutral var(--border-default), an honest absence rather than a
        // guessed color.
        const rows = top5.map(t => {
            const move = (t.previous && t.current) ? t.previous - t.current : 0;
            const moveHtml = move > 0 ? `<span style="color:var(--color-win)">▲${move}</span>`
                : move < 0 ? `<span style="color:var(--color-loss)">▼${-move}</span>`
                : `<span style="color:var(--text-muted)">–</span>`;
            return `<div class="sl-playoff-row" onclick="navigateTo('${view}')">
                <span class="sl-power-rank">${_escHtml(String(t.current))}</span>
                <img src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>
                <span class="sl-playoff-name">${_escHtml(t.name)}</span>
                <span class="sl-playoff-rec">${_escHtml(t.record || '')}</span>
                ${moveHtml}
            </div>`;
        }).join('');
        host.innerHTML = `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">${_escHtml(ap.name)}</span><button class="sl-section-link" onclick="navigateTo('${view}')">Full poll →</button></div>
            <div>${rows}</div></section>`;
    } catch (err) {
        Logger.warn(`${logTag} landing rankings failed`, err && err.message, 'APP');
        host.remove();
    }
}

// ── NCAAB landing Game Spotlight (Phase 4) — no leverage/marquee scoring
// model, unlike NFL/NCAAF: live game first (preferring one with a ranked
// team if more than one is live), else the soonest upcoming game (preferring
// a ranked matchup), else nothing. Reuses _heroFromNCAABGame above.
async function _loadNCAABLandingSpotlight() {
    const host = document.getElementById('slSpotlight');
    if (!host) return;
    let games = [];
    try {
        games = (AppState.ncaabGames && AppState.ncaabGames.length) ? AppState.ncaabGames
            : (typeof fetchNCAABScoreboard === 'function' ? await fetchNCAABScoreboard() : []);
        AppState.ncaabGames = games;
    } catch (err) {
        Logger.warn('NCAAB landing spotlight fetch failed', err && err.message, 'APP');
    }
    if (!host.isConnected) return;
    const live = (games || []).filter(g => g.isLive);
    const upcoming = (games || []).filter(g => !g.isLive && !g.isFinal);
    let hero = null;
    if (live.length) {
        const rankedLive = live.filter(g => g.homeTeam.rank || g.awayTeam.rank);
        hero = _heroFromNCAABGame((rankedLive.length ? rankedLive : live)[0], 'live');
    } else if (upcoming.length) {
        const ranked = upcoming.filter(g => g.homeTeam.rank || g.awayTeam.rank);
        const g = (ranked.length ? ranked : upcoming).slice().sort((a, b) => new Date(a.date) - new Date(b.date))[0];
        hero = _heroFromNCAABGame(g, 'upcoming');
    }
    if (!hero) { host.remove(); return; }
    host.innerHTML = `<div class="home-hero home-hero--${hero.kind}" role="button" tabindex="0">${hero.html}</div>`;
    const card = host.querySelector('.home-hero');
    card.onclick = hero.onClick;
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hero.onClick(); } };
    document.getElementById('slHero')?.classList.add('sl-hero--slim');
}
// ── NCAAB landing Games module (Phase 4) — reuses _ncaabGameCard (js/ncaab.js),
// the same compact card displayNCAABScores() already renders, instead of a
// new card shape. Not routed through Scorebug -- NCAAB has no Scorebug
// normalizer (a separate, pre-existing gap noted in CLAUDE.md for the
// ticker; fixing that architecture is out of scope here). Labeled "Upcoming
// Games" rather than NFL/NCAAF's "This Week's Games": NCAAB's schedule can
// be genuinely weeks away from the landing page's own default view (e.g.
// the whole offseason, when every game on the board is opening week), and
// "this week" would misdescribe that gap.
async function _loadNCAABLandingGames() {
    const host = document.getElementById('slGames');
    if (!host) return;
    try {
        const games = (AppState.ncaabGames && AppState.ncaabGames.length) ? AppState.ncaabGames
            : (typeof fetchNCAABScoreboard === 'function' ? await fetchNCAABScoreboard() : []);
        AppState.ncaabGames = games;
        if (!host.isConnected) return;
        const liveFirst = g => g.isLive ? 0 : 1;
        const picked = (games || []).slice().sort((a, b) => (liveFirst(a) - liveFirst(b)) || (new Date(a.date) - new Date(b.date))).slice(0, 6);
        const cards = picked.map(g => (typeof _ncaabGameCard === 'function') ? _ncaabGameCard(g) : '').filter(Boolean).join('');
        if (!cards) { host.remove(); return; }
        host.innerHTML = `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">Upcoming Games</span><button class="sl-section-link" onclick="navigateTo('ncaab-scores')">All scores →</button></div>
            <div class="sl-games">${cards}</div></section>`;
    } catch (err) {
        Logger.warn('NCAAB landing games failed', err && err.message, 'APP');
        host.remove();
    }
}
// ── NCAAB landing Conference Leaders module (Phase 4) — fills #slLeaders'
// slot with a real, honest substitute for the player-level stat leaders
// NCAAB doesn't have (zero code anywhere for it, confirmed by this session's
// audit -- not a hidden/deferred feature, a genuine gap). fetchNCAABStandings
// already returns each team's winPct, already fetched for the Standings page
// but never surfaced anywhere else (displayNCAABTeams discards everything but
// logo+name) -- top-winPct team per conference, same 4-tile rhythm as a
// player-leaders row, labeled as team standings rather than invented stats.
async function _loadNCAABLandingConferenceLeaders() {
    const host = document.getElementById('slLeaders');
    if (!host) return;
    try {
        const season = (typeof NCAAB_LAST_SEASON !== 'undefined') ? NCAAB_LAST_SEASON : new Date().getFullYear();
        const confs = (typeof fetchNCAABStandings === 'function') ? await fetchNCAABStandings(season) : [];
        if (!host.isConnected) return;
        const leaders = confs.map(c => {
            const top = (c.teams || []).filter(t => t.winPct != null).sort((a, b) => b.winPct - a.winPct)[0];
            return top ? { conf: c.name, team: top } : null;
        }).filter(Boolean).sort((a, b) => b.team.winPct - a.team.winPct).slice(0, 4);
        if (!leaders.length) { host.remove(); return; }
        const tiles = leaders.map(({ conf, team }) => `
            <button class="sl-leader" onclick="navigateTo('ncaab-standings')">
                <span class="sl-leader-val">${_escHtml(team.overall || '')}<span class="sl-leader-unit">W-L</span></span>
                <span class="sl-leader-name">${_escHtml(team.name)}</span>
                <span class="sl-leader-team">${_escHtml(conf.replace(/\s*Conference$/i, ''))}</span>
            </button>`).join('');
        host.innerHTML = `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">Conference Leaders</span><button class="sl-section-link" onclick="navigateTo('ncaab-standings')">Full standings →</button></div>
            <div class="sl-leaders">${tiles}</div></section>`;
    } catch (err) {
        Logger.warn('NCAAB landing conference leaders failed', err && err.message, 'APP');
        host.remove();
    }
}

// ── WNBA landing Game Spotlight (Phase 5) — same simple live-else-soonest
// picker as NCAAB's (no leverage/marquee model). Reuses _heroFromWNBAGame.
async function _loadWNBALandingSpotlight() {
    const host = document.getElementById('slSpotlight');
    if (!host) return;
    let games = [];
    try {
        games = (AppState.wnbaGames && AppState.wnbaGames.length) ? AppState.wnbaGames
            : (typeof fetchWNBAScoreboard === 'function' ? await fetchWNBAScoreboard() : []);
        AppState.wnbaGames = games;
    } catch (err) {
        Logger.warn('WNBA landing spotlight fetch failed', err && err.message, 'APP');
    }
    if (!host.isConnected) return;
    const live = (games || []).filter(g => g.isLive);
    const upcoming = (games || []).filter(g => !g.isLive && !g.isFinal);
    let hero = null;
    if (live.length) {
        hero = _heroFromWNBAGame(live[0], 'live');
    } else if (upcoming.length) {
        const g = upcoming.slice().sort((a, b) => new Date(a.date) - new Date(b.date))[0];
        hero = _heroFromWNBAGame(g, 'upcoming');
    }
    if (!hero) { host.remove(); return; }
    host.innerHTML = `<div class="home-hero home-hero--${hero.kind}" role="button" tabindex="0">${hero.html}</div>`;
    const card = host.querySelector('.home-hero');
    card.onclick = hero.onClick;
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hero.onClick(); } };
    document.getElementById('slHero')?.classList.add('sl-hero--slim');
}
// ── WNBA landing Games module (Phase 5) — reuses _wnbaGameCard (js/wnba.js),
// which already wires each card to the real showWNBAGame() panel (D-092
// Resolution 6), unlike NCAAB's Scores-grid-only cards.
async function _loadWNBALandingGames() {
    const host = document.getElementById('slGames');
    if (!host) return;
    try {
        const games = (AppState.wnbaGames && AppState.wnbaGames.length) ? AppState.wnbaGames
            : (typeof fetchWNBAScoreboard === 'function' ? await fetchWNBAScoreboard() : []);
        AppState.wnbaGames = games;
        if (!host.isConnected) return;
        const liveFirst = g => g.isLive ? 0 : 1;
        const picked = (games || []).slice().sort((a, b) => (liveFirst(a) - liveFirst(b)) || (new Date(a.date) - new Date(b.date))).slice(0, 6);
        const cards = picked.map(g => (typeof _wnbaGameCard === 'function') ? _wnbaGameCard(g) : '').filter(Boolean).join('');
        if (!cards) { host.remove(); return; }
        host.innerHTML = `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">Upcoming Games</span><button class="sl-section-link" onclick="navigateTo('wnba-scores')">All scores →</button></div>
            <div class="sl-games">${cards}</div></section>`;
    } catch (err) {
        Logger.warn('WNBA landing games failed', err && err.message, 'APP');
        host.remove();
    }
}
// ── WNBA landing Signature module (Phase 5) — a compact top-4 Playoff
// Picture snapshot, reusing _wnbaComputePlayoffField (js/wnba.js, hoisted
// out of displayWNBAPlayoffPicture for this exact reuse) rather than
// re-deriving the overall-record sort. WNBA's real format has no per-
// conference bracket (top 8 of 15 by overall record, D-092 Resolution 6),
// so this shows a single ranked list, not NFL's AFC/NFC split.
async function _loadWNBALandingSignature() {
    const host = document.getElementById('slSignature');
    if (!host) return;
    try {
        const season = (typeof _wnba !== 'undefined') ? _wnba.season : (typeof WNBA_LAST_SEASON !== 'undefined' ? WNBA_LAST_SEASON : new Date().getFullYear());
        const confs = (typeof fetchWNBAStandings === 'function') ? await fetchWNBAStandings(season) : [];
        if (!host.isConnected) return;
        const all = (typeof _wnbaComputePlayoffField === 'function') ? _wnbaComputePlayoffField(confs) : [];
        if (!all.length) { host.remove(); return; }
        const top4 = all.slice(0, 4);
        const rows = top4.map((t, i) => `
            <div class="sl-playoff-row" onclick="navigateTo('wnba-playoffs')">
                <span class="sl-power-rank">${i + 1}</span>
                <img src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error>
                <span class="sl-playoff-name">${_escHtml(t.name)}</span>
                <span class="sl-playoff-rec">${_escHtml(t.overall || '')}</span>
            </div>`).join('');
        host.innerHTML = `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">Playoff Picture</span><button class="sl-section-link" onclick="navigateTo('wnba-playoffs')">Full picture →</button></div>
            <div>${rows}</div></section>`;
    } catch (err) {
        Logger.warn('WNBA landing signature module failed', err && err.message, 'APP');
        host.remove();
    }
}
// ── WNBA landing Leaders module (Phase 5) — reuses the same /api/wnbastats
// category fetch displayWNBALeaders() already calls (that function keeps it
// inline rather than as a standalone helper, so this fetches it directly
// rather than adding a factoring pass to a page this port doesn't otherwise
// touch); picks 3 headline categories for single-leader tiles, same shape as
// NCAAF's stat-leader tiles.
async function _loadWNBALandingLeaders() {
    const host = document.getElementById('slLeaders');
    if (!host) return;
    try {
        const season = (typeof _wnba !== 'undefined') ? _wnba.season : (typeof WNBA_LAST_SEASON !== 'undefined' ? WNBA_LAST_SEASON : new Date().getFullYear());
        const res = await fetch(`/api/wnbastats?season=${season}`);
        if (!res.ok) throw new Error(`wnbastats ${res.status}`);
        const data = await res.json();
        if (!host.isConnected) return;
        const cats = (data && data.categories) || [];
        const wanted = ['PPG', 'RPG', 'APG'];
        const picked = wanted.map(u => cats.find(c => (c.unit || '').toUpperCase() === u)).filter(Boolean);
        const tiles = (picked.length ? picked : cats.slice(0, 3)).map(cat => {
            const l = (cat.leaders || [])[0];
            if (!l || l.value == null) return '';
            return `<button class="sl-leader" onclick="navigateTo('wnba-player-${_escHtml(String(l.id))}')">
                <span class="sl-leader-val">${_escHtml(String(l.value))}<span class="sl-leader-unit">${_escHtml(cat.unit || '')}</span></span>
                <span class="sl-leader-name">${_escHtml(l.name || '')}</span>
                <span class="sl-leader-team">${_escHtml(l.team || '')}</span></button>`;
        }).filter(Boolean).join('');
        if (!tiles) { host.remove(); return; }
        host.innerHTML = `<section class="sl-section">
            <div class="sl-section-hdr"><span class="eyebrow">League Leaders</span><button class="sl-section-link" onclick="navigateTo('wnba-leaders')">Full leaderboards →</button></div>
            <div class="sl-leaders">${tiles}</div></section>`;
    } catch (err) {
        Logger.warn('WNBA landing leaders failed', err && err.message, 'APP');
        host.remove();
    }
}

// ── My Dashboard (D-069 cont'd) — cross-sport personalized view ────────────
// "Smart default" scope (owner decision): auto-reflects AuthState.follows,
// no manual widget picker, no drag-and-drop. First real consumer of the
// defaultSport preference key D-031 reserved but never wired up.
const _SPORT_LABEL = { mlb: 'MLB', nfl: 'NFL', ncaaf: 'NCAA Football', nba: 'NBA', nhl: 'NHL' };
const _SPORT_TEAMS_VIEW = { mlb: 'mlb-teams', nfl: 'nfl-teams', ncaaf: 'ncaaf-teams', nba: 'teams' };
const _SPORT_PLAYERS_VIEW = { mlb: 'mlb-players', nfl: 'nfl-players', ncaaf: 'ncaaf-leaders', nba: 'players' };

function _dashGroupFollows() {
    const bySport = {};
    (AuthState.follows || new Set()).forEach(key => {
        const parts = key.split(':');
        const sport = parts[0], entityType = parts[1], entityId = parts[2];
        if (!sport || !entityType) return;
        bySport[sport] = bySport[sport] || { teams: [], players: [] };
        if (entityType === 'team') bySport[sport].teams.push(entityId);
        else if (entityType === 'player') bySport[sport].players.push(entityId);
    });
    return bySport;
}

function _dashTeamLogo(sport, abbr) {
    // Only sports with a plain abbreviation-keyed logo helper get an image —
    // disclosed scope limit (ISSUES.md "My Dashboard"), not a broken-image risk.
    try {
        if (sport === 'mlb' && typeof getMLBTeamLogoByAbbr === 'function') return getMLBTeamLogoByAbbr(abbr);
        if (sport === 'nfl' && typeof getNFLTeamLogoUrl === 'function') return getNFLTeamLogoUrl(abbr);
    } catch (_) {}
    return null;
}

function _dashSectionHtml(sport, data, isDefault, todayGames, injuryAlerts) {
    const label = _SPORT_LABEL[sport] || sport.toUpperCase();
    const teamsView = _SPORT_TEAMS_VIEW[sport];
    const playersView = _SPORT_PLAYERS_VIEW[sport];
    const teamChips = data.teams.map(function(abbr) {
        const logo = _dashTeamLogo(sport, abbr);
        const img = logo ? ('<img src="' + _escHtml(logo) + '" alt="" data-hide-on-error style="width:20px;height:20px;object-fit:contain">') : '';
        const onclick = teamsView ? ("navigateTo('" + teamsView + "')") : '';
        return '<button class="md-pos-btn" onclick="' + onclick + '">' + img + _escHtml(abbr) + '</button>';
    }).join('');
    const playerLine = data.players.length
        ? ('<p class="md-note">' + data.players.length + ' followed player' + (data.players.length === 1 ? '' : 's') + (playersView ? (' — <a href="#' + playersView + '">browse ' + _escHtml(label) + ' players</a>') : '') + '</p>')
        : '';
    const defaultBtn = !isDefault ? ('<button class="auth-method-btn" onclick="_dashSetDefaultSport(\'' + sport + '\')">Set as my default sport</button>') : '';
    // "Plays today" fast-follow (ISSUES.md "Dashboard live enrichment"): reuses the exact
    // same Scorebug card the home page renders, so a followed team's live game looks
    // identical everywhere on the site rather than getting a bespoke Dashboard treatment.
    const todayHtml = (todayGames && todayGames.length && typeof Scorebug !== 'undefined')
        ? ('<div class="md-dash-today">' + todayGames.map(function(m) { return Scorebug.renderScoreCard(m); }).join('') + '</div>')
        : '';
    // Injury alerts (ISSUES.md "Dashboard live enrichment + Manage Follows" follow-up,
    // 2026-08-17 brainstorm): same "Injury watch" phrasing/color nfl.js already uses on
    // player cards (--color-loss), not a new visual primitive. Placed above the team
    // chips, right after the live game card -- state that changed is the most useful
    // thing the Dashboard can surface, same reasoning as the "plays today" enrichment.
    const injuryHtml = (injuryAlerts && injuryAlerts.length)
        ? ('<p class="md-note" style="color:var(--color-loss)">Injury watch: ' +
            injuryAlerts.map(function(a) { return _escHtml(a.name) + ' (' + _escHtml(a.status) + ')'; }).join(', ') +
            '</p>')
        : '';
    return '' +
      '<section class="auth-account-section">' +
        '<p class="auth-account-label">' + _escHtml(label) + (isDefault ? ' <span class="md-note">(default)</span>' : '') + '</p>' +
        todayHtml +
        injuryHtml +
        (teamChips ? ('<div class="md-pos-filters">' + teamChips + '</div>') : '<p class="md-note">No followed teams.</p>') +
        playerLine +
        defaultBtn +
      '</section>';
}

// ── "Plays today" data fetch — MLB/NFL/NCAAF only (NBA/NHL preview-only, no live
// enrichment per this project's standing don't-build-NBA/NHL-unprompted rule). ──
function _mlbCanonAbbr(abbr) {
    return (typeof _MLB_ABBR_ALIASES !== 'undefined' && _MLB_ABBR_ALIASES[abbr]) || abbr;
}

async function _dashTodayGamesMLB(teamAbbrs) {
    if (!teamAbbrs.length || typeof fetchMLBSchedule !== 'function' || typeof Scorebug === 'undefined') return [];
    try {
        const games = await fetchMLBSchedule(1);
        // Same ET-day approximation the home page already uses (_loadHomeTodayGames).
        const todayET = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
        const wanted = new Set(teamAbbrs.map(_mlbCanonAbbr));
        return (games || [])
            .filter(function(g) { return (g.officialDate || (g.gameDate || '').slice(0, 10)) === todayET; })
            .filter(function(g) {
                const home = _mlbCanonAbbr(g.teams?.home?.team?.abbreviation);
                const away = _mlbCanonAbbr(g.teams?.away?.team?.abbreviation);
                return wanted.has(home) || wanted.has(away);
            })
            .map(function(g) { return Scorebug.normalizeMLBGame(g); });
    } catch (_) { return []; }
}

async function _dashTodayGamesFootball(sport, teamAbbrs) {
    if (!teamAbbrs.length || typeof Scorebug === 'undefined') return [];
    const fetchFn = sport === 'nfl'
        ? (typeof fetchNFLScoreboard === 'function' ? fetchNFLScoreboard : null)
        : (typeof fetchNCAAFScoreboard === 'function' ? fetchNCAAFScoreboard : null);
    if (!fetchFn) return [];
    try {
        const games = await fetchFn();
        const todayET = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
        const wanted = new Set(teamAbbrs);
        const normalize = sport === 'nfl' ? Scorebug.normalizeNFLGame : Scorebug.normalizeNCAAFGame;
        return (games || [])
            .filter(function(g) { return g.isLive || (g.date || '').slice(0, 10) === todayET; })
            .filter(function(g) { return wanted.has(g.homeTeam?.abbr) || wanted.has(g.awayTeam?.abbr); })
            .map(function(g) { return normalize(g); });
    } catch (_) { return []; }
}

async function _dashTodayGamesFor(sport, teamAbbrs) {
    if (sport === 'mlb') return _dashTodayGamesMLB(teamAbbrs);
    if (sport === 'nfl' || sport === 'ncaaf') return _dashTodayGamesFootball(sport, teamAbbrs);
    return [];
}

async function renderDashboardView() {
    const main = document.getElementById('main');
    if (!main) return;

    // D-109: a cold load straight to #dashboard runs this before initAuth()'s
    // /api/auth/get-session fetch resolves -- AuthState.status is still 'loading' at
    // that point, not 'signed-out'. Treating 'loading' as signed-out flashed the wrong
    // empty state and auto-opened the sign-in sheet for already-signed-in users, and
    // since nothing ever re-rendered afterward, closing that unwanted sheet left the
    // Dashboard permanently stuck showing "Sign in..." (ISSUES.md, 2026-08-17 report).
    // Wait for the real answer first instead of guessing from an in-progress status.
    if (typeof AuthState !== 'undefined' && AuthState.status === 'loading' && AuthState.ready) {
        main.innerHTML = '<div class="auth-account-page"><h1 class="auth-account-title">Your Dashboard</h1><div class="auth-account-loading" role="status">Loading…</div></div>';
        await AuthState.ready;
        if (typeof AppState !== 'undefined' && AppState.currentView !== 'dashboard') return;
    }

    if (typeof AuthState === 'undefined' || AuthState.status !== 'signed-in') {
        main.innerHTML = '<div class="auth-account-page"><h1 class="auth-account-title">Your Dashboard</h1><div class="auth-account-signedout"><p>Sign in to see your followed teams and players in one place, across every sport.</p></div></div>';
        if (typeof openAuthSheet === 'function') openAuthSheet();
        return;
    }

    const bySport = _dashGroupFollows();
    const allFollowedSports = Object.keys(bySport);
    const hiddenSports = typeof _getDashboardHiddenSports === 'function' ? _getDashboardHiddenSports() : [];
    const sports = allFollowedSports.filter(function(s) { return hiddenSports.indexOf(s) === -1; });
    const defaultSport = typeof _getDefaultSport === 'function' ? _getDefaultSport() : null;

    // Every followed sport hidden via Settings (2026-08-17) is a distinct state from
    // "not following anything" -- Vera's rule: don't silently render a blank Dashboard,
    // say why it's empty and point at the fix.
    if (!sports.length && allFollowedSports.length) {
        main.innerHTML = '' +
          '<div class="auth-account-page">' +
            '<h1 class="auth-account-title">Your Dashboard</h1>' +
            '<div class="auth-account-section">' +
              '<p class="auth-sheet-note">You\'ve hidden every section from your Dashboard.</p>' +
              '<div class="md-head-actions">' +
                '<button class="md-btn md-btn--ghost" onclick="if (typeof openSettingsPanel === \'function\') openSettingsPanel();">Open Settings</button>' +
              '</div>' +
            '</div>' +
          '</div>';
        return;
    }

    if (!sports.length) {
        main.innerHTML = '' +
          '<div class="auth-account-page">' +
            '<h1 class="auth-account-title">Your Dashboard</h1>' +
            '<div class="auth-account-section">' +
              '<p class="auth-sheet-note">You\'re not following any teams or players yet. Follow a few and they\'ll show up here automatically.</p>' +
              '<div class="md-head-actions">' +
                '<button class="md-btn md-btn--ghost" onclick="navigateTo(\'mlb-teams\')">Browse MLB Teams</button>' +
                '<button class="md-btn md-btn--ghost" onclick="navigateTo(\'nfl-teams\')">Browse NFL Teams</button>' +
                '<button class="md-btn md-btn--ghost" onclick="navigateTo(\'ncaaf-teams\')">Browse NCAAF Teams</button>' +
              '</div>' +
            '</div>' +
          '</div>';
        return;
    }

    // Smart ordering: explicit defaultSport pref wins if set, otherwise the
    // sport with the most total follows leads — genuine personalization with
    // zero required setup (the whole point of "smart default").
    sports.sort(function(a, b) {
        if (a === defaultSport) return -1;
        if (b === defaultSport) return 1;
        const countOf = function(s) { return bySport[s].teams.length + bySport[s].players.length; };
        return countOf(b) - countOf(a);
    });

    const hasNFLFollow = sports.indexOf('nfl') !== -1;

    // Fetch each sport's "plays today" games (and NFL injury alerts) in parallel --
    // independent fetches, no reason to serialize them. Sleeper league-link teaser
    // (ISSUES.md "Dashboard live enrichment" follow-up, 2026-08-17) piggybacks on the
    // same Promise.all -- one more cheap, already-built endpoint (/api/sleeperLink,
    // D-065), not a new fetch pattern.
    const todayGamesBySport = {};
    const injuryAlertsBySport = {};
    let sleeperLinkName = null;
    await Promise.all(sports.map(async function(s) {
        todayGamesBySport[s] = await _dashTodayGamesFor(s, bySport[s].teams);
        injuryAlertsBySport[s] = (s === 'nfl') ? await _dashNFLInjuryAlerts(bySport[s].players) : [];
    }).concat(hasNFLFollow ? [(async function() {
        try {
            const linkRes = await fetch('/api/sleeperLink', { credentials: 'same-origin' });
            if (linkRes.ok) {
                const body = await linkRes.json();
                if (body && body.link && body.link.league_name) sleeperLinkName = body.link.league_name;
            }
        } catch (e) {
            if (typeof Logger !== 'undefined') Logger.warn('Dashboard sleeperLink fetch failed', e, 'NFL');
        }
    })()] : []));

    const sectionsHtml = sports.map(function(s) { return _dashSectionHtml(s, bySport[s], s === defaultSport, todayGamesBySport[s], injuryAlertsBySport[s]); }).join('');

    main.innerHTML = '' +
      '<div class="auth-account-page">' +
        '<h1 class="auth-account-title">Your Dashboard</h1>' +
        sectionsHtml +
        (hasNFLFollow ? (
          '<section class="auth-account-section">' +
            '<p class="auth-account-label">Fantasy</p>' +
            (sleeperLinkName ? ('<p class="md-note">Linked league: ' + _escHtml(sleeperLinkName) + '</p>') : '') +
            '<div class="md-head-actions">' +
              '<button class="md-btn md-btn--ghost" onclick="navigateTo(\'nfl-mydrafts\')">My Drafts</button>' +
              '<button class="md-btn md-btn--ghost" onclick="navigateTo(\'nfl-myleague\')">My League</button>' +
            '</div>' +
          '</section>'
        ) : '') +
      '</div>';

    // The "plays today" cards render with the same cursor:pointer/role=button affordance
    // as the home page's own game cards -- wire them the same way, or they'd be dead clicks.
    if (typeof _wireHomeGameCardClicks === 'function') _wireHomeGameCardClicks(main);
}

// Injury alerts for followed NFL players (ISSUES.md "Dashboard live enrichment"
// follow-up, 2026-08-17). NFL-only, disclosed scope limit -- injury_status only
// exists on the Sleeper player pool (N-17's data source); MLB/NCAAF have no
// equivalent feed in this codebase today. Reuses the same in-module-memoized
// fetchNFLSleeperPool()/_nflPoolMap the Injury Report tab and player cards
// already read -- no new fetch pattern, no new cache.
async function _dashNFLInjuryAlerts(playerIds) {
    if (!playerIds || !playerIds.length || typeof fetchNFLSleeperPool !== 'function') return [];
    try {
        await fetchNFLSleeperPool();
        return playerIds
            .map(function(id) { return typeof _nflPoolMap !== 'undefined' && _nflPoolMap ? _nflPoolMap[id] : null; })
            .filter(function(p) { return p && p.injury_status; })
            .map(function(p) { return { name: ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || 'Unknown player', status: p.injury_status }; });
    } catch (e) {
        if (typeof Logger !== 'undefined') Logger.warn('Dashboard injury lookup failed', e, 'NFL');
        return [];
    }
}

function _dashSetDefaultSport(sport) {
    // Shared with the Settings panel's Default Sport select (js/auth.js's _setDefaultSport) --
    // one write path for localStorage + server push, not two copies of the same logic.
    if (typeof _setDefaultSport === 'function') _setDefaultSport(sport);
    renderDashboardView();
}

if (typeof window !== 'undefined') {
    window._renderSportLanding = _renderSportLanding;
    window._renderSportPicker = _renderSportPicker;
    window._loadNFLLandingSpotlight = _loadNFLLandingSpotlight;
    window._loadSportLandingNews = _loadSportLandingNews;
    window._loadNFLLandingSignature = _loadNFLLandingSignature;
    window._loadNFLLandingFantasyPulse = _loadNFLLandingFantasyPulse;
    window._loadNFLLandingMatchup = _loadNFLLandingMatchup;
    window._loadNCAAFLandingSpotlight = _loadNCAAFLandingSpotlight;
    window._loadPollRankingsSignature = _loadPollRankingsSignature;
    window.loadHome   = loadHome;
    window.enterSport = enterSport;
    window.renderDashboardView = renderDashboardView;
    window._dashSetDefaultSport = _dashSetDefaultSport;
}

// ── Theme & Settings Panel ────────────────────────────────────

// D-047: live theme set. Retired themes are archived in css/themes-retired/.
const _KEPT_THEMES = { dark: 1, light: 1, 'nl-monarchs': 1 };

const _CC_TEAM_LOGOS = {
    'nl-monarchs':     'assets/themes/images.png',
};

const _CC_THEME_ALTS = {
    'nl-monarchs':     'Kansas City Monarchs — Negro Leagues',
};

function _applyTheme(theme, opts) {
    // A retired theme in a returning user's localStorage falls back to dark, silently.
    if (!_KEPT_THEMES[theme]) theme = 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('zs_theme', theme); } catch (_) {}
    // 2026-08-09 fix: this write-back was missing entirely -- theme synced DOWN from the
    // server on sign-in (_syncPreferencesOnSignIn) but a change made here never went back
    // UP, so D-031's "cross-device sync for prefs" was only half-true for theme. `silent`
    // skips the push on the initial boot-time call (nothing changed, nothing to sync) and
    // avoids re-pushing on every _initSettingsPanel resync.
    if (!(opts && opts.silent) && typeof pushPreference === 'function') pushPreference('theme', theme);
    document.querySelectorAll('.theme-swatch').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.themeSet === theme));
    });
    const logoEl = document.querySelector('.brand-logo-img');
    if (logoEl) {
        const ccLogo = _CC_TEAM_LOGOS[theme];
        if (ccLogo) {
            logoEl.onerror = () => { logoEl.src = 'assets/icon-64.png'; logoEl.onerror = null; };
        } else {
            logoEl.onerror = null;
        }
        logoEl.src = ccLogo || 'assets/icon-64.png';
        logoEl.alt = _CC_THEME_ALTS[theme] || 'SportStrata';
    }
    // F9: keep the browser UI tint in sync with the active theme background token.
    const _tc = document.querySelector('meta[name="theme-color"]');
    if (_tc) {
        const _bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim();
        if (_bg) _tc.setAttribute('content', _bg);
    }
}

function openSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    panel.hidden = false;
    _applyTheme(document.documentElement.getAttribute('data-theme') || 'dark', { silent: true });
    _refreshSettingsPanelState();
    requestAnimationFrame(() => panel.classList.add('settings-panel--open'));
    document.addEventListener('keydown', _settingsPanelKeyHandler);
}

function _closeSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    panel.classList.remove('settings-panel--open');
    panel.addEventListener('transitionend', () => { panel.hidden = true; }, { once: true });
    document.removeEventListener('keydown', _settingsPanelKeyHandler);
}

function _settingsPanelKeyHandler(e) {
    if (e.key === 'Escape') _closeSettingsPanel();
}

// Settings panel — Default Sport + Account sections (2026-08-09). Local-first default
// sport works fully signed-out (D-034); Account line is read-only glue into the existing
// auth system, not a second copy of it -- no sign-out/account logic duplicated here.
// Option list itself lives as static <option> markup in index.html (three fixed values,
// not worth generating from JS).
function _refreshSettingsPanelState() {
    const sel = document.getElementById('settingsDefaultSport');
    if (sel && typeof _getDefaultSport === 'function') {
        sel.value = _getDefaultSport() || '';
    }

    _renderSettingsFollowsList();
    if (typeof _renderSettingsDashboardSections === 'function') _renderSettingsDashboardSections();

    const accountLine = document.getElementById('settingsAccountLine');
    const accountBtn = document.getElementById('settingsAccountBtn');
    if (!accountLine || !accountBtn) return;

    if (typeof AuthState !== 'undefined' && AuthState.status === 'signed-in') {
        accountLine.textContent = `Signed in as ${AuthState.user.email}`;
        accountBtn.textContent = 'Manage account';
        accountBtn.onclick = () => { _closeSettingsPanel(); navigateTo('account'); };
    } else {
        accountLine.textContent = 'Not signed in';
        accountBtn.textContent = 'Sign in';
        accountBtn.onclick = () => { _closeSettingsPanel(); if (typeof openAuthSheet === 'function') openAuthSheet(); };
    }
}

// Dashboard section visibility (2026-08-17, Kael's "soft customization" ceiling from
// the team brainstorm) -- lists every sport the user currently follows something in
// (reuses _dashGroupFollows(), the exact same source Dashboard itself renders from,
// so this list can never drift out of sync with what Dashboard would actually show)
// with a checkbox per sport. Unchecked = hidden. A sport with zero follows never
// appears here, same as it never appears on Dashboard itself.
function _renderSettingsDashboardSections() {
    const host = document.getElementById('settingsDashboardSections');
    if (!host) return;

    if (typeof AuthState === 'undefined' || AuthState.status !== 'signed-in' || typeof _dashGroupFollows !== 'function') {
        host.innerHTML = '<p class="md-note">Sign in and follow a team or player to customize your Dashboard.</p>';
        return;
    }

    const bySport = _dashGroupFollows();
    const followedSports = Object.keys(bySport);
    if (!followedSports.length) {
        host.innerHTML = '<p class="md-note">Not following anything yet.</p>';
        return;
    }

    const hidden = typeof _getDashboardHiddenSports === 'function' ? _getDashboardHiddenSports() : [];
    host.innerHTML = followedSports.sort().map(function(sport) {
        const label = (typeof _SPORT_LABEL !== 'undefined' && _SPORT_LABEL[sport]) || sport.toUpperCase();
        const isHidden = hidden.indexOf(sport) !== -1;
        return '<label class="md-check"><input type="checkbox" data-dash-section-sport="' + _escHtml(sport) + '"' + (isHidden ? '' : ' checked') + '> ' + _escHtml(label) + '</label>';
    }).join('');

    host.querySelectorAll('[data-dash-section-sport]').forEach(function(cb) {
        cb.addEventListener('change', function() {
            const sport = cb.dataset.dashSectionSport;
            const current = typeof _getDashboardHiddenSports === 'function' ? _getDashboardHiddenSports() : [];
            const next = cb.checked ? current.filter(function(s) { return s !== sport; }) : current.concat([sport]);
            if (typeof _setDashboardHiddenSports === 'function') _setDashboardHiddenSports(next);
        });
    });
}

// Manage Follows (ISSUES.md "Dashboard live enrichment + Manage Follows") -- the only
// central place on the site to see everything you follow and remove it; every other
// surface only ever adds a follow via a single star on a single card.
function _dashResolvePlayerName(sport, id) {
    try {
        if (sport === 'mlb' && typeof AppState !== 'undefined' && AppState.mlbPlayers) {
            const pools = [AppState.mlbPlayers.hitting, AppState.mlbPlayers.pitching];
            for (const pool of pools) {
                const hit = (pool || []).find(p => String(p.id) === String(id));
                if (hit) return hit.fullName;
            }
        }
        if (sport === 'nfl' && typeof _mdPool !== 'undefined' && _mdPool) {
            const hit = _mdPool.find(p => String(p.id) === String(id));
            if (hit) return hit.name;
        }
    } catch (_) { /* opportunistic only -- fall through to the ID label below */ }
    return null;
}

function _renderSettingsFollowsList() {
    const host = document.getElementById('settingsFollowsList');
    if (!host) return;

    if (typeof AuthState === 'undefined' || !AuthState.follows || !AuthState.follows.size) {
        host.innerHTML = '<p class="md-note">Not following anything yet.</p>';
        return;
    }

    const bySport = {};
    AuthState.follows.forEach(key => {
        const parts = key.split(':');
        const sport = parts[0], entityType = parts[1], entityId = parts[2];
        if (!sport || !entityType || !entityId) return;
        (bySport[sport] = bySport[sport] || []).push({ entityType, entityId });
    });

    host.innerHTML = Object.keys(bySport).sort().map(sport => {
        const label = (typeof _SPORT_LABEL !== 'undefined' && _SPORT_LABEL[sport]) || sport.toUpperCase();
        const rows = bySport[sport].map(({ entityType, entityId }) => {
            let displayHtml;
            if (entityType === 'team') {
                const logo = typeof _dashTeamLogo === 'function' ? _dashTeamLogo(sport, entityId) : null;
                const img = logo ? `<img src="${_escHtml(logo)}" alt="" data-hide-on-error style="width:16px;height:16px;object-fit:contain;margin-right:6px;vertical-align:-3px">` : '';
                displayHtml = img + _escHtml(entityId);
            } else {
                const name = _dashResolvePlayerName(sport, entityId);
                displayHtml = name ? _escHtml(name) : `Player #${_escHtml(entityId)}`;
            }
            return `<div class="settings-follow-row">
                <span>${displayHtml}</span>
                <button class="settings-unfollow-btn" data-unfollow-sport="${_escHtml(sport)}" data-unfollow-type="${_escHtml(entityType)}" data-unfollow-id="${_escHtml(entityId)}" aria-label="Unfollow" title="Unfollow">&times;</button>
            </div>`;
        }).join('');
        return `<p class="settings-subsection-label">${_escHtml(label)}</p>${rows}`;
    }).join('');

    host.querySelectorAll('.settings-unfollow-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            // toggleFollow dispatches ss:follow-changed synchronously after updating
            // AuthState.follows -- the listener below (which checks the panel is open)
            // re-renders this list, so no direct re-render call is needed here too.
            const { unfollowSport, unfollowType, unfollowId } = btn.dataset;
            if (typeof toggleFollow === 'function') await toggleFollow(unfollowSport, unfollowType, unfollowId, false);
        });
    });
}

(function _initSettingsPanel() {
    document.getElementById('settingsPanelClose')?.addEventListener('click', _closeSettingsPanel);
    document.getElementById('settingsPanelBackdrop')?.addEventListener('click', _closeSettingsPanel);
    document.querySelectorAll('.theme-swatch').forEach(btn => {
        btn.addEventListener('click', () => _applyTheme(btn.dataset.themeSet));
    });
    document.getElementById('settingsDefaultSport')?.addEventListener('change', (e) => {
        if (typeof _setDefaultSport === 'function') _setDefaultSport(e.target.value);
    });
})();

// Sync swatch active state on load (theme was set by the inline <head> script) -- not a
// user action, so this must never push a "change" back to the server.
_applyTheme(document.documentElement.getAttribute('data-theme') || 'dark', { silent: true });

if (typeof window !== 'undefined') {
    window.openSettingsPanel = openSettingsPanel;
}

// ── PWA Install Prompt ────────────────────────────────────────
// Captures the beforeinstallprompt event so we can trigger it on demand.
// After a short delay on the second+ visit, surfaces a non-intrusive toast.
(function setupInstallPrompt() {
    let _deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        _deferredPrompt = e;

        const visits = parseInt(localStorage.getItem('zs_visits') || '0', 10) + 1;
        localStorage.setItem('zs_visits', String(visits));

        if (visits < 2) return; // only prompt from 2nd visit onward
        if (localStorage.getItem('zs_install_dismissed')) return;

        setTimeout(() => {
            if (!_deferredPrompt) return;
            const toast = document.createElement('div');
            toast.className = 'install-toast';
            toast.setAttribute('role', 'dialog');
            toast.setAttribute('aria-label', 'Install SportStrata');
            toast.innerHTML = `
                <span class="install-toast-msg">Add SportStrata to your home screen</span>
                <button class="install-toast-btn" id="installAcceptBtn">Install</button>
                <button class="install-toast-dismiss" aria-label="Dismiss">✕</button>
            `;
            document.body.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('install-toast--visible'));

            document.getElementById('installAcceptBtn')?.addEventListener('click', () => {
                _deferredPrompt.prompt();
                _deferredPrompt.userChoice.then(() => { _deferredPrompt = null; toast.remove(); });
            });
            toast.querySelector('.install-toast-dismiss')?.addEventListener('click', () => {
                localStorage.setItem('zs_install_dismissed', '1');
                toast.classList.remove('install-toast--visible');
                setTimeout(() => toast.remove(), 300);
            });
        }, 4000);
    });

    window.addEventListener('appinstalled', () => {
        _deferredPrompt = null;
        document.querySelector('.install-toast')?.remove();
        Logger.info('PWA installed', undefined, 'APP');
    });
})();


// ── F5 Phase 1: Add-to-Home-Screen prompt (2nd distinct-day visit) ──
// G4: visit tracking is localStorage-only, nothing leaves the browser.
// iOS Safari never fires beforeinstallprompt — strip simply never shows there.
(function setupInstallPrompt() {
    const DONE_KEY = 'zs_a2hs_done';
    const DAYS_KEY = 'zs_visit_days';
    let deferred = null;

    try {
        if (localStorage.getItem(DONE_KEY)) return;
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        const today = new Date().toDateString();
        const days = JSON.parse(localStorage.getItem(DAYS_KEY) || '[]');
        if (!days.includes(today)) {
            days.push(today);
            localStorage.setItem(DAYS_KEY, JSON.stringify(days.slice(-5)));
        }
        if (days.length < 2) return;
    } catch (_) { return; }

    window.addEventListener('appinstalled', () => {
        try { localStorage.setItem(DONE_KEY, '1'); } catch (_) {}
        document.querySelector('.a2hs-strip')?.remove();
        document.body.classList.remove('a2hs-open');
    });

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferred = e;
        if (document.querySelector('.a2hs-strip')) return;
        const strip = document.createElement('div');
        strip.className = 'a2hs-strip';
        strip.setAttribute('role', 'region');
        strip.setAttribute('aria-label', 'Install SportStrata');
        strip.innerHTML = `
            <img class="a2hs-icon" src="assets/icon-64.png" alt="">
            <span class="a2hs-text">Install SportStrata for one-tap access</span>
            <button class="btn-primary a2hs-install">Install</button>
            <button class="a2hs-dismiss" aria-label="Dismiss install prompt">\u00d7</button>`;
        const done = () => {
            strip.remove();
            document.body.classList.remove('a2hs-open');
            try { localStorage.setItem(DONE_KEY, '1'); } catch (_) {}
        };
        strip.querySelector('.a2hs-install').addEventListener('click', async () => {
            done();
            if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; }
        });
        strip.querySelector('.a2hs-dismiss').addEventListener('click', done);
        document.body.appendChild(strip);
        document.body.classList.add('a2hs-open');
        Logger.info('A2HS prompt shown', undefined, 'APP');
    });
})();

// ── Seasonal promo band (D-043 3b) — exactly one promo CTA, chosen by the
// calendar. Priority order matters: first active entry wins. Replaces the old
// single hardcoded "NFL Draft Season" row, which just went empty once its
// Jun–Sep window closed instead of following the calendar into football
// season the way Vera's spec calls for. Windows below are disjoint by design
// (draft ends Aug, nfl-live starts Sep), so ordering doesn't actually matter
// today — kept priority-based anyway so a future overlapping entry is safe.
//
// A function, not a top-level `const` array — `loadHome()` runs synchronously
// during script bootstrap (setupNavigation → _loadFromHash → navigateTo, all
// called near the top of this file) which is *before* the JS engine reaches a
// `const` declared further down the file; referencing it from that path threw
// "Cannot access 'PROMO_MOMENTS' before initialization" (a real TDZ bug caught
// live on first production check, 2026-08-02). Function declarations are
// fully hoisted, so this reads identically but has no ordering hazard.
function _promoMoments() {
    return [
        {
            key: 'nfl-live',
            // Deliberately NOT derived from _nflIsOffseason() (D-063 narrowed that to
            // exclude August preseason) -- this promo is specifically "the real season
            // is live," which August preseason isn't. Sep-Feb, same window this always
            // used, just no longer coupled to a season-phase helper whose meaning changed
            // out from under it. Sep 1-8 (preseason's tail) and Mar-Jun have no active
            // NFL promo here by design -- 'draft' below owns Jul-Aug, and there's
            // deliberately no promo for the handful of days between preseason ending and
            // "draft season" already being over; the Pennant Races widget fills that gap.
            active: () => { const m = new Date().getMonth() + 1; return m >= 9 || m <= 2; },
            kicker: () => `${typeof NFL_FANTASY_SEASON !== 'undefined' ? NFL_FANTASY_SEASON : ''} Football Season`,
            text:   () => (typeof _ncaafIsOffseason === 'function' && !_ncaafIsOffseason())
                ? 'NFL and NCAAF — scores, standings and fantasy tools, all live, no login required.'
                : 'Scores, standings and fantasy tools — all live, no login required.',
            primary: { label: 'NFL Scores →', view: 'nfl-games' },
            secondary: () => (typeof _ncaafIsOffseason === 'function' && !_ncaafIsOffseason())
                ? { label: 'NCAAF Scores →', view: 'ncaaf-scores' }
                : { label: 'Standings →', view: 'nfl-standings' },
        },
        {
            key: 'draft',
            active: () => { const m = new Date().getMonth() + 1; return m === 7 || m === 8; }, // Jul–Aug
            kicker: () => 'NFL Draft Season',
            text:   () => 'Mock draft in 60 seconds — no login. Build your board before your league does.',
            primary: { label: 'Mock Draft →', view: 'nfl-mock' },
            secondary: () => ({ label: 'Draft Kit →', view: 'nfl-draftkit' }),
        },
    ];
}

function _activePromoMoment() {
    return _promoMoments().find(p => { try { return p.active(); } catch (_) { return false; } }) || null;
}

// Cross-sport navigation needs the sport UI switched first — a bare
// navigateTo from MLB home to an nfl-* view recreates the D-038 V2 chimera.
// 'ncaaf' was missing here (D-043 3b fix) — a promo CTA routing to any
// ncaaf-* view would silently fail to switch AppState.currentSport.
function _hmGo(view) {
    const sport = view.split('-')[0];
    if (['mlb', 'nfl', 'nhl', 'ncaaf'].includes(sport) && AppState.currentSport !== sport) {
        AppState.currentSport = sport;
        if (typeof _applySportUI === 'function') _applySportUI(sport);
    }
    navigateTo(view);
}

// Home redesign Phase 1 (2026-09-07): the Pennant Races viz that used to
// live here is retired -- its tightest-gap signal is now one candidate in
// the cross-sport stat-moment Insights engine above (_mlbPennantStatMoment),
// competing honestly against NFL/NCAAF/NCAAB/WNBA's own signals instead of
// always occupying its own MLB-only card regardless of what else is
// happening that day. This function now only renders the seasonal promo row
// (_activePromoMoment), left functionally untouched -- it's a marketing CTA,
// not a stat, so it doesn't belong in the notability competition.
function _renderHomeMoment() {
    const host = document.getElementById('homeMoment');
    if (!host) return;
    const promo = _activePromoMoment();
    if (!promo) { host.hidden = true; return; }

    // 2026-08-19 (mock-draft-visibility fix): giving the promo row the
    // sport's own accent as a left border + icon (same "border = identity"
    // pattern .sport-card already uses) makes it legible as distinct,
    // sport-owned content at a glance, without inventing any new class or color.
    const promoSport = promo.primary.view.split('-')[0];
    const promoMeta = (typeof SPORTS_META !== 'undefined' && SPORTS_META[promoSport]) || {};
    const promoAccent = promoMeta.accent || 'var(--accent)';
    const promoIcon = promoMeta.icon ? `<span class="hm-kicker-icon">${_iconSvg(promoMeta.icon, 12)}</span>` : '';

    host.hidden = false;
    host.innerHTML = `
        <div class="hm-row hm-row--promo" style="--sport-accent:${promoAccent}">
            <span class="hm-kicker">${promoIcon}${_escHtml(promo.kicker())}</span>
            <span class="hm-text">${_escHtml(promo.text())}</span>
            <button class="hm-chip hm-chip--primary" onclick="_hmGo('${promo.primary.view}')">${_escHtml(promo.primary.label)}</button>
            <button class="hm-chip" onclick="_hmGo('${promo.secondary().view}')">${_escHtml(promo.secondary().label)}</button>
        </div>`;
}


// Boot splash dismiss (D-048): fade the branded splash once the first view has painted.
(function(){
    var s = document.getElementById('bootSplash');
    if (!s) return;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
        s.classList.add('boot-hide');
        setTimeout(function(){ if (s && s.parentNode) s.parentNode.removeChild(s); }, 500);
    }); });
})();

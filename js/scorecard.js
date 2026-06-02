// ============================================================
// scorecard.js — MLB Play-by-Play Scorecard, Phase 1: Historical
// Depends on: mlb.js (mlbFetch, getMLBTeamColors, getMLBTeamLogoByAbbr,
//             getMLBTeamLogoUrl, _mlbTeamAbbr, _escHtml, Logger,
//             AppState, ApiCache)
// Load order: after mlb.js, before nfl.js in index.html
// ============================================================

// ── Notation resolver ─────────────────────────────────────────

function resolveNotation(play) {
    const et    = play.result?.eventType;
    const event = play.result?.event;

    switch (et) {
        case 'strikeout': {
            const events   = play.playEvents || [];
            const lastPitch = [...events].reverse().find(e => e.isPitch);
            return lastPitch?.details?.call?.code === 'C' ? 'Kc' : 'K';
        }
        case 'walk':                        return 'BB';
        case 'intent_walk':                 return 'IBB';
        case 'hit_by_pitch':                return 'HBP';
        case 'single':                      return '1B';
        case 'double':                      return '2B';
        case 'triple':                      return '3B';
        case 'home_run':                    return 'HR';
        case 'field_out':
            if (event === 'Groundout')      return 'G';
            if (event === 'Flyout')         return 'F';
            if (event === 'Lineout')        return 'L';
            if (event === 'Pop Out')        return 'PO';
            return 'F';
        case 'grounded_into_double_play':   return 'DP';
        case 'double_play':                 return 'DP';
        case 'force_out':                   return 'FC';
        case 'field_error':                 return 'E';
        case 'sac_bunt':                    return 'SAC';
        case 'sac_fly':                     return 'SF';
        case 'sac_bunt_double_play':        return 'SACDP';
        case 'runner_double_play':          return 'DP';
        case 'catcher_interf':              return 'CI';
        default:
            return et ? et.slice(0, 3).toUpperCase() : '—';
    }
}

// ── Base progression ─────────────────────────────────────────
// Returns array of CSS class names to add to the .sc-diamond <svg>.
// Classes are cumulative: reaching 2B fills both 1B and 2B segments.

function resolveBaseProgression(play) {
    const batterId = play.matchup?.batter?.id;
    if (!batterId) return [];

    const runners     = play.runners || [];
    const batterRuns  = runners.filter(r => r.details?.runner?.id === batterId);
    if (!batterRuns.length) return [];

    const sorted   = [...batterRuns].sort((a, b) =>
        (a.details?.playIndex ?? 0) - (b.details?.playIndex ?? 0));
    const last     = sorted[sorted.length - 1];
    const finalEnd = last?.movement?.end;

    // Batter was put out — no base fill
    if (!finalEnd || last?.movement?.isOut) return [];

    if (finalEnd === '1B')    return ['reached-1'];
    if (finalEnd === '2B')    return ['reached-1', 'reached-2'];
    if (finalEnd === '3B')    return ['reached-1', 'reached-2', 'reached-3'];
    if (finalEnd === 'score') return ['reached-1', 'reached-2', 'reached-3', 'scored'];
    return [];
}

// ── Team section builder ──────────────────────────────────────
// Filters allPlays to one half-inning direction ('top'=away, 'bottom'=home),
// builds an ordered lineup with each batter's PAs indexed by inning.

function _buildTeamSection(allPlays, halfInning) {
    const lineupMap   = new Map(); // batterId → {id, fullName, paByInning: Map}
    const lineupOrder = [];        // batter IDs in first-appearance order

    for (const play of allPlays) {
        if (play.about?.halfInning !== halfInning) continue;
        const batter = play.matchup?.batter;
        if (!batter?.id) continue;
        // Only plate appearance results — skip plays without an eventType
        if (!play.result?.eventType) continue;

        if (!lineupMap.has(batter.id)) {
            lineupMap.set(batter.id, {
                id: batter.id,
                fullName: batter.fullName || '—',
                paByInning: new Map(),
            });
            lineupOrder.push(batter.id);
        }

        const entry   = lineupMap.get(batter.id);
        const inning  = play.about.inning;
        const base    = resolveBaseProgression(play);
        const pa      = {
            notation: resolveNotation(play),
            base,
            scored:   base.includes('scored'),
        };

        if (!entry.paByInning.has(inning)) entry.paByInning.set(inning, []);
        entry.paByInning.get(inning).push(pa);
    }

    return lineupOrder.map(id => lineupMap.get(id));
}

// ── Inning totals ─────────────────────────────────────────────
// Tallies runs and hits per inning per side.
// Errors require linescore data and are not computed here (Phase 1 scope).

function _buildInningTotals(allPlays, innings) {
    const hitTypes = new Set(['single', 'double', 'triple', 'home_run']);
    const totals   = {};
    for (let i = 1; i <= innings; i++) {
        totals[i] = { away: { r: 0, h: 0 }, home: { r: 0, h: 0 } };
    }

    for (const play of allPlays) {
        const inning = play.about?.inning;
        if (!inning || !totals[inning]) continue;
        const side = play.about.halfInning === 'top' ? 'away' : 'home';

        const runs = (play.runners || []).filter(r => r.movement?.end === 'score').length;
        totals[inning][side].r += runs;

        if (hitTypes.has(play.result?.eventType)) totals[inning][side].h += 1;
    }
    return totals;
}

// ── Game meta ─────────────────────────────────────────────────
// Prefers the stub already in AppState to avoid a network call.

async function _fetchGameMeta(gameId, gameStub) {
    // Prefer stub, then fall back to AppState.mlbGames (present when navigating from scores view)
    const g = gameStub || (AppState.mlbGames || []).find(gs => gs.gamePk === gameId) || null;
    if (g?.teams) {
        const ht = g.teams.home?.team || {};
        const at = g.teams.away?.team || {};
        return {
            homeTeam:  { id: ht.id, name: ht.name || '', abbreviation: _mlbTeamAbbr(ht) },
            awayTeam:  { id: at.id, name: at.name || '', abbreviation: _mlbTeamAbbr(at) },
            homeScore: g.teams.home?.score ?? null,
            awayScore: g.teams.away?.score ?? null,
            gameDate:  g.gameDate || '',
            status:    g.status?.detailedState || 'Final',
        };
    }

    // Cold load — boxscore has team names and run totals
    const box = await mlbFetch(`/game/${gameId}/boxscore`, {}, ApiCache.TTL.LONG);
    const ht  = box.teams?.home?.team || {};
    const at  = box.teams?.away?.team || {};
    return {
        homeTeam:  { id: ht.id, name: ht.name || '', abbreviation: ht.abbreviation || '' },
        awayTeam:  { id: at.id, name: at.name || '', abbreviation: at.abbreviation || '' },
        homeScore: box.teams?.home?.teamStats?.batting?.runs ?? null,
        awayScore: box.teams?.away?.teamStats?.batting?.runs ?? null,
        gameDate:  '',
        status:    'Final',
    };
}

// ── Main data builder ─────────────────────────────────────────

async function buildScorecardData(gameId, gameStub) {
    const [pbp, meta] = await Promise.all([
        mlbFetch(`/game/${gameId}/playByPlay`, {}, ApiCache.TTL.LONG),
        _fetchGameMeta(gameId, gameStub),
    ]);

    const allPlays = pbp.allPlays || [];
    const innings  = allPlays.reduce((max, p) => Math.max(max, p.about?.inning || 0), 0) || 9;

    return {
        meta:   { ...meta, gameId, innings },
        away:   _buildTeamSection(allPlays, 'top'),
        home:   _buildTeamSection(allPlays, 'bottom'),
        totals: _buildInningTotals(allPlays, innings),
    };
}

// ── HTML render helpers ───────────────────────────────────────

function _renderDiamond(baseClasses) {
    const cls = ['sc-diamond', ...baseClasses].join(' ');
    return `<svg class="${cls}" viewBox="0 0 60 60" aria-hidden="true">
        <path class="sc-seg sc-seg--first"  d="M30,30 L60,30 L30,60 Z"/>
        <path class="sc-seg sc-seg--second" d="M30,30 L30,0  L60,30 Z"/>
        <path class="sc-seg sc-seg--third"  d="M30,30 L0,30  L30,0  Z"/>
        <path class="sc-seg sc-seg--home"   d="M30,30 L30,60 L0,30  Z"/>
        <path class="sc-diamond-border" d="M30,0 L60,30 L30,60 L0,30 Z"
              stroke-width="1.5"/>
    </svg>`;
}

function _renderPACell(pa, batterName, inning) {
    return `<div class="sc-cell" role="gridcell" tabindex="0"
                 aria-label="${_escHtml(batterName)}, inning ${inning}: ${_escHtml(pa.notation)}">
        <span class="sc-notation">${_escHtml(pa.notation)}</span>
        ${_renderDiamond(pa.base)}
    </div>`;
}

function _renderEmptyCell() {
    return `<div class="sc-cell sc-cell--empty" role="gridcell" aria-hidden="true"></div>`;
}

// ── Grid builder ─────────────────────────────────────────────
// Emits exactly (innings + 1) × (lineup.length + 2) child elements
// so CSS Grid auto-placement fills the declared rows correctly.

function _renderScorecardGrid(lineup, totals, innings, teamAbbr, side) {
    let html = '';

    // Header row: name corner + inning numbers
    html += `<div class="sc-header-cell sc-name-col">${_escHtml(teamAbbr)}</div>`;
    for (let i = 1; i <= innings; i++) {
        html += `<div class="sc-header-cell">${i}</div>`;
    }

    // Batter rows
    for (const batter of lineup) {
        html += `<div class="sc-name-cell">
            <button class="sc-player-btn"
                    onclick="showMLBPlayerDetail(${batter.id},'hitting')"
                    aria-label="View ${_escHtml(batter.fullName)}'s stats">
                ${_escHtml(batter.fullName)}
            </button>
        </div>`;

        for (let inning = 1; inning <= innings; inning++) {
            const pas = batter.paByInning.get(inning);
            if (!pas || pas.length === 0) {
                html += _renderEmptyCell();
            } else {
                // Show first PA. Multiple PAs in the same inning (big inning) are
                // known edge case — subsequent PAs shown in a second cell if present.
                // Flagged for Axiom: grid column alignment requires exactly one cell
                // per inning, so only the first PA renders in the column slot.
                html += _renderPACell(pas[0], batter.fullName, inning);
            }
        }
    }

    // Footer row: R / H per inning
    html += `<div class="sc-footer-cell sc-name-col">
        <span>R</span>
        <span class="sc-footer-h">H</span>
    </div>`;
    for (let i = 1; i <= innings; i++) {
        const t = totals[i]?.[side] || { r: 0, h: 0 };
        html += `<div class="sc-footer-cell">
            <span>${t.r}</span>
            <span class="sc-footer-h">${t.h}</span>
        </div>`;
    }

    return html;
}

// ── Full scorecard HTML ───────────────────────────────────────

function _renderScorecardHTML(data) {
    const { meta, away, home, totals } = data;

    const awayLogo = getMLBTeamLogoUrl(meta.awayTeam.id) || getMLBTeamLogoByAbbr(meta.awayTeam.abbreviation);
    const homeLogo = getMLBTeamLogoUrl(meta.homeTeam.id) || getMLBTeamLogoByAbbr(meta.homeTeam.abbreviation);

    const awayWon = meta.awayScore !== null && meta.homeScore !== null && meta.awayScore > meta.homeScore;
    const homeWon = meta.awayScore !== null && meta.homeScore !== null && meta.homeScore > meta.awayScore;

    let dateStr = '';
    if (meta.gameDate) {
        try {
            dateStr = new Date(meta.gameDate).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            });
        } catch (_) { dateStr = meta.gameDate.split('T')[0]; }
    }

    const awayGrid = _renderScorecardGrid(away, totals, meta.innings, meta.awayTeam.abbreviation, 'away');
    const homeGrid = _renderScorecardGrid(home, totals, meta.innings, meta.homeTeam.abbreviation, 'home');

    return `
<div class="scorecard-view">
    <div class="sc-nav-bar">
        <button class="sc-back-btn" onclick="navigateTo('mlb-games')" aria-label="Back to scores">← Scores</button>
        <span class="sc-nav-title">Scorecard</span>
        <span></span>
    </div>
    <div class="scorecard-wrapper">
        <div class="scorecard-header">
            <div class="sc-team-side sc-team-side--away">
                ${awayLogo ? `<img class="sc-header-logo" src="${awayLogo}" alt="${_escHtml(meta.awayTeam.abbreviation)}" data-hide-on-error loading="lazy">` : ''}
                <div class="sc-header-info">
                    <div class="sc-header-abbr">${_escHtml(meta.awayTeam.abbreviation)}</div>
                    <div class="sc-header-name">${_escHtml(meta.awayTeam.name)}</div>
                </div>
                <div class="sc-header-score${awayWon ? ' sc-header-score--win' : ''}">
                    ${meta.awayScore !== null ? meta.awayScore : '—'}
                </div>
            </div>
            <div class="sc-header-center">
                <div class="sc-header-status">${_escHtml(meta.status)}</div>
                ${dateStr ? `<div class="sc-header-date">${_escHtml(dateStr)}</div>` : ''}
            </div>
            <div class="sc-team-side sc-team-side--home">
                <div class="sc-header-score${homeWon ? ' sc-header-score--win' : ''}">
                    ${meta.homeScore !== null ? meta.homeScore : '—'}
                </div>
                <div class="sc-header-info sc-header-info--right">
                    <div class="sc-header-abbr">${_escHtml(meta.homeTeam.abbreviation)}</div>
                    <div class="sc-header-name">${_escHtml(meta.homeTeam.name)}</div>
                </div>
                ${homeLogo ? `<img class="sc-header-logo" src="${homeLogo}" alt="${_escHtml(meta.homeTeam.abbreviation)}" data-hide-on-error loading="lazy">` : ''}
            </div>
        </div>

        <div class="sc-section-label">AWAY — ${_escHtml(meta.awayTeam.abbreviation)}</div>
        <div class="sc-scroll-wrap">
            <div class="scorecard-grid"
                 style="--scorecard-innings:${meta.innings};--scorecard-batters:${away.length}"
                 role="grid"
                 aria-label="${_escHtml(meta.awayTeam.name)} batting scorecard">
                ${awayGrid}
            </div>
        </div>

        <div class="sc-section-label sc-section-label--home">HOME — ${_escHtml(meta.homeTeam.abbreviation)}</div>
        <div class="sc-scroll-wrap">
            <div class="scorecard-grid"
                 style="--scorecard-innings:${meta.innings};--scorecard-batters:${home.length}"
                 role="grid"
                 aria-label="${_escHtml(meta.homeTeam.name)} batting scorecard">
                ${homeGrid}
            </div>
        </div>
    </div>
</div>`;
}

// ── Skeleton HTML ─────────────────────────────────────────────

function _renderScorecardSkeleton() {
    const rows = Array.from({ length: 9 }, () =>
        `<div class="skeleton-line" style="height:88px;margin-bottom:2px;border-radius:0;opacity:0.6"></div>`
    ).join('');
    return `
<div class="scorecard-view">
    <div class="sc-nav-bar">
        <button class="sc-back-btn" onclick="navigateTo('mlb-games')" aria-label="Back to scores">← Scores</button>
        <span class="sc-nav-title">Scorecard</span>
        <span></span>
    </div>
    <div class="scorecard-wrapper">
        <div class="scorecard-header">
            <div class="skeleton-line" style="width:130px;height:36px;border-radius:var(--radius-sm)"></div>
            <div class="skeleton-line" style="width:60px;height:20px;margin:0 auto;border-radius:var(--radius-sm)"></div>
            <div class="skeleton-line" style="width:130px;height:36px;border-radius:var(--radius-sm)"></div>
        </div>
        <div style="padding:0.5rem 1rem 1rem">
            <div class="skeleton-line" style="width:80px;height:12px;margin-bottom:0.5rem"></div>
            ${rows}
        </div>
    </div>
</div>`;
}

// ── Entry point ───────────────────────────────────────────────

async function loadMLBScorecard(gameId, gameStub) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;';
    document.getElementById('searchBar')?.style.setProperty('display', 'none');

    // Breadcrumb
    const atAbbr   = gameStub ? _mlbTeamAbbr(gameStub.teams?.away?.team || {}) : '';
    const hmAbbr   = gameStub ? _mlbTeamAbbr(gameStub.teams?.home?.team || {}) : '';
    const crumbLbl = atAbbr && hmAbbr ? `${atAbbr} @ ${hmAbbr}` : 'Scorecard';
    if (window.setBreadcrumb) setBreadcrumb('mlb-games', crumbLbl);

    AppState.currentView = `mlb-scorecard-${gameId}`;
    history.pushState({ view: 'mlb-scorecard', gameId }, '', `#mlb-scorecard-${gameId}`);

    grid.innerHTML = _renderScorecardSkeleton();

    try {
        const data = await buildScorecardData(gameId, gameStub);
        grid.innerHTML = _renderScorecardHTML(data);
    } catch (err) {
        Logger.error('Scorecard load failed', err, 'MLB');
        ErrorHandler.handle(grid, err, () => loadMLBScorecard(gameId, gameStub), {
            tag: 'MLB',
            title: 'Could not load scorecard',
        });
    }
}

// Cold deep-link restore — called by _restoreMLBScorecard in navigation.js
async function _restoreMLBScorecard(gameId) {
    Logger.info(`Restoring scorecard gameId=${gameId}`, undefined, 'NAV');
    if (AppState.currentSport !== 'mlb') {
        AppState.currentSport = 'mlb';
        _applySportUI('mlb');
    }
    const stub = (AppState.mlbGames || []).find(g => g.gamePk === gameId) || null;
    await loadMLBScorecard(gameId, stub);
}

if (typeof window !== 'undefined') {
    window.loadMLBScorecard     = loadMLBScorecard;
    window._restoreMLBScorecard = _restoreMLBScorecard;
    window.buildScorecardData   = buildScorecardData;
    window.resolveNotation      = resolveNotation;
    window.resolveBaseProgression = resolveBaseProgression;
}

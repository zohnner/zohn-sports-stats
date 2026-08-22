// ============================================================
// NCAA Football Live Game viewer — Phase 1 skeleton (2026-08-22).
// Clones the NFL live game viewer's data source and architecture
// (js/nflLiveGame.js, D-030/D-080) at a deliberately smaller scope: a
// score header + game-info panel, not the full six-tab production
// build. See the scope note below for exactly what's deferred and why.
//
// Data: ESPN college-football summary via /api/ncaaf?path=/summary
// (functions/api/ncaaf.js — /summary was already allowlisted with a
// 20s live-game TTL when this file was written, cloned from nfl.js's
// allowlist at D-042 time but never consumed by any frontend code
// until now).
//
// SCOPE NOTE — what this file does NOT do yet, and why:
// NFL's own live game viewer (D-080) named an open risk before Finn
// built its Play-by-Play tab: whether ESPN's /summary response
// actually carries a populated drives/plays array couldn't be
// confirmed without a live in-progress game to check against. The
// same risk applies here, unconfirmed in the other direction — as of
// 2026-08-22 the NCAAF season has not started (earliest scheduled
// game: Aug 29, SJSU @ USC; live-checked against the real /scoreboard
// and /summary endpoints this session, not assumed), so there is no
// live-in-progress NCAAF game available to verify drives/plays/
// scoringPlays against. Building a Play-by-Play/Box Score/live
// situation tab on an unverified assumption would repeat exactly the
// mistake this project's own house rules exist to prevent. This file
// ships the header + game-info panel (confirmed live, pregame, against
// event 401864494) and an honest "not yet" placeholder in place of
// the deeper tabs, matching the "absent degrades to nothing, never a
// placeholder shell" convention — except here the omission itself
// says why, rather than silently showing nothing. Revisit once a real
// NCAAF game is live (kickoff week, Aug 29+) and /summary can be
// checked against real in-progress data the way D-105/D-106 checked
// NFL's.
// ============================================================

const _nclg = { eventId: null, timer: null, lastData: null };

async function fetchNCAAFSummary(eventId) {
    const r = await espnNCAAFFetch('/summary', { event: eventId }, ApiCache.TTL.SHORT);
    return r;
}

function _nclgStop() {
    if (_nclg.timer) { clearInterval(_nclg.timer); _nclg.timer = null; }
}

async function showNCAAFGame(eventId) {
    _nclgStop();
    _nclg.eventId = eventId;
    _nclg.lastData = null;
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    // See D-080/js/nflLiveGame.js's own comment on why a view-render
    // function must set AppState.currentView itself rather than trust
    // navigateTo() already did — same reason applies to the poll guard
    // below.
    AppState.currentView = 'ncaaf-game-' + eventId;
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    // navigateTo() unconditionally resets #playersGrid's className to
    // 'players-grid' for every non-home view before this runs — leaving
    // that in place would crush this page's own layout exactly the way
    // it crushed Highlight Card Studio's (found + fixed the same day
    // this file was written, see ISSUES.md). Reset it here, up front.
    grid.className = 'player-detail-container';
    grid.style.cssText = '';
    grid.innerHTML = `<div class="nlg-loading"><div class="skeleton-line" style="height:48px;width:60%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Loading game…</p></div>`;
    try {
        const data = await fetchNCAAFSummary(eventId);
        _nclgRender(data);
        _nclgMaybePoll(data);
    } catch (err) {
        if (window.ErrorHandler && ErrorHandler.handle) {
            ErrorHandler.handle(grid, err, () => showNCAAFGame(eventId), { tag: 'NCAAF', title: 'Failed to Load Game' });
        } else {
            grid.innerHTML = `<div class="nlg-empty"><p>Couldn't load this game.</p><button class="md-btn" onclick="navigateTo('ncaaf-scores')">Back to scores</button></div>`;
        }
        if (window.Logger) Logger.warn('ncaaf summary failed', err, 'NCAAF');
    }
}

function _nclgState(data) {
    const c = data?.header?.competitions?.[0];
    return c?.status?.type?.state || 'post';
}

function _nclgComp(data) { return data.header.competitions[0]; }
function _nclgSide(comp, ha) { return (comp.competitors || []).find(c => c.homeAway === ha) || {}; }

// Only the header re-polls right now — the deeper tabs this would
// otherwise refresh don't exist yet (see the file-level scope note).
// Kept to the same 20s cadence functions/api/ncaaf.js's ttlFor('/summary')
// already edge-caches at, matching the NFL viewer's own reasoning
// (polling faster would just re-serve the same cached response).
function _nclgMaybePoll(data) {
    _nclgStop();
    if (_nclgState(data) !== 'in') return;
    _nclg.timer = setInterval(async () => {
        if (AppState.currentView !== 'ncaaf-game-' + _nclg.eventId) { _nclgStop(); return; }
        try {
            const d = await fetchNCAAFSummary(_nclg.eventId);
            _nclgRender(d);
            if (_nclgState(d) !== 'in') _nclgStop();
        } catch (_) { /* keep last render */ }
    }, 20000);
}

function _nclgTeamColor(team) {
    const hex = (team?.color || '').replace('#', '');
    return hex ? `#${hex}` : 'var(--accent)';
}

function _nclgRender(data) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    _nclg.lastData = data;
    const comp = _nclgComp(data);
    const home = _nclgSide(comp, 'home'), away = _nclgSide(comp, 'away');
    const homeAbbr = home.team?.abbreviation || '';
    const awayAbbr = away.team?.abbreviation || '';
    if (window.setBreadcrumb && homeAbbr && awayAbbr) setBreadcrumb('ncaaf-scores', `${awayAbbr} @ ${homeAbbr}`);

    const st = comp.status?.type || {};
    const state = st.state || 'post';
    const live = state === 'in';
    const statusText = st.shortDetail || st.detail || (state === 'pre' ? 'Scheduled' : 'Final');

    const teamBlock = (c, align) => {
        const t = c.team || {};
        const logo = t.logos?.[0]?.href || '';
        const rec = c.records?.[0]?.summary || '';
        const rank = c.curatedRank?.current && c.curatedRank.current <= 25 ? c.curatedRank.current : null;
        const won = state === 'post' && c.winner;
        return `<div class="nlg-team nlg-team--${align}" style="--tc:${_nclgTeamColor(t)}">
            <img src="${_escHtml(logo)}" alt="" data-hide-on-error>
            <span class="nlg-team-abbr">${rank ? `#${rank} ` : ''}${_escHtml(t.abbreviation || '')}</span>
            <span class="nlg-team-name">${_escHtml(t.shortDisplayName || t.name || '')}</span>
            ${rec ? `<span class="nlg-team-rec">${_escHtml(rec)}</span>` : ''}
            <span class="nlg-team-score ${won ? 'nlg-team-score--win' : ''}">${c.score != null ? c.score : ''}</span>
        </div>`;
    };

    const gameInfo = data.gameInfo || {};
    const venue = gameInfo.venue?.fullName ? `${gameInfo.venue.fullName}${gameInfo.venue.address?.city ? ` — ${gameInfo.venue.address.city}${gameInfo.venue.address.state ? ', ' + gameInfo.venue.address.state : ''}` : ''}` : '';
    const broadcast = data.broadcasts?.[0]?.media?.shortName || data.broadcasts?.[0]?.names?.[0] || '';
    // Reuses the existing cross-sport bio-chip component (detailFrame.js's
    // own pattern, css/components.css .player-bio-grid/.player-bio-item) —
    // this is a skeleton, not a place to invent a new card component when
    // an identical one already exists and is already loaded on every page.
    const infoChip = (label, val) => val ? `<div class="player-bio-item"><span class="bio-label">${_escHtml(label)}</span><span class="bio-value">${_escHtml(val)}</span></div>` : '';

    grid.className = 'player-detail-container';
    grid.innerHTML = `
      <div class="nlg-wrap">
        <div class="nlg-topbar">
          <button onclick="navigateTo('ncaaf-scores')" class="back-button">← Scores</button>
        </div>
        <div class="nlg-header">
          <div class="nlg-score ${live ? 'nlg-score--live' : ''}">
            ${teamBlock(away, 'away')}
            <div class="nlg-center">
              <div class="nlg-status ${live ? 'nlg-status--live' : ''}">${_escHtml(statusText)}${live ? ' <span class="nlg-livebadge">● LIVE</span>' : ''}</div>
              <div class="nlg-vs">@</div>
            </div>
            ${teamBlock(home, 'home')}
          </div>
        </div>
        ${(venue || broadcast) ? `<div class="player-bio-grid" style="margin:1rem 0">${infoChip('Venue', venue)}${infoChip('Broadcast', broadcast)}</div>` : ''}
        <div class="nfl-offseason">
          <p class="nfl-offseason-text">Full play-by-play and box score open once we can verify them against a real in-progress game — the college football season hasn't kicked off yet. Check back kickoff week.</p>
        </div>
      </div>`;
}

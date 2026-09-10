// ============================================================
// NFL Live Game viewer (D-030, rebuilt D-080 Phase 1) — production-density game
// dashboard: always-visible score/situation header, a 6-tab body (Summary,
// Play-by-Play, Box Score, Team Stats, Analytics, Fantasy), and a sidebar
// (win probability, game leaders, fantasy leaders, game flow). Data: ESPN
// summary via /api/nfl?path=/summary. Polls every 20s while a game is in
// progress (matches functions/api/nfl.js's ttlFor('/summary') edge-cache TTL
// exactly — polling faster would just re-serve the same cached response).
//
// Update architecture ports MLB's js/liveGame.js pattern (P3-025) rather than
// this file's old one: the previous version fully replaced the page's
// innerHTML on every poll tick, which is incompatible with tabs — it would
// reset the user's active tab and scroll position every 20 seconds. Now only
// the header, sidebar, and the ACTIVE tab's body are touched per poll; the
// wrapper, tab strip, and inactive tab bodies are never re-rendered. Tab
// selection lives in _nlg.activeTab and survives every poll.
//
// Field-shape note (D-080, cleared by D-106): drives.previous[].plays[],
// winprobability[], and leaders[] were live-verified against a real completed
// ESPN NFL summary response before this file was written (2026-08-09, event
// 401873271) — not assumed. winprobability was present and populated (188
// entries, 170 distinct values) for that one game; per D-080 it shipped as
// Phase 2 only once confirmed reliable across multiple games including a
// genuinely live one. That check happened during D-105 (137 real, sensibly
// climbing entries on a real 4th-quarter game) — see _nlgWinProbability below.
// ============================================================

const _nlg = { eventId: null, timer: null, activeTab: 'summary', lastData: null, fantasyScoring: 'PPR', situation: null, lastPlayArrowId: null, lastTimeouts: { home: null, away: null }, lastState: null, fantasyWatchGamePk: null, fantasyWatchHtml: '', fantasyWatchPlayers: null, yourRosterGameId: null, yourRosterPlayers: null, lastDown: null, fvLastPositions: null, fvPendingPositions: null };

const NLG_POLL_MS = 20000;
// Pregame-only cadence (D-1xx): a scheduled game never used to poll at all
// (_nlgMaybePoll only armed for state === 'in'), so a fan sitting on the
// preview page through kickoff never saw it flip live without a manual
// reload. 60s mirrors MLB's own pregame cadence (js/liveGame.js
// LG_PREGAME_MS) -- frequent enough to catch kickoff promptly, far slower
// than the 20s live cadence since nothing else about a scheduled game
// changes between polls.
const NLG_PREGAME_POLL_MS = 60000;

const _NLG_TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'pbp', label: 'Play-by-Play' },
    { id: 'box', label: 'Box Score' },
    { id: 'team', label: 'Team Stats' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'fantasy', label: 'Fantasy' },
];

async function fetchNFLSummary(eventId) {
    const r = await fetch(`/api/nfl?path=/summary&event=${encodeURIComponent(eventId)}`);
    if (!r.ok) throw new Error(`summary ${r.status}`);
    return r.json();
}

function _nlgStop() {
    if (_nlg.timer) { clearInterval(_nlg.timer); _nlg.timer = null; }
}

async function showNFLGame(eventId) {
    _nlgStop();
    const isNewGame = _nlg.eventId !== eventId;
    _nlg.eventId = eventId;
    if (isNewGame) { _nlg.activeTab = 'summary'; _nlg.lastData = null; _nlg.lastTimeouts = { home: null, away: null }; _nlg.lastState = null; _nlg.fantasyWatchGamePk = null; _nlg.fantasyWatchHtml = ''; _nlg.fantasyWatchPlayers = null; _nlg.yourRosterGameId = null; _nlg.yourRosterPlayers = null; _nlg.lastDown = null; _nlg.fvLastPositions = null; _nlg.fvPendingPositions = null; }
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    // Self-set currentView rather than relying on navigateTo() having done it —
    // same D-075 lesson (js/mlb.js's showMLBGameDetail): any view-render function
    // callable outside the router's dispatch must own this, or a caller that
    // bypasses navigateTo() (e.g. the home hero's game-of-the-day click) leaves
    // this stale, and _nlgMaybePoll's own currentView guard immediately self-stops
    // the live poll it just started, thinking the user already navigated away.
    AppState.currentView = 'nfl-game-' + eventId;
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('nfl-games', 'Game');
    if (isNewGame) {
        grid.className = 'player-detail-container'; grid.style.cssText = '';
        grid.innerHTML = `<div class="nlg-loading"><div class="skeleton-line" style="height:48px;width:60%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Loading game…</p></div>`;
    }
    try {
        const data = await fetchNFLSummary(eventId);
        // D-105: fetch the field-viewer's situation data alongside the
        // summary, but only while the game is actually live -- no point
        // hitting /scoreboard for a scheduled or final game, and the field
        // viewer itself only ever renders for a live game anyway.
        _nlg.situation = null;
        if (_nlgState(data) === 'in') {
            try { _nlg.situation = await fetchNFLLiveSituation(eventId); } catch (_) { /* field viewer just omits */ }
        }
        _nlgRender(data);
        _nlgMaybePoll(data);
    } catch (err) {
        if (window.ErrorHandler && ErrorHandler.handle) ErrorHandler.handle(grid, err, () => showNFLGame(eventId), { tag: 'NFL', title: 'Failed to Load Game' });
        else grid.innerHTML = `<div class="nlg-empty"><p>Couldn't load this game.</p><button class="md-btn" onclick="navigateTo('nfl-games')">Back to scores</button></div>`;
        if (window.Logger) Logger.warn('nfl summary failed', err, 'NFL');
    }
}

// Polls at a cadence that depends on the state THIS invocation was armed
// for -- 'pre' games poll slowly just to catch kickoff (see
// NLG_PREGAME_POLL_MS above), 'in' games poll at the real live cadence.
// When a poll observes the state has actually changed (pre -> in, or
// in/pre -> post), it re-arms via a fresh call to this function rather than
// keep ticking at the wrong cadence forever -- each fresh call captures the
// new state in its own closure, so this naturally terminates once state
// reaches 'post' (no further re-arm) rather than recursing indefinitely.
function _nlgMaybePoll(data) {
    const state = _nlgState(data);
    _nlgStop();
    if (state === 'post') return;
    const ms = state === 'pre' ? NLG_PREGAME_POLL_MS : NLG_POLL_MS;
    _nlg.timer = setInterval(async () => {
        if (AppState.currentView !== 'nfl-game-' + _nlg.eventId) { _nlgStop(); return; }
        try {
            const d = await fetchNFLSummary(_nlg.eventId);
            const newState = _nlgState(d);
            if (newState === 'in') {
                try { _nlg.situation = await fetchNFLLiveSituation(_nlg.eventId); } catch (_) { /* keep last situation */ }
            } else {
                _nlg.situation = null;
            }
            _nlgRender(d);
            if (newState === 'post') { _nlgStop(); return; }
            if (newState !== state) _nlgMaybePoll(d);
        } catch (_) { /* keep last render */ }
    }, ms);
}

function _nlgState(data) {
    const c = data && data.header && data.header.competitions && data.header.competitions[0];
    return (c && c.status && c.status.type && c.status.type.state) || 'post';
}

function _nlgComp(data) { return data.header.competitions[0]; }
function _nlgSide(comp, ha) { return (comp.competitors || []).find(c => c.homeAway === ha) || {}; }

// -- Shell + header (always re-rendered; never loses tab/scroll state) ------

function _nlgRender(data) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    _nlg.lastData = data;
    const comp = _nlgComp(data);
    const home = _nlgSide(comp, 'home'), away = _nlgSide(comp, 'away');
    const homeAbbr = (home.team && home.team.abbreviation) || '';
    const awayAbbr = (away.team && away.team.abbreviation) || '';
    if (window.setBreadcrumb && homeAbbr && awayAbbr) setBreadcrumb('nfl-games', `${awayAbbr} @ ${homeAbbr}`);

    const state = _nlgState(data);
    const isFirstRender = grid.className !== 'nlg-shell-mounted';
    if (isFirstRender) {
        grid.className = 'nlg-shell-mounted'; grid.style.cssText = '';
        grid.innerHTML = `
          <div class="nlg-wrap">
            <div class="nlg-topbar">
              <button onclick="navigateTo('nfl-games')" class="back-button">← Scores</button>
              <button type="button" class="hcs-pill" onclick="openNFLHighlightCardForGame('${_escHtml(String(_nlg.eventId))}')">${_iconSvg('film', 13)} Create Highlight Card</button>
            </div>
            <div class="nlg-header"></div>
            <div class="nlg-layout">
              <div class="nlg-main"></div>
              ${_nlgSidebarHtml(data, comp, home, away)}
            </div>
            <p class="pct-caption nlg-venue-caption"></p>
          </div>`;
    } else {
        const sideEl = grid.querySelector('.nlg-side');
        if (sideEl) sideEl.outerHTML = _nlgSidebarHtml(data, comp, home, away);
    }

    _nlgRenderHeader(comp, home, away);
    _nlgRenderMain(data, comp, home, away, state);

    const venue = (data.gameInfo && data.gameInfo.venue && data.gameInfo.venue.fullName) || '';
    const oddsLine = _nlgBroadcastOddsLine(data, state);
    const capParts = [venue, oddsLine].filter(Boolean);
    const capEl = grid.querySelector('.nlg-venue-caption');
    if (capEl) capEl.textContent = capParts.length ? `${capParts.join(' · ')} · data via ESPN` : 'Data via ESPN';
}

// Broadcast network + betting line, folded into the existing venue caption
// rather than a new component — pregame-relevant context a fan checks once,
// not a live-updating surface. Field shapes live-verified 2026-08-09 against
// event 401873271 EXCEPT `broadcasts`, which was an empty array for that game
// (a completed preseason game) — the accessor chain below covers the shapes
// ESPN uses elsewhere in this codebase's other endpoints, but is unverified
// for a populated broadcasts[] and fails silently (omits, never throws) if
// the real shape differs. pickcenter[0].details/overUnder ARE verified
// (DraftKings, "CAR -1.5", 34.5).
// `state` skips the spread/total portion pregame -- _nlgOddsCard now shows
// the same numbers (plus moneyline) as a real card in the pregame preview,
// so repeating them in this tiny footnote right below it would just be
// noise. Live/final games have no such card, so the footnote keeps doing
// its original job there.
function _nlgBroadcastOddsLine(data, state) {
    const parts = [];
    const b = (data.broadcasts && data.broadcasts[0]) || null;
    const bname = b && ((b.media && (b.media.shortName || b.media.callLetters)) || (b.names && b.names[0]) || (b.type && b.type.shortName) || b.name);
    if (bname) parts.push(String(bname));
    if (state !== 'pre') {
        const pc = (data.pickcenter && data.pickcenter[0]) || null;
        if (pc) {
            const line = [];
            if (pc.details) line.push(pc.details);
            if (pc.overUnder != null) line.push(`O/U ${pc.overUnder}`);
            if (line.length) parts.push(line.join(', '));
        }
    }
    return parts.join(' · ');
}

// "Kicks off in 1h 12m" -- see _nlgRenderHeader's call site for why this is
// computed fresh per-render rather than a live-ticking interval. Rounds down
// to the minute (a countdown that's off by up to 60s reads fine; a separate
// seconds-precision timer would not be worth the added complexity here).
function _nlgKickoffCountdown(dateStr) {
    if (!dateStr) return '';
    const diffMs = new Date(dateStr).getTime() - Date.now();
    if (diffMs <= 0) return '';
    const totalMin = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    if (h === 0 && m === 0) return 'Kicks off any moment';
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return `Kicks off in ${parts.join(' ')}`;
}

function _nlgRenderHeader(comp, home, away) {
    const headerEl = document.querySelector('.nlg-header');
    if (!headerEl) return;
    const st = (comp.status && comp.status.type) || {};
    const state = st.state || 'post';
    const live = state === 'in';
    // Kickoff countdown (2026-09-09): pregame previously showed only a
    // static date/time string with no sense of "how soon" -- for a fan
    // sitting on the page in the final stretch before a marquee opener,
    // that's the one number that actually matters. Computed fresh on each
    // render rather than a separate ticking interval: the pregame poll
    // already re-renders this header every 60s (NLG_PREGAME_POLL_MS), so
    // the countdown self-refreshes on that same cadence with zero new
    // timers to create or clean up. Omits itself once kickoff has actually
    // passed (ESPN's own state flip lags a live poll by up to 60s, and a
    // negative countdown reads as broken, not exciting).
    const countdown = state === 'pre' ? _nlgKickoffCountdown(comp.date) : '';
    const statusText = st.shortDetail || st.detail || (state === 'pre' ? 'Scheduled' : 'Final');
    const tc = (abbr) => (typeof getNFLTeamColor === 'function' && getNFLTeamColor(abbr)) || 'var(--accent)';

    const teamBlock = (c, align) => {
        const t = c.team || {};
        const logo = (t.logos && t.logos[0] && t.logos[0].href) || (typeof getNFLTeamLogoUrl === 'function' ? getNFLTeamLogoUrl(t.abbreviation) : '');
        const rec = (c.records && c.records[0] && c.records[0].summary) || (Array.isArray(c.record) ? (c.record[0] && c.record[0].summary) : '') || '';
        const won = state === 'post' && c.winner;
        return `<button class="nlg-team nlg-team--${align}" onclick="${_nlgNav(t.abbreviation)}" style="--tc:${tc(t.abbreviation)}">
            <img src="${_escHtml(logo)}" alt="" data-hide-on-error>
            <span class="nlg-team-abbr">${_escHtml(t.abbreviation || '')}</span>
            <span class="nlg-team-name">${_escHtml(t.shortDisplayName || t.name || '')}</span>
            ${rec ? `<span class="nlg-team-rec">${_escHtml(rec)}</span>` : ''}
            <span class="nlg-team-score ${won ? 'nlg-team-score--win' : ''}">${c.score != null ? c.score : ''}</span>
        </button>`;
    };

    // D-105: situation now comes from _nlg.situation (a separate fetch
    // against /scoreboard -- see fetchNFLLiveSituation in js/nfl.js), NOT
    // comp.situation. comp here is /summary's header.competitions[0], which
    // live-verification confirmed NEVER carries a situation field -- this
    // line was silent dead code before this fix (the `&& comp.situation`
    // check was always falsy, so .nlg-situation never rendered for any live
    // game, ever). Filed as a pre-existing bug fixed in the same pass; see
    // ISSUES.md.
    const sit = live ? _nlg.situation?.situation : null;

    // Field viewer only renders when we have real numeric position data AND
    // possession resolves to one of the two teams in this game -- absent
    // (not defaulted/guessed) otherwise, same "absent degrades to nothing"
    // rule the rest of this file follows for situation/leaders/etc. Computed
    // before sitLine below (moved up, was after) so sitLine can name the
    // possessing team in plain English instead of ESPN's raw "SEA 21".
    const homeTeamId = _nlg.situation?.homeTeamId, awayTeamId = _nlg.situation?.awayTeamId;
    const possResolves = sit?.possession && (String(sit.possession) === String(homeTeamId) || String(sit.possession) === String(awayTeamId));
    const sitPossTeamName = possResolves
        ? (String(sit.possession) === String(homeTeamId) ? (home?.team?.shortDisplayName || home?.team?.name) : (away?.team?.shortDisplayName || away?.team?.name))
        : null;
    const fieldHtml = sit && typeof sit.down === 'number' && sit.down >= 1 && typeof sit.yardLine === 'number' && possResolves
        ? _nlgFieldViewerHtml(sit, homeTeamId, awayTeamId, home, away, tc)
        : '';
    // D-1xx (2026-09-09): live-verified with a synthetic-but-real live
    // situation that this bar was rendering directly under the field
    // viewer showing the exact same possession + down/distance the field
    // viewer's own .fv-topline had just shown a few pixels above it --
    // pure duplication, no new information, just wasted vertical space.
    // When the field viewer is present, this bar now carries only what it
    // doesn't already show (Last Play), and disappears entirely if there's
    // no last-play text either. Without a field viewer (missing yardLine/
    // down data -- the only place this info appears at all), it keeps its
    // original full content.
    const sitLine = sit
        ? (fieldHtml
            ? (sit.lastPlay && sit.lastPlay.text
                ? `<div class="nlg-situation"><span class="nlg-lastplay">${_escHtml(sit.lastPlay.text)}</span></div>`
                : '')
            : `<div class="nlg-situation">
                 ${sitPossTeamName ? `<span class="nlg-poss">${_iconSvg('football', 12)} ${_escHtml(sitPossTeamName)} ball</span>` : (sit.possessionText ? `<span class="nlg-poss">${_iconSvg('football', 12)} ${_escHtml(sit.possessionText)}</span>` : '')}
                 ${sit.downDistanceText ? `<span class="nlg-dd">${_escHtml(sit.downDistanceText)}</span>` : ''}
                 ${sit.lastPlay && sit.lastPlay.text ? `<span class="nlg-lastplay">${_escHtml(sit.lastPlay.text)}</span>` : ''}
               </div>`)
        : '';

    headerEl.innerHTML = `
        <div class="nlg-score ${live ? 'nlg-score--live' : ''}">
          ${teamBlock(away, 'away')}
          <div class="nlg-center">
            <div class="nlg-status ${live ? 'nlg-status--live' : ''}">${_escHtml(statusText)}${live ? ' <span class="nlg-livebadge">● LIVE</span>' : ''}</div>
            ${countdown ? `<div class="nlg-countdown">${_escHtml(countdown)}</div>` : ''}
            <div class="nlg-vs">@</div>
          </div>
          ${teamBlock(home, 'home')}
        </div>
        ${fieldHtml}
        ${sitLine}`;
    if (fieldHtml) _nlgAnimateFieldMotion();
}

// D-105/Phase-1 field redesign: ESPN Gamecast-style live field position
// graphic (concept approved 2026-08-16, see DECISIONS.md D-105; visual
// rebuild + orientation fix 2026-08-24, see D-1xx). Away renders on the
// field's left edge and home on the right -- this now genuinely matches
// the score header immediately above it (_nlgRenderHeader renders
// teamBlock(away) then teamBlock(home): away-left, home-right). An
// earlier version of this function put home on the left instead, and its
// own comment claimed that matched the header -- it didn't. Live-verified
// against the real SEA@TEN game 2026-08-24: SEA (away) sat left in the
// score card above but right in the field bar below it. Fixed here by
// leaving the underlying yardLine math untouched (0 = home's own goal,
// 100 = away's own goal -- still what every comment below refers to) and
// only mirroring the DISPLAY position via disp(v) = 100 - v, since
// yardLine 100 (away's goal) now sits at the visual left edge and
// yardLine 0 (home's goal) at the visual right edge.
// Shared perspective-projection constants/helpers (D-1xx, 2026-09-09) --
// hoisted to module scope, not a per-call closure inside
// _nlgFieldViewerHtml, so _nlgAnimateFieldMotion (below) can compute the
// SAME screen coordinates for a "previous" situation without duplicating
// the math or re-running the whole HTML builder just to get a point.
const _FV = (() => {
    const VB_W = 1000, VB_H = 400;
    const BOTTOM_Y = 378, TOP_Y = 150;
    const BOTTOM_HALF_W = 486, TOP_HALF_W = 284;
    const CENTER_X = VB_W / 2;
    const halfWAt = (yF) => BOTTOM_HALF_W + (TOP_HALF_W - BOTTOM_HALF_W) * yF;
    const yAt = (yF) => BOTTOM_Y + (TOP_Y - BOTTOM_Y) * yF;
    const proj = (xF, yF) => {
        const xNorm = (xF + 10) / 120;
        const hw = halfWAt(yF);
        return { x: CENTER_X - hw + xNorm * hw * 2, y: yAt(yF) };
    };
    const scaleAt = (yF) => halfWAt(yF) / BOTTOM_HALF_W;
    return { VB_W, VB_H, BOTTOM_Y, TOP_Y, BOTTOM_HALF_W, TOP_HALF_W, CENTER_X, halfWAt, yAt, proj, scaleAt };
})();

// Glides the ball marker and the scrimmage/first-down lines from wherever
// they were on the LAST render to wherever they are now, instead of the
// silent teleport an innerHTML replace produces by default (this file
// rebuilds the whole header markup fresh on every poll -- see
// _nlgRenderHeader -- so a plain CSS transition never fires: there is no
// persisted element carrying an old value into the new one). Matches the
// broadcast convention researched for this feature (the yellow line and
// ball spot visibly slide into place, they never just cut) and this file's
// own established "motion marks a real change, never a first paint" rule
// (see the play-arrow entrance and timeout-dot flash elsewhere in this
// file). Skips entirely under prefers-reduced-motion or when there is no
// remembered previous value (first paint / game switch) to animate from.
// Called once, right after headerEl.innerHTML mounts the fresh SVG.
//
// Animates a <g> wrapper's `transform` rather than a <line>'s raw x1/y1/x2/
// y2 attributes -- `transform` is universally WAAPI-animatable on SVG
// elements, while cross-browser support for animating SVG geometry
// attributes as CSS/WAAPI properties is inconsistent. The scrimmage/first-
// down lines are wrapped in a <g id="..."> at their FINAL (correct) position
// in the static markup; the "from" keyframe offsets that group back to
// where the near-sideline (bottom) end of the line used to sit via
// translateX, and animates to translateX(0) -- a good-enough approximation
// (the true perspective delta differs slightly between the near and far
// endpoint) that looks like a clean slide without needing per-attribute
// animation support.
function _nlgAnimateFieldMotion() {
    const from = _nlg.fvLastPositions;
    const to = _nlg.fvPendingPositions;
    _nlg.fvLastPositions = to || null;
    if (!from || !to) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const svg = document.querySelector('.fv-field3d-svg');
    if (!svg) return;
    try {
        const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'; // ease-out, matches this file's other entrance motion
        const DUR = 420;
        const slideGroup = (id, fromX, toX) => {
            const el = svg.querySelector('#' + id);
            if (!el || fromX === toX) return;
            el.animate([
                { transform: `translateX(${(fromX - toX).toFixed(1)}px)` },
                { transform: 'translateX(0px)' },
            ], { duration: DUR, easing: EASE, fill: 'both' });
        };
        slideGroup('fvScrimLine', from.scrimBottomX, to.scrimBottomX);
        slideGroup('fvFirstDownLine', from.fdBottomX, to.fdBottomX);
        const ballEl = svg.querySelector('#fvBallG');
        if (ballEl && (from.ball.x !== to.ball.x || from.ball.y !== to.ball.y)) {
            ballEl.animate([
                { transform: `translate(${(from.ball.x - to.ball.x).toFixed(1)}px,${(from.ball.y - to.ball.y).toFixed(1)}px) scale(${to.ballScale})` },
                { transform: `translate(0px,0px) scale(${to.ballScale})` },
            ], { duration: DUR, easing: EASE, fill: 'both' });
        }
    } catch (e) { if (window.Logger) Logger.warn('field motion animate failed', e, 'NFL'); }
}

function _nlgFieldViewerHtml(sit, homeTeamId, awayTeamId, home, away, tc) {
    const homeAbbr = home?.team?.abbreviation || '';
    const awayAbbr = away?.team?.abbreviation || '';
    const possHome = String(sit.possession) === String(homeTeamId);
    const disp = (v) => 100 - v;
    // Logos for the endzones/possession marker/center-field mark — same lookup
    // order teamBlock() in _nlgRenderHeader already uses (ESPN's own logos[0]
    // first, getNFLTeamLogoUrl as fallback), not a new source.
    const logoFor = (t) => (t?.team?.logos && t.team.logos[0] && t.team.logos[0].href) || (typeof getNFLTeamLogoUrl === 'function' ? getNFLTeamLogoUrl(t?.team?.abbreviation) : '') || '';
    const homeLogo = logoFor(home), awayLogo = logoFor(away);
    const possLogo = possHome ? homeLogo : awayLogo;
    // Plain-English possession label -- a viewer who does not already know
    // scorebug conventions cannot read "SEA 21" (ESPNs raw possessionText,
    // just a field location) as "Seahawks have the ball". Named explicitly
    // here instead, using the same team objects already in scope; falls
    // back to the raw ESPN string only if it somehow does not resolve.
    const possTeamName = (possHome ? (home?.team?.shortDisplayName || home?.team?.name) : (away?.team?.shortDisplayName || away?.team?.name)) || "";

    // yardLine is anchored to the HOME team's own goal line -- 0 = home's
    // goal, 100 = away's goal -- regardless of which team currently has
    // the ball. Live-verified against TWO real possession states on the
    // same live game (2026-08-16): home (BAL) on offense at yardLine 58
    // ("BAL 58", past their own midfield -- fine either way this is read)
    // and, critically, away (PHI) on offense at yardLine 19 with
    // downDistanceText "1st & Goal at BAL 19" (deep in BAL's own
    // territory). Only a fixed home-anchored scale explains both; an
    // offense-relative reading (this function's first draft) would put
    // PHI's 1st-and-goal snap only 19 yards past PHI's own goal --
    // nowhere near BAL's end zone. The first draft's `100 - yardLine` flip
    // for an away possession put the ball marker on the wrong side of the
    // field; caught by live-testing both possession states, not just one,
    // and confirmed by zooming the actual rendered marker position before
    // shipping. disp() below is a SEPARATE, later mirroring step for
    // display only -- it does not change this paragraph's math.
    const ballPct = sit.yardLine;
    // First-down line: the offense drives toward the DEFENSE's goal, so the
    // direction depends on who has the ball -- home drives toward 100, away
    // drives toward 0. Clamped at the goal line for goal-to-go situations
    // (verified: a real "1st & Goal at BAL 19", distance 19, computes to
    // exactly yardLine 0 -- the goal line itself, not over/undershooting).
    const firstDownPct = possHome
        ? Math.min(100, sit.yardLine + (sit.distance || 0))
        : Math.max(0, sit.yardLine - (sit.distance || 0));
    const possColor = possHome ? tc(homeAbbr) : tc(awayAbbr);
    const homeColor = tc(homeAbbr), awayColor = tc(awayAbbr);

    // Red zone = offense within the DEFENSE's own 20 -- yardLine 80-100
    // when home has the ball (driving toward away's goal), 0-20 when away
    // does (driving toward home's goal). Still expressed in yardLine space
    // here; disp() converts the [rzLeft,rzRight] pair into display-space.
    const rzLeft = possHome ? 80 : 0;
    const rzRight = possHome ? 100 : 20;

    // Timeout dots flash red-then-fade when a team's count drops from what
    // the previous render showed, so a burned timeout reads as an event the
    // user can see happen, not a silent disappearance -- same "motion marks
    // a real change, never a first paint" rule as the play arrows above
    // (_nlg.lastTimeouts tracks each team's prior count between renders).
    const toDots = (n, team) => {
        const prev = _nlg.lastTimeouts[team];
        const usedIdx = (typeof n === 'number' && typeof prev === 'number' && n < prev) ? n : -1;
        if (typeof n === 'number') _nlg.lastTimeouts[team] = n;
        return Array.from({ length: 3 }, (_, i) =>
            `<div class="fv-to-dot${i < (n ?? 3) ? ' fv-to-dot--on' : ''}${i === usedIdx ? ' fv-to-dot--used' : ''}"></div>`).join('');
    };

    // ---- Real perspective, not a CSS rotateX guess (D-1xx, 2026-09-09) ----
    // A prior attempt tilted the whole .fv-field box with rotateX+perspective
    // and left the turf/lines as a flat painted background. Live-measured
    // (getBoundingClientRect on real screenshots, at both 22deg and an
    // exaggerated 55deg): the browser DOES perspective-warp the box's own
    // vector edges, but never the background-image content inside it -- the
    // yard stripes stayed perfectly parallel at any angle while only the
    // endzone edges kept slanting, reading as broken rather than 3D. Instead
    // of relying on the browser to warp painted content, every element below
    // is drawn as real SVG geometry at coordinates WE project by hand, so
    // convergence is a fact about the coordinates, not a hope about how some
    // browser's compositor treats a texture.
    //
    // xField is the same 0-100 "display space" disp() already produces (away
    // goal = 0, home goal = 100, endzones extend to -10/110). yField is 0
    // (near sideline, bottom of frame, largest) to 1 (far sideline, top,
    // smallest) -- this is NOT a real lateral ball position (ESPN's feed
    // carries no hash-mark data), so every on-field marker sits at yField 0.5
    // rather than claiming a position we don't actually have.
    const { VB_W, VB_H, proj, scaleAt } = _FV;
    const pt = (xF, yF) => { const p = proj(xF, yF); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; };

    const fieldOutline = [proj(-10, 0), proj(110, 0), proj(110, 1), proj(-10, 1)].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Sideline boundary -- a real field has a solid painted white line at
    // each sideline; ours just faded into the surrounding dark background
    // with nothing marking where the turf actually ends (reported live,
    // same pass as the midfield-arrow fix). Runs the full endzone-to-endzone
    // length at yField 0 and 1, same style weight as the goal lines.
    const sidelinesHtml = [0, 1].map((yF) => {
        const a = proj(-10, yF), b = proj(110, yF);
        return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(255,255,255,0.85)" stroke-width="3"/>`;
    }).join('');

    // Mow stripes every 5 yards across the 100-yard playing field -- each
    // band is its own quad projected through the SAME function as everything
    // else, so the alternating stripes genuinely narrow toward the horizon
    // instead of just being a flat texture stretched under a tilted box.
    let stripesHtml = '';
    for (let x0 = 0; x0 < 100; x0 += 5) {
        const dark = (x0 / 5) % 2 === 0;
        stripesHtml += `<polygon points="${pt(x0,0)} ${pt(x0+5,0)} ${pt(x0+5,1)} ${pt(x0,1)}" fill="${dark ? '#184f26' : '#1f6f37'}"/>`;
    }

    // Yard lines every 10 yards, full depth -- the lines that actually
    // converge toward the far edge, the entire point of this rebuild.
    let yardLinesHtml = '';
    for (let x = 0; x <= 100; x += 10) {
        const isGoal = x === 0 || x === 100;
        const a = proj(x, 0), b = proj(x, 1);
        yardLinesHtml += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(255,255,255,${isGoal ? 0.85 : 0.45})" stroke-width="${isGoal ? 3 : 1.6}"/>`;
    }
    // 5-yard hash ticks near both sidelines.
    let ticksHtml = '';
    // Real NFL hash marks sit 70'9" apart on a 160'-wide field -- 44.625ft
    // (27.9%) in from each sideline, nowhere near the sideline itself. Was
    // 0.06/0.94 (basically ON the sideline) -- a made-up placeholder value,
    // not a measured one; 0.28/0.72 is the actual number.
    for (let x = 5; x < 100; x += 10) {
        [0.28, 0.72].forEach((yF) => {
            const c = proj(x, yF), s = scaleAt(yF);
            ticksHtml += `<line x1="${(c.x - 5 * s).toFixed(1)}" y1="${c.y.toFixed(1)}" x2="${(c.x + 5 * s).toFixed(1)}" y2="${c.y.toFixed(1)}" stroke="rgba(255,255,255,0.4)" stroke-width="${(2 * s).toFixed(1)}"/>`;
        });
    }
    // Yard number labels, mirrored near-edge (big) and far-edge (small) --
    // the standard "distance from nearest goal" display, replacing the old
    // flat .fv-yardnums row below the field (removed, not shown twice). Each
    // number except midfield gets a small direction chevron pointing at the
    // NEARER goal line (real broadcast/field-paint convention -- e.g. a real
    // "◄ 20"). The 50 has no "nearer" goal -- it's equidistant from both --
    // so real fields show a bare "50" with no arrow; dir was `x < 50 ? -1 :
    // 1`, which fails open to +1 at exactly x===50 instead of "neither",
    // giving midfield a phantom arrow toward the home goal (reported live).
    let numsHtml = '';
    for (let x = 10; x <= 90; x += 10) {
        const num = x <= 50 ? x : 100 - x;
        const dir = x === 50 ? 0 : (x < 50 ? -1 : 1);
        [{ yF: 0.1, size: 34 }, { yF: 0.9, size: 18 }].forEach(({ yF, size }) => {
            const p = proj(x, yF);
            numsHtml += `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" font-family="var(--font-display)" font-weight="800" font-size="${size}" fill="rgba(255,255,255,0.78)" text-anchor="middle" dominant-baseline="middle">${num}</text>`;
            if (dir === 0) return;
            const scale = size / 34, cx = p.x + dir * 24 * scale, chevW = 6 * scale, chevH = 8 * scale;
            numsHtml += `<polygon points="${(cx + dir * chevW).toFixed(1)},${p.y.toFixed(1)} ${(cx - dir * chevW).toFixed(1)},${(p.y - chevH).toFixed(1)} ${(cx - dir * chevW).toFixed(1)},${(p.y + chevH).toFixed(1)}" fill="rgba(255,255,255,0.55)"/>`;
        });
    }
    // End zone pylons -- small, bright, and one of the most immediately
    // recognizable "this is a real NFL field" details for very little
    // drawing effort. Real pylons sit at all 4 corners of each end zone
    // (goal line x back line, both sidelines); drawn as a simple upward
    // triangle in the site's own accent orange, which happens to already
    // match real pylon color. Height is real-world vertical (scales with
    // depth the same way goalposts do), not a ground-plane coordinate.
    const pylon = (xF, yF) => {
        const base = proj(xF, yF), s = scaleAt(yF), h = 14 * s, w = 5 * s;
        return `<polygon points="${(base.x - w).toFixed(1)},${base.y.toFixed(1)} ${(base.x + w).toFixed(1)},${base.y.toFixed(1)} ${base.x.toFixed(1)},${(base.y - h).toFixed(1)}" fill="var(--accent)" stroke="rgba(0,0,0,0.35)" stroke-width="0.6"/>`;
    };
    const pylonsHtml = [0, -10, 100, 110].map((xF) => [0, 1].map((yF) => pylon(xF, yF)).join('')).join('');

    // Endzones: solid team-color quad + the same diagonal hazard hatch the
    // red-zone shading below reuses (established visual language for
    // "scoring territory") + abbreviation, all at the endzone's own
    // projected midpoint so they sit correctly on the tilted plane. Logos
    // are NOT drawn here -- see logoPct()/the HTML <img> overlays below.
    const awayEZPts = [proj(-10, 0), proj(0, 0), proj(0, 1), proj(-10, 1)].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const homeEZPts = [proj(100, 0), proj(110, 0), proj(110, 1), proj(100, 1)].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const ezContent = (x0, x1, ptsStr, color, abbr, clipId) => {
        const c = proj((x0 + x1) / 2, 0.5), s = scaleAt(0.5);
        return `
        <polygon points="${ptsStr}" fill="${color}"/>
        <rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="url(#fvHatch)" clip-path="url(#${clipId})"/>
        <text x="${c.x.toFixed(1)}" y="${(c.y + 34 * s).toFixed(1)}" font-family="var(--font-display)" font-weight="800" font-size="${(15 * s).toFixed(1)}" fill="rgba(255,255,255,0.9)" text-anchor="middle">${_escHtml(abbr)}</text>`;
    };
    // Team logos are real photographic/vector artwork, not simple geometry --
    // drawing them as SVG <image> inside .fv-field3d-svg meant they inherited
    // the SAME non-uniform stretch every yard line/stripe deliberately gets
    // from preserveAspectRatio="none" (that's WHY the trapezoid converges).
    // A logo genuinely warped into an oval is a real, reported bug (D-1xx,
    // 2026-09-09), and nesting another <svg> does NOT fix it -- SVG
    // transforms compose down the tree, so a nested viewport's own
    // preserveAspectRatio decision is made against ITS OWN local width/height
    // numbers, not the final on-screen pixel aspect ratio; it does not
    // shield content from an ancestor's distortion. The only fix that
    // actually holds is keeping logos out of the distorted coordinate space
    // entirely: plain HTML <img> elements positioned by PERCENTAGE over
    // .fv-field3d (a real, undistorted box), sized in real CSS px so they
    // stay circular/square regardless of the field's own aspect ratio.
    const logoPct = (xF, yF) => { const p = proj(xF, yF); return { left: (p.x / VB_W * 100).toFixed(2), top: (p.y / VB_H * 100).toFixed(2) }; };
    const logoImgHtml = (logo, xF, yF, cls) => {
        if (!logo) return '';
        const { left, top } = logoPct(xF, yF);
        return `<img class="${cls}" style="left:${left}%;top:${top}%" src="${_escHtml(logo)}" alt="" data-hide-on-error>`;
    };

    // Goalposts -- the single strongest "this is a real football field" cue,
    // and the reason the flat rebuild never looked like a broadcast graphic.
    // Height is drawn straight UP from a base anchored on the field plane at
    // each back line -- goalpost height isn't a depth coordinate, it's
    // literally vertical, so it scales with the base's yField=0.5 depth but
    // otherwise draws independent of the ground projection above it.
    // Crossbar must be parallel to the back-of-endzone line in the SAME way
    // it is in real life -- both run along the field's width axis at the
    // same length-wise position. Under this linear-trapezoid projection that
    // back line is NOT vertical in screen space (it slants toward center as
    // it recedes, same as every other yard line), so the crossbar has to
    // follow that measured slope rather than assume horizontal -- the
    // previous version drew it dead level, which looked wrong against the
    // visibly slanted endzone edge right next to it. Uprights still rise
    // straight up (real-world vertical), only the crossbar's own angle
    // changes; the support post stays vertical too, same as a real post.
    const goalpost = (xF) => {
        const p0 = proj(xF, 0), p1 = proj(xF, 1);
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const base = proj(xF, 0.5), s = scaleAt(0.5);
        const postH = 105 * s, crossW = 62 * s, uprightH = 70 * s;
        const crossC = { x: base.x, y: base.y - postH };
        const crossL = { x: crossC.x - ux * crossW / 2, y: crossC.y - uy * crossW / 2 };
        const crossR = { x: crossC.x + ux * crossW / 2, y: crossC.y + uy * crossW / 2 };
        const upL = { x: crossL.x, y: crossL.y - uprightH };
        const upR = { x: crossR.x, y: crossR.y - uprightH };
        return `<g stroke="#ffd21f" stroke-width="${(4 * s).toFixed(1)}" fill="none" stroke-linecap="round">
            <line x1="${base.x.toFixed(1)}" y1="${base.y.toFixed(1)}" x2="${crossC.x.toFixed(1)}" y2="${crossC.y.toFixed(1)}"/>
            <line x1="${crossL.x.toFixed(1)}" y1="${crossL.y.toFixed(1)}" x2="${crossR.x.toFixed(1)}" y2="${crossR.y.toFixed(1)}"/>
            <line x1="${crossL.x.toFixed(1)}" y1="${crossL.y.toFixed(1)}" x2="${upL.x.toFixed(1)}" y2="${upL.y.toFixed(1)}"/>
            <line x1="${crossR.x.toFixed(1)}" y1="${crossR.y.toFixed(1)}" x2="${upR.x.toFixed(1)}" y2="${upR.y.toFixed(1)}"/>
        </g>`;
    };

    // Red zone + first-down + scrimmage all drawn as projected geometry too,
    // so they converge with the grid instead of floating over it un-warped.
    // rzLeft/rzRight are in RAW yardLine space (0=home goal, 100=away goal);
    // proj()/disp() work in DISPLAY space (0=away/left, 100=home/right),
    // same as every other on-field marker below. disp() reverses order (it's
    // a straight 100-minus flip), so the raw [rzLeft,rzRight] interval maps
    // to display-space [disp(rzRight), disp(rzLeft)], not [rzLeft,rzRight]
    // unconverted -- that was a real bug (D-1xx, 2026-09-09, reported live):
    // the shading rendered on the mirrored side of the field because this
    // line skipped the same disp() conversion scrimA/fdA below correctly
    // apply, silently reusing raw yardline numbers as if they were already
    // display-space coordinates.
    const rzDispLeft = disp(rzRight), rzDispRight = disp(rzLeft);
    const rzClipPts = sit.isRedZone ? [proj(rzDispLeft, 0), proj(rzDispRight, 0), proj(rzDispRight, 1), proj(rzDispLeft, 1)].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') : '';
    const redZoneHtml = sit.isRedZone
        ? `<polygon points="${rzClipPts}" fill="rgba(229,72,77,0.22)"/><rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="url(#fvHatch)" clip-path="url(#fvRzClip)"/><polygon points="${rzClipPts}" fill="none" stroke="rgba(229,72,77,0.6)" stroke-width="2" stroke-dasharray="6 5"/>`
        : '';
    const scrimA = proj(disp(ballPct), 0), scrimB = proj(disp(ballPct), 1);
    const fdA = proj(disp(firstDownPct), 0), fdB = proj(disp(firstDownPct), 1);
    const ballPt = proj(disp(ballPct), 0.5), ballScale = scaleAt(0.5);
    const arrowSvg = _nlgPlayArrowSvg(sit, proj, disp, 0.5);

    // 4th down: real broadcasts have long recolored the down-marker line on
    // 4th down (yellow -> red) as a plain-sight urgency cue -- researched
    // convention (broadcast graphics history), not invented here. Reuses
    // --color-loss the same way red-zone shading and the arrow's turnover/
    // sack tint already do, so "red on this field" means one consistent
    // thing everywhere rather than a new meaning per element.
    const isDown4 = sit.down === 4;
    // First-down-earned pulse: a NEW set of downs (down resets to 1 from
    // something else) is a real, discrete event worth a one-shot flash --
    // same "motion marks a change the user didn't see happen yet" rule as
    // the timeout-dot flash and play-arrow entrance elsewhere in this file.
    // A CSS animation (not a WAAPI from/to transition) is enough here since
    // it just needs to play once on mount, which fires naturally even
    // though this whole SVG is torn down and rebuilt fresh every poll.
    const firstDownEarned = sit.down === 1 && _nlg.lastDown != null && _nlg.lastDown !== 1;
    _nlg.lastDown = typeof sit.down === 'number' ? sit.down : _nlg.lastDown;

    // Stash this render's positions for _nlgAnimateFieldMotion (called by
    // _nlgRenderHeader right after this HTML is mounted) to compare against
    // next poll's positions and glide the difference instead of teleporting.
    _nlg.fvPendingPositions = { scrimBottomX: scrimA.x, fdBottomX: fdA.x, ball: { x: ballPt.x, y: ballPt.y }, ballScale };

    return `
    <div class="field-viewer">
        <div class="fv-topline">
            <span class="fv-dd">${_escHtml(sit.downDistanceText || sit.shortDownDistanceText || '')}</span>
            <span class="fv-poss">${possLogo ? `<img class="fv-poss-logo" src="${_escHtml(possLogo)}" alt="" data-hide-on-error>` : (possColor ? `<span class="fv-poss-dot" style="background:${possColor}"></span>` : '')}${possTeamName ? _escHtml(possTeamName) + ' ball' : _escHtml(sit.possessionText || '')}</span>
        </div>
        <div class="fv-field3d">
            ${logoImgHtml(homeLogo, 50, 0.5, 'fv-mid-logo')}
            <svg class="fv-field3d-svg" viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <pattern id="fvHatch" width="14" height="14" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                        <rect width="7" height="14" fill="rgba(255,255,255,0.09)"/>
                    </pattern>
                    <clipPath id="fvAwayEZClip"><polygon points="${awayEZPts}"/></clipPath>
                    <clipPath id="fvHomeEZClip"><polygon points="${homeEZPts}"/></clipPath>
                    ${sit.isRedZone ? `<clipPath id="fvRzClip"><polygon points="${rzClipPts}"/></clipPath>` : ''}
                    <linearGradient id="fvBallSheen" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#fff" stop-opacity="0.4"/>
                        <stop offset="45%" stop-color="#fff" stop-opacity="0"/>
                        <stop offset="100%" stop-color="#000" stop-opacity="0.28"/>
                    </linearGradient>
                    <marker id="fvArrowHead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" class="fv-arrow-head"/>
                    </marker>
                </defs>
                <polygon points="${fieldOutline}" fill="#1a5c2c"/>
                ${stripesHtml}
                ${ezContent(-10, 0, awayEZPts, awayColor, awayAbbr, 'fvAwayEZClip')}
                ${ezContent(100, 110, homeEZPts, homeColor, homeAbbr, 'fvHomeEZClip')}
                ${redZoneHtml}
                ${sidelinesHtml}
                ${yardLinesHtml}
                ${ticksHtml}
                ${numsHtml}
                <g id="fvFirstDownLine" class="${firstDownEarned ? 'fv-fd-earned' : ''}">
                    <line x1="${fdA.x.toFixed(1)}" y1="${fdA.y.toFixed(1)}" x2="${fdB.x.toFixed(1)}" y2="${fdB.y.toFixed(1)}" stroke="${isDown4 ? 'var(--color-loss)' : 'var(--color-first-down)'}" stroke-width="3.5" class="${isDown4 ? 'fv-down4-line' : ''}"/>
                </g>
                <g id="fvScrimLine"><line x1="${scrimA.x.toFixed(1)}" y1="${scrimA.y.toFixed(1)}" x2="${scrimB.x.toFixed(1)}" y2="${scrimB.y.toFixed(1)}" stroke="var(--color-scrimmage)" stroke-width="3"/></g>
                ${arrowSvg}
                ${pylonsHtml}
                ${goalpost(-10)}
                ${goalpost(110)}
                <g id="fvBallG">
                <g transform="translate(${ballPt.x.toFixed(1)},${ballPt.y.toFixed(1)}) scale(${ballScale.toFixed(2)})">
                    <ellipse cx="0" cy="0" rx="17" ry="10.5" fill="${possColor}" stroke="var(--bg-card)" stroke-width="2"/>
                    <ellipse cx="0" cy="0" rx="17" ry="10.5" fill="url(#fvBallSheen)"/>
                    <path d="M-11,0 Q0,-8 11,0" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.9"/>
                    <path d="M-11,0 Q0,8 11,0" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.9"/>
                    <line x1="-3.5" y1="0" x2="3.5" y2="0" stroke="#fff" stroke-width="1.1" stroke-opacity="0.9"/>
                    <line x1="-1.5" y1="-2" x2="-1.5" y2="2" stroke="#fff" stroke-width="0.8" stroke-opacity="0.9"/>
                    <line x1="0" y1="-2" x2="0" y2="2" stroke="#fff" stroke-width="0.8" stroke-opacity="0.9"/>
                    <line x1="1.5" y1="-2" x2="1.5" y2="2" stroke="#fff" stroke-width="0.8" stroke-opacity="0.9"/>
                </g>
                </g>
            </svg>
            ${logoImgHtml(awayLogo, -5, 0.5, 'fv-ez-logo')}
            ${logoImgHtml(homeLogo, 105, 0.5, 'fv-ez-logo')}
        </div>
        <div class="fv-legend">
            <div class="fv-timeouts"><span class="fv-to-label">${_escHtml(awayAbbr)} TO</span><div class="fv-to-dots">${toDots(sit.awayTimeouts, 'away')}</div></div>
            <div class="fv-key">
                <span><i style="background:var(--color-scrimmage)"></i>Scrimmage</span>
                ${sit.isRedZone ? `<span><i style="background:var(--color-loss)"></i>Red zone</span>` : `<span><i style="background:var(--color-first-down)"></i>1st down</span>`}
            </div>
            <div class="fv-timeouts"><div class="fv-to-dots">${toDots(sit.homeTimeouts, 'home')}</div><span class="fv-to-label">${_escHtml(homeAbbr)} TO</span></div>
        </div>
    </div>`;
}

// D-105 Phase 2: ESPN-style play arrow -- draws the previous play's
// start->end yardline as a directional path over the turf, styled by play
// type (run/pass/kick/sack/turnover/incomplete). Reads sit.lastPlay, which
// is already flowing through the same /scoreboard situation poll the rest
// of this field viewer reads (fetchNFLLiveSituation, D-105) -- confirmed
// live 2026-08-24 that lastPlay already carries type.text, start.yardLine,
// and end.yardLine on this SAME home-anchored 0-100 scale ballPct/
// firstDownPct use, so no conversion beyond disp() is needed and no new
// fetch was added. Only plays a one-time entrance animation when
// lastPlay.id changes from the previous render (_nlg.lastPlayArrowId) --
// matches this file's existing "motion marks a real change the user
// didn't see happen yet, never a first paint or same-state re-render"
// convention (see the live badge / tab switch code elsewhere in this file).
// Reworked (D-1xx, 2026-09-09) from a standalone viewBox="0 0 100 40" nested
// <svg> into a <g> fragment sharing the main field SVG's projected coordinate
// space -- it now takes proj/disp so the arrow's start/end points land in the
// exact same perspective grid as the yard lines around it, instead of a flat
// 0-100 strip that no longer matches the field's own geometry.
function _nlgPlayArrowSvg(sit, proj, disp, yF) {
    const lp = sit.lastPlay;
    if (!lp || !lp.type || typeof lp.start?.yardLine !== 'number' || typeof lp.end?.yardLine !== 'number') return '';
    const label = (lp.type.text || '').toLowerCase();
    // Administrative entries carry no real field trajectory to draw --
    // skip rather than invent one (this file's "absent degrades to
    // nothing" rule, same one fieldHtml itself already follows above).
    if (/timeout|two-minute|end of|coin toss|kneel|spike/.test(label)) return '';
    if (/penalty/.test(label)) return '';

    const isNew = !!lp.id && lp.id !== _nlg.lastPlayArrowId;
    if (lp.id) _nlg.lastPlayArrowId = lp.id;
    const cls = 'fv-arrow' + (isNew ? ' fv-arrow--entering' : '');
    const p1 = proj(disp(lp.start.yardLine), yF), p2 = proj(disp(lp.end.yardLine), yF);

    // Incomplete pass: start and end yardLine are the same spot (the ball
    // comes back to the line of scrimmage) -- a stationary "no gain"
    // marker, not a zero-length arrow pretending there's a distance.
    if (/incomplet/.test(label)) {
        return `<g class="${cls}" transform="translate(${p1.x.toFixed(1)},${p1.y.toFixed(1)})">
            <circle r="9" class="fv-arrow-badge-ring"/>
            <path d="M-4.2,-4.2 L4.2,4.2 M-4.2,4.2 L4.2,-4.2" class="fv-arrow-badge-x"/>
        </g>`;
    }

    // Apex offsets are deliberately far apart, not just nudged -- punts/
    // kickoffs get a real ballistic arc well above the line, passes stay a
    // much flatter, line-drive trajectory -- the two should never look
    // alike. Offsets are in the same viewBox units as everything else here.
    let kind = 'run', apexOffset = 0;
    if (/sack/.test(label)) kind = 'sack';
    else if (/interception|fumble/.test(label)) kind = 'turnover';
    else if (/punt|kickoff/.test(label)) { kind = 'kick'; apexOffset = 70; }
    else if (/field goal|extra point/.test(label)) { kind = 'kick'; apexOffset = 40; }
    else if (/pass/.test(label)) { kind = 'pass'; apexOffset = 26; }

    const midX = (p1.x + p2.x) / 2, apexY = p1.y - apexOffset;
    const d = apexOffset === 0
        ? `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
        : `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} Q${midX.toFixed(1)},${apexY.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    return `<g class="${cls} fv-arrow--${kind}">
        <path d="${d}" class="fv-arrow-path" marker-end="url(#fvArrowHead)"/>
    </g>`;
}

// -- Main region: tabbed dashboard (live/final) vs. one flowing preview -----
// (pregame). This is the actual fix for the "6 empty tabs" bug: the choice
// used to be baked into the isFirstRender-only shell template in _nlgRender,
// so it was made once, at mount, and never revisited -- a game that went
// from Preview to Live while a fan sat on the page kept showing the preview
// forever. Now it's evaluated on every render (every poll), mirroring how
// MLB's js/liveGame.js _renderPanel re-checks isPreview on every poll tick,
// not just at panel creation. `.nlg-main`'s contents are only torn down and
// rebuilt when the pre/live/post state has actually changed since the last
// render (_nlg.lastState) -- an unconditional rebuild every poll would wipe
// tab selection and scroll position for a live game the same way the old
// bug this file's own header comment describes (D-080) already fixed once.
function _nlgRenderMain(data, comp, home, away, state) {
    const mainEl = document.querySelector('.nlg-main');
    if (!mainEl) return;
    const wasPre = _nlg.lastState === 'pre';
    _nlg.lastState = state;

    if (state === 'pre') {
        if (!wasPre || !mainEl.querySelector('.nlg-pregame-wrap')) {
            mainEl.innerHTML = `<div class="nlg-pregame-wrap"></div>`;
        }
        const wrap = mainEl.querySelector('.nlg-pregame-wrap');
        if (wrap) wrap.innerHTML = _nlgBuildPregamePreview(data, comp, home, away);
        return;
    }

    if (wasPre || !mainEl.querySelector('.gv-tabs')) {
        mainEl.innerHTML = `${_nlgTabsHtml()}<div class="gv-tabpanel"></div>`;
    }
    _nlgRenderActiveTabBody();
}

// -- Pregame Preview (state === 'pre') -----------------------------------
// Replaces the entire tab region rather than showing a "Preview" tab or
// slimmed-down versions of the other 6 -- Play-by-Play/Box Score/Team
// Stats/Analytics have zero real per-game data pregame (data.plays absent,
// boxscore.players/boxscore.teams[].statistics both empty, drives={} --
// live-verified 2026-09-08 against event 401872657, SF @ LAR) so a "pregame
// version" of any of them would just be the same empty-state message in a
// different costume. Fantasy is the one tab with real pregame-relevant
// data (recent-game trend), but it answers a different question than the
// live Fantasy tab does ("who's been hot lately" vs. "who's doing well in
// THIS game"), so it lives here as its own section (Fantasy Watch) instead
// of a tab that would behave unlike every other tab.
function _nlgBuildPregamePreview(data, comp, home, away) {
    return `${_nlgWinProjectionCard(data, home, away)}${_nlgOddsCard(data)}${_nlgRecentFormCard(data, home, away)}${_nlgInjuriesCard(data)}${_nlgNewsCard(data, true)}${_nlgFantasyWatchSection(data, home, away)}`;
}

// data.predictor (ESPN's pregame win-projection model) -- confirmed live
// 2026-09-08, zero existing references anywhere in this codebase before
// this. The two team projections don't reliably sum to exactly 100 (60.5 +
// 39.2 = 99.7 in the verified sample -- ESPN-side rounding, not a bug here)
// so they're normalized against their own sum before rendering as a split
// bar, rather than drawn raw and visibly not adding up.
function _nlgWinProjectionCard(data, home, away) {
    const p = data.predictor;
    if (!p || !p.homeTeam || !p.awayTeam) return '';
    const hRaw = parseFloat(p.homeTeam.gameProjection), aRaw = parseFloat(p.awayTeam.gameProjection);
    if (!(hRaw >= 0) || !(aRaw >= 0) || (hRaw + aRaw) <= 0) return '';
    const total = hRaw + aRaw;
    const hPct = Math.round((hRaw / total) * 100);
    const aPct = 100 - hPct;
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const tc = (abbr) => (typeof getNFLTeamColor === 'function' && getNFLTeamColor(abbr)) || 'var(--accent)';
    const hColor = tc(homeAbbr), aColor = tc(awayAbbr);
    return `<div class="nlg-card nlg-winproj">
        <div class="nlg-sum">Win Projection <span class="nlg-sum-teams">ESPN Matchup Predictor</span></div>
        <div class="nlg-winproj-body">
            <div class="nlg-winproj-bar">
                <div class="nlg-winproj-seg" style="width:${aPct}%;background:${_escHtml(aColor)}"></div>
                <div class="nlg-winproj-seg" style="width:${hPct}%;background:${_escHtml(hColor)}"></div>
            </div>
            <div class="nlg-winproj-labels">
                <span style="color:${_escHtml(aColor)}">${_escHtml(awayAbbr)} ${aPct}%</span>
                <span style="color:${_escHtml(hColor)}">${_escHtml(homeAbbr)} ${hPct}%</span>
            </div>
        </div>
    </div>`;
}

// Promotes the spread/total/moneyline _nlgBroadcastOddsLine used to bury in
// a one-line footnote into a real pregame card (moneyline was never shown
// anywhere on this page before). data.pickcenter[0], same field the
// footnote already read for details/overUnder -- homeTeamOdds/awayTeamOdds
// are new here. No outbound sportsbook links: this site doesn't broker
// bets anywhere else, and pickcenter's own link objects are built for that,
// not for us.
function _nlgOddsCard(data) {
    const pc = (data.pickcenter && data.pickcenter[0]) || null;
    if (!pc) return '';
    const provider = (pc.provider && pc.provider.name) || '';
    const ml = (side) => {
        const o = pc[side + 'TeamOdds'];
        if (!o || o.moneyLine == null) return '—';
        return o.moneyLine > 0 ? `+${o.moneyLine}` : String(o.moneyLine);
    };
    const rows = [];
    if (pc.details) rows.push(['Spread', pc.details]);
    if (pc.overUnder != null) rows.push(['Total', `O/U ${pc.overUnder}`]);
    rows.push(['Moneyline', `${ml('away')} / ${ml('home')}`]);
    if (!rows.length) return '';
    return `<div class="nlg-card nlg-odds">
        <div class="nlg-sum">Odds ${provider ? `<span class="nlg-sum-teams">${_escHtml(provider)}</span>` : ''}</div>
        <div class="nlg-ts">${rows.map(([l, v]) => `<div class="nlg-ts-row"><span class="nlg-ts-l">${_escHtml(l)}</span><span class="nlg-an-val">${_escHtml(v)}</span></div>`).join('')}</div>
    </div>`;
}

// data.lastFiveGames[] -- one entry per team, each carrying up to 5 real
// past results. Live-verified 2026-09-08 (event 401872657, a Week 1
// pregame matchup with zero current-season games played): it reaches back
// across the season boundary into January playoff games rather than
// returning nothing, which is the right behavior for a "recent form" read,
// not a bug to guard against.
function _nlgRecentFormCard(data, home, away) {
    const teams = data.lastFiveGames || [];
    if (!teams.length) return '';
    const row = (abbr) => {
        const entry = teams.find(t => (t.team || {}).abbreviation === abbr);
        const events = (entry && entry.events) || [];
        if (!events.length) return '';
        const chips = events.map(e => {
            const w = e.gameResult === 'W', l = e.gameResult === 'L';
            const cls = w ? 'nlg-form-chip--w' : l ? 'nlg-form-chip--l' : 'nlg-form-chip--t';
            const opp = (e.opponent && e.opponent.abbreviation) || '';
            const title = `${e.atVs || ''}${opp} ${e.score || ''}`.trim();
            return `<span class="${cls} nlg-form-chip" title="${_escHtml(title)}">${_escHtml(e.gameResult || '-')}</span>`;
        }).join('');
        return `<div class="nlg-form-row"><span class="nlg-form-abbr">${_escHtml(abbr)}</span><div class="nlg-form-chips">${chips}</div></div>`;
    };
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const rows = [row(awayAbbr), row(homeAbbr)].filter(Boolean).join('');
    if (!rows) return '';
    return `<div class="nlg-card nlg-form"><div class="nlg-sum">Recent Form <span class="nlg-sum-teams">Last 5</span></div><div class="nlg-form-body">${rows}</div></div>`;
}

// -- Fantasy Watch (pregame only): recent fantasy-point trend for each
// team's projected starters. Genuinely new data -- /summary has nothing
// pregame-fantasy-relevant of its own (no box score exists yet). Bridges
// Sleeper depth chart (fetchNFLSleeperPool/_nflPoolMap/_nflSleeperAbbr,
// already defined in js/nfl.js, which loads before this file) -> ESPN
// athlete id (/api/nflplayer, the same bridge the player-detail page
// already uses) -> last-5-game log (/api/nflgamelog) -> fantasy points via
// _nlgGamelogFantasyPoints, keyed by each column's stable ESPN `name`
// (passingYards, rushingTouchdowns, ...) rather than label text -- live-
// verified 2026-09-08 that names are stable across a QB's and a WR/RB's
// gamelog alike, unlike the box-score fantasy formula's label-text match.
// Progressive-enhanced the same shape as MLB's js/liveGame.js
// _lgFetchPregameExtras: render a skeleton immediately, fetch once per
// game, swap in real content when it resolves, guarded against having
// navigated away or the game having gone live by the time it does.
const _NLG_FANTASY_WATCH_POS = ['QB', 'RB', 'WR', 'TE'];

function _nlgGamelogFantasyPoints(columns, stats, scoring) {
    const idx = {};
    (columns || []).forEach((c, i) => { if (c && c.name) idx[c.name] = i; });
    const num = (name) => {
        const i = idx[name];
        if (i == null || i >= (stats || []).length) return 0;
        const v = parseFloat(String(stats[i]).replace(/,/g, ''));
        return isNaN(v) ? 0 : v;
    };
    let pts = 0;
    pts += num('passingYards') / 25;
    pts += num('passingTouchdowns') * 4;
    pts -= num('interceptions') * 2;
    pts += num('rushingYards') / 10;
    pts += num('rushingTouchdowns') * 6;
    pts += num('receivingYards') / 10;
    pts += num('receivingTouchdowns') * 6;
    const recPts = scoring === 'PPR' ? 1 : scoring === 'Half-PPR' ? 0.5 : 0;
    pts += num('receptions') * recPts;
    pts -= num('fumblesLost') * 2;
    return pts;
}

// One starter per skill position (QB/RB/WR/TE) by Sleeper's own
// depth_chart_order === 1 -- not data.leaders[], which is confirmed empty
// (0 categories populated) for a season-opener pregame game and unverified
// whether it's populated even mid-season; depth chart works regardless of
// how much of the season has been played.
function _nlgFantasyWatchStarters(homeAbbr, awayAbbr) {
    if (typeof _nflPoolMap !== 'object' || !_nflPoolMap) return [];
    const sAbbr = (typeof _nflSleeperAbbr === 'function') ? _nflSleeperAbbr : (a) => a;
    const pick = (abbr) => {
        const roster = Object.values(_nflPoolMap).filter(p =>
            p && p.active && p.status !== 'Inactive' && p.team === sAbbr(abbr) &&
            p.depth_chart_order === 1 && _NLG_FANTASY_WATCH_POS.includes(p.position));
        return _NLG_FANTASY_WATCH_POS
            .map(pos => roster.find(p => p.position === pos))
            .filter(Boolean)
            .map(p => ({ id: p.player_id, name: p.full_name, pos: p.position, team: abbr }));
    };
    return [...pick(awayAbbr), ...pick(homeAbbr)];
}

function _nlgFantasyWatchSkeletonHtml() {
    return `<div class="nlg-card nlg-fantasywatch"><div class="nlg-sum">Fantasy Watch <span class="nlg-sum-teams">Last 5 games</span></div>
        <div class="nlg-fantasywatch-body">${Array.from({ length: 4 }).map(() => `<div class="skeleton-line" style="height:38px;border-radius:8px;margin-bottom:0.4rem"></div>`).join('')}</div></div>`;
}

function _nlgFantasyWatchSection(data, home, away) {
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const gamePk = String(_nlg.eventId);
    if (_nlg.fantasyWatchGamePk === gamePk && _nlg.fantasyWatchHtml) return _nlg.fantasyWatchHtml;
    if (_nlg.fantasyWatchGamePk !== gamePk) {
        _nlg.fantasyWatchGamePk = gamePk;
        _nlg.fantasyWatchHtml = '';
        _nlg.fantasyWatchPlayers = null;
        _nlgFetchFantasyWatch(gamePk, homeAbbr, awayAbbr);
    }
    return _nlgFantasyWatchSkeletonHtml();
}

async function _nlgFetchFantasyWatch(gamePk, homeAbbr, awayAbbr) {
    try { await fetchNFLSleeperPool(); } catch (_) { /* section just stays empty below */ }
    const starters = _nlgFantasyWatchStarters(homeAbbr, awayAbbr);
    if (!starters.length) { _nlgFantasyWatchDone(gamePk, [], ''); return; }

    const results = await Promise.allSettled(starters.map(async (s) => {
        const pRes = await fetch(`/api/nflplayer?name=${encodeURIComponent(s.name)}&team=${encodeURIComponent(s.team)}`);
        if (!pRes.ok) return null;
        const pData = await pRes.json();
        if (!pData.espnId) return null;
        const glRes = await fetch(`/api/nflgamelog?id=${encodeURIComponent(pData.espnId)}&season=${encodeURIComponent(pData.season)}`);
        if (!glRes.ok) return null;
        const glData = await glRes.json();
        if (!glData.found || !glData.games || !glData.games.length) return null;
        return { ...s, columns: glData.columns, games: glData.games.slice(-5) };
    }));

    const players = results.map(r => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean);
    _nlgFantasyWatchDone(gamePk, players, _nlgRenderFantasyWatch(players, _nlg.fantasyScoring));
}

function _nlgFantasyWatchDone(gamePk, players, html) {
    _nlg.fantasyWatchPlayers = players;
    _nlg.fantasyWatchHtml = html;
    // Mirrors MLB's _lgFetchPregameExtras guard: this is several sequential
    // round trips per player, so only touch the DOM if still on this same
    // game and still pregame by the time it resolves.
    if (String(_nlg.eventId) !== gamePk || _nlgState(_nlg.lastData || {}) !== 'pre') return;
    const host = document.querySelector('.nlg-fantasywatch');
    if (host) host.outerHTML = html || '';
}

function _nlgRenderFantasyWatch(players, scoring) {
    if (!players.length) return '';
    const rows = players.map(p => {
        const pts = p.games.map(g => _nlgGamelogFantasyPoints(p.columns, g.stats, scoring));
        const bars = pts.map(v => `<div class="nlg-fw-bar" style="height:${Math.max(4, Math.min(32, v * 1.1))}px" title="${v.toFixed(1)} pts"></div>`).join('');
        const avg = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
        return `<div class="nlg-fw-row">
            <div class="nlg-fw-info"><span class="nlg-fw-name">${_escHtml(p.name)}</span><span class="nlg-fw-meta">${_escHtml(p.team)} · ${_escHtml(p.pos)}</span></div>
            <div class="nlg-fw-bars">${bars}</div>
            <span class="nlg-fw-avg">${avg.toFixed(1)} <span class="pct-caption">avg</span></span>
        </div>`;
    }).join('');
    const chip = (s) => `<button type="button" class="nlg-fantasy-chip ${scoring === s ? 'nlg-fantasy-chip--active' : ''}" onclick="_nlgSetFantasyScoring('${s}')">${s}</button>`;
    return `<div class="nlg-card nlg-fantasywatch">
        <div class="nlg-sum">Fantasy Watch <span class="nlg-sum-teams">Last 5 games</span></div>
        <div class="nlg-fantasywatch-body">
            <div class="nlg-fantasy-chips" style="padding:0 0.6rem 0.5rem">${chip('Standard')}${chip('Half-PPR')}${chip('PPR')}</div>
            ${rows}
        </div>
    </div>`;
}

// -- Tabs ---------------------------------------------------------------

function _nlgTabsHtml() {
    // Each tab button carries a stable id + aria-controls pointing at the one
    // shared tabpanel below (aria-labelledby on that panel is kept in sync in
    // _nlgRenderActiveTabBody, since the panel element itself is reused across
    // renders, not recreated). Found live 2026-08-22: this component (this
    // codebase's first tablist, D-080) had role/aria-selected on the buttons
    // but no aria-controls and no id/role/aria-labelledby on the panel they
    // control -- screen readers announced tab state correctly but never
    // exposed the tab<->panel relationship. Additive/wiring-only fix; the
    // roving-tabindex + arrow-key navigation pattern ARIA's Tabs practice also
    // calls for is a real interaction-model change to this novel component,
    // not touched here -- flagged separately rather than bundled into this fix.
    return `<div class="gv-tabs" role="tablist">${_NLG_TABS.map(t => `<button type="button" id="gv-tab-${t.id}" class="gv-tab ${_nlg.activeTab === t.id ? 'gv-tab--active' : ''}" role="tab" aria-selected="${_nlg.activeTab === t.id}" aria-controls="gv-tabpanel" onclick="_nlgSwitchTab('${t.id}')">${_escHtml(t.label)}</button>`).join('')}</div>`;
}

function _nlgSwitchTab(tab) {
    if (_nlg.activeTab === tab) return;
    _nlg.activeTab = tab;
    const tabsEl = document.querySelector('.gv-tabs');
    if (tabsEl) tabsEl.outerHTML = _nlgTabsHtml();
    _nlgRenderActiveTabBody();
}

function _nlgRenderActiveTabBody() {
    const data = _nlg.lastData;
    const panel = document.querySelector('.gv-tabpanel');
    if (!data || !panel) return;
    const comp = _nlgComp(data);
    const home = _nlgSide(comp, 'home'), away = _nlgSide(comp, 'away');
    const scrollTop = panel.scrollTop; // preserve reading position across poll-driven re-renders
    let html = '';
    switch (_nlg.activeTab) {
        case 'summary': html = _nlgRenderSummaryTab(data, comp, home, away); break;
        case 'pbp': html = _nlgRenderPbp(data); break;
        case 'box': html = _nlgRenderBoxFull(data, home, away); break;
        case 'team': html = _nlgTeamStats(data, home, away); break;
        case 'analytics': html = _nlgRenderAnalyticsTab(data, comp, home, away); break;
        case 'fantasy': html = _nlgRenderFantasyTab(data); break;
        default: html = _nlgRenderSummaryTab(data, comp, home, away);
    }
    panel.innerHTML = html;
    panel.id = 'gv-tabpanel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'gv-tab-' + _nlg.activeTab);
    panel.scrollTop = scrollTop;
}

// -- Summary tab (linescore + scoring feed) ------------------------------

function _nlgRenderSummaryTab(data, comp, home, away) {
    return `${_nlgLinescore(comp, home, away)}${_nlgScoringFeed(data)}${_nlgInjuriesCard(data)}${_nlgNewsCard(data)}`;
}

function _nlgLinescore(comp, home, away) {
    const ls = (c) => (c.linescores || []).map(l => (l.value != null ? l.value : (l.displayValue || 0)));
    const h = ls(home), a = ls(away);
    const n = Math.max(h.length, a.length, 4);
    if (!h.length && !a.length) return '';
    const qLabels = []; for (let i = 0; i < n; i++) qLabels.push(i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3));
    const row = (c, arr) => `<tr><td class="nlg-ls-team">${_escHtml((c.team || {}).abbreviation || '')}</td>
        ${qLabels.map((_, i) => `<td>${arr[i] != null ? arr[i] : '-'}</td>`).join('')}
        <td class="nlg-ls-total">${c.score != null ? c.score : ''}</td></tr>`;
    return `<div class="nlg-card"><table class="nlg-ls">
        <thead><tr><th></th>${qLabels.map(q => `<th>${q}</th>`).join('')}<th>T</th></tr></thead>
        <tbody>${row(away, a)}${row(home, h)}</tbody></table></div>`;
}

function _nlgScoringFeed(data) {
    const plays = data.scoringPlays || [];
    if (!plays.length) return '';
    const rows = plays.map(p => {
        const t = p.team || {};
        const logo = (typeof getNFLTeamLogoUrl === 'function') ? getNFLTeamLogoUrl(t.abbreviation) : '';
        const q = p.period && p.period.number ? (p.period.number <= 4 ? 'Q' + p.period.number : 'OT') : '';
        const clk = p.clock && p.clock.displayValue ? p.clock.displayValue : '';
        return `<div class="nlg-play">
            <span class="nlg-play-when">${q}${clk ? ' ' + _escHtml(clk) : ''}</span>
            ${logo ? `<img src="${_escHtml(logo)}" alt="" data-hide-on-error>` : ''}
            <span class="nlg-play-text">${_escHtml(p.text || (p.type && p.type.text) || 'Score')}</span>
            <span class="nlg-play-score">${p.awayScore}–${p.homeScore}</span>
        </div>`;
    }).join('');
    return `<details class="nlg-card" open><summary class="nlg-sum">Scoring plays</summary><div class="nlg-plays">${rows}</div></details>`;
}

// -- Injury report + NFL news (data.injuries[], data.news.articles[] — both
// -- already present in fetchNFLSummary's response, live-verified 2026-08-09
// -- against event 401873271: injuries[].injuries[] = {status, type:{abbreviation},
// -- athlete:{shortName,position:{abbreviation}}, details:{detail}}; news is
// -- general NFL news, not scoped to this specific game — labeled honestly. --

function _nlgInjuriesCard(data) {
    const teams = (data.injuries || []).filter(t => t.injuries && t.injuries.length);
    if (!teams.length) return '';
    const total = teams.reduce((n, t) => n + t.injuries.length, 0);
    const rows = (t) => (t.injuries || []).map(i => {
        const abbr = (i.type && i.type.abbreviation) || (i.status || '').slice(0, 1);
        const name = (i.athlete && (i.athlete.shortName || i.athlete.displayName)) || '';
        const pos = (i.athlete && i.athlete.position && i.athlete.position.abbreviation) || '';
        const detail = (i.details && i.details.detail) || '';
        return `<div class="nlg-inj-row">
            <span class="nlg-inj-status">${_escHtml(abbr)}</span>
            <span class="nlg-inj-name">${_escHtml(name)}</span>
            <span class="nlg-inj-pos">${_escHtml(pos)}</span>
            <span class="nlg-inj-detail">${_escHtml(detail)}</span>
        </div>`;
    }).join('');
    const teamBlock = (t) => `<div class="nlg-inj-team"><div class="nlg-bx-team-title">${_escHtml((t.team || {}).abbreviation || '')}</div>${rows(t)}</div>`;
    return `<details class="nlg-card" open><summary class="nlg-sum">Injury Report <span class="nlg-sum-teams">${total} listed</span></summary>
        <div class="nlg-inj">${teams.map(teamBlock).join('')}</div></details>`;
}

// `forceOpen` (pregame only): collapsed-by-default reads as empty at a
// glance, which is exactly wrong pregame -- this is some of the most
// substantive real content available before kickoff, not a footnote.
// Live/final games keep the original collapsed default.
function _nlgNewsCard(data, forceOpen) {
    const ago = typeof _newsTimeAgo === 'function' ? _newsTimeAgo : () => '';
    const articles = ((data.news && data.news.articles) || []).filter(a => a && a.headline && a.links && a.links.web && a.links.web.href).slice(0, 5);
    if (!articles.length) return '';
    const rows = articles.map(a => `<a class="nlg-news-row" href="${_escHtml(a.links.web.href)}" target="_blank" rel="noopener">
        <span class="nlg-news-headline">${_escHtml(a.headline)}</span>
        <span class="nlg-news-meta">${_escHtml(a.byline || '')}${a.byline ? ' · ' : ''}${_escHtml(ago(a.published || a.lastModified))}</span>
    </a>`).join('');
    return `<details class="nlg-card" ${forceOpen ? 'open' : ''}><summary class="nlg-sum">NFL News</summary><div class="nlg-news">${rows}</div></details>`;
}

// -- Play-by-Play tab (drives.current + drives.previous, live-verified shape) --

function _nlgRenderPbp(data) {
    const drivesObj = data.drives || {};
    // Bug found live 2026-08-13 against a real in-progress game (event
    // 401874392, TEN@SF -- see ISSUES.md "Live NFL preseason debugging
    // session"): at certain live moments (confirmed: right after a drive
    // ends, before the next one's first play is recorded) ESPN's
    // drives.current is the SAME drive object as drives.previous's most
    // recent entry -- verified by matching `id` (e.g. both "40187439217")
    // -- not a distinct in-progress drive. Rendering both unconditionally
    // duplicated the most recent drive card. Dedupe by id before concat.
    const prev = (drivesObj.previous || []).filter(d => !drivesObj.current || d.id !== drivesObj.current.id);
    const all = [...(drivesObj.current ? [drivesObj.current] : []), ...prev.slice().reverse()];
    if (!all.length) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No play-by-play yet</p><p class="pct-caption">Drive detail appears once the game is underway.</p></div>`;
    const driveHtml = (d, i) => {
        const teamAbbr = (d.team || {}).abbreviation || '';
        const plays = (d.plays || []).slice().reverse();
        const playsHtml = plays.map(p => `<div class="nlg-pbp-play ${p.scoringPlay ? 'nlg-pbp-play--score' : ''}">
                <span class="nlg-pbp-dd">${_escHtml((p.start && p.start.downDistanceText) || '')}</span>
                <span class="nlg-pbp-text">${_escHtml(p.text || '')}</span>
                <span class="nlg-pbp-score">${p.awayScore != null ? p.awayScore : ''}–${p.homeScore != null ? p.homeScore : ''}</span>
            </div>`).join('');
        return `<details class="nlg-card" ${i < 2 ? 'open' : ''}>
            <summary class="nlg-sum">${_escHtml(teamAbbr)} · ${_escHtml(d.description || d.displayResult || 'Drive')}
                <span class="nlg-sum-teams">${_escHtml(d.shortDisplayResult || '')}</span></summary>
            <div class="nlg-pbp-plays">${playsHtml}</div>
        </details>`;
    };
    return all.map(driveHtml).join('');
}

// -- Box Score tab (all groups present, not just passing/rushing/receiving) --

function _nlgRenderBoxFull(data, home, away) {
    const players = (data.boxscore && data.boxscore.players) || [];
    if (!players.length) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No box score yet</p><p class="pct-caption">Player stats post once the game starts.</p></div>`;
    const groupHtml = (group) => {
        const labels = group.labels || [];
        if (!group.athletes || !group.athletes.length) return '';
        const head = `<div class="nlg-bx-head"><span>${_escHtml((group.name || '').toUpperCase())}</span>${labels.map(l => `<span>${_escHtml(l)}</span>`).join('')}</div>`;
        const rows = group.athletes.map(a => `<div class="nlg-bx-row">
            <span class="nlg-bx-name">${_escHtml((a.athlete && (a.athlete.shortName || a.athlete.displayName)) || '')}</span>
            ${(a.stats || []).map(v => `<span>${_escHtml(v)}</span>`).join('')}
        </div>`).join('');
        return head + rows;
    };
    const teamCol = (side) => {
        const tb = players.find(p => (p.team || {}).id === (side.team || {}).id);
        if (!tb) return '';
        const groups = (tb.statistics || []).filter(g => g.athletes && g.athletes.length);
        return `<div class="nlg-bx-team"><div class="nlg-bx-team-title">${_escHtml((side.team || {}).abbreviation || '')}</div>${groups.map(groupHtml).join('')}</div>`;
    };
    return `<div class="nlg-bx nlg-bx--full">${teamCol(away)}${teamCol(home)}</div>`;
}

// -- Team Stats tab -------------------------------------------------------

function _nlgTeamStats(data, home, away) {
    const teams = (data.boxscore && data.boxscore.teams) || [];
    if (teams.length < 2) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No team stats yet</p></div>`;
    const byHA = {};
    teams.forEach(t => { byHA[t.homeAway || (t.team && t.team.id === (home.team || {}).id ? 'home' : 'away')] = t; });
    const ht = byHA.home || teams.find(t => (t.team || {}).id === (home.team || {}).id) || teams[1];
    const at = byHA.away || teams.find(t => (t.team || {}).id === (away.team || {}).id) || teams[0];
    const get = (t, name) => { const s = (t.statistics || []).find(x => x.name === name); return s ? (s.displayValue || '') : '—'; };
    const want = [
        ['totalYards', 'Total Yards'], ['netPassingYards', 'Passing'], ['rushingYards', 'Rushing'],
        ['firstDowns', 'First Downs'], ['thirdDownEff', '3rd Down'], ['totalPenaltiesYards', 'Penalties'],
        ['turnovers', 'Turnovers'], ['possessionTime', 'Time of Poss.'],
    ];
    const rows = want.map(([k, l]) => `<div class="nlg-ts-row">
        <span class="nlg-ts-a">${_escHtml(get(at, k))}</span>
        <span class="nlg-ts-l">${l}</span>
        <span class="nlg-ts-h">${_escHtml(get(ht, k))}</span></div>`).join('');
    return `<div class="nlg-card"><div class="nlg-sum">Team stats <span class="nlg-sum-teams">${_escHtml((at.team || {}).abbreviation || '')} · ${_escHtml((ht.team || {}).abbreviation || '')}</span></div>
        <div class="nlg-ts">${rows}</div></div>`;
}

// -- Analytics tab (D-081 Phase 3a: Success Rate + Drive Efficiency — live,
// -- computed from data already fetched, no new source. EPA/CPOE/win-prob-
// -- added (Phase 3b) need nflverse play-by-play, which doesn't exist for
// -- the 2026 season yet (checked live 2026-08-09: play_by_play_2026.csv.gz
// -- 404s) and isn't live by nature even once it does — those stay a
// -- "coming soon" note here, not faked or borrowed from a different season. --

function _nlgAllDrives(data) {
    const drivesObj = data.drives || {};
    // Same dedup as _nlgRenderPbp above -- drives.current can be the same
    // drive object as drives.previous's last entry at certain live moments
    // (id match, live-verified 2026-08-13). Left un-deduped here, this fed
    // Success Rate and Drive Efficiency (Analytics tab) with a real
    // double-count of that drive's plays/yards, not just a visual dupe.
    const prev = (drivesObj.previous || []).filter(d => !drivesObj.current || d.id !== drivesObj.current.id);
    return [...(drivesObj.current ? [drivesObj.current] : []), ...prev];
}

// Standard down-based success-rate thresholds (Football Outsiders / nflfastR
// convention): gained >=40% of yards-to-go on 1st, >=60% on 2nd, a full
// conversion (100%) on 3rd/4th. Penalty plays are excluded — penalty yardage
// isn't a real offensive down/distance conversion signal.
function _nlgIsSuccess(down, distance, yardsGained) {
    if (!distance || distance <= 0 || yardsGained == null) return null;
    const pct = yardsGained / distance;
    if (down === 1) return pct >= 0.4;
    if (down === 2) return pct >= 0.6;
    return pct >= 1.0;
}

function _nlgComputeSuccessRate(data) {
    const byTeam = {};
    _nlgAllDrives(data).forEach((d) => {
        const abbr = (d.team || {}).abbreviation;
        if (!abbr) return;
        if (!byTeam[abbr]) byTeam[abbr] = { total: 0, success: 0, byDown: { 1: { t: 0, s: 0 }, 2: { t: 0, s: 0 }, 3: { t: 0, s: 0 } } };
        (d.plays || []).forEach((p) => {
            if (p.isPenalty) return;
            const down = p.start && p.start.down;
            const distance = p.start && p.start.distance;
            if (!down || down < 1 || down > 4 || distance == null) return;
            const success = _nlgIsSuccess(down, distance, p.statYardage);
            if (success == null) return;
            const t = byTeam[abbr];
            t.total++;
            if (success) t.success++;
            const bucket = down >= 3 ? 3 : down;
            t.byDown[bucket].t++;
            if (success) t.byDown[bucket].s++;
        });
    });
    return byTeam;
}

function _nlgComputeDriveEfficiency(data) {
    const byTeam = {};
    _nlgAllDrives(data).forEach((d) => {
        const abbr = (d.team || {}).abbreviation;
        if (!abbr) return;
        if (!byTeam[abbr]) byTeam[abbr] = { drives: 0, scoringDrives: 0, totalYards: 0, totalPlays: 0 };
        const t = byTeam[abbr];
        t.drives++;
        if (d.isScore) t.scoringDrives++;
        t.totalYards += (typeof d.yards === 'number' ? d.yards : 0);
        t.totalPlays += (typeof d.offensivePlays === 'number' ? d.offensivePlays : 0);
    });
    return byTeam;
}

function _nlgRenderAnalyticsTab(data, comp, home, away) {
    const sr = _nlgComputeSuccessRate(data);
    const de = _nlgComputeDriveEfficiency(data);
    const teamAbbrs = [away, home].map((s) => (s.team || {}).abbreviation).filter(Boolean);
    const hasData = teamAbbrs.some((abbr) => sr[abbr] && sr[abbr].total);
    if (!hasData) {
        return `<div class="nlg-empty-tab">
            <p class="nlg-empty-tab-title">No plays yet</p>
            <p class="pct-caption">Success rate and drive efficiency compute live from this game's plays once it's underway.</p>
        </div>`;
    }

    const downRow = (byDown, label, bucket) => {
        const b = byDown[bucket];
        if (!b || !b.t) return '';
        const pct = Math.round(100 * b.s / b.t);
        return `<div class="nlg-ts-row"><span class="nlg-ts-l">${label}</span><span class="nlg-an-val">${pct}% <span class="pct-caption">(${b.s}/${b.t})</span></span></div>`;
    };
    const srCard = teamAbbrs.map((abbr) => {
        const s = sr[abbr];
        if (!s || !s.total) return '';
        const pct = Math.round(100 * s.success / s.total);
        return `<div class="nlg-an-team">
            <div class="nlg-bx-team-title">${_escHtml(abbr)}</div>
            <div class="nlg-an-headline">${pct}% <span class="pct-caption">(${s.success}/${s.total} plays)</span></div>
            ${downRow(s.byDown, '1st down', 1)}${downRow(s.byDown, '2nd down', 2)}${downRow(s.byDown, '3rd/4th down', 3)}
        </div>`;
    }).join('');

    const deCard = teamAbbrs.map((abbr) => {
        const d = de[abbr];
        if (!d || !d.drives) return '';
        const ypp = d.totalPlays ? (d.totalYards / d.totalPlays).toFixed(1) : '—';
        const ypd = (d.totalYards / d.drives).toFixed(1);
        const scoringPct = Math.round(100 * d.scoringDrives / d.drives);
        return `<div class="nlg-an-team">
            <div class="nlg-bx-team-title">${_escHtml(abbr)}</div>
            <div class="nlg-ts-row"><span class="nlg-ts-l">Yards / Play</span><span class="nlg-an-val">${ypp}</span></div>
            <div class="nlg-ts-row"><span class="nlg-ts-l">Yards / Drive</span><span class="nlg-an-val">${ypd}</span></div>
            <div class="nlg-ts-row"><span class="nlg-ts-l">Scoring Drives</span><span class="nlg-an-val">${scoringPct}% <span class="pct-caption">(${d.scoringDrives}/${d.drives})</span></span></div>
        </div>`;
    }).join('');

    return `<div class="nlg-card"><div class="nlg-sum">Success Rate <span class="nlg-sum-teams">≥40% on 1st · ≥60% on 2nd · 100% on 3rd/4th</span></div>
            <div class="nlg-an-grid">${srCard}</div></div>
        <div class="nlg-card"><div class="nlg-sum">Drive Efficiency</div>
            <div class="nlg-an-grid">${deCard}</div></div>
        <p class="pct-caption">Computed live from this game's plays and drives. EPA, CPOE, and win probability added need play-level modeling this doesn't have yet — coming later (D-081).</p>`;
}

// -- Fantasy (tab + sidebar leaders) — computed live from box score stats, --
// -- not a new data source. Label-name lookup against each group's own    --
// -- labels[] (not hardcoded positions) — same discipline as the NFL      --
// -- Highlight Card Studio's stat catalog (js/highlightCard.js).          --

function _nlgLabelIdx(labels, name) {
    return (labels || []).findIndex((l) => l && l.toUpperCase() === name);
}

function _nlgPlayerFantasyPoints(group, labels, stats, scoring) {
    const num = (i) => { if (i < 0 || i >= stats.length) return 0; const v = parseFloat(String(stats[i]).replace(/,/g, '')); return isNaN(v) ? 0 : v; };
    const idx = (name) => _nlgLabelIdx(labels, name);
    let pts = 0;
    if (group === 'passing') {
        pts += num(idx('YDS')) / 25;
        pts += num(idx('TD')) * 4;
        pts -= num(idx('INT')) * 2;
    } else if (group === 'rushing') {
        pts += num(idx('YDS')) / 10;
        pts += num(idx('TD')) * 6;
    } else if (group === 'receiving') {
        pts += num(idx('YDS')) / 10;
        pts += num(idx('TD')) * 6;
        const recPts = scoring === 'PPR' ? 1 : scoring === 'Half-PPR' ? 0.5 : 0;
        pts += num(idx('REC')) * recPts;
    }
    return pts;
}

function _nlgComputeFantasy(data, scoring) {
    const teamBlocks = (data.boxscore && data.boxscore.players) || [];
    const totals = {};
    teamBlocks.forEach((tb) => {
        const teamAbbr = (tb.team || {}).abbreviation || '';
        (tb.statistics || []).forEach((group) => {
            if (!['passing', 'rushing', 'receiving'].includes(group.name)) return;
            const labels = group.labels || [];
            (group.athletes || []).forEach((a) => {
                const athlete = a.athlete || {};
                const id = athlete.id || athlete.displayName;
                if (!id) return;
                const pts = _nlgPlayerFantasyPoints(group.name, labels, a.stats || [], scoring);
                if (!totals[id]) totals[id] = { name: athlete.shortName || athlete.displayName || '', team: teamAbbr, pts: 0 };
                totals[id].pts += pts;
            });
        });
    });
    return Object.values(totals).sort((a, b) => b.pts - a.pts);
}

function _nlgSetFantasyScoring(scoring) {
    _nlg.fantasyScoring = scoring;
    // Pregame: Fantasy Watch recomputes from the already-fetched gamelog data
    // cached in _nlg.fantasyWatchPlayers -- no refetch, same as flipping the
    // scoring toggle on the live Fantasy tab below doesn't refetch box score.
    if (_nlgState(_nlg.lastData || {}) === 'pre') {
        const host = document.querySelector('.nlg-fantasywatch');
        if (host && _nlg.fantasyWatchPlayers) {
            const html = _nlgRenderFantasyWatch(_nlg.fantasyWatchPlayers, scoring);
            _nlg.fantasyWatchHtml = html;
            host.outerHTML = html;
        }
        return;
    }
    _nlgRenderActiveTabBody();
    const sideEl = document.querySelector('.nlg-side');
    if (sideEl && _nlg.lastData) {
        const comp = _nlgComp(_nlg.lastData);
        sideEl.outerHTML = _nlgSidebarHtml(_nlg.lastData, comp, _nlgSide(comp, 'home'), _nlgSide(comp, 'away'));
    }
}

function _nlgRenderFantasyTab(data) {
    const scoring = _nlg.fantasyScoring;
    const list = _nlgComputeFantasy(data, scoring);
    if (!list.length) return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">No fantasy stats yet</p><p class="pct-caption">Points post live as box score stats accrue.</p></div>`;
    const rows = list.slice(0, 20).map((p, i) => `<div class="nlg-fantasy-row">
            <span class="nlg-fantasy-rank">${i + 1}</span>
            <span class="nlg-fantasy-name">${_escHtml(p.name)}</span>
            <span class="nlg-fantasy-team">${_escHtml(p.team)}</span>
            <span class="nlg-fantasy-pts">${p.pts.toFixed(1)}</span>
        </div>`).join('');
    const chip = (s) => `<button type="button" class="nlg-fantasy-chip ${scoring === s ? 'nlg-fantasy-chip--active' : ''}" onclick="_nlgSetFantasyScoring('${s}')">${s}</button>`;
    return `<div class="nlg-fantasy-header">
            <span class="pct-caption">Fantasy points, computed live from box score stats</span>
            <div class="nlg-fantasy-chips">${chip('Standard')}${chip('Half-PPR')}${chip('PPR')}</div>
        </div>
        <div class="nlg-fantasy-list">${rows}</div>`;
}

// -- Sidebar: game leaders (ESPN leaders[], live-verified) + fantasy leaders + game flow --

function _nlgSidebarHtml(data, comp, home, away) {
    return `<aside class="nlg-side">
        ${_nlgYourRosterSection(data, home, away)}
        ${_nlgWinProbability(data, home, away)}
        ${_nlgSidebarLeaders(data)}
        ${_nlgFantasyLeadersCard(data)}
        ${_nlgGameFlow(comp, home, away)}
        ${_nlgStandingsCard(data, home, away)}
    </aside>`;
}

// -- Your Roster in This Game — live fantasy points for the signed-in
// user's own Sleeper starters, cross-referenced against whichever two teams
// are actually playing (D-1xx, 2026-09-09). Deliberately separate from the
// Fantasy tab/Fantasy Watch above: those answer "who's doing well in this
// game" / "who's been hot lately" for anyone; this answers "do I need to
// check on my guy" for a specific signed-in user, so it has to actually
// filter down to their real roster rather than showing every player. Fails
// silently at every step (not signed in, no linked league, no roster match)
// -- this is a bonus for the minority of visitors who've linked a league via
// My League (js/fantasy.js), never a broken-looking empty box for anyone
// else. Same memoized-fetch-then-patch-in pattern as _nlgFantasyWatchSection
// below, minus the loading skeleton -- unlike Fantasy Watch (useful to
// basically every visitor), this is likely empty for most, so it stays
// invisible while loading and only appears once there's something real to
// show, rather than flashing a skeleton box that then vanishes.
function _nlgYourRosterSection(data, home, away) {
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const gamePk = String(_nlg.eventId);
    if (_nlg.yourRosterGameId !== gamePk) {
        _nlg.yourRosterGameId = gamePk;
        _nlg.yourRosterPlayers = null;
        _nlgFetchYourRoster(gamePk, homeAbbr, awayAbbr);
    }
    if (!_nlg.yourRosterPlayers || !_nlg.yourRosterPlayers.length) return '';
    return _nlgRenderYourRoster(data);
}

async function _nlgFetchYourRoster(gamePk, homeAbbr, awayAbbr) {
    try {
        if (typeof AuthState === 'undefined' || AuthState.status !== 'signed-in') { _nlgYourRosterDone(gamePk, []); return; }
        // Reuse js/fantasy.js's own cached link if My League has already been
        // visited this session; otherwise fetch it independently -- a fresh
        // load of a game page has no reason to depend on which order the
        // user visited pages in.
        let link = (typeof _mlLink !== 'undefined') ? _mlLink : null;
        if (!link) {
            const res = await fetch('/api/sleeperLink', { credentials: 'same-origin' });
            if (!res.ok) { _nlgYourRosterDone(gamePk, []); return; }
            link = (await res.json()).link;
            if (typeof _mlLink !== 'undefined') _mlLink = link; // share the cache forward with My League
        }
        if (!link) { _nlgYourRosterDone(gamePk, []); return; }
        await fetchNFLSleeperPool();
        const rRes = await fetch(`/api/sleeper?path=${encodeURIComponent('/v1/league/' + link.league_id + '/rosters')}`, { credentials: 'same-origin' });
        if (!rRes.ok) { _nlgYourRosterDone(gamePk, []); return; }
        const rosters = await rRes.json();
        const myRoster = (rosters || []).find(r => String(r.owner_id) === String(link.sleeper_user_id));
        if (!myRoster || !Array.isArray(myRoster.starters)) { _nlgYourRosterDone(gamePk, []); return; }
        const sAbbr = (typeof _nflSleeperAbbr === 'function') ? _nflSleeperAbbr : (a) => a;
        const homeS = sAbbr(homeAbbr), awayS = sAbbr(awayAbbr);
        const players = myRoster.starters
            .map(id => _nflPoolMap && _nflPoolMap[id])
            .filter(p => p && p.full_name && (p.team === homeS || p.team === awayS))
            .map(p => ({ name: p.full_name, pos: p.position, team: p.team === homeS ? homeAbbr : awayAbbr, nameKey: _nlgNameKey(p.full_name) }));
        _nlgYourRosterDone(gamePk, players);
    } catch (_) {
        _nlgYourRosterDone(gamePk, []);
    }
}

function _nlgYourRosterDone(gamePk, players) {
    _nlg.yourRosterPlayers = players;
    if (String(_nlg.eventId) !== gamePk || !players.length) return; // navigated away, or nothing to patch in
    const sideEl = document.querySelector('.nlg-side');
    if (sideEl && _nlg.lastData) {
        const comp = _nlgComp(_nlg.lastData);
        sideEl.outerHTML = _nlgSidebarHtml(_nlg.lastData, comp, _nlgSide(comp, 'home'), _nlgSide(comp, 'away'));
    }
}

// Same first-initial + last-name key on both sides of the match -- ESPN's
// live box score identifies players by athlete.shortName ("P. Mahomes",
// confirmed live elsewhere in this file), not the full "Patrick Mahomes"
// Sleeper's pool carries, so a plain normalized-full-name equality check
// would silently never match. Collision risk (two same-initial same-last-
// name players) is real in the abstract but negligible here: both sides are
// already filtered down to just the two teams actually playing.
function _nlgNameKey(name) {
    const n = String(name || '').toLowerCase().replace(/\./g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').trim();
    const parts = n.split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return `${parts[0][0]}|${parts[parts.length - 1]}`;
}

// Sidebar-card pattern (.nlg-side-card/.nlg-side-title/.nlg-leader-row),
// matching Fantasy Leaders right below it -- not the heavier .nlg-card used
// by main-panel content (Fantasy tab, Fantasy Watch). No scoring-format
// toggle of its own, same call Fantasy Leaders already made: one shared
// _nlg.fantasyScoring toggle for the whole page (Fantasy tab), read-only
// everywhere else via a caption, rather than three separate live-updating
// controls for the same setting.
function _nlgRenderYourRoster(data) {
    const scoring = _nlg.fantasyScoring;
    const live = _nlgComputeFantasy(data, scoring);
    const liveByKey = {};
    live.forEach(p => { const k = _nlgNameKey(p.name); if (k && !(k in liveByKey)) liveByKey[k] = p.pts; });
    const withPts = _nlg.yourRosterPlayers
        .map(p => ({ ...p, pts: liveByKey[p.nameKey] || 0 }))
        .sort((a, b) => b.pts - a.pts);
    const rows = withPts.map(p => `<div class="nlg-leader-row">
            <div class="nlg-leader-row-top">
                <span class="nlg-leader-name">${_escHtml(p.name)} <span class="pct-caption">${_escHtml(p.team)} · ${_escHtml(p.pos)}</span></span>
                <span class="nlg-leader-val">${p.pts.toFixed(1)}</span>
            </div>
        </div>`).join('');
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Your Roster in This Game <span class="pct-caption">(${_escHtml(scoring)})</span></h3>${rows}</div>`;
}

// D-106: live win probability chart. data.winprobability[] (ESPN /summary
// field) was flagged reliable-but-unconfirmed in D-080 ("Phase 2... until
// confirmed reliable on a genuinely live game") and confirmed during D-105's
// live testing (137 real, monotonically sensible entries on a real
// 4th-quarter game, home win % climbing correctly as the game resolved) — no
// new fetch needed, this rides along on the same summary poll every 20s.
// Each entry is { homeWinPercentage (0-1), tiePercentage, playId } — a single
// number that fully determines both teams' odds, not two independent series
// like Game Flow's cumulative score, so this draws ONE polyline rather than
// two. Colored two-tone (home team's color above the 50% line, away team's
// below) via two clip-path'd copies of the same polyline rather than
// computing exact crossing-point path math — clipping handles the crossings
// for free and avoids the kind of coordinate-math bug D-105 caught in the
// field viewer. Renders nothing (fails-safe, same convention as every other
// sidebar card here) if fewer than 2 real entries exist.
function _nlgWinProbability(data, home, away) {
    const wp = (data.winprobability || []).filter(w => typeof w.homeWinPercentage === 'number');
    if (wp.length < 2) return '';
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const hColor = (typeof getNFLTeamColor === 'function' && getNFLTeamColor(homeAbbr)) || 'var(--accent)';
    const aColor = (typeof getNFLTeamColor === 'function' && getNFLTeamColor(awayAbbr)) || 'var(--text-muted)';
    const n = wp.length;
    const w = 220, hgt = 56, pad = 4;
    const midY = hgt / 2;
    const xFor = (i) => pad + (i / (n - 1)) * (w - pad * 2);
    const yFor = (pct) => pad + (1 - pct) * (hgt - pad * 2);
    const pts = wp.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.homeWinPercentage).toFixed(1)}`).join(' ');
    const cur = wp[n - 1].homeWinPercentage;
    const curAbbr = cur >= 0.5 ? homeAbbr : awayAbbr;
    const curColor = cur >= 0.5 ? hColor : aColor;
    const curVal = Math.round((cur >= 0.5 ? cur : 1 - cur) * 100);
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Win Probability</h3>
        <svg class="nlg-wp-svg" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">
            <defs>
                <clipPath id="nlg-wp-clip-above"><rect x="0" y="0" width="${w}" height="${midY}"/></clipPath>
                <clipPath id="nlg-wp-clip-below"><rect x="0" y="${midY}" width="${w}" height="${hgt - midY}"/></clipPath>
            </defs>
            <line x1="${pad}" y1="${midY}" x2="${w - pad}" y2="${midY}" stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="3,3"/>
            <polyline points="${_escHtml(pts)}" fill="none" stroke="${_escHtml(hColor)}" stroke-width="2" clip-path="url(#nlg-wp-clip-above)"/>
            <polyline points="${_escHtml(pts)}" fill="none" stroke="${_escHtml(aColor)}" stroke-width="2" clip-path="url(#nlg-wp-clip-below)"/>
        </svg>
        <div class="nlg-wp-legend">
            <span style="color:${_escHtml(curColor)}">${_escHtml(curAbbr)} ${curVal}%</span>
            <span class="pct-caption">Win probability</span>
        </div>
    </div>`;
}

// Playoff-race context (data.standings.groups[], live-verified 2026-08-09):
// each group is one division's table — entries[].stats[] includes a ready-made
// 'overall' displayValue ("1-0") and 'winPercent'. Shows each team's own
// division; if both teams share a division (a divisional game), shows it once.
//
// Bug found via live verification (2026-08-09), fixed same commit: entries[].team
// is NOT an object with .abbreviation — it's a bare location string ("Carolina",
// "Arizona"). The first version assumed the header-competitor team shape and
// matched on .abbreviation, which is always undefined here — the card silently
// rendered nothing (fails-safe caught it, but it was dead code). Now matches by
// location string against home.team.location/away.team.location instead, and
// renders that location string as the row label (no per-entry abbreviation
// exists to show instead — this is a normal broadcast-standings convention).
function _nlgStandingsCard(data, home, away) {
    const groups = (data.standings && data.standings.groups) || [];
    if (!groups.length) return '';
    const homeLoc = (home.team && home.team.location) || '';
    const awayLoc = (away.team && away.team.location) || '';
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const findGroupFor = (loc) => groups.find(g => (((g.standings || {}).entries) || []).some(e => e.team === loc));
    const gHome = findGroupFor(homeLoc), gAway = findGroupFor(awayLoc);
    const uniqueGroups = (gHome && gHome === gAway) ? [gHome] : [gHome, gAway].filter(Boolean);
    if (!uniqueGroups.length) return '';
    const tc = (abbr) => (typeof getNFLTeamColor === 'function' && getNFLTeamColor(abbr)) || 'var(--border-strong)';
    const table = (g) => {
        const entries = ((g.standings || {}).entries) || [];
        const rows = entries.map(e => {
            const loc = e.team || '';
            const playing = loc === homeLoc || loc === awayLoc;
            const abbr = loc === homeLoc ? homeAbbr : (loc === awayLoc ? awayAbbr : '');
            const overall = (e.stats || []).find(s => s.name === 'overall');
            const pct = (e.stats || []).find(s => s.name === 'winPercent');
            return `<div class="nlg-st-row ${playing ? 'nlg-st-row--playing' : ''}" ${playing ? `style="--tc:${tc(abbr)}"` : ''}>
                <span class="nlg-st-team">${_escHtml(loc)}</span>
                <span class="nlg-st-rec">${_escHtml(overall ? overall.displayValue : '')}</span>
                <span class="nlg-st-pct">${_escHtml(pct ? pct.displayValue : '')}</span>
            </div>`;
        }).join('');
        return `<div class="nlg-st-group"><div class="nlg-leader-team-title">${_escHtml(g.divisionHeader || g.header || '')}</div>${rows}</div>`;
    };
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Standings</h3>${uniqueGroups.map(table).join('')}</div>`;
}

function _nlgSidebarLeaders(data) {
    const leaders = data.leaders || [];
    // Fixed live 2026-08-22: the old guard only checked the top-level
    // leaders[] array (one entry per team, always present pregame),
    // not whether either team actually HAS a populated leader category
    // yet. Pregame, ESPN returns leaders[] with two team blocks whose
    // own `.leaders` (categories) are empty -- this rendered a card with
    // "Game Leaders / DET / WSH" and nothing underneath, violating this
    // file's own "absent degrades to nothing, never a placeholder shell"
    // rule (see D-105). Now a team block is omitted unless it produced
    // at least one real row, and the whole card is omitted unless at
    // least one team block survived.
    // D-134: rows used to be one 3-column grid line (category | name | value).
    // A real category label ("Passing Yards") and a full stat line ("17/19,
    // 243 YDS, 4 TD") already eat most of a narrow sidebar card's width, so the
    // player's name -- the one thing a reader actually wants to read -- was
    // what silently truncated ("A. Simmo…"). Category+value now share a top
    // line; name gets its own full-width line below (see css/nflLiveGame.css).
    const block = (tb) => {
        const abbr = (tb.team || {}).abbreviation || '';
        const cats = (tb.leaders || []).slice(0, 3);
        const rows = cats.map((c) => {
            const top = c.leaders && c.leaders[0];
            if (!top) return '';
            const name = (top.athlete && (top.athlete.shortName || top.athlete.displayName)) || '';
            return `<div class="nlg-leader-row">` +
                `<div class="nlg-leader-row-top"><span class="nlg-leader-cat">${_escHtml(c.shortDisplayName || c.displayName || c.name || '')}</span><span class="nlg-leader-val">${_escHtml(top.displayValue || '')}</span></div>` +
                `<span class="nlg-leader-name">${_escHtml(name)}</span></div>`;
        }).join('');
        return rows ? `<div class="nlg-leader-team"><div class="nlg-leader-team-title">${_escHtml(abbr)}</div>${rows}</div>` : '';
    };
    const blocks = leaders.map(block).filter(Boolean);
    if (!blocks.length) return '';
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Game Leaders</h3>${blocks.join('')}</div>`;
}

function _nlgFantasyLeadersCard(data) {
    const scoring = _nlg.fantasyScoring;
    const list = _nlgComputeFantasy(data, scoring);
    if (!list.length) return '';
    const rows = list.slice(0, 5).map((p, i) => `<div class="nlg-leader-row"><span class="nlg-leader-cat">${i + 1}</span><span class="nlg-leader-name">${_escHtml(p.name)} <span class="pct-caption">${_escHtml(p.team)}</span></span><span class="nlg-leader-val">${p.pts.toFixed(1)}</span></div>`).join('');
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Fantasy Leaders <span class="pct-caption">(${_escHtml(scoring)})</span></h3>${rows}</div>`;
}

function _nlgGameFlow(comp, home, away) {
    const ls = (c) => (c.linescores || []).map((l) => (l.value != null ? l.value : (l.displayValue || 0)));
    const h = ls(home), a = ls(away);
    const n = Math.max(h.length, a.length);
    if (n < 2) return '';
    const cum = (arr) => { let s = 0; return arr.map((v) => (s += (v || 0))); };
    const hc = cum(h), ac = cum(a);
    const maxV = Math.max(...hc, ...ac, 1);
    const w = 220, hgt = 56, pad = 4;
    const pt = (arr, i) => {
        const x = pad + (i / (n - 1)) * (w - pad * 2);
        const y = hgt - pad - (arr[i] / maxV) * (hgt - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    };
    const hPts = hc.map((_, i) => pt(hc, i)).join(' ');
    const aPts = ac.map((_, i) => pt(ac, i)).join(' ');
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const hColor = (typeof getNFLTeamColor === 'function' && getNFLTeamColor(homeAbbr)) || 'var(--accent)';
    const aColor = (typeof getNFLTeamColor === 'function' && getNFLTeamColor(awayAbbr)) || 'var(--text-muted)';
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Game Flow</h3>
        <svg class="nlg-flow-svg" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">
            <polyline points="${_escHtml(aPts)}" fill="none" stroke="${_escHtml(aColor)}" stroke-width="2"/>
            <polyline points="${_escHtml(hPts)}" fill="none" stroke="${_escHtml(hColor)}" stroke-width="2"/>
        </svg>
        <div class="nlg-flow-legend"><span style="color:${_escHtml(aColor)}">${_escHtml(awayAbbr)}</span><span style="color:${_escHtml(hColor)}">${_escHtml(homeAbbr)}</span></div>
    </div>`;
}

function _nlgNav(abbr) {
    return `event.stopPropagation();navigateTo('nfl-team-${_escHtml(abbr === 'WAS' ? 'WSH' : (abbr || ''))}')`;
}

if (typeof window !== 'undefined') {
    window.showNFLGame = showNFLGame;
    window.fetchNFLSummary = fetchNFLSummary;
    window.stopNFLLiveGame = _nlgStop;
    window._nlgSwitchTab = _nlgSwitchTab;
    window._nlgSetFantasyScoring = _nlgSetFantasyScoring;
}

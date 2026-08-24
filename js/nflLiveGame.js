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

const _nlg = { eventId: null, timer: null, activeTab: 'summary', lastData: null, fantasyScoring: 'PPR', situation: null, lastPlayArrowId: null };

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
    if (isNewGame) { _nlg.activeTab = 'summary'; _nlg.lastData = null; }
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

function _nlgMaybePoll(data) {
    const state = _nlgState(data);
    _nlgStop();
    if (state !== 'in') return;
    _nlg.timer = setInterval(async () => {
        if (AppState.currentView !== 'nfl-game-' + _nlg.eventId) { _nlgStop(); return; }
        try {
            const d = await fetchNFLSummary(_nlg.eventId);
            if (_nlgState(d) === 'in') {
                try { _nlg.situation = await fetchNFLLiveSituation(_nlg.eventId); } catch (_) { /* keep last situation */ }
            } else {
                _nlg.situation = null;
            }
            _nlgRender(d);
            if (_nlgState(d) !== 'in') _nlgStop();
        } catch (_) { /* keep last render */ }
    }, 20000);
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

    const isFirstRender = grid.className !== 'nlg-shell-mounted';
    if (isFirstRender) {
        grid.className = 'nlg-shell-mounted'; grid.style.cssText = '';
        grid.innerHTML = `
          <div class="nlg-wrap">
            <div class="nlg-topbar">
              <button onclick="navigateTo('nfl-games')" class="back-button">← Scores</button>
              <button type="button" class="hcs-pill" onclick="openNFLHighlightCardForGame('${_escHtml(String(_nlg.eventId))}')">🎬 Create Highlight Card</button>
            </div>
            <div class="nlg-header"></div>
            <div class="nlg-layout">
              <div class="nlg-main">
                ${_nlgTabsHtml()}
                <div class="gv-tabpanel"></div>
              </div>
              ${_nlgSidebarHtml(data, comp, home, away)}
            </div>
            <p class="pct-caption nlg-venue-caption"></p>
          </div>`;
    } else {
        const sideEl = grid.querySelector('.nlg-side');
        if (sideEl) sideEl.outerHTML = _nlgSidebarHtml(data, comp, home, away);
    }

    _nlgRenderHeader(comp, home, away);
    _nlgRenderActiveTabBody();

    const venue = (data.gameInfo && data.gameInfo.venue && data.gameInfo.venue.fullName) || '';
    const oddsLine = _nlgBroadcastOddsLine(data);
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
function _nlgBroadcastOddsLine(data) {
    const parts = [];
    const b = (data.broadcasts && data.broadcasts[0]) || null;
    const bname = b && ((b.media && (b.media.shortName || b.media.callLetters)) || (b.names && b.names[0]) || (b.type && b.type.shortName) || b.name);
    if (bname) parts.push(String(bname));
    const pc = (data.pickcenter && data.pickcenter[0]) || null;
    if (pc) {
        const line = [];
        if (pc.details) line.push(pc.details);
        if (pc.overUnder != null) line.push(`O/U ${pc.overUnder}`);
        if (line.length) parts.push(line.join(', '));
    }
    return parts.join(' · ');
}

function _nlgRenderHeader(comp, home, away) {
    const headerEl = document.querySelector('.nlg-header');
    if (!headerEl) return;
    const st = (comp.status && comp.status.type) || {};
    const state = st.state || 'post';
    const live = state === 'in';
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
    const sitLine = sit
        ? `<div class="nlg-situation">
             ${sit.possessionText ? `<span class="nlg-poss">🏈 ${_escHtml(sit.possessionText)}</span>` : ''}
             ${sit.downDistanceText ? `<span class="nlg-dd">${_escHtml(sit.downDistanceText)}</span>` : ''}
             ${sit.lastPlay && sit.lastPlay.text ? `<span class="nlg-lastplay">${_escHtml(sit.lastPlay.text)}</span>` : ''}
           </div>`
        : '';

    // Field viewer only renders when we have real numeric position data AND
    // possession resolves to one of the two teams in this game -- absent
    // (not defaulted/guessed) otherwise, same "absent degrades to nothing"
    // rule the rest of this file follows for situation/leaders/etc.
    const homeTeamId = _nlg.situation?.homeTeamId, awayTeamId = _nlg.situation?.awayTeamId;
    const possResolves = sit?.possession && (String(sit.possession) === String(homeTeamId) || String(sit.possession) === String(awayTeamId));
    const fieldHtml = sit && typeof sit.down === 'number' && sit.down >= 1 && typeof sit.yardLine === 'number' && possResolves
        ? _nlgFieldViewerHtml(sit, homeTeamId, awayTeamId, home, away, tc)
        : '';

    headerEl.innerHTML = `
        <div class="nlg-score ${live ? 'nlg-score--live' : ''}">
          ${teamBlock(away, 'away')}
          <div class="nlg-center">
            <div class="nlg-status ${live ? 'nlg-status--live' : ''}">${_escHtml(statusText)}${live ? ' <span class="nlg-livebadge">● LIVE</span>' : ''}</div>
            <div class="nlg-vs">@</div>
          </div>
          ${teamBlock(home, 'home')}
        </div>
        ${fieldHtml}
        ${sitLine}`;
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
function _nlgFieldViewerHtml(sit, homeTeamId, awayTeamId, home, away, tc) {
    const homeAbbr = home?.team?.abbreviation || '';
    const awayAbbr = away?.team?.abbreviation || '';
    const possHome = String(sit.possession) === String(homeTeamId);
    const disp = (v) => 100 - v;

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
    // here; disp() converts the [rzLeft,rzRight] pair to a display
    // left%/width% span below.
    const rzLeft = possHome ? 80 : 0;
    const rzRight = possHome ? 100 : 20;
    const redZoneHtml = sit.isRedZone
        ? `<div class="fv-redzone" style="left:${disp(rzRight)}%; width:${(rzRight - rzLeft)}%"></div>`
        : '';

    const toDots = (n) => Array.from({ length: 3 }, (_, i) =>
        `<div class="fv-to-dot${i < (n ?? 3) ? ' fv-to-dot--on' : ''}"></div>`).join('');
    const arrowHtml = _nlgPlayArrowHtml(sit, disp);

    return `
    <div class="field-viewer">
        <div class="fv-topline">
            <span class="fv-dd">${_escHtml(sit.downDistanceText || sit.shortDownDistanceText || '')}</span>
            <span class="fv-poss">${possColor ? `<span class="fv-poss-dot" style="background:${possColor}"></span>` : ''}${_escHtml(sit.possessionText || '')}</span>
        </div>
        <div class="fv-field">
            <div class="fv-endzone" style="background-color:${awayColor}">${_escHtml(awayAbbr)}</div>
            <div class="fv-track">
                ${arrowHtml}
                ${redZoneHtml}
                <div class="fv-firstdown" style="left:${disp(firstDownPct)}%"></div>
                <div class="fv-ball" style="left:${disp(ballPct)}%; background-color:${possColor}"></div>
            </div>
            <div class="fv-endzone" style="background-color:${homeColor}">${_escHtml(homeAbbr)}</div>
        </div>
        <div class="fv-yardnums"><span>${_escHtml(awayAbbr)}</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span><span>40</span><span>30</span><span>20</span><span>10</span><span>${_escHtml(homeAbbr)}</span></div>
        <div class="fv-legend">
            <div class="fv-timeouts"><span class="fv-to-label">${_escHtml(awayAbbr)} TO</span><div class="fv-to-dots">${toDots(sit.awayTimeouts)}</div></div>
            <div class="fv-key">${sit.isRedZone ? `<span><i style="background:var(--color-loss)"></i>Red zone</span>` : `<span><i style="background:var(--color-first-down)"></i>1st down</span>`}</div>
            <div class="fv-timeouts"><div class="fv-to-dots">${toDots(sit.homeTimeouts)}</div><span class="fv-to-label">${_escHtml(homeAbbr)} TO</span></div>
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
function _nlgPlayArrowHtml(sit, disp) {
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
    const x1 = disp(lp.start.yardLine), x2 = disp(lp.end.yardLine);

    // Incomplete pass: start and end yardLine are the same spot (the ball
    // comes back to the line of scrimmage) -- a stationary "no gain"
    // marker, not a zero-length arrow pretending there's a distance.
    if (/incomplet/.test(label)) {
        return `<svg class="${cls}" viewBox="0 0 100 40" preserveAspectRatio="none">
            <g transform="translate(${x1},20)">
                <circle r="3.4" class="fv-arrow-badge-ring"/>
                <path d="M-1.6,-1.6 L1.6,1.6 M-1.6,1.6 L1.6,-1.6" class="fv-arrow-badge-x"/>
            </g>
        </svg>`;
    }

    let kind = 'run', apexY = 20;
    if (/sack/.test(label)) kind = 'sack';
    else if (/interception|fumble/.test(label)) kind = 'turnover';
    else if (/punt|field goal|extra point|kickoff/.test(label)) { kind = 'kick'; apexY = 3; }
    else if (/pass/.test(label)) { kind = 'pass'; apexY = 8; }

    const midX = (x1 + x2) / 2;
    const d = apexY === 20 ? `M${x1},20 L${x2},20` : `M${x1},20 Q${midX},${apexY} ${x2},20`;
    return `<svg class="${cls} fv-arrow--${kind}" viewBox="0 0 100 40" preserveAspectRatio="none">
        <defs>
            <marker id="fvArrowHead" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" class="fv-arrow-head"/>
            </marker>
        </defs>
        <path d="${d}" class="fv-arrow-path" marker-end="url(#fvArrowHead)"/>
    </svg>`;
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

function _nlgNewsCard(data) {
    const ago = typeof _newsTimeAgo === 'function' ? _newsTimeAgo : () => '';
    const articles = ((data.news && data.news.articles) || []).filter(a => a && a.headline && a.links && a.links.web && a.links.web.href).slice(0, 5);
    if (!articles.length) return '';
    const rows = articles.map(a => `<a class="nlg-news-row" href="${_escHtml(a.links.web.href)}" target="_blank" rel="noopener">
        <span class="nlg-news-headline">${_escHtml(a.headline)}</span>
        <span class="nlg-news-meta">${_escHtml(a.byline || '')}${a.byline ? ' · ' : ''}${_escHtml(ago(a.published || a.lastModified))}</span>
    </a>`).join('');
    return `<details class="nlg-card"><summary class="nlg-sum">NFL News</summary><div class="nlg-news">${rows}</div></details>`;
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
        ${_nlgWinProbability(data, home, away)}
        ${_nlgSidebarLeaders(data)}
        ${_nlgFantasyLeadersCard(data)}
        ${_nlgGameFlow(comp, home, away)}
        ${_nlgStandingsCard(data, home, away)}
    </aside>`;
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
    const block = (tb) => {
        const abbr = (tb.team || {}).abbreviation || '';
        const cats = (tb.leaders || []).slice(0, 3);
        const rows = cats.map((c) => {
            const top = c.leaders && c.leaders[0];
            if (!top) return '';
            const name = (top.athlete && (top.athlete.shortName || top.athlete.displayName)) || '';
            return `<div class="nlg-leader-row"><span class="nlg-leader-cat">${_escHtml(c.shortDisplayName || c.displayName || c.name || '')}</span><span class="nlg-leader-name">${_escHtml(name)}</span><span class="nlg-leader-val">${_escHtml(top.displayValue || '')}</span></div>`;
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

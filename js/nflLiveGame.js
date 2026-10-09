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

const _nlg = { eventId: null, timer: null, activeTab: 'summary', lastData: null, fantasyScoring: 'PPR', situation: null, lastState: null, fantasyWatchGamePk: null, fantasyWatchHtml: '', fantasyWatchPlayers: null, yourRosterGameId: null, yourRosterPlayers: null, field: null, fieldSource: null, fieldIndex: null, lastBigPlayId: null, bigPlayDismiss: null, lastSituationKey: null, catchupData: null, lastBattleState: null, lastBreakKey: undefined };

const NLG_POLL_MS = 20000;
// Pregame-only cadence (D-1xx): a scheduled game never used to poll at all
// (_nlgMaybePoll only armed for state === 'in'), so a fan sitting on the
// preview page through kickoff never saw it flip live without a manual
// reload. 60s mirrors MLB's own pregame cadence (js/liveGame.js
// LG_PREGAME_MS) -- frequent enough to catch kickoff promptly, far slower
// than the 20s live cadence since nothing else about a scheduled game
// changes between polls.
const NLG_PREGAME_POLL_MS = 60000;

// Sound design (D-159, "elevate the experience," 2026-09-13). Synthesized
// tones via the Web Audio API -- deliberately not sourced/hosted audio
// files, which would need a new CSP allowance and raise a real licensing
// question for anything that sounds like a broadcast SFX. A clean
// oscillator tone is also the more honest register for this brand anyway
// (the owner's own brainstorm named "Bloomberg terminal / F1 interface, not
// ESPN" as the target, and a synthesized tick reads as exactly that,
// where a sourced "ding" sample would read as a game-show/ESPN cue).
// Off by default (localStorage `ss_nfl_sound`, opt-in only, no dark
// pattern) -- browsers require a real user gesture before audio can play
// at all, so the toggle button click itself is what creates/resumes the
// AudioContext; sound can never start itself.
const NLG_SOUND_KEY = 'ss_nfl_sound';
let _nlgAudioCtx = null;

function _nlgSoundEnabled() {
    try { return localStorage.getItem(NLG_SOUND_KEY) === '1'; } catch (_) { return false; }
}

function _nlgGetAudioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!_nlgAudioCtx) _nlgAudioCtx = new AC();
    if (_nlgAudioCtx.state === 'suspended') _nlgAudioCtx.resume().catch(() => {});
    return _nlgAudioCtx;
}

// Plays one short synthesized note. Deliberately tiny/restrained (soft
// attack/decay envelope, low peak gain) -- this is a UI tick, not a sound
// effect. Fails silently on any error (no AudioContext support, a browser
// blocking playback outside a gesture, etc.) rather than ever throwing --
// sound is a bonus layer, never something that should break the page.
function _nlgTone(freq, durationMs, type = 'sine', gainPeak = 0.12) {
    const ctx = _nlgGetAudioCtx();
    if (!ctx) return;
    try {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + durationMs / 1000 + 0.03);
    } catch (_) {}
}

// Named presets, not raw frequency calls at each site -- keeps every actual
// sound-design decision (which cue sounds like what) in exactly one place.
// Deliberately narrow: only the events that were already rare/meaningful
// enough to get a VISUAL treatment today get a sound too (score, turnover,
// entering 4th down, a critical moment) -- a plain 20+ yard gain does not,
// same "if everything makes noise, nothing sounds important" discipline
// applied to audio as this file already applies to motion.
function _nlgPlayTone(preset) {
    if (!_nlgSoundEnabled()) return;
    if (preset === 'score') { _nlgTone(523.25, 90, 'sine', 0.12); setTimeout(() => _nlgTone(659.25, 140, 'sine', 0.12), 90); }
    else if (preset === 'turnover') { _nlgTone(196, 220, 'triangle', 0.14); }
    else if (preset === 'battle') { _nlgTone(440, 70, 'sine', 0.08); }
    else if (preset === 'critical') { _nlgTone(392, 100, 'sine', 0.13); setTimeout(() => _nlgTone(523.25, 100, 'sine', 0.13), 100); setTimeout(() => _nlgTone(659.25, 220, 'sine', 0.14), 200); }
}

function _nlgToggleSound(btn) {
    const next = !_nlgSoundEnabled();
    try { localStorage.setItem(NLG_SOUND_KEY, next ? '1' : '0'); } catch (_) {}
    if (next) _nlgGetAudioCtx(); // create/resume on this exact user gesture -- required by browser autoplay policy
    _nlgUpdateSoundToggleBtn(btn || document.getElementById('nlgSoundToggle'));
    if (next) _nlgPlayTone('score'); // a one-off confirmation tone so turning it on has an audible result immediately
}

function _nlgUpdateSoundToggleBtn(btn) {
    if (!btn) return;
    const on = _nlgSoundEnabled();
    btn.innerHTML = `${_iconSvg(on ? 'speakerOn' : 'speakerOff', 13)} Sound ${on ? 'On' : 'Off'}`;
    btn.setAttribute('aria-pressed', String(on));
}

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
    if (isNewGame) { if (_nlg.field) { _nlg.field.destroy(); _nlg.field = null; } _nlg.fieldSource = null; _nlg.activeTab = 'summary'; _nlg.lastData = null; _nlg.lastState = null; _nlg.fantasyWatchGamePk = null; _nlg.fantasyWatchHtml = ''; _nlg.fantasyWatchPlayers = null; _nlg.yourRosterGameId = null; _nlg.yourRosterPlayers = null; _nlg.lastBigPlayId = null; if (_nlg.bigPlayDismiss) { _nlg.bigPlayDismiss(); _nlg.bigPlayDismiss = null; } _nlg.lastSituationKey = null; _nlg.catchupData = null; _nlg.lastBattleState = null; _nlg.lastBreakKey = undefined; }
    _nlgLoadFieldIndex();
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
        // Seed on first mount so the big-play suggestion (D-118 Idea 2) never
        // fires for whatever the last play happened to be before the user
        // opened the page -- only a play that happens while they're actually
        // watching should prompt "make a card?".
        if (isNewGame && _nlg.situation?.situation?.lastPlay?.id) _nlg.lastBigPlayId = _nlg.situation.situation.lastPlay.id;
        // Catch Me Up (D-156) -- computed once here, on the very first fetch
        // for a fresh mount, not on every poll. See _nlgComputeCatchup's own
        // header comment for why a per-poll recompute would defeat the point.
        if (isNewGame) _nlg.catchupData = _nlgComputeCatchup(data);
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
    if (state === 'in') _nlgCheckBigPlay();
    const isFirstRender = grid.className !== 'nlg-shell-mounted';
    if (isFirstRender) {
        grid.className = 'nlg-shell-mounted'; grid.style.cssText = '';
        grid.innerHTML = `
          <div class="nlg-wrap">
            <div class="nlg-topbar">
              <button onclick="navigateTo('nfl-games')" class="back-button">← Scores</button>
              ${_nlg.catchupData ? `<button type="button" class="hcs-pill" onclick="_nlgToggleCatchup()">${_iconSvg('trendUp', 13)} Catch Me Up (${_nlg.catchupData.plays.length})</button>` : ''}
              <button type="button" class="hcs-pill" onclick="openNFLHighlightCardForGame('${_escHtml(String(_nlg.eventId))}')">${_iconSvg('film', 13)} Create Highlight Card</button>
              <button type="button" class="hcs-pill" id="nlgSoundToggle" aria-pressed="${_nlgSoundEnabled()}" onclick="_nlgToggleSound(this)">${_iconSvg(_nlgSoundEnabled() ? 'speakerOn' : 'speakerOff', 13)} Sound ${_nlgSoundEnabled() ? 'On' : 'Off'}</button>
            </div>
            ${_nlgCatchupHtml(home, away)}
            <div class="nlg-header"><div class="nlg-header-pin"></div><div class="nlg-field-host"><div class="nlg-field-slot" hidden></div><div class="nlg-break-slot"></div></div></div>
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

    // Ambient tension pulse -- applied to the whole wrap, not a specific tab
    // or panel, so it's visible regardless of which tab the user is on (same
    // "visible everywhere, not just the Live tab" choice js/liveGame.js's
    // .lg-panel--high-leverage made). Toggled every render, not tracked as a
    // one-shot change -- a sustained ambient state, not an event.
    const wrapEl = grid.querySelector('.nlg-wrap');
    if (wrapEl) {
        const lev = state === 'in' ? _nlgLeverageIndex(comp) : null;
        wrapEl.classList.toggle('nlg-wrap--high-leverage', lev != null && lev >= 16);
    }

    _nlgRenderHeader(comp, home, away);
    _nlgRenderMain(data, comp, home, away, state);

    const venue = (_nlgFieldProfileFor(data).profile?.name) || data.gameInfo?.venue?.fullName || '';
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

// Tension layer (2026-09-13, NFL follow-on to js/liveGame.js's MLB tension
// cues, 34a9ccf) -- ambient in-game leverage. Deliberately NOT a reuse of
// _nflLeverage (js/app.js): that function picks WHICH live game the home
// hero should feature, so it includes a +100 followed-team bonus and a +4
// national-broadcast bonus -- real signals for "which game should I watch,"
// meaningless once someone has already committed to watching THIS one (a
// followed team's 45-3 blowout would still read as maximally "high leverage"
// under that formula, which is backwards for an in-page tension cue). This is
// a smaller, from-scratch formula measuring only in-game stakes: quarter,
// score closeness, and red zone. No baseline-ratio scale like MLB's
// leverage index (period*2 + closeness maxes near 20, not a "1.0 = average"
// ratio) -- the >=16 threshold below is a considered estimate (Q4 within two
// scores, or a tied Q3 game, or red zone tips a moderately close game over),
// not empirically tuned against historical NFL win-probability swings the
// way a real leverage-index model would be.
function _nlgLeverageIndex(comp) {
    const status = comp.status || {};
    const period = status.period;
    if (status.type?.state !== 'in' || !period) return null;
    const home = (comp.competitors || []).find(c => c.homeAway === 'home') || {};
    const away = (comp.competitors || []).find(c => c.homeAway === 'away') || {};
    const hs = parseInt(home.score, 10) || 0, as = parseInt(away.score, 10) || 0;
    const diff = Math.abs(hs - as);
    const closeness = Math.max(0, 10 - diff * (10 / 16));
    const redZone = _nlg.situation?.situation?.isRedZone ? 2 : 0;
    return (period * 2) + closeness + redZone;
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
    // Break card (2026-10-04): takes the field's slot during dead time. Also
    // wins over a field the scoreboard still thinks is live when the summary
    // already shows a score (see _nlgBreakInfo's lag note).
    const breakInfo = live && _nlg.lastData ? _nlgBreakInfo(_nlg.lastData, sit) : null;
    if (!breakInfo) _nlg.lastBreakKey = null;
    const showField = !breakInfo && !!sit && typeof sit.down === 'number' && sit.down >= 1 && typeof sit.yardLine === 'number' && !!possResolves;
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
    // Tension cue -- situation flash: mirrors js/liveGame.js's _lgFlashSituation,
    // adapted to this file's "rebuild the whole header from a template string
    // every poll" architecture rather than MLB's "patch a persistent node"
    // one. Because headerEl.innerHTML is fully replaced each render, a fresh
    // element created WITH the flash class present plays its one-shot CSS
    // entrance animation automatically on mount -- no classList.add/setTimeout
    // removal needed the way MLB's version required (that pattern is for a
    // node that survives across renders; this one never does).
    const sitKey = sit && typeof sit.down === 'number' ? `${sit.down}_${sit.distance}_${sit.possession}` : null;
    const sitChanged = sitKey !== null && _nlg.lastSituationKey !== null && _nlg.lastSituationKey !== sitKey;
    _nlg.lastSituationKey = sitKey;
    const sitFlashCls = sitChanged ? ' nlg-situation--flash' : '';

    // Tension cue -- battle state: 4th down is the NFL analog of MLB's
    // sustained 2-strike treatment -- an ongoing "this drive ends here if they
    // don't convert" state, re-included in the template for as long as it
    // stays true across consecutive polls (no separate one-shot tracking
    // needed, unlike the flash above, since this is meant to persist, not fire
    // once).
    const isBattle = live && sit?.down === 4;
    // Sound cue (D-159): a short tick on the TRANSITION into 4th down only --
    // isBattle itself is recomputed fresh every poll (true for as long as
    // it stays 4th down), so without this separate tracker the tone would
    // replay on every single 20s poll tick while a team is still deciding
    // what to do on 4th down, which is exactly the kind of noise this
    // feature's own restraint principle argues against.
    if (isBattle && !_nlg.lastBattleState) _nlgPlayTone('battle');
    _nlg.lastBattleState = isBattle;

    const summaryLastPlay = breakInfo ? _nlgAllPlaysFlat(_nlg.lastData).slice(-1)[0] : null;
    // A two-minute-warning break (keepSituation, D-172) is mid-drive: keep the
    // full possession + down-and-distance line, since the field is hidden.
    const sitLine = breakInfo && !breakInfo.keepSituation
        ? (summaryLastPlay?.text ? `<div class="nlg-situation"><span class="nlg-lastplay">${_escHtml(summaryLastPlay.text)}</span></div>` : '')
        : sit
        ? (showField
            ? (sit.lastPlay && sit.lastPlay.text
                ? `<div class="nlg-situation${sitFlashCls}"><span class="nlg-lastplay">${_escHtml(sit.lastPlay.text)}</span></div>`
                : '')
            : `<div class="nlg-situation${sitFlashCls}">
                 ${sitPossTeamName ? `<span class="nlg-poss">${_iconSvg('football', 12)} ${_escHtml(sitPossTeamName)} ball</span>` : (sit.possessionText ? `<span class="nlg-poss">${_iconSvg('football', 12)} ${_escHtml(sit.possessionText)}</span>` : '')}
                 ${sit.downDistanceText ? `<span class="nlg-dd">${_escHtml(sit.downDistanceText)}</span>` : ''}
                 ${sit.lastPlay && sit.lastPlay.text ? `<span class="nlg-lastplay">${_escHtml(sit.lastPlay.text)}</span>` : ''}
               </div>`)
        : '';

    // D-118 Idea 1 (sticky score header, ISSUES.md "immersion brainstorm",
    // ratified 2026-08-24, unbuilt until now). Axiom's own feasibility note
    // on that spec: .nlg-header can't take position:sticky as originally
    // proposed, because .nlg-score/fieldHtml/sitLine are flat siblings here --
    // that would pin the field-position graphic too, directly contradicting
    // the spec's "field viewer does not stick" requirement (it's the richest
    // visual on the page and deserves real space when actually being looked
    // at, not a permanently-reserved sliver of every tab). Fix: a new
    // .nlg-header-pin wrapper around just the score row + situation line;
    // fieldHtml stays a sibling OUTSIDE it, scrolling away normally. CSS
    // (not JS) handles dropping the situation row from the pinned bar on
    // mobile (Kael's spec), same "CSS over JS for visuals" discipline this
    // codebase uses everywhere else.
    const pinEl = headerEl.querySelector('.nlg-header-pin');
    if (pinEl) pinEl.innerHTML = `
          <div class="nlg-score ${live ? 'nlg-score--live' : ''}${isBattle ? ' nlg-score--battle' : ''}">
            ${teamBlock(away, 'away')}
            <div class="nlg-center">
              <div class="nlg-status ${live ? 'nlg-status--live' : ''}">${_escHtml(statusText)}${live ? ' <span class="nlg-livebadge">● LIVE</span>' : ''}</div>
              ${countdown ? `<div class="nlg-countdown">${_escHtml(countdown)}</div>` : ''}
              <div class="nlg-vs">@</div>
            </div>
            ${teamBlock(home, 'home')}
          </div>
          ${sitLine}`;
    const breakSlot = headerEl.querySelector('.nlg-break-slot');
    if (breakSlot) breakSlot.innerHTML = breakInfo ? _nlgBreakCardHtml(breakInfo, _nlg.lastData, home, away, tc) : '';
    const fieldSlot = headerEl.querySelector('.nlg-field-slot');
    if (fieldSlot) {
        fieldSlot.hidden = !showField;
        if (showField) {
            const fv = _nlgEnsureField(home, away, homeTeamId, tc);
            if (fv) fv.update(sit);
        }
    }
}

// Field viewer wiring. The renderer lives in js/fieldViewer.js; this page owns
// which profile a game gets and keeps one instance alive across polls.
function _nlgTeamLogo(t) {
    return (t?.logos && t.logos[0] && t.logos[0].href) || (typeof getNFLTeamLogoUrl === 'function' ? getNFLTeamLogoUrl(t?.abbreviation) : '') || '';
}

function _nlgFieldProfileFor(data) {
    if (typeof FieldViewer === 'undefined' || !data) return { source: 'generated', profile: null };
    const comp = _nlgComp(data) || {};
    const home = _nlgSide(comp, 'home');
    return FieldViewer.resolveField({
        index: _nlg.fieldIndex,
        venueId: data.gameInfo?.venue?.id,
        homeAbbr: home?.team?.abbreviation,
        eventId: _nlg.eventId,
        neutralSite: !!comp.neutralSite,
    });
}

function _nlgEnsureField(home, away, homeTeamId, tc) {
    const slot = document.querySelector('.nlg-field-slot');
    if (!slot || typeof FieldViewer === 'undefined') return null;
    if (_nlg.field && _nlg.field.host === slot && slot.isConnected) return _nlg.field;
    if (_nlg.field) _nlg.field.destroy();
    const data = _nlg.lastData || {};
    const resolved = _nlgFieldProfileFor(data);
    const side = (c) => {
        const t = c?.team || {};
        return { abbr: t.abbreviation || '', name: t.shortDisplayName || t.name || '', logo: _nlgTeamLogo(t), color: tc(t.abbreviation) };
    };
    const h = side(home);
    const profile = resolved.profile || FieldViewer.generatedProfile({
        homeLocation: home?.team?.location, homeName: home?.team?.name || h.name, homeColor: h.color,
        neutral: resolved.source === 'neutral-generated',
    });
    _nlg.field = FieldViewer.mount(slot, {
        profile, home: h, away: side(away), homeTeamId,
        indoor: !!_nlg.situation?.venueIndoor,
        venueLabel: resolved.source === 'neutral-generated' ? (data.gameInfo?.venue?.fullName || '') : '',
    });
    _nlg.fieldSource = resolved.source;
    return _nlg.field;
}

// Never blocks first paint: a field drawn from the generated fallback is
// re-skinned in place once the researched profile arrives.
async function _nlgLoadFieldIndex() {
    if (_nlg.fieldIndex) return;
    let idx = ApiCache.get('nfl-field-index');
    if (!idx) {
        try {
            const r = await fetch('/content/nfl/fields/index.json');
            if (!r.ok) return;
            idx = await r.json();
            ApiCache.set('nfl-field-index', idx, ApiCache.TTL.DAILY);
        } catch (_) { return; }
    }
    _nlg.fieldIndex = idx;
    if (_nlg.field && _nlg.lastData) {
        const r = _nlgFieldProfileFor(_nlg.lastData);
        if (r.profile && r.source !== _nlg.fieldSource) { _nlg.field.setProfile(r.profile); _nlg.fieldSource = r.source; }
    }
}

// D-118 Idea 2 -- big-play Highlight Card auto-suggest, fully gated (ISSUES.md
// "immersion brainstorm", ratified 2026-08-24, unbuilt until now). Rule-based,
// no EPA -- that version stays blocked on missing nflverse 2026 play-by-play
// data (D-081), unchanged by this. Reads sit.lastPlay, the exact same field
// the play arrow above already parses every poll -- zero new fetches. A
// qualifying play is a score, a turnover (INT or opponent fumble recovery),
// or a 20+ yard gain. Toast only, never auto-navigates (ux.md's
// every-interaction-has-a-cost rule) -- the user chose to be on this page,
// and jumping them into the Studio the instant something exciting happens
// would cost them their place in whatever they were watching. Replace-not-
// stack: a new qualifying play while one is showing replaces it rather than
// stacking a second (spec's own rate-limit rule).
// Shared qualification predicate (extracted 2026-09-13 while building Catch
// Me Up, D-156) -- both the big-play auto-suggest below and Catch Me Up's
// recap need the identical "is this a real, notable play" rule, so it lives
// in exactly one place rather than being copy-pasted a second time. A
// qualifying play is a score (scoreValue > 1 -- excludes extra points, which
// always immediately follow a TD that already got its own notice), a
// turnover (INT, or a fumble recovery that isn't the same team recovering
// its own fumble), or a 20+ yard gain. Excludes admin plays (timeout/
// penalty/etc., same filter _nlgPlayArrowSvg uses) and ESPN's own
// "*** play under review ***" marker, which ESPN mis-categorizes as a plain
// "Rush" (so the type.text admin filter alone doesn't catch it -- found live
// building Key Plays, D-155; this predicate is what propagates that fix to
// the big-play auto-suggest too, which never had it before now).
function _nlgIsBigPlay(lp) {
    if (!lp || !lp.type || typeof lp.statYardage !== 'number') return false;
    const label = (lp.type.text || '').toLowerCase();
    if (/timeout|two-minute|end of|coin toss|kneel|spike|penalty/.test(label)) return false;
    if (/^\s*\*{3}.*\*{3}\s*$/.test(lp.text || '')) return false;
    const isScore = (lp.scoreValue || 0) > 1;
    // "own" excludes a team recovering its own fumble (no possession change,
    // not the exciting turnover this rule means) -- unverified against a
    // real ESPN fumble-recovery type.text this session (a real one was
    // caught live building Key Plays, D-155, but its exact text wasn't
    // captured then), flagged rather than asserted certain.
    const isTurnover = /intercept/.test(label) || (/fumble/.test(label) && !/own/.test(label));
    const isBigGain = lp.statYardage >= 20;
    return isScore || isTurnover || isBigGain;
}

// scoreValue alone can't tell a safety (defense scores 2) from a 2-point
// conversion (offense scores 2) -- both are worth 2, completely different
// plays. Checks type.text for "safety" explicitly instead of assuming;
// anything else at scoreValue 2 reads as a plain 2-pt conversion, not
// mislabeled as a safety. Assumes _nlgIsBigPlay(lp) is already true.
function _nlgPlayKind(lp) {
    const label = (lp.type.text || '').toLowerCase();
    const isScore = (lp.scoreValue || 0) > 1;
    if (isScore) {
        return lp.scoreValue === 6 ? 'TD' : lp.scoreValue === 3 ? 'FG' : lp.scoreValue === 2 ? (/safety/.test(label) ? 'safety' : '2-pt conversion') : 'score';
    }
    const isTurnover = /intercept/.test(label) || (/fumble/.test(label) && !/own/.test(label));
    return isTurnover ? (/intercept/.test(label) ? 'INT' : 'fumble recovery') : 'big gain';
}

function _nlgCheckBigPlay() {
    // BUG FIX (found 2026-09-13, same session as the original ship): this was
    // _nlg.situation?.lastPlay, one level too shallow. fetchNFLLiveSituation()
    // (js/nfl.js) returns {situation, homeTeamId, awayTeamId} -- a wrapped
    // object, the exact same shape _nlgRenderHeader already correctly reads
    // via `_nlg.situation?.situation` a few hundred lines above this function.
    // The shallow read meant lp was always undefined in the real browser,
    // silently no-op'ing every single poll -- passed every syntax check and
    // every hand-traced-against-raw-API verification because those checks
    // never actually exercised this exact variable path. Found on a later
    // re-read while building the leverage/tension follow-up, not caught by
    // anything automated.
    const lp = _nlg.situation?.situation?.lastPlay;
    if (!lp || !lp.id || lp.id === _nlg.lastBigPlayId) return;
    _nlg.lastBigPlayId = lp.id;
    if (!_nlgIsBigPlay(lp)) return;

    const athlete = (lp.athletesInvolved || [])[0];
    if (!athlete || !athlete.id) return; // nothing to pre-select in the Studio without one

    const kind = _nlgPlayKind(lp);
    const name = _escHtml(athlete.shortName || athlete.fullName || 'That play');
    const message = `${name} — ${lp.statYardage}-yd ${kind}. Make a card?`;

    // Sound cue: score/turnover only, not a plain big gain -- same rarity
    // discipline as the tone presets themselves (see their own header
    // comment). If a critical moment ALSO fires below, its own 'critical'
    // tone plays in addition to this one -- two real, distinct facts (this
    // was a score/turnover, AND it was also a critical swing), not a
    // conflict to resolve.
    const _turnoverKinds = new Set(['INT', 'fumble recovery']);
    if (_turnoverKinds.has(kind)) _nlgPlayTone('turnover');
    else if (kind !== 'big gain') _nlgPlayTone('score');

    // Tension-tier "critical moment" (owner-directed, 2026-09-13 -- see
    // DECISIONS.md D-157 for the full reasoning). Deliberately narrower than
    // a plain qualifying big play: only a real, rare win-probability swing
    // (>=15 points) earns the full-page treatment -- an ordinary touchdown
    // in a blowout still only gets today's toast/ambient pulse. Reuses the
    // exact winprobability[] pairing Key Plays/Catch Me Up already read
    // (D-155/D-156), no new data, no new fetch.
    const wpArr = (_nlg.lastData?.winprobability || []).filter(w => typeof w.homeWinPercentage === 'number' && w.playId);
    const wpIdx = wpArr.findIndex(w => String(w.playId) === String(lp.id));
    if (wpIdx > 0) {
        const wpDelta = wpArr[wpIdx].homeWinPercentage - wpArr[wpIdx - 1].homeWinPercentage;
        if (Math.abs(wpDelta) >= 0.15) {
            const critComp = _nlgComp(_nlg.lastData);
            const critTeam = (wpDelta > 0 ? _nlgSide(critComp, 'home') : _nlgSide(critComp, 'away')).team || {};
            _nlgFireCriticalMoment(kind, critTeam, Math.round(Math.abs(wpDelta) * 100), _nlgWhyItMatters(critComp));
        }
    }

    // {immediate:true} on the replace path -- see errorHandler.js's comment on
    // dismiss(). A normal animated dismiss would leave the old toast on screen
    // for its ~250ms exit animation while the new one is already appended,
    // violating the spec's own "no more than one prompt visible ever" rule on
    // back-to-back qualifying plays (a real bug found on re-review, not a
    // theoretical one -- e.g. a pick-six's INT followed moments later by
    // another team's own big play in a different live game on the same slate
    // isn't even needed to trigger it; two qualifying plays close together in
    // THIS game alone is enough).
    if (_nlg.bigPlayDismiss) _nlg.bigPlayDismiss({ immediate: true });
    _nlg.bigPlayDismiss = ErrorHandler.toast(message, 'info', {
        title: 'Big play',
        duration: 12000,
        actions: [
            { label: 'Create Card', primary: true, onClick: () => openNFLHighlightCardForPlay(_nlg.eventId, athlete.id) },
            { label: 'Dismiss' },
        ],
    });
}

// Full-page critical-moment overlay (D-157). Genuinely rare by construction
// (see the >=15-point win-probability gate at the call site above) -- the
// same "if everything pulses nothing feels important" discipline this
// file's ambient leverage pulse already follows, just applied to a louder
// treatment for this specific tier because that intensity was the explicit,
// deliberate direction chosen for it, not a lapse in that discipline.
// pointer-events:none (set in CSS) so it never blocks reading or clicking
// the actual page underneath while it plays. One-shot and non-stacking: a
// second qualifying moment while one is already showing is simply skipped
// rather than queued or replacing the first -- these should be rare enough
// that two colliding in the same few seconds is a real edge case, not a
// common one worth building queue/replace logic for. prefers-reduced-motion
// gets a shorter, non-animated static appearance instead of losing the
// moment entirely -- same fallback posture as every other motion in this
// file, not an exception carved out for this one.
// "Why It Matters" (2026-09-13, same round as D-157) -- a deterministic,
// rules-derived game-state sentence, not an LLM-generated one. The owner's
// own brainstorm explicitly favored this over AI commentary: "generate
// deterministic explanations from your actual analytics... auditable."
// Built from data already in hand (score, quarter, clock) -- no new fetch,
// no model, nothing that could hallucinate a number that isn't real. Scoped
// to the one place it earns its keep most: the critical-moment overlay,
// replacing a bare "N-point swing" with real context about what the score
// and clock actually mean right now.
function _nlgWhyItMatters(comp) {
    const home = _nlgSide(comp, 'home'), away = _nlgSide(comp, 'away');
    const hs = parseInt(home.score, 10) || 0, as = parseInt(away.score, 10) || 0;
    const margin = Math.abs(hs - as);
    const status = comp.status || {};
    const clock = status.displayClock || '';
    const period = status.period;
    const periodLabel = period === 1 ? '1st' : period === 2 ? '2nd' : period === 3 ? '3rd' : period === 4 ? '4th' : (period > 4 ? 'OT' : '');
    const timeLine = (clock && periodLabel) ? ` with ${clock} left in the ${periodLabel}` : '';

    if (margin === 0) return `Tied${timeLine}`;
    const leaderAbbr = ((hs > as ? home : away).team || {}).abbreviation || 'Leader';
    return `${leaderAbbr} leads by ${margin}${timeLine}`;
}

let _nlgCriticalShowing = false;
function _nlgFireCriticalMoment(kind, team, deltaPct, whyItMatters) {
    if (_nlgCriticalShowing) return;
    _nlgCriticalShowing = true;
    _nlgPlayTone('critical');

    const abbr = team.abbreviation || '';
    const name = team.shortDisplayName || team.name || abbr || 'That team';
    const color = (typeof getNFLTeamColor === 'function' && getNFLTeamColor(abbr)) || 'var(--accent)';
    const verb = kind === 'TD' ? 'TOUCHDOWN'
        : kind === 'INT' ? 'INTERCEPTION'
        : kind === 'fumble recovery' ? 'FUMBLE RECOVERY'
        : kind === 'FG' ? 'FIELD GOAL'
        : kind === 'safety' ? 'SAFETY'
        : kind === '2-pt conversion' ? 'TWO-POINT CONVERSION'
        : 'GAME-CHANGING PLAY';

    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const el = document.createElement('div');
    el.className = 'nlg-critical' + (reduced ? ' nlg-critical--static' : '');
    el.style.setProperty('--nlg-critical-color', color);
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
        <div class="nlg-critical-body">
            <span class="nlg-critical-team">${_escHtml(name)}</span>
            <span class="nlg-critical-verb">${_escHtml(verb)}</span>
            <span class="nlg-critical-sub">${deltaPct}-point win probability swing</span>
            ${whyItMatters ? `<span class="nlg-critical-why">${_escHtml(whyItMatters)}</span>` : ''}
        </div>`;
    document.body.appendChild(el);

    const HOLD_MS = reduced ? 1600 : 3200;
    setTimeout(() => {
        const cleanup = () => { el.remove(); _nlgCriticalShowing = false; };
        if (reduced) { cleanup(); return; }
        el.classList.add('nlg-critical--out');
        el.addEventListener('animationend', cleanup, { once: true });
    }, HOLD_MS);
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
    const { home: hColor, away: aColor } = _nlgMatchupColors(homeAbbr, awayAbbr);
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

// Drive-history position bar (2026-09-13, "elevate the experience," D-160).
// Scoped narrower than the original brainstorm's LIVE/DRIVE/GAME field-mode
// switcher: rather than rebuild the live field viewer into a historical-
// replay engine, this adds a simple CSS start->end bar directly into the
// Play-by-Play tab's existing per-drive <details>/<summary> accordion
// (below), which already does the actual exploration job (click a drive,
// see its plays) -- turning the field position into something visible at a
// glance without expanding, not building a second, separate drive list that
// would duplicate what's already there. drive.start.yardLine/end.yardLine
// are already on the exact same home-anchored 0-100 scale the live field
// viewer's sit.yardLine uses (re-verified against a real live drive today,
// same as the shape D-105/D-148 already proved for live situations) -- no
// new conversion math, same disp() mirror the field viewer already uses.
function _nlgDriveBarHtml(d, homeAbbr, tc) {
    const s = d.start?.yardLine, e = d.end?.yardLine;
    if (typeof s !== 'number' || typeof e !== 'number') return '';
    const disp = (v) => 100 - v;
    const sPct = disp(s), ePct = disp(e);
    const teamAbbr = (d.team || {}).abbreviation || '';
    const color = tc(teamAbbr === homeAbbr ? homeAbbr : teamAbbr);
    const left = Math.min(sPct, ePct), width = Math.max(1, Math.abs(ePct - sPct));
    return `<div class="nlg-drive-bar"><div class="nlg-drive-bar-fill" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%;background:${_escHtml(color)}"></div></div>`;
}

function _nlgRenderPbp(data) {
    const comp = _nlgComp(data);
    const homeAbbr = (_nlgSide(comp, 'home').team || {}).abbreviation || '';
    const tc = (abbr) => (typeof getNFLTeamColor === 'function' && getNFLTeamColor(abbr)) || 'var(--accent)';
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
                <span class="nlg-sum-teams">${_escHtml(d.shortDisplayResult || '')}</span>
                ${_nlgDriveBarHtml(d, homeAbbr, tc)}</summary>
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
        ${_nlgKeyPlays(data)}
        ${_nlgSidebarLeaders(data)}
        ${_nlgFantasyLeadersCard(data)}
        ${_nlgGameFlow(comp, home, away)}
        ${_nlgStandingsCard(data, home, away)}
    </aside>`;
}

// Key Plays (2026-09-13, "elevate the experience" round 2) -- ranks real
// plays by win-probability swing. Deliberately NOT EPA-based: EPA/CPOE stay
// blocked on missing nflverse 2026 play-by-play data (D-081), unchanged by
// this -- same reason the big-play auto-suggest (D-152) is rule-based
// instead. WP swing is a real, already-live, already-verified (D-106)
// substitute that needs zero new data: data.winprobability[] pairs each
// entry with the playId that caused the transition FROM the previous
// entry, so the delta between consecutive entries is exactly "how much did
// this specific play move the game." Cross-referenced against
// drives.previous[].plays[]/drives.current.plays for the actual play text
// -- both already fetched for Play-by-Play/Box Score, no new fetch here
// either. Placed directly after the win-probability chart in the sidebar
// since it's derived from the exact same array.
// Flattens every play across every drive (previous + current) into one
// chronological list -- shared by Key Plays and Catch Me Up (below) so this
// isn't duplicated a second time. Already-fetched data (Play-by-Play/Box
// Score need it too), no new fetch either place.
// Chronological drive list, deduped the same way _nlgAllDrives is: ESPN
// repeats the in-progress drive as both drives.current and the last
// drives.previous entry (re-confirmed live 2026-10-04, NE@BUF). Without the
// dedup every play in that drive appeared twice here -- the cause of Catch
// Me Up listing the same kickoff return twice.
function _nlgDrivesChrono(data) {
    const drivesObj = data.drives || {};
    const cur = drivesObj.current;
    const prev = (drivesObj.previous || []).filter(d => !cur || d.id !== cur.id);
    return cur ? [...prev, cur] : prev;
}

function _nlgAllPlaysFlat(data) {
    return _nlgDrivesChrono(data).flatMap(d => d.plays || []);
}

// The one win-probability series every consumer reads (chart, Key Plays,
// break card) -- so a dot's index on the chart and a swing's wpIndex always
// refer to the same entry.
function _nlgWpSeries(data) {
    return (data.winprobability || []).filter(w => typeof w.homeWinPercentage === 'number' && w.playId);
}

// Every play's win-probability swing, in game order. ESPN's own type.text
// lies here -- a "*** play under review ***" administrative marker (not a
// real snap) is categorized as a plain "Rush," so the play-arrow's own
// type.text-based admin filter doesn't catch it. Found live: it tied for #2
// in a real ranking, right behind an actual touchdown. Filtered on the
// literal asterisk-wrapped marker text instead, the only reliable signal
// ESPN gives for this case.
function _nlgWpSwings(data) {
    const wp = _nlgWpSeries(data);
    if (wp.length < 2) return [];
    const playById = new Map(_nlgAllPlaysFlat(data).map(p => [String(p.id), p]));
    const swings = [];
    for (let i = 1; i < wp.length; i++) {
        const play = playById.get(String(wp[i].playId));
        if (!play || !play.text) continue; // no play text to show -- skip rather than render a bare percentage
        if (/^\s*\*{3}.*\*{3}\s*$/.test(play.text)) continue;
        swings.push({ delta: Math.abs(wp[i].homeWinPercentage - wp[i - 1].homeWinPercentage), play, wpIndex: i });
    }
    return swings;
}

// Top 5, numbered -- shared by the Key Plays list and the chart's numbered
// dots so the two can never disagree about which play is #3.
function _nlgKeyPlaySwings(data) {
    return _nlgWpSwings(data)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5)
        .map((s, i) => ({ ...s, rank: i + 1 }));
}

// Chart dot click -> scroll to and briefly highlight the matching Key Plays row.
function _nlgFocusKeyPlay(rank) {
    const row = document.getElementById('nlg-kp-' + rank);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    row.classList.remove('nlg-keyplay-row--focus');
    void row.offsetWidth;
    row.classList.add('nlg-keyplay-row--focus');
}

function _nlgKeyPlays(data) {
    const top = _nlgKeyPlaySwings(data);
    if (!top.length) return '';
    const rows = top.map(({ delta, play, rank }) => `
        <div class="nlg-keyplay-row" id="nlg-kp-${rank}">
            <span class="nlg-keyplay-rank">${rank}</span>
            <span class="nlg-keyplay-text">${_escHtml(play.text)}</span>
            <span class="nlg-keyplay-wp">${Math.round(delta * 100)}<span class="nlg-keyplay-wp-unit">% WP</span></span>
        </div>`).join('');

    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Key Plays</h3>
        <div class="nlg-keyplay-list">${rows}</div>
        <p class="pct-caption">Ranked by win-probability swing, not EPA (not yet available for this season)</p>
    </div>`;
}

// Catch Me Up (2026-09-13, "elevate the experience" round 2, second piece
// after Key Plays/D-155) -- a one-click recap of what happened in this game
// since the user last had it open. No accounts needed: the marker is a
// per-game play id in localStorage, same "local-first, no server round trip
// for a purely cosmetic per-visitor convenience" posture as every other
// localStorage-backed feature on this site. Reuses _nlgIsBigPlay/_nlgPlayKind
// (the exact same rules the big-play auto-suggest uses) rather than
// inventing a second definition of "notable."
//
// Computed exactly ONCE per fresh mount (called from showNFLGame, gated on
// isNewGame), not on every poll -- the marker gets advanced to "now"
// immediately as part of this same computation, so a recomputation on the
// very next poll would always find zero gap by construction. The result is
// a static snapshot of "since you were last away," which is the actual job
// to be done -- it's not supposed to keep growing while you're already
// watching (the tension layer and the big-play toast already cover "what's
// happening right now").
//
// Known, disclosed limitation: the marker advances on every fresh mount,
// which only reflects "closed the tab / navigated elsewhere and came back."
// If someone keeps this exact tab open and focused but alt-tabs away to a
// different application for an hour, the live poll (which keeps running as
// long as AppState.currentView still points at this game) will have already
// advanced the marker in the background, so nothing will appear to catch up
// on. Accepted for this scope rather than adding document.visibilityState
// tracking to close it -- the core "opened this game fresh, hours later"
// case this feature exists for is unaffected.
const NLG_CATCHUP_KEY_PREFIX = 'ss_nfl_catchup_';

function _nlgComputeCatchup(data) {
    const key = NLG_CATCHUP_KEY_PREFIX + _nlg.eventId;
    let lastSeenId = null;
    try { lastSeenId = localStorage.getItem(key); } catch (_) { /* storage disabled -- feature just never fires, not an error */ }

    const allPlays = _nlgAllPlaysFlat(data);
    const currentLastPlay = allPlays[allPlays.length - 1] || null;
    try { if (currentLastPlay?.id) localStorage.setItem(key, String(currentLastPlay.id)); } catch (_) {}

    if (!lastSeenId || !allPlays.length) return null; // first-ever visit to this game -- nothing to catch up on
    const idx = allPlays.findIndex(p => String(p.id) === String(lastSeenId));
    if (idx === -1 || idx >= allPlays.length - 1) return null; // marker not found (stale/pruned), or nothing new since

    const since = allPlays.slice(idx + 1).filter(_nlgIsBigPlay);
    if (!since.length) return null; // real plays happened, but nothing notable enough to recap

    // Win-probability context, same array/pairing Key Plays already uses
    // (D-106) -- how much things moved between the marker play and now.
    const wp = (data.winprobability || []).filter(w => typeof w.homeWinPercentage === 'number' && w.playId);
    const wpAt = (playId) => { const e = wp.find(w => String(w.playId) === String(playId)); return e ? e.homeWinPercentage : null; };
    const wpBefore = wpAt(lastSeenId);
    const wpAfter = wp.length ? wp[wp.length - 1].homeWinPercentage : null;

    return {
        plays: since.map(p => ({ text: p.text, kind: _nlgPlayKind(p) })),
        wpBefore, wpAfter,
    };
}

// Toggle handler, wired via inline onclick same as every other one-time
// button in this file's mount-once shell (e.g. "Create Highlight Card").
function _nlgToggleCatchup() {
    const panel = document.getElementById('nlgCatchup');
    if (panel) panel.hidden = !panel.hidden;
}

// Rendered once, into the mount-once shell (isFirstRender in _nlgRender) --
// not rebuilt on every poll, since the recap it shows is a static snapshot
// from the moment the page opened, not a live-updating widget.
function _nlgCatchupHtml(home, away) {
    if (!_nlg.catchupData) return '';
    const { plays, wpBefore, wpAfter } = _nlg.catchupData;
    let wpLine = '';
    if (wpBefore != null && wpAfter != null) {
        // Frame around whichever team is currently ahead -- same convention
        // _nlgWinProbability's own legend already uses, rather than always
        // reporting the home team's number regardless of which side it favors.
        const leaderIsHome = wpAfter >= 0.5;
        const abbr = ((leaderIsHome ? home : away).team || {}).abbreviation || (leaderIsHome ? 'Home' : 'Away');
        const beforePct = Math.round((leaderIsHome ? wpBefore : 1 - wpBefore) * 100);
        const afterPct = Math.round((leaderIsHome ? wpAfter : 1 - wpAfter) * 100);
        wpLine = `<p class="pct-caption">${_escHtml(abbr)} win probability: ${beforePct}% → ${afterPct}%</p>`;
    }
    const rows = plays.map(({ text, kind }) => `
        <div class="nlg-keyplay-row">
            <span class="nlg-keyplay-wp">${_escHtml(kind)}</span>
            <span class="nlg-keyplay-text">${_escHtml(text)}</span>
        </div>`).join('');
    return `<div class="nlg-catchup nlg-side-card" id="nlgCatchup" hidden>
        <h3 class="nlg-side-title">Since you last checked</h3>
        ${wpLine}
        <div class="nlg-keyplay-list">${rows}</div>
    </div>`;
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
// Chart-only pair (2026-09-26): _NFL_TEAM_COLOR has exact duplicate
// primaries (GB/PIT, CIN/DEN, ATL/HOU/KC, NE/SF) and no secondaries, so a
// collision degrades away to neutral gray — see _matchupTeamColors.
function _nlgMatchupColors(homeAbbr, awayAbbr) {
    const hex = abbr => (typeof getNFLTeamColor === 'function' && getNFLTeamColor(abbr)) || null;
    const h = hex(homeAbbr), a = hex(awayAbbr);
    const r = _matchupTeamColors(a ? { primary: a } : null, h ? { primary: h } : null);
    return { home: r.home || 'var(--accent)', away: r.away || 'var(--text-muted)' };
}

// One renderer, two sizes (2026-10-04 break card): 'small' in the sidebar,
// 'large' in the break card. Both carry quarter ticks, team labels, and the
// top-5 Key Plays as numbered dots (same numbers as the Key Plays list --
// both read _nlgKeyPlaySwings). Lines live in a stretched SVG
// (preserveAspectRatio="none" + non-scaling strokes); dots and labels are
// HTML positioned over it in %, the same split D-148 made for the field's
// team logos -- text or circles inside a stretched SVG smear into ovals, and
// inside a uniformly-scaled one they shrink to ~4px on a phone. clipPath ids
// carry the size so both charts can share a page.
const _NLG_WP_DIMS = {
    small: { w: 220, h: 56, padX: 4, padY: 5, nudgeDx: 9, nudgeDy: 30 },
    large: { w: 640, h: 120, padX: 6, padY: 8, nudgeDx: 3.5, nudgeDy: 20 },
};

function _nlgWpChartSvg(data, home, away, opts = {}) {
    const wp = _nlgWpSeries(data);
    if (wp.length < 2) return '';
    const size = opts.size === 'large' ? 'large' : 'small';
    const D = _NLG_WP_DIMS[size];
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const { home: hColor, away: aColor } = _nlgMatchupColors(homeAbbr, awayAbbr);
    const n = wp.length;
    const midY = D.h / 2;
    const xFor = (i) => D.padX + (i / (n - 1)) * (D.w - D.padX * 2);
    const yFor = (pct) => D.padY + (1 - pct) * (D.h - D.padY * 2);
    const pts = wp.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.homeWinPercentage).toFixed(1)}`).join(' ');

    const playById = new Map(_nlgAllPlaysFlat(data).map(p => [String(p.id), p]));
    const periodAt = (i) => playById.get(String(wp[i].playId))?.period?.number;
    let qticks = '';
    for (let i = 1; i < n; i++) {
        const a = periodAt(i - 1), b = periodAt(i);
        if (a && b && b !== a) {
            const x = ((xFor(i - 1) + xFor(i)) / 2).toFixed(1);
            qticks += `<line class="nlg-wp-qtick" x1="${x}" y1="${D.padY}" x2="${x}" y2="${D.h - D.padY}" vector-effect="non-scaling-stroke"/>`;
        }
    }

    let driveShade = '';
    if (opts.driveId) {
        const drive = _nlgDrivesChrono(data).find(d => String(d.id) === String(opts.driveId));
        const ids = new Set((drive?.plays || []).map(p => String(p.id)));
        const idx = wp.map((w, i) => (ids.has(String(w.playId)) ? i : -1)).filter(i => i >= 0);
        if (idx.length) {
            const x0 = xFor(Math.max(0, idx[0] - 1)), x1 = xFor(idx[idx.length - 1]);
            driveShade = `<rect class="nlg-wp-drive" x="${x0.toFixed(1)}" y="${D.padY}" width="${Math.max(1, x1 - x0).toFixed(1)}" height="${D.h - D.padY * 2}"/>`;
        }
    }

    // Plays a few snaps apart land on top of each other (live-observed: #1
    // and #3 on one CHI goal-line stand). Each dot that crowds an earlier one
    // steps TOWARD the 50% line by one dot-height per crowding neighbour --
    // a lopsided game hugs the chart's edge, so the open space is inward;
    // stepping outward pushed a dot clean off the sidebar chart (live-seen).
    const placed = [];
    const dots = _nlgKeyPlaySwings(data)
        .sort((a, b) => a.wpIndex - b.wpIndex)
        .map(({ rank, wpIndex, play }) => {
            const left = (xFor(wpIndex) / D.w) * 100;
            const top = (yFor(wp[wpIndex].homeWinPercentage) / D.h) * 100;
            const nudge = placed.filter(p => Math.abs(p.left - left) < D.nudgeDx && Math.abs(p.top - top) < D.nudgeDy).length;
            placed.push({ left, top });
            const dir = top <= 50 ? 1 : -1;
            return `<button type="button" class="nlg-wp-dot" data-rank="${rank}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;--nudge:${nudge * dir}" title="${_escHtml(`#${rank}: ${play.text}`)}" aria-label="${_escHtml(`Key play ${rank}: ${play.text}`)}" onclick="_nlgFocusKeyPlay(${rank})">${rank}</button>`;
        }).join('');

    const clipA = `nlg-wp-clip-above-${size}`, clipB = `nlg-wp-clip-below-${size}`;
    return `<div class="nlg-wp-chart nlg-wp-chart--${size}">
        <svg class="nlg-wp-svg nlg-wp-svg--${size}" viewBox="0 0 ${D.w} ${D.h}" preserveAspectRatio="none" role="img" aria-label="Win probability chart">
            <defs>
                <clipPath id="${clipA}"><rect x="0" y="0" width="${D.w}" height="${midY}"/></clipPath>
                <clipPath id="${clipB}"><rect x="0" y="${midY}" width="${D.w}" height="${D.h - midY}"/></clipPath>
            </defs>
            ${driveShade}
            ${qticks}
            <line class="nlg-wp-mid" x1="${D.padX}" y1="${midY}" x2="${D.w - D.padX}" y2="${midY}" vector-effect="non-scaling-stroke"/>
            <polyline points="${_escHtml(pts)}" fill="none" stroke="${_escHtml(hColor)}" stroke-width="2" vector-effect="non-scaling-stroke" clip-path="url(#${clipA})"/>
            <polyline points="${_escHtml(pts)}" fill="none" stroke="${_escHtml(aColor)}" stroke-width="2" vector-effect="non-scaling-stroke" clip-path="url(#${clipB})"/>
        </svg>
        <span class="nlg-wp-team nlg-wp-team--home" style="color:${_escHtml(hColor)}">${_escHtml(homeAbbr)}</span>
        <span class="nlg-wp-team nlg-wp-team--away" style="color:${_escHtml(aColor)}">${_escHtml(awayAbbr)}</span>
        ${dots}
    </div>`;
}

function _nlgWinProbability(data, home, away) {
    const wp = _nlgWpSeries(data);
    if (wp.length < 2) return '';
    const homeAbbr = (home.team || {}).abbreviation || '';
    const awayAbbr = (away.team || {}).abbreviation || '';
    const { home: hColor, away: aColor } = _nlgMatchupColors(homeAbbr, awayAbbr);
    const cur = wp[wp.length - 1].homeWinPercentage;
    const curAbbr = cur >= 0.5 ? homeAbbr : awayAbbr;
    const curColor = cur >= 0.5 ? hColor : aColor;
    const curVal = Math.round((cur >= 0.5 ? cur : 1 - cur) * 100);
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">Win Probability</h3>
        ${_nlgWpChartSvg(data, home, away, { size: 'small' })}
        <div class="nlg-wp-legend">
            <span style="color:${_escHtml(curColor)}">${_escHtml(curAbbr)} ${curVal}%</span>
            <span class="pct-caption">Win probability</span>
        </div>
    </div>`;
}

// -- Break card (2026-10-04) — replaces the field graphic during dead time
// (after scores, punts, turnovers, timeouts, quarter ends, halftime), which
// is exactly when a second-screen fan looks over and the field used to
// vanish, leaving a bare "Official Timeout at 14:15." line. Recaps the drive
// that just ended and how much it moved the game. Everything comes from the
// /summary payload already polled every 20s -- no new fetch.
//
// Drive results observed live: TD, PUNT (2026-10-04). The rest of the map
// is ESPN's documented vocabulary; any result NOT in it omits the "next
// possession" line rather than guessing (a pick-six's possession logic, for
// one, is the reverse of a plain INT's).
const _NLG_NEXT_POSS = {
    TD: 'receives', FG: 'receives',
    PUNT: 'ball', INT: 'ball', FUMBLE: 'ball', DOWNS: 'ball', 'MISSED FG': 'ball', 'BLOCKED FG': 'ball', 'BLOCKED PUNT': 'ball',
};
const _NLG_ORDINAL = { 1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH' };

// "CAR drive so far: 1 play · 11 yards · from CAR 30". Counts real snaps
// only: kickoffs (down 0), timeouts and the warning itself are excluded.
function _nlgDriveSoFarLine(drive, teamAbbr) {
    const snaps = (drive.plays || []).filter(p =>
        (p.start?.down || 0) >= 1 && String(p.type?.id) !== '75' && !/timeout/i.test(p.type?.text || ''));
    const yards = snaps.reduce((sum, p) => sum + (Number(p.statYardage) || 0), 0);
    return [
        `${teamAbbr} drive so far: ${snaps.length} play${snaps.length === 1 ? '' : 's'} · ${yards} yard${Math.abs(yards) === 1 ? '' : 's'}`,
        drive.start?.text ? `from ${drive.start.text}` : '',
    ].filter(Boolean).join(' · ');
}

function _nlgBreakInfo(data, sit) {
    const comp = _nlgComp(data);
    const statusName = comp.status?.type?.name;
    const isHalftime = statusName === 'STATUS_HALFTIME';
    const isEndPeriod = statusName === 'STATUS_END_PERIOD';
    const plays = _nlgAllPlaysFlat(data);
    // The summary and the scoreboard update at different moments: for one
    // poll after a score the scoreboard can still report the pre-snap down
    // (live-observed 2026-10-04 -- header said 7-6 while the field still
    // showed 1st & Goal). A scoring play as the summary's latest play wins
    // over a stale down. A missing situation is NOT treated as a break --
    // a failed scoreboard fetch mid-drive shouldn't flip the card on.
    const lastPlay = plays[plays.length - 1];
    const justScored = !!lastPlay?.scoringPlay;
    // Two-minute warning (D-172): a TV timeout in all but name, but ESPN keeps
    // a live down through it (live-observed DET @ CAR 2026-10-04: 1st & 10),
    // so the no-valid-down rule never fired. Keyed on play type id 75, not
    // the text. Mid-drive, so it recaps the drive IN PROGRESS, not the last
    // finished one, and leaves the down-and-distance on screen.
    const isTwoMinute = String(lastPlay?.type?.id) === '75';
    const downLive = sit && typeof sit.down === 'number' && sit.down >= 1;
    if (!isHalftime && !isEndPeriod && !justScored && !isTwoMinute && (!sit || downLive)) return null;

    const drives = _nlgDrivesChrono(data);
    const drive = isTwoMinute
        ? drives.find(d => (d.plays || []).some(p => String(p.id) === String(lastPlay.id)))
        : [...drives].reverse().find(d => d.result);
    if (!drive || !(drive.plays || []).length) return null;

    const home = _nlgSide(comp, 'home'), away = _nlgSide(comp, 'away');
    const homeAbbr = home.team?.abbreviation || '', awayAbbr = away.team?.abbreviation || '';
    const teamAbbr = drive.team?.abbreviation || '';
    const oppAbbr = teamAbbr === homeAbbr ? awayAbbr : (teamAbbr === awayAbbr ? homeAbbr : '');

    const headline = isTwoMinute ? 'TWO-MINUTE WARNING'
        : isHalftime ? 'HALFTIME'
        : isEndPeriod ? `END OF ${_NLG_ORDINAL[comp.status?.period] || 'QUARTER'}`
        : `${teamAbbr} ${String(drive.displayResult || drive.result).toUpperCase()}`.trim();

    // A status headline (HALFTIME / END OF 2ND) doesn't name the drive, so the
    // drive line has to -- live-seen at GB@TB halftime, where "3 plays · 4
    // yards" read as a mystery until the 58-yard FG three lines further down.
    const statusHeadline = isHalftime || isEndPeriod;
    const driveLine = isTwoMinute ? _nlgDriveSoFarLine(drive, teamAbbr) : [
        statusHeadline ? `Last drive: ${teamAbbr} ${drive.displayResult || drive.result}`.trim() : '',
        String(drive.description || '').split(', ').filter(Boolean).join(' · '),
        drive.start?.text ? `from ${drive.start.text}` : '',
    ].filter(Boolean).join(' · ');

    // Swing measured from the entry just BEFORE the drive's first play (each
    // winprobability entry is the state AFTER its playId -- D-106) to now,
    // framed around whoever leads now, same convention as Catch Me Up.
    const wp = _nlgWpSeries(data);
    const driveIds = new Set(drive.plays.map(p => String(p.id)));
    const firstIdx = wp.findIndex(w => driveIds.has(String(w.playId)));
    let wpBeforePct = null, wpAfterPct = null, leaderAbbr = null;
    if (firstIdx > 0) {
        const before = wp[firstIdx - 1].homeWinPercentage;
        const after = wp[wp.length - 1].homeWinPercentage;
        const leaderIsHome = after >= 0.5;
        leaderAbbr = leaderIsHome ? homeAbbr : awayAbbr;
        wpBeforePct = Math.round((leaderIsHome ? before : 1 - before) * 100);
        wpAfterPct = Math.round((leaderIsHome ? after : 1 - after) * 100);
    }

    const driveSwings = _nlgWpSwings(data).filter(s => driveIds.has(String(s.play.id)));
    const biggest = driveSwings.sort((a, b) => b.delta - a.delta)[0];
    const keyRank = biggest ? (_nlgKeyPlaySwings(data).find(k => String(k.play.id) === String(biggest.play.id))?.rank || null) : null;
    const swingPlay = biggest ? { text: biggest.play.text, rank: keyRank, deltaPct: Math.round(biggest.delta * 100) } : null;

    const nextVerb = _NLG_NEXT_POSS[String(drive.result || '').toUpperCase()];
    const nextPoss = (!isHalftime && !isEndPeriod && !isTwoMinute && nextVerb && oppAbbr) ? `${oppAbbr} ${nextVerb}` : null;

    return { headline, driveId: String(drive.id), driveTeam: teamAbbr, driveLine, leaderAbbr, wpBeforePct, wpAfterPct, swingPlay, nextPoss, keepSituation: isTwoMinute };
}

function _nlgBreakCardHtml(info, data, home, away, tc) {
    // Entrance animation only when the break itself changes (new drive or
    // new status headline) -- the header rebuilds every 20s poll, and a
    // long official timeout shouldn't re-flash the card on every tick.
    const key = `${info.driveId}|${info.headline}`;
    const flash = _nlg.lastBreakKey !== undefined && _nlg.lastBreakKey !== key ? ' nlg-break--enter' : '';
    _nlg.lastBreakKey = key;
    const wpLine = info.wpBeforePct != null
        ? (() => {
            const diff = info.wpAfterPct - info.wpBeforePct;
            const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
            return `<div class="nlg-break-wp"><span>${_escHtml(info.leaderAbbr)} win probability</span>
                <span class="nlg-break-wp-vals">${info.wpBeforePct}% → ${info.wpAfterPct}%</span>
                <span class="nlg-break-wp-delta">${sign}${Math.abs(diff)}</span></div>`;
        })()
        : '';
    const swing = info.swingPlay
        ? `<p class="nlg-break-swing"><span class="nlg-break-label">Biggest play${info.swingPlay.rank ? ` · Key Play #${info.swingPlay.rank}` : ''}</span>${_escHtml(info.swingPlay.text)}</p>`
        : '';
    return `<section class="nlg-break${flash}" style="--tc:${_escHtml(tc(info.driveTeam))}" aria-live="polite">
        <div class="nlg-break-head">
            <span class="nlg-break-kicker">${_escHtml(info.headline)}</span>
            ${info.nextPoss ? `<span class="nlg-break-next">Next: ${_escHtml(info.nextPoss)}</span>` : ''}
        </div>
        ${info.driveLine ? `<div class="nlg-break-drive">${_escHtml(info.driveLine)}</div>` : ''}
        ${wpLine}
        ${_nlgWpChartSvg(data, home, away, { size: 'large', driveId: info.driveId })}
        ${swing}
    </section>`;
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
    const { home: hColor, away: aColor } = _nlgMatchupColors(homeAbbr, awayAbbr);
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

// ============================================================
// NBA Game Center (D-185) — the capability layer js/bballLiveGame.js
// switches to when a sport's _BLG_SPORTS entry sets gameCenter: true.
// Only NBA does: every surface here was built and checked against real
// NBA /summary payloads (2026-10-26: final 401909861, live 401909868-71,
// pregame 401909872). WNBA/NCAAB keep the original viewer until someone
// verifies their payloads the same way and flips the flag.
//
// Pure math lives in js/bballGameMath.js (BballMath); this file only
// renders. Every computed number carries its receipt (DESIGN.md house
// pattern 1): an "est" chip, a formula caption, or "computed from
// play-by-play".
//
// Live-verified quirks this file works around:
//   - competitors[].possession reads false for both teams mid-game, so no
//     possession arrow is drawn anywhere.
//   - fouls.bonusState/foulsToGive describe the FOULING team (BOS at 4
//     fouls: 1 to give, NONE), so the strip says "over the limit", never
//     "in the bonus".
//   - timeoutsRemaining reads 0 for both teams at halftime (two games
//     checked, one had shown 5 minutes earlier), so a break that reads 0
//     for both hides timeouts instead of showing a false zero. Other
//     breaks keep them: at the end of regulation in a tied game (401909869)
//     both read 2, the real overtime allotment.
//   - During a break the foul fields mix periods: the ended period's count
//     next to the next period's foulsToGive/bonusState (5 PF beside
//     "4 to give" entering OT). Breaks show the count only.
//   - The same glitches persist into the first instant of the next period:
//     at OT 5:00 with no plays run, both teams read 0 PF yet "over the
//     limit" and 0 timeouts (401909869, a minute after reading 2 each).
//     So "between periods" (ctx.handoff) also covers a clock that still
//     shows the full period length.
//   - Through the rest of that OT both teams read timeoutsRemaining 0 AND
//     timeoutsUsed 0, though each had used exactly 7 in regulation and
//     none in OT: ESPN blanks the whole block. 0 remaining with 0 used is
//     impossible, so that pair hides the team's timeouts; a real late-game
//     0 always has used > 0 and still shows.
// ============================================================

const BGC_TABS = [
    { id: 'story', label: 'Game Story' },
    { id: 'shots', label: 'Shots', needs: 'shots' },
    { id: 'pbp', label: 'Play-by-Play' },
    { id: 'box', label: 'Box Score' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'team', label: 'Team Stats' },
];

// A play is "key" in Play-by-Play when ESPN's win probability moved this
// many points on it.
const BGC_KEY_SWING = 0.05;
const BGC_MIN_SHOTS = 10;

// -- Context: everything derived from one /summary, computed once ---------

function _bgcAthletes(data) {
    const map = new Map();
    ((data.boxscore && data.boxscore.players) || []).forEach(tb => {
        const teamId = String((tb.team || {}).id || '');
        const g = tb.statistics && tb.statistics[0];
        if (!g) return;
        (g.athletes || []).forEach(a => {
            const ath = a.athlete || {};
            if (!ath.id) return;
            map.set(String(ath.id), { id: String(ath.id), teamId, short: ath.shortName || ath.displayName || '' });
        });
    });
    return map;
}

function _bgcCtx(data) {
    if (_blg.ctx && _blg.ctx.data === data) return _blg.ctx;
    const M = BballMath;
    const cfg = _BLG_SPORTS[_blg.sport];
    const comp = _blgComp(data);
    const home = _blgSide(comp, 'home'), away = _blgSide(comp, 'away');
    const st = comp.status || {};
    const stType = st.type || {};
    const state = stType.state || 'post';
    const fmt = M.gameFormat(data);
    const plays = data.plays || [];
    const ids = { home: String((home.team || {}).id || ''), away: String((away.team || {}).id || '') };
    const last = plays[plays.length - 1];
    let endT = 0;
    if (state === 'in' && st.period) endT = M.elapsedAt(st.period, st.displayClock, fmt);
    else if (last) endT = M.elapsedAt(last.period && last.period.number, last.clock && last.clock.displayValue, fmt);
    const tl = M.wpTimeline(plays, data.winprobability, fmt);
    const swingById = new Map();
    for (let i = 1; i < tl.length; i++) swingById.set(String(tl[i].play.id), tl[i].home - tl[i - 1].home);
    const shotsAllowed = !!cfg.shotChart && comp.shotChartAvailable !== false;
    const shots = shotsAllowed ? M.validShots(plays) : [];
    const ctx = {
        data, cfg, comp, home, away, ids, state, fmt, plays, endT, tl, swingById, shots,
        events: M.scoringEvents(plays, fmt),
        athletes: _bgcAthletes(data),
        // Live games keep the tab while shots trickle in so the tab row
        // doesn't jump mid-game; a final with too few located shots hides it.
        shotsTab: shotsAllowed && (state === 'in' || shots.length >= BGC_MIN_SHOTS),
        handoff: /HALFTIME|END_PERIOD/.test(stType.name || '') ||
            (state === 'in' && st.period > 0 && M.parseClock(st.displayClock) >= M.periodLen(st.period, fmt)),
        colors: _blgMatchupColors(home.team, away.team),
        abbr: { home: (home.team || {}).abbreviation || '', away: (away.team || {}).abbreviation || '' },
    };
    ctx.sideOf = (teamId) => (String(teamId) === ids.home ? 'home' : String(teamId) === ids.away ? 'away' : null);
    _blg.ctx = ctx;
    return ctx;
}

function _bgcWhen(ctx, period, clock) {
    return `${BballMath.periodLabel(period, ctx.fmt)} ${clock}`;
}
function _bgcWhenT(ctx, t) {
    const c = BballMath.clockAt(t, ctx.fmt);
    return _bgcWhen(ctx, c.period, c.clock);
}
function _bgcPlayWhen(ctx, p) {
    return _bgcWhen(ctx, (p.period && p.period.number) || 1, (p.clock && p.clock.displayValue) || '');
}
// Away first everywhere, matching the header and linescore.
function _bgcScoreLine(ctx, away, home) {
    return `${ctx.abbr.away} ${away} – ${ctx.abbr.home} ${home}`;
}
function _bgcPct(v, digits = 1) { return v == null ? '—' : (v * 100).toFixed(digits) + '%'; }
function _bgcRate(v) { return v == null ? '—' : v.toFixed(3).replace(/^0/, ''); }
function _bgcEst() { return '<span class="bgc-est" title="Estimated from box-score totals, not tracked possession data">est</span>'; }
function _bgcTeamDot(ctx, side) { return `<span class="bgc-dot" style="background:${_escHtml(ctx.colors[side])}"></span>`; }
function _bgcEmpty(title, sub) {
    return `<div class="nlg-empty-tab"><p class="nlg-empty-tab-title">${_escHtml(title)}</p>${sub ? `<p class="pct-caption">${_escHtml(sub)}</p>` : ''}</div>`;
}
function _bgcPlayerLink(ctx, id, name) {
    if (!id || !ctx.cfg.playerView) return `<span>${_escHtml(name)}</span>`;
    return `<button type="button" class="bgc-plink" onclick="navigateTo('${ctx.cfg.playerView}${_escHtml(String(id))}')">${_escHtml(name)}</button>`;
}

// -- Tabs -------------------------------------------------------------

function _bgcTabs(ctx) {
    return BGC_TABS.filter(t => t.needs !== 'shots' || ctx.shotsTab);
}

function _bgcRenderTab(ctx, tab) {
    switch (tab) {
        case 'shots': return ctx.shotsTab ? _bgcShotsTab(ctx) : _bgcStory(ctx);
        case 'pbp': return _bgcPbp(ctx);
        case 'box': return _bgcBox(ctx);
        case 'analytics': return _bgcAnalytics(ctx);
        case 'team': return _blgTeamStats(ctx.data, ctx.home, ctx.away);
        default: return _bgcStory(ctx);
    }
}

// -- Freshness receipt (header) ------------------------------------------

function _bgcAgo(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
}

function _bgcFresh() {
    const data = _blg.lastData;
    if (!data) return { text: '', stale: false };
    const meta = data.meta || {};
    const now = Date.now();
    const upd = meta.lastUpdatedAt || meta.lastPlayWallClock;
    const updD = upd ? new Date(upd) : null;
    const validUpd = updD && !isNaN(updD);
    const state = _blgState(data);
    if (state === 'in') {
        if (_blg.lastOkAt && now - _blg.lastOkAt > 60000) {
            return { text: `Stale · last good data ${_bgcAgo(now - _blg.lastOkAt)} ago · retrying`, stale: true };
        }
        const parts = [];
        if (validUpd) parts.push('ESPN updated ' + updD.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
        if (_blg.lastOkAt) parts.push('checked ' + _bgcAgo(now - _blg.lastOkAt) + ' ago');
        return { text: parts.join(' · '), stale: false };
    }
    if (state === 'post') {
        return { text: validUpd ? 'Final · last ESPN update ' + updD.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Final', stale: false };
    }
    return { text: _blg.lastOkAt ? 'Pregame · checked ' + _bgcAgo(now - _blg.lastOkAt) + ' ago' : '', stale: false };
}

function _bgcCountdown(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const mins = Math.round((d - Date.now()) / 60000);
    if (mins <= 0) return 'Tip-off due now';
    if (mins < 60) return `Tips in ${mins}m`;
    const h = Math.floor(mins / 60);
    if (h < 48) return `Tips in ${h}h ${mins % 60}m`;
    return `Tips in ${Math.round(h / 24)} days`;
}

// 5s label refresh: text-only writes, never a re-render, so it can't move
// scroll or focus. Self-clears once the viewer is no longer on screen.
function _bgcTick() {
    const cfg = _BLG_SPORTS[_blg.sport];
    if (!cfg || AppState.currentView !== cfg.gamePrefix + _blg.eventId) {
        clearInterval(_blg.freshTimer); _blg.freshTimer = null; return;
    }
    const el = document.querySelector('.bgc-fresh');
    if (el) {
        const f = _bgcFresh();
        el.textContent = f.text;
        el.classList.toggle('bgc-fresh--stale', f.stale);
    }
    const cd = document.querySelector('.bgc-countdown');
    if (cd && cd.dataset.iso) cd.textContent = _bgcCountdown(cd.dataset.iso);
}

function _bgcEnsureTicker() {
    if (!_blg.freshTimer) _blg.freshTimer = setInterval(_bgcTick, 5000);
    _bgcTick();
}

// -- Game-state strip (live only) -----------------------------------------

function _bgcLastPlay(ctx) {
    for (let i = ctx.plays.length - 1; i >= 0; i--) if (ctx.plays[i].text) return ctx.plays[i];
    return null;
}

function _bgcCurrentWp(ctx) {
    const last = ctx.tl[ctx.tl.length - 1];
    if (!last) return null;
    const side = last.home >= 0.5 ? 'home' : 'away';
    return { side, pct: side === 'home' ? last.home : 1 - last.home };
}

// Never renders 100%: ESPN's model can sit at 1.0 in a decided game, and a
// probability shown to the user should not claim certainty.
function _bgcWpLabel(p) {
    const v = p * 100;
    if (v > 99) return '>99%';
    if (v < 1) return '<1%';
    return Math.round(v) + '%';
}

function _bgcBroadcastNames(ctx) {
    const seen = new Set();
    (ctx.comp.broadcasts || []).forEach(b => {
        const n = (b.media && (b.media.shortName || b.media.name)) || b.station || '';
        if (n) seen.add(n);
    });
    return [...seen];
}

function _bgcStripHtml(ctx) {
    if (ctx.state !== 'in') return '';
    const cells = [];
    const lp = _bgcLastPlay(ctx);
    if (lp) {
        cells.push(`<div class="bgc-strip-cell bgc-strip-cell--play">
            <span class="eyebrow">Last play · ${_escHtml(_bgcPlayWhen(ctx, lp))}</span>
            <span class="bgc-strip-play">${_escHtml(lp.text)}</span>
            <span class="bgc-strip-sub">${_escHtml(_bgcScoreLine(ctx, lp.awayScore, lp.homeScore))}</span>
        </div>`);
    }
    // 0 remaining with 0 used is impossible (unused timeouts are remaining
    // ones), so it marks a blanked block. Without timeoutsUsed, fall back to
    // the between-periods both-zero signature.
    const zeroTimeoutHandoff = ctx.handoff && ctx.home.timeoutsRemaining === 0 && ctx.away.timeoutsRemaining === 0;
    const timeoutsBlank = (c) => c.timeoutsRemaining === 0 && (c.timeoutsUsed === 0 || (c.timeoutsUsed == null && zeroTimeoutHandoff));
    const teamRow = (side) => {
        const c = ctx[side];
        const f = c.fouls;
        const bits = [];
        if (f && f.teamFoulsCurrent != null) {
            bits.push(`<span title="Team fouls this period (game total)">${_escHtml(String(f.teamFoulsCurrent))} PF <span class="bgc-muted">(${_escHtml(String(f.teamFouls != null ? f.teamFouls : '—'))})</span></span>`);
            if (!ctx.handoff && f.teamFoulsCurrent > 0 && f.bonusState && f.bonusState !== 'NONE') bits.push('<span class="bgc-tag" title="This team is over the foul limit: the opponent shoots free throws on non-shooting fouls">Over limit</span>');
            else if (!ctx.handoff && f.foulsToGive > 0) bits.push(`<span class="bgc-muted" title="Fouls this team can commit before the opponent shoots free throws">${_escHtml(String(f.foulsToGive))} to give</span>`);
        }
        if (!timeoutsBlank(c) && c.timeoutsRemaining != null) bits.push(`<span title="Timeouts remaining">${_escHtml(String(c.timeoutsRemaining))} TO</span>`);
        if (!bits.length) return '';
        return `<div class="bgc-strip-team">${_bgcTeamDot(ctx, side)}<strong>${_escHtml(ctx.abbr[side])}</strong>${bits.join('')}</div>`;
    };
    const rows = teamRow('away') + teamRow('home');
    if (rows) {
        const per = (ctx.comp.status && ctx.comp.status.period) || 1;
        cells.push(`<div class="bgc-strip-cell"><span class="eyebrow">Fouls &amp; timeouts · ${_escHtml(BballMath.periodLabel(per, ctx.fmt))}</span>${rows}</div>`);
    }
    const wp = _bgcCurrentWp(ctx);
    if (wp) {
        cells.push(`<div class="bgc-strip-cell">
            <span class="eyebrow">Win probability</span>
            <span class="bgc-strip-big">${_bgcTeamDot(ctx, wp.side)}${_escHtml(ctx.abbr[wp.side])} ${_bgcWpLabel(wp.pct)}</span>
            <span class="bgc-strip-sub">ESPN model</span>
        </div>`);
    }
    const bc = _bgcBroadcastNames(ctx);
    if (bc.length) {
        cells.push(`<div class="bgc-strip-cell"><span class="eyebrow">Watch</span><span class="bgc-strip-sub">${_escHtml(bc.slice(0, 3).join(' · '))}</span></div>`);
    }
    return cells.length ? `<div class="bgc-strip" aria-label="Game state">${cells.join('')}</div>` : '';
}

// -- Game Story ------------------------------------------------------------

function _bgcStory(ctx) {
    if (!ctx.plays.length) return _bgcEmpty('No plays yet', 'The game story builds from play-by-play once the ball is tipped.');
    return [
        ctx.state === 'post' ? _bgcRecap(ctx) : _bgcNow(ctx),
        _blgLinescore(ctx.data, ctx.comp, ctx.home, ctx.away),
        _bgcStoryStats(ctx),
        _bgcKeyPlaysCard(ctx),
        _bgcLeadersMain(ctx),
        _blgInjuriesCard(ctx.data),
        _bgcNewsCard(ctx.data),
    ].join('');
}

function _bgcRunText(ctx, run) {
    return `${ctx.abbr[run.side]} ${run.pts}-0 run`;
}

function _bgcNow(ctx) {
    const lp = _bgcLastPlay(ctx);
    const r = BballMath.runs(ctx.events).current;
    const runLine = r && r.pts >= 5
        ? `<div class="bgc-now-run">${_bgcTeamDot(ctx, r.side)}<strong>${_escHtml(_bgcRunText(ctx, r))}</strong> <span class="bgc-muted">since ${_escHtml(_bgcPlayWhen(ctx, r.start.play))}, computed from play-by-play</span></div>`
        : '';
    return `<div class="nlg-card bgc-now">
        <div class="nlg-sum">Right now</div>
        <div class="bgc-now-body">
            ${lp ? `<div class="bgc-now-play"><span class="bgc-when">${_escHtml(_bgcPlayWhen(ctx, lp))}</span><span>${_escHtml(lp.text)}</span><span class="bgc-score">${_escHtml(_bgcScoreLine(ctx, lp.awayScore, lp.homeScore))}</span></div>` : ''}
            ${runLine}
        </div>
    </div>`;
}

function _bgcRecap(ctx) {
    const M = BballMath;
    const h = ctx.home, a = ctx.away;
    const winSide = h.winner ? 'home' : (a.winner ? 'away' : (Number(h.score) >= Number(a.score) ? 'home' : 'away'));
    const loseSide = winSide === 'home' ? 'away' : 'home';
    const lines = [];
    const turn = M.wpSwings(ctx.tl, 1)[0];
    if (turn) {
        const s = _bgcSwingFor(turn);
        lines.push(`<div class="bgc-recap-row"><span class="eyebrow">Turning point</span>
            <span><span class="bgc-when">${_escHtml(_bgcPlayWhen(ctx, turn.play))}</span> ${_escHtml(turn.play.text)}</span>
            <span class="bgc-muted">${_escHtml(ctx.abbr[s.side])} win probability ${_bgcWpLabel(s.b)} → ${_bgcWpLabel(s.a)}, the biggest single-play swing</span></div>`);
    }
    const big = M.runs(ctx.events).biggest;
    const best = [big.home, big.away].filter(Boolean).sort((x, y) => y.pts - x.pts)[0];
    if (best) {
        lines.push(`<div class="bgc-recap-row"><span class="eyebrow">Biggest run</span>
            <span>${_escHtml(_bgcRunText(ctx, best))}, ${_escHtml(_bgcPlayWhen(ctx, best.start.play))} to ${_escHtml(_bgcPlayWhen(ctx, best.end.play))}</span></div>`);
    }
    const perf = (ctx.data.leaders || []).map(tb => {
        const pts = (tb.leaders || []).find(c => c.name === 'points');
        const top = pts && pts.leaders && pts.leaders[0];
        if (!top) return '';
        const nm = (top.athlete && (top.athlete.shortName || top.athlete.displayName)) || '';
        return `${(tb.team || {}).abbreviation || ''}: ${nm} ${top.displayValue || ''}`;
    }).filter(Boolean);
    if (perf.length) {
        lines.push(`<div class="bgc-recap-row"><span class="eyebrow">Top scorers</span><span>${_escHtml(perf.join(' · '))}</span></div>`);
    }
    const ff = _bgcFourFactorsData(ctx);
    if (ff) {
        lines.push(`<div class="bgc-recap-row"><span class="eyebrow">Shooting (eFG%)</span>
            <span>${_escHtml(ctx.abbr.away)} ${_bgcPct(ff.away.efg)} · ${_escHtml(ctx.abbr.home)} ${_bgcPct(ff.home.efg)}</span>
            <button type="button" class="bgc-link" onclick="_blgSwitchTab('analytics')">All Four Factors →</button></div>`);
    }
    return `<div class="nlg-card bgc-recap">
        <div class="nlg-sum">Final <span class="nlg-sum-teams">${_escHtml(ctx.abbr[winSide])} ${_escHtml(String(ctx[winSide].score))}, ${_escHtml(ctx.abbr[loseSide])} ${_escHtml(String(ctx[loseSide].score))}</span></div>
        <div class="bgc-recap-body">${lines.join('')}</div>
        <p class="pct-caption bgc-pad">Turning point and run computed from play-by-play and ESPN's win-probability feed.</p>
    </div>`;
}

function _bgcStoryStats(ctx) {
    const M = BballMath;
    const r = M.runs(ctx.events).biggest;
    const l = M.leads(ctx.plays);
    const d = M.droughts(ctx.events, ctx.endT);
    const live = ctx.state === 'in';
    const cell = (main, sub) => `<td><span class="bgc-stat">${_escHtml(main)}</span>${sub ? `<span class="bgc-stat-sub">${_escHtml(sub)}</span>` : ''}</td>`;
    const runCell = (side) => r[side] ? cell(`${r[side].pts}-0`, _bgcPlayWhen(ctx, r[side].start.play)) : cell('—');
    const leadCell = (side) => l[side] ? cell('+' + l[side].lead, _bgcPlayWhen(ctx, l[side].play)) : cell('Never led');
    const droughtCell = (side) => {
        const x = d[side];
        if (!x) return cell('—');
        const ongoing = x.open && live;
        return cell(M.fmtSec(x.sec) + (ongoing ? ' and counting' : ''), `${_bgcWhenT(ctx, x.from)} to ${ongoing ? 'now' : _bgcWhenT(ctx, x.to)}`);
    };
    return `<div class="nlg-card">
        <div class="nlg-sum">Game shape</div>
        <div class="bgc-table-wrap"><table class="bgc-table">
            <thead><tr><th></th><th>${_bgcTeamDot(ctx, 'away')}${_escHtml(ctx.abbr.away)}</th><th>${_bgcTeamDot(ctx, 'home')}${_escHtml(ctx.abbr.home)}</th></tr></thead>
            <tbody>
                <tr><th scope="row">Biggest run</th>${runCell('away')}${runCell('home')}</tr>
                <tr><th scope="row">Biggest lead</th>${leadCell('away')}${leadCell('home')}</tr>
                <tr><th scope="row">Longest scoring drought</th>${droughtCell('away')}${droughtCell('home')}</tr>
            </tbody>
        </table></div>
        <p class="pct-caption bgc-pad">Computed from play-by-play. A run is unanswered points; a drought is game clock without scoring a point (free throws count).</p>
    </div>`;
}

function _bgcSwingFor(sw) {
    const side = sw.delta >= 0 ? 'home' : 'away';
    return { side, b: side === 'home' ? sw.before : 1 - sw.before, a: side === 'home' ? sw.after : 1 - sw.after };
}

function _bgcKeyPlaysCard(ctx) {
    const top = BballMath.wpSwings(ctx.tl, 5);
    if (!top.length) return '';
    const rows = top.map((sw, i) => {
        const s = _bgcSwingFor(sw);
        return `<div class="nlg-keyplay-row bgc-kp-row">
            <span class="nlg-keyplay-rank">${i + 1}</span>
            <span class="bgc-kp-main">
                <span class="bgc-when">${_escHtml(_bgcPlayWhen(ctx, sw.play))}</span>
                <span class="nlg-keyplay-text">${_escHtml(sw.play.text)}</span>
                <span class="bgc-muted">${_escHtml(_bgcScoreLine(ctx, sw.play.awayScore, sw.play.homeScore))}</span>
            </span>
            <span class="bgc-kp-wp">${_escHtml(ctx.abbr[s.side])} ${_bgcWpLabel(s.b)} → ${_bgcWpLabel(s.a)}</span>
        </div>`;
    }).join('');
    return `<div class="nlg-card">
        <div class="nlg-sum">Key plays</div>
        <div class="nlg-keyplay-list bgc-pad">${rows}</div>
        <p class="pct-caption bgc-pad">Ranked by how far ESPN's win probability moved on the play, matched to each play by its play id.</p>
    </div>`;
}

function _bgcLeadersMain(ctx) {
    const pre = ctx.state === 'pre';
    const blocks = (ctx.data.leaders || []).map(tb => {
        const abbr = (tb.team || {}).abbreviation || '';
        const side = ctx.abbr.home === abbr ? 'home' : 'away';
        const rows = (tb.leaders || []).slice(0, 3).map(c => {
            const top = c.leaders && c.leaders[0];
            if (!top) return '';
            const ath = top.athlete || {};
            return `<div class="bgc-leader"><span class="nlg-leader-cat">${_escHtml(c.shortDisplayName || c.displayName || '')}</span>${_bgcPlayerLink(ctx, ath.id, ath.shortName || ath.displayName || '')}<span class="bgc-leader-val">${_escHtml(top.displayValue || '')}</span></div>`;
        }).join('');
        return rows ? `<div class="bgc-leader-team"><div class="nlg-leader-team-title">${_bgcTeamDot(ctx, side)}${_escHtml(abbr)}</div>${rows}</div>` : '';
    }).filter(Boolean);
    if (!blocks.length) return '';
    return `<div class="nlg-card">
        <div class="nlg-sum">${pre ? 'Season leaders <span class="nlg-sum-teams">per game</span>' : 'Game leaders'}</div>
        <div class="bgc-leaders">${blocks.join('')}</div>
    </div>`;
}

// Same feed as _blgNewsCard, relabeled: ESPN returns league-wide headlines
// here, not stories about this game.
function _bgcNewsCard(data, open) {
    const html = _blgNewsCard(data);
    if (!html) return '';
    return html.replace('<details class="nlg-card">', `<details class="nlg-card"${open ? ' open' : ''}>`)
        .replace(/>[^<]* News<\/summary>/, '>League news <span class="nlg-sum-teams">via ESPN</span></summary>');
}

// -- Shots -------------------------------------------------------------

function _bgcShotFilter() {
    if (!_blg.shotFilter) _blg.shotFilter = { team: 'all', player: '', period: 'all', result: 'all' };
    return _blg.shotFilter;
}

function _bgcSetShot(key, value) {
    const f = _bgcShotFilter();
    f[key] = value;
    if (key === 'team') f.player = '';
    _blgRenderActiveTabBody(true);
}

function _bgcFilteredShots(ctx) {
    const f = _bgcShotFilter();
    return ctx.shots.filter(s =>
        (f.team === 'all' || ctx.sideOf(s.teamId) === f.team) &&
        (!f.player || s.shooterId === f.player) &&
        (f.period === 'all' || String(s.period) === f.period) &&
        (f.result === 'all' || (f.result === 'made') === s.made));
}

// Half court in feet x10, baseline at the top. Markings follow NBA
// dimensions (50x47 half court, 16-ft lane to a 19-ft FT line, 23.75-ft arc,
// 22-ft corners, 4-ft restricted area). Left/right is ESPN's x as given.
function _bgcCourtSvg(markers) {
    const hy = 52.5;
    return `<svg class="bgc-court" viewBox="0 0 500 470" role="img" aria-label="Shot chart, half court with the hoop at the top">
        <g class="bgc-court-lines" fill="none">
            <rect x="0" y="0" width="500" height="470"/>
            <rect x="170" y="0" width="160" height="190"/>
            <circle cx="250" cy="190" r="60"/>
            <line x1="220" y1="40" x2="280" y2="40"/>
            <circle cx="250" cy="${hy}" r="7.5"/>
            <path d="M210,${hy} A40,40 0 0 0 290,${hy}"/>
            <path d="M30,0 L30,142 A237.5,237.5 0 0 0 470,142 L470,0"/>
            <path d="M190,470 A60,60 0 0 1 310,470"/>
        </g>
        ${markers}
    </svg>`;
}

function _bgcShotMarker(ctx, s) {
    const { cx, cy } = BballMath.toCourt(s);
    const x = cx * 10, y = Math.min(cy, 46.5) * 10;
    const color = _escHtml(ctx.colors[ctx.sideOf(s.teamId) || 'home']);
    const paint = s.made ? `fill="${color}" stroke="${color}"` : `fill="none" stroke="${color}"`;
    const title = `<title>${_escHtml(_bgcWhen(ctx, s.period, s.clock))} · ${_escHtml(s.text)}</title>`;
    const cls = `bgc-shot ${s.made ? 'bgc-shot--made' : 'bgc-shot--miss'}`;
    if (s.three) return `<rect class="${cls}" x="${(x - 6).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="12" height="12" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})" ${paint}>${title}</rect>`;
    return `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" ${paint}>${title}</circle>`;
}

function _bgcZoneTable(ctx, shots) {
    const M = BballMath;
    const z = M.zoneSplits(shots);
    const total = shots.length;
    const rows = M.ZONES.map(k => `<tr><th scope="row">${_escHtml(M.ZONE_LABEL[k])}</th>
        <td class="bgc-mono">${z[k].fgm}-${z[k].fga}</td>
        <td class="bgc-mono">${z[k].fga ? _bgcPct(z[k].fgm / z[k].fga) : '—'}</td>
        <td class="bgc-mono">${total ? _bgcPct(z[k].fga / total, 0) : '—'}</td></tr>`).join('');
    return `<div class="bgc-table-wrap"><table class="bgc-table bgc-table--num">
        <thead><tr><th>Zone</th><th>FGM-FGA</th><th>FG%</th><th>Share</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function _bgcShotsTab(ctx) {
    if (ctx.shots.length < BGC_MIN_SHOTS) {
        return _bgcEmpty('Shot chart fills in as shots go up', `${ctx.shots.length} located field-goal attempt${ctx.shots.length === 1 ? '' : 's'} so far; the chart draws at ${BGC_MIN_SHOTS}.`);
    }
    const f = _bgcShotFilter();
    const shots = _bgcFilteredShots(ctx);
    const opt = (v, label, cur) => `<option value="${_escHtml(v)}"${v === cur ? ' selected' : ''}>${_escHtml(label)}</option>`;
    const periods = [...new Set(ctx.shots.map(s => s.period))].sort((a, b) => a - b);
    const shooters = new Map();
    ctx.shots.forEach(s => {
        if (!s.shooterId) return;
        const e = shooters.get(s.shooterId) || { fga: 0, fgm: 0, side: ctx.sideOf(s.teamId) };
        e.fga++; if (s.made) e.fgm++;
        shooters.set(s.shooterId, e);
    });
    const group = (side) => {
        if (f.team !== 'all' && f.team !== side) return '';
        const list = [...shooters.entries()].filter(([, e]) => e.side === side).sort((a, b) => b[1].fga - a[1].fga);
        if (!list.length) return '';
        return `<optgroup label="${_escHtml(ctx.abbr[side])}">${list.map(([id, e]) => {
            const a = ctx.athletes.get(id);
            return opt(id, `${a ? a.short : 'Player ' + id} (${e.fgm}-${e.fga})`, f.player);
        }).join('')}</optgroup>`;
    };
    const controls = `<div class="bgc-filters" role="group" aria-label="Shot filters">
        <label>Team <select onchange="_bgcSetShot('team', this.value)">${opt('all', 'Both', f.team)}${opt('away', ctx.abbr.away, f.team)}${opt('home', ctx.abbr.home, f.team)}</select></label>
        <label>Player <select onchange="_bgcSetShot('player', this.value)">${opt('', 'All players', f.player)}${group('away')}${group('home')}</select></label>
        <label>Period <select onchange="_bgcSetShot('period', this.value)">${opt('all', 'All', f.period)}${periods.map(p => opt(String(p), BballMath.periodLabel(p, ctx.fmt), f.period)).join('')}</select></label>
        <label>Result <select onchange="_bgcSetShot('result', this.value)">${opt('all', 'All', f.result)}${opt('made', 'Makes', f.result)}${opt('miss', 'Misses', f.result)}</select></label>
    </div>`;
    const made = shots.filter(s => s.made).length;
    const legend = `<div class="bgc-shot-legend" aria-hidden="true">
        <span><svg width="14" height="14"><circle cx="7" cy="7" r="5" class="bgc-legend-mark"/></svg>Made 2</span>
        <span><svg width="14" height="14"><circle cx="7" cy="7" r="5" class="bgc-legend-mark bgc-legend-mark--miss"/></svg>Missed 2</span>
        <span><svg width="14" height="14"><rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" class="bgc-legend-mark"/></svg>Made 3</span>
        <span><svg width="14" height="14"><rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" class="bgc-legend-mark bgc-legend-mark--miss"/></svg>Missed 3</span>
        ${f.team === 'all' ? `<span>${_bgcTeamDot(ctx, 'away')}${_escHtml(ctx.abbr.away)}</span><span>${_bgcTeamDot(ctx, 'home')}${_escHtml(ctx.abbr.home)}</span>` : ''}
    </div>`;
    return `<div class="nlg-card">
        <div class="nlg-sum">Shot chart <span class="nlg-sum-teams">${made}-${shots.length} FG${shots.length ? ' · ' + _bgcPct(made / shots.length) : ''}</span></div>
        ${controls}
        <div class="bgc-court-wrap">${_bgcCourtSvg(shots.map(s => _bgcShotMarker(ctx, s)).join(''))}</div>
        ${legend}
        <p class="pct-caption bgc-pad">${shots.length} field-goal attempts placed from ESPN play-by-play coordinates (feet, rounded to the nearest foot; hoop at top, left/right as ESPN reports it). Free throws and end-of-period heaves are excluded, matching the official box score.</p>
    </div>
    <div class="nlg-card">
        <div class="nlg-sum">Zone splits <span class="nlg-sum-teams">current filter</span></div>
        ${_bgcZoneTable(ctx, shots)}
        <p class="pct-caption bgc-pad">At rim: 2-pt tries within 4 ft of the hoop. Paint: other 2-pt tries inside the 16-ft lane, up to the free-throw line. Midrange: every other 2. Corner 3: threes from 21+ ft to the side, below the break of the arc. Above-break 3: every other three. 2 vs 3 comes from ESPN's scoring, not from position.</p>
    </div>`;
}

// -- Charts (scrubbable) -------------------------------------------------

// The x-axis always spans at least regulation, so a live game's line grows
// left to right instead of stretching to fill the box.
function _bgcAxisT(ctx) {
    return Math.max(ctx.fmt.periods * ctx.fmt.periodSec, ctx.endT || 0);
}

function _bgcPeriodTicks(ctx, W, H, totalT) {
    let out = '';
    for (let p = 2; ; p++) {
        const t = BballMath.periodStart(p, ctx.fmt);
        if (t >= totalT) break;
        const x = (t / totalT * W).toFixed(1);
        out += `<line class="bgc-chart-tick" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
    }
    return out;
}

function _bgcPeriodLabels(ctx, totalT) {
    const labels = [];
    for (let p = 1; ; p++) {
        const t0 = BballMath.periodStart(p, ctx.fmt);
        if (t0 >= totalT) break;
        const mid = (t0 + BballMath.periodLen(p, ctx.fmt) / 2) / totalT * 100;
        labels.push(`<span style="left:${mid.toFixed(2)}%">${_escHtml(BballMath.periodLabel(p, ctx.fmt))}</span>`);
    }
    return `<div class="bgc-chart-periods" aria-hidden="true">${labels.join('')}</div>`;
}

function _bgcSeries(ctx, kind) {
    if (kind === 'wp') return ctx.tl;
    if (!ctx.margin) ctx.margin = BballMath.marginSeries(ctx.plays, ctx.fmt);
    return ctx.margin;
}

function _bgcChartHtml(ctx, kind, { large = false, id = kind } = {}) {
    const series = _bgcSeries(ctx, kind);
    if (series.length < 2) return '';
    const W = 600, H = large ? 180 : 70, mid = H / 2;
    const totalT = _bgcAxisT(ctx);
    const xOf = (t) => (t / totalT * W).toFixed(1);
    const maxAbs = kind === 'wp' ? 0 : Math.max(5, ...series.map(s => Math.abs(s.margin)));
    const yOf = kind === 'wp'
        ? (v) => ((1 - v) * H).toFixed(1)
        : (v) => ((1 - (v + maxAbs) / (2 * maxAbs)) * H).toFixed(1);
    const val = (s) => (kind === 'wp' ? s.home : s.margin);
    const pts = series.map(s => `${xOf(s.t)},${yOf(val(s))}`);
    const area = `M${xOf(series[0].t)},${mid} L${pts.join(' L')} L${xOf(series[series.length - 1].t)},${mid} Z`;
    const hc = _escHtml(ctx.colors.home), ac = _escHtml(ctx.colors.away);
    const pre = 'bgc-' + id;
    const dots = (kind === 'wp' && large)
        ? BballMath.wpSwings(ctx.tl, 5).map((sw, i) =>
            `<span class="bgc-chart-dot" style="left:${(sw.t / totalT * 100).toFixed(2)}%;top:${((1 - sw.after) * 100).toFixed(2)}%">${i + 1}</span>`).join('')
        : '';
    const top = kind === 'wp' ? `${ctx.abbr.home} 100%` : `${ctx.abbr.home} +${maxAbs}`;
    const bot = kind === 'wp' ? `${ctx.abbr.away} 100%` : `${ctx.abbr.away} +${maxAbs}`;
    const label = kind === 'wp' ? 'Win probability over the game' : 'Score margin over the game';
    return `<div class="bgc-chart${large ? ' bgc-chart--large' : ''}" data-kind="${kind}" data-id="${_escHtml(id)}" tabindex="0" role="img" aria-label="${label}. Left and right arrow keys step through plays."
            onpointermove="_bgcScrub(event)" onpointerleave="_bgcScrubEnd(event)" onblur="_bgcScrubEnd(event)" onkeydown="_bgcScrubKey(event)">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="bgc-chart-svg" aria-hidden="true">
            <defs>
                <clipPath id="${pre}-above"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath>
                <clipPath id="${pre}-below"><rect x="0" y="${mid}" width="${W}" height="${H - mid}"/></clipPath>
            </defs>
            ${_bgcPeriodTicks(ctx, W, H, totalT)}
            <line class="bgc-chart-mid" x1="0" y1="${mid}" x2="${W}" y2="${mid}"/>
            <path d="${area}" fill="${hc}" class="bgc-chart-area" clip-path="url(#${pre}-above)"/>
            <path d="${area}" fill="${ac}" class="bgc-chart-area" clip-path="url(#${pre}-below)"/>
            <polyline points="${pts.join(' ')}" fill="none" stroke="${hc}" stroke-width="2" vector-effect="non-scaling-stroke" clip-path="url(#${pre}-above)"/>
            <polyline points="${pts.join(' ')}" fill="none" stroke="${ac}" stroke-width="2" vector-effect="non-scaling-stroke" clip-path="url(#${pre}-below)"/>
        </svg>
        <span class="bgc-chart-axis bgc-chart-axis--top">${_escHtml(top)}</span><span class="bgc-chart-axis bgc-chart-axis--bot">${_escHtml(bot)}</span>
        ${dots}
        <div class="bgc-chart-cursor" hidden></div>
    </div>
    ${large ? _bgcPeriodLabels(ctx, totalT) : ''}
    <div class="bgc-readout" id="bgc-readout-${_escHtml(id)}" aria-live="polite">${_escHtml(_bgcReadoutText(ctx, kind, series[series.length - 1], true))}</div>`;
}

function _bgcReadoutText(ctx, kind, s, isLatest) {
    if (!s) return '';
    const p = s.play;
    const head = `${isLatest ? 'Latest · ' : ''}${_bgcPlayWhen(ctx, p)} · ${_bgcScoreLine(ctx, p.awayScore, p.homeScore)}`;
    const v = kind === 'wp'
        ? `${s.home >= 0.5 ? ctx.abbr.home : ctx.abbr.away} ${_bgcWpLabel(s.home >= 0.5 ? s.home : 1 - s.home)} to win`
        : (s.margin === 0 ? 'Tied' : `${s.margin > 0 ? ctx.abbr.home : ctx.abbr.away} +${Math.abs(s.margin)}`);
    return `${head} · ${v} · ${p.text || ''}`;
}

function _bgcScrubAt(el, idx) {
    const ctx = _blg.ctx;
    if (!ctx) return;
    const kind = el.dataset.kind;
    const series = _bgcSeries(ctx, kind);
    if (!series.length) return;
    const i = Math.max(0, Math.min(series.length - 1, idx));
    el.dataset.idx = String(i);
    const cur = el.querySelector('.bgc-chart-cursor');
    if (cur) { cur.hidden = false; cur.style.left = (series[i].t / _bgcAxisT(ctx) * 100).toFixed(2) + '%'; }
    const out = document.getElementById('bgc-readout-' + el.dataset.id);
    if (out) out.textContent = _bgcReadoutText(ctx, kind, series[i], i === series.length - 1);
}

function _bgcScrub(ev) {
    const el = ev.currentTarget, ctx = _blg.ctx;
    if (!ctx) return;
    const series = _bgcSeries(ctx, el.dataset.kind);
    if (!series.length) return;
    const r = el.getBoundingClientRect();
    const t = (ev.clientX - r.left) / r.width * _bgcAxisT(ctx);
    let lo = 0, hi = series.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (series[m].t < t) lo = m + 1; else hi = m; }
    if (lo > 0 && Math.abs(series[lo - 1].t - t) <= Math.abs(series[lo].t - t)) lo--;
    _blg.scrubbing = true;
    _bgcScrubAt(el, lo);
}

function _bgcScrubEnd(ev) {
    const el = ev.currentTarget, ctx = _blg.ctx;
    _blg.scrubbing = false;
    if (!ctx || (ev.type === 'pointerleave' && document.activeElement === el)) return;
    const series = _bgcSeries(ctx, el.dataset.kind);
    const cur = el.querySelector('.bgc-chart-cursor');
    if (cur) cur.hidden = true;
    delete el.dataset.idx;
    const out = document.getElementById('bgc-readout-' + el.dataset.id);
    if (out) out.textContent = _bgcReadoutText(ctx, el.dataset.kind, series[series.length - 1], true);
}

function _bgcScrubKey(ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const el = ev.currentTarget, ctx = _blg.ctx;
    if (!ctx) return;
    const n = _bgcSeries(ctx, el.dataset.kind).length;
    const cur = el.dataset.idx != null ? +el.dataset.idx : n - 1;
    _bgcScrubAt(el, cur + (ev.key === 'ArrowRight' ? 1 : -1));
}

// -- Analytics ------------------------------------------------------------

function _bgcTeamEntries(ctx) {
    const teams = (ctx.data.boxscore && ctx.data.boxscore.teams) || [];
    const h = teams.find(t => String((t.team || {}).id) === ctx.ids.home);
    const a = teams.find(t => String((t.team || {}).id) === ctx.ids.away);
    return h && a ? { home: BballMath.teamTotals(h), away: BballMath.teamTotals(a) } : null;
}

function _bgcFourFactorsData(ctx) {
    const t = _bgcTeamEntries(ctx);
    if (!t || !(t.home.fga > 0) || !(t.away.fga > 0)) return null;
    return { home: BballMath.fourFactors(t.home, t.away), away: BballMath.fourFactors(t.away, t.home), totals: t };
}

function _bgcFourFactorsCard(ctx, ff) {
    const row = (label, key, fmtFn, lowerBetter) => {
        const a = ff.away[key], h = ff.home[key];
        const better = (a == null || h == null || a === h) ? null : ((lowerBetter ? a < h : a > h) ? 'away' : 'home');
        return `<tr><th scope="row">${label}</th>
            <td class="bgc-mono${better === 'away' ? ' bgc-better' : ''}">${fmtFn(a)}</td>
            <td class="bgc-mono${better === 'home' ? ' bgc-better' : ''}">${fmtFn(h)}</td></tr>`;
    };
    return `<div class="nlg-card">
        <div class="nlg-sum">Four Factors</div>
        <div class="bgc-table-wrap"><table class="bgc-table bgc-table--num">
            <thead><tr><th></th><th>${_bgcTeamDot(ctx, 'away')}${_escHtml(ctx.abbr.away)}</th><th>${_bgcTeamDot(ctx, 'home')}${_escHtml(ctx.abbr.home)}</th></tr></thead>
            <tbody>
                ${row('Effective FG%', 'efg', _bgcPct, false)}
                ${row('Turnover %', 'tov', _bgcPct, true)}
                ${row('Off. rebound %', 'orb', _bgcPct, false)}
                ${row('FT rate', 'ftr', _bgcRate, false)}
            </tbody>
        </table></div>
        <p class="pct-caption bgc-pad">eFG% = (FGM + 0.5 × 3PM) / FGA. TOV% = TOV / (FGA + 0.44 × FTA + TOV). ORB% = ORB / (ORB + opponent DRB). FT rate = FTM / FGA. From ESPN box-score totals; bold marks the better side.</p>
    </div>`;
}

function _bgcEfficiencyCard(ctx, totals) {
    const M = BballMath;
    const eff = M.efficiency(totals.home, totals.away, Number(ctx.home.score) || 0, Number(ctx.away.score) || 0, ctx.endT, ctx.fmt);
    if (!eff) return '';
    const elapsed = ctx.state === 'in' ? `${M.fmtSec(ctx.endT)} of game clock so far` : `${Math.round(eff.minutes)} minutes played`;
    return `<div class="nlg-card">
        <div class="nlg-sum">Pace &amp; efficiency</div>
        <div class="bgc-kv">
            <div><span class="eyebrow">Possessions ${_bgcEst()}</span><span class="bgc-stat">~${Math.round(eff.poss)}</span></div>
            <div><span class="eyebrow">Pace ${_bgcEst()}</span><span class="bgc-stat">${eff.pace.toFixed(1)}</span><span class="bgc-stat-sub">per ${Math.round(eff.regMin)} min</span></div>
            <div><span class="eyebrow">${_escHtml(ctx.abbr.away)} off / def rtg ${_bgcEst()}</span><span class="bgc-stat">${eff.awayOrtg.toFixed(1)} / ${eff.homeOrtg.toFixed(1)}</span></div>
            <div><span class="eyebrow">${_escHtml(ctx.abbr.home)} off / def rtg ${_bgcEst()}</span><span class="bgc-stat">${eff.homeOrtg.toFixed(1)} / ${eff.awayOrtg.toFixed(1)}</span></div>
        </div>
        <p class="pct-caption bgc-pad">Possessions per team = FGA + 0.44 × FTA − ORB + TOV, averaged across both teams. Pace = possessions × ${Math.round(eff.regMin)} ÷ minutes played (${_escHtml(elapsed)}). Ratings are points per 100 estimated possessions.</p>
    </div>`;
}

function _bgcShotProfileCard(ctx) {
    if (ctx.shots.length < BGC_MIN_SHOTS) return '';
    const M = BballMath;
    const bySide = (side) => M.zoneSplits(ctx.shots.filter(s => ctx.sideOf(s.teamId) === side));
    const z = { away: bySide('away'), home: bySide('home') };
    const tot = (zs) => M.ZONES.reduce((n, k) => n + zs[k].fga, 0);
    const cell = (zs, k) => {
        const n = tot(zs), c = zs[k];
        return `<td class="bgc-mono">${n ? _bgcPct(c.fga / n, 0) : '—'}<span class="bgc-stat-sub">${c.fga ? _bgcPct(c.fgm / c.fga, 0) + ' FG' : '—'}</span></td>`;
    };
    const rows = M.ZONES.map(k => `<tr><th scope="row">${_escHtml(M.ZONE_LABEL[k])}</th>${cell(z.away, k)}${cell(z.home, k)}</tr>`).join('');
    return `<div class="nlg-card">
        <div class="nlg-sum">Shot profile</div>
        <div class="bgc-table-wrap"><table class="bgc-table bgc-table--num">
            <thead><tr><th>Zone</th><th>${_bgcTeamDot(ctx, 'away')}${_escHtml(ctx.abbr.away)}</th><th>${_bgcTeamDot(ctx, 'home')}${_escHtml(ctx.abbr.home)}</th></tr></thead>
            <tbody>${rows}</tbody></table></div>
        <p class="pct-caption bgc-pad">Share of each team's field-goal attempts by zone, with FG% underneath. Zones as defined on the Shots tab.</p>
    </div>`;
}

function _bgcSplitTable(ctx, split) {
    const cells = (s) => [s.pts, `${s.fgm}-${s.fga}`, `${s.tpm}-${s.tpa}`, `${s.ftm}-${s.fta}`];
    const row = (side) => `<tr><th scope="row">${_bgcTeamDot(ctx, side)}${_escHtml(ctx.abbr[side])}</th>${cells(split[side]).map(v => `<td class="bgc-mono">${v}</td>`).join('')}</tr>`;
    return `<div class="bgc-table-wrap"><table class="bgc-table bgc-table--num">
        <thead><tr><th></th><th>PTS</th><th>FG</th><th>3PT</th><th>FT</th></tr></thead>
        <tbody>${row('away')}${row('home')}</tbody></table></div>`;
}

function _bgcSplitsCard(ctx) {
    const M = BballMath;
    const lastReg = _escHtml(M.periodLabel(ctx.fmt.periods, ctx.fmt));
    const parts = [];
    if (ctx.endT >= 300) {
        const l5 = M.lastFive(ctx.plays, ctx.ids, ctx.fmt, ctx.endT);
        const span = `${_bgcWhenT(ctx, ctx.endT - 300)} to ${ctx.state === 'in' ? _bgcWhenT(ctx, ctx.endT) : 'the final buzzer'}`;
        parts.push(`<h4 class="bgc-subhead">${ctx.state === 'in' ? 'Last 5:00 of game clock' : 'Final 5:00'} <span class="bgc-muted">${_escHtml(span)}</span></h4>${_bgcSplitTable(ctx, l5)}`);
    }
    const cl = M.clutch(ctx.plays, ctx.ids, ctx.fmt);
    if (cl.plays > 0) parts.push(`<h4 class="bgc-subhead">Clutch <span class="bgc-muted">${cl.plays} plays</span></h4>${_bgcSplitTable(ctx, cl)}`);
    else parts.push(`<p class="pct-caption">No clutch minutes ${ctx.state === 'in' ? 'yet' : 'in this game'}: none played in the ${lastReg} or OT with 5:00 or less left and the score within 5.</p>`);
    return `<div class="nlg-card">
        <div class="nlg-sum">Situational splits</div>
        <div class="bgc-pad">${parts.join('')}</div>
        <p class="pct-caption bgc-pad">Computed from play-by-play: points from score changes, attempts from shooting plays (heaves excluded). Clutch = ${lastReg} or OT, 5:00 or less left, score within 5 before the play.</p>
    </div>`;
}

function _bgcAnalytics(ctx) {
    if (ctx.state === 'pre' || !ctx.plays.length) return _bgcEmpty('No analytics yet', 'Four Factors, pace, and shot profile compute once the game is underway.');
    const ff = _bgcFourFactorsData(ctx);
    const margin = _bgcChartHtml(ctx, 'margin', { large: true, id: 'margin-main' });
    const wp = _bgcChartHtml(ctx, 'wp', { large: true, id: 'wp-main' });
    return [
        ff ? _bgcFourFactorsCard(ctx, ff) : '',
        ff ? _bgcEfficiencyCard(ctx, ff.totals) : '',
        ctx.shotsTab ? _bgcShotProfileCard(ctx) : '',
        margin ? `<div class="nlg-card"><div class="nlg-sum">Score margin</div><div class="bgc-pad">${margin}</div><p class="pct-caption bgc-pad">Home lead above the line, away lead below, from the score after every play. Hover, drag, or focus and use the arrow keys to read any moment.</p></div>` : '',
        wp ? `<div class="nlg-card"><div class="nlg-sum">Win probability</div><div class="bgc-pad">${wp}</div><p class="pct-caption bgc-pad">ESPN's win-probability model, matched to each play. Numbered dots are the Key Plays on the Game Story tab, which lists the same moments as text.</p></div>` : '',
        _bgcSplitsCard(ctx),
        _blgRenderAnalyticsTab(ctx.data, ctx.home, ctx.away).replace('Advanced Stats', 'ESPN-tracked'),
    ].join('');
}

// -- Box score ------------------------------------------------------------

function _bgcBox(ctx) {
    const players = (ctx.data.boxscore && ctx.data.boxscore.players) || [];
    if (!players.length) return _bgcEmpty('No box score yet', 'Player stats post once the game starts.');
    const live = ctx.state === 'in';
    const team = (side) => {
        const tb = players.find(p => String((p.team || {}).id) === ctx.ids[side]);
        const g = tb && tb.statistics && tb.statistics[0];
        if (!g) return '';
        const labels = g.labels || g.names || [];
        const pfIdx = (g.keys || []).indexOf('fouls');
        const nameCell = (a) => {
            const ath = a.athlete || {};
            const meta = [ath.jersey ? '#' + ath.jersey : '', ath.position && ath.position.abbreviation].filter(Boolean).join(' · ');
            const pf = pfIdx >= 0 ? parseInt((a.stats || [])[pfIdx], 10) : NaN;
            const badges = [];
            if (live && a.active) badges.push('<span class="bgc-badge bgc-badge--court">On court</span>');
            if (a.ejected) badges.push('<span class="bgc-badge bgc-badge--warn">Ejected</span>');
            else if (pf >= 6) badges.push('<span class="bgc-badge bgc-badge--warn">Fouled out</span>');
            else if (pf >= 4 && live) badges.push(`<span class="bgc-badge bgc-badge--warn" title="${pf} personal fouls">${pf} PF</span>`);
            return `<th scope="row" class="bgc-bx-name"><span class="bgc-bx-who">${_bgcPlayerLink(ctx, ath.id, ath.shortName || ath.displayName || '')}<span class="bgc-bx-meta">${_escHtml(meta)}</span></span>${badges.join('')}</th>`;
        };
        const rowHtml = (a) => {
            const cls = live && a.active ? ' class="bgc-bx-row--court"' : '';
            if (a.didNotPlay || !(a.stats || []).length) {
                return `<tr${cls}>${nameCell(a)}<td colspan="${labels.length}" class="bgc-bx-dnp">${_escHtml(a.reason || 'DNP')}</td></tr>`;
            }
            return `<tr${cls}>${nameCell(a)}${a.stats.map(v => `<td>${_escHtml(v)}</td>`).join('')}</tr>`;
        };
        const ath = g.athletes || [];
        const starters = ath.filter(a => a.starter), bench = ath.filter(a => !a.starter);
        const headRow = (first, extra) => `<tr${extra}><th scope="col" class="bgc-bx-name">${first}</th>${labels.map(l => `<th scope="col">${_escHtml(l)}</th>`).join('')}</tr>`;
        const totals = (g.totals || []).length ? `<tfoot><tr class="bgc-bx-total"><th scope="row" class="bgc-bx-name">Team</th>${g.totals.map(v => `<td>${_escHtml(v)}</td>`).join('')}</tr></tfoot>` : '';
        return `<div class="nlg-card">
            <div class="nlg-sum">${_bgcTeamDot(ctx, side)}${_escHtml(ctx.abbr[side])} <span class="nlg-sum-teams">${_escHtml(_blgRecord(ctx[side]))}</span></div>
            <div class="bgc-bx-scroll"><table class="bgc-bx">
                <thead>${headRow('Starters', '')}</thead>
                <tbody>${starters.map(rowHtml).join('')}</tbody>
                ${bench.length ? `<tbody>${headRow('Bench', ' class="bgc-bx-sep"')}${bench.map(rowHtml).join('')}</tbody>` : ''}
                ${totals}
            </table></div>
        </div>`;
    };
    return team('away') + team('home') +
        `<p class="pct-caption">${live ? 'On court = the five players ESPN lists as active right now. Foul-trouble flag at 4+ personal fouls. ' : ''}6 personal fouls is a foul-out.</p>`;
}

// -- Play-by-play --------------------------------------------------------

function _bgcPbpFilter() {
    if (!_blg.pbpFilter) _blg.pbpFilter = { kind: 'all', team: 'all', player: '' };
    return _blg.pbpFilter;
}

function _bgcSetPbp(key, value) {
    _bgcPbpFilter()[key] = value;
    _blg.pbpNew = 0;
    _blg.pbpSeen = null;
    _blgRenderActiveTabBody(true);
}

function _bgcPbpShotContext(p) {
    const s = BballMath.validShots([p])[0];
    return s ? `${Math.round(s.dist)} ft · ${BballMath.ZONE_LABEL[s.zone]}` : '';
}

function _bgcPbp(ctx) {
    const plays = ctx.plays;
    if (!plays.length) return _bgcEmpty('No play-by-play yet', 'Plays appear once the game is underway.');
    const f = _bgcPbpFilter();
    const involves = (p, id) => (p.participants || []).some(x => x.athlete && String(x.athlete.id) === id);
    const keep = (p) => {
        if (f.kind === 'scoring' && !p.scoringPlay) return false;
        if (f.kind === 'key' && !(Math.abs(ctx.swingById.get(String(p.id)) || 0) >= BGC_KEY_SWING)) return false;
        if (f.team !== 'all' && ctx.sideOf(p.team && p.team.id) !== f.team) return false;
        if (f.player && !involves(p, f.player)) return false;
        return true;
    };
    const shown = plays.filter(keep);
    const byPeriod = {};
    shown.forEach(p => { const n = (p.period && p.period.number) || 1; (byPeriod[n] = byPeriod[n] || []).push(p); });
    const nums = Object.keys(byPeriod).map(Number).sort((a, b) => b - a);
    const latest = Math.max(...plays.map(p => (p.period && p.period.number) || 1));
    const open = _blgPbpOpenSet(latest);
    const chip = (v, l) => `<button type="button" class="bgc-chip${f.kind === v ? ' bgc-chip--on' : ''}" aria-pressed="${f.kind === v}" onclick="_bgcSetPbp('kind','${v}')">${l}</button>`;
    const opt = (v, label, cur) => `<option value="${_escHtml(v)}"${v === cur ? ' selected' : ''}>${_escHtml(label)}</option>`;
    const involved = new Set();
    plays.forEach(p => (p.participants || []).forEach(x => { if (x.athlete && x.athlete.id) involved.add(String(x.athlete.id)); }));
    const playerOpts = (side) => {
        const list = [...ctx.athletes.values()].filter(a => involved.has(a.id) && a.teamId === ctx.ids[side]).sort((a, b) => a.short.localeCompare(b.short));
        return list.length ? `<optgroup label="${_escHtml(ctx.abbr[side])}">${list.map(a => opt(a.id, a.short, f.player)).join('')}</optgroup>` : '';
    };
    const controls = `<div class="bgc-filters" role="group" aria-label="Play filters">
        <div class="bgc-chips">${chip('all', 'All plays')}${chip('scoring', 'Scoring')}${chip('key', 'Key plays')}</div>
        <label>Team <select onchange="_bgcSetPbp('team', this.value)">${opt('all', 'Both', f.team)}${opt('away', ctx.abbr.away, f.team)}${opt('home', ctx.abbr.home, f.team)}</select></label>
        <label>Player <select onchange="_bgcSetPbp('player', this.value)">${opt('', 'Anyone', f.player)}${playerOpts('away')}${playerOpts('home')}</select></label>
    </div>`;
    const newCount = _blg.pbpNew || 0;
    const banner = newCount > 0
        ? `<button type="button" class="bgc-newplays" onclick="_bgcJumpToNewest()">${newCount} new play${newCount === 1 ? '' : 's'} ↑</button>`
        : '';
    const periodHtml = (num) => {
        const list = byPeriod[num].slice().reverse();
        const rows = list.map(p => {
            const sw = ctx.swingById.get(String(p.id));
            const key = sw != null && Math.abs(sw) >= BGC_KEY_SWING;
            const side = key ? (sw > 0 ? 'home' : 'away') : null;
            const shotCtx = _bgcPbpShotContext(p);
            const ts = p.team && ctx.sideOf(p.team.id);
            return `<div class="nlg-pbp-play bgc-pbp-play${p.scoringPlay ? ' nlg-pbp-play--score' : ''}" data-play-id="${_escHtml(String(p.id))}">
                <span class="nlg-pbp-dd">${_escHtml((p.clock && p.clock.displayValue) || '')}</span>
                <span class="nlg-pbp-text">${ts ? _bgcTeamDot(ctx, ts) : ''}${_escHtml(p.text || '')}${shotCtx ? ` <span class="bgc-muted">· ${_escHtml(shotCtx)}</span>` : ''}${key ? ` <span class="bgc-badge" title="Win probability moved ${Math.round(Math.abs(sw) * 100)} points on this play">${_escHtml(ctx.abbr[side])} +${Math.round(Math.abs(sw) * 100)}% WP</span>` : ''}</span>
                <span class="nlg-pbp-score">${p.awayScore != null ? p.awayScore : ''}–${p.homeScore != null ? p.homeScore : ''}</span>
            </div>`;
        }).join('');
        const label = (list[0] && list[0].period && list[0].period.displayValue) || BballMath.periodLabel(num, ctx.fmt);
        return `<details class="nlg-card" data-period="${num}"${open.has(num) ? ' open' : ''}>
            <summary class="nlg-sum">${_escHtml(label)} <span class="nlg-sum-teams">${list.length} play${list.length === 1 ? '' : 's'}</span></summary>
            <div class="nlg-pbp-plays">${rows}</div>
        </details>`;
    };
    const body = nums.length ? nums.map(periodHtml).join('') : _bgcEmpty('No plays match these filters');
    return `${controls}${banner}${body}
        <p class="pct-caption">Key plays moved ESPN's win probability ${Math.round(BGC_KEY_SWING * 100)}+ points. Shot distance and zone come from ESPN's play coordinates.</p>`;
}

function _bgcJumpToNewest() {
    _blg.pbpNew = 0;
    _blg.pbpSeen = null;
    _blgRenderActiveTabBody(true);
    const panel = document.querySelector('.gv-tabpanel');
    if (panel) panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// Before a poll re-renders Play-by-Play, remember the first play row on
// screen; afterwards scroll by however far it moved. New plays render at
// the top, so without this a reader partway down gets pushed down by every
// poll. Returns null when the reader is at the top (nothing to hold).
const BGC_STICKY_TOP = 150;

function _bgcPbpAnchor(panel) {
    if (panel.getBoundingClientRect().top >= BGC_STICKY_TOP) return null;
    for (const r of panel.querySelectorAll('[data-play-id]')) {
        const rt = r.getBoundingClientRect().top;
        if (rt >= BGC_STICKY_TOP) return { id: r.dataset.playId, top: rt };
    }
    return null;
}

function _bgcPbpRestore(panel, anchor) {
    if (!anchor) return;
    const el = panel.querySelector(`[data-play-id="${CSS.escape(anchor.id)}"]`);
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - anchor.top);
}

// -- Pregame preview ---------------------------------------------------------

function _bgcPreview(ctx) {
    const d = ctx.data;
    const comp = ctx.comp;
    const tip = new Date(comp.date);
    const validTip = !isNaN(tip);
    const tipLine = validTip
        ? tip.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
        : (((comp.status || {}).type || {}).detail || 'Scheduled');
    const venue = (d.gameInfo && d.gameInfo.venue) || {};
    const addr = venue.address || {};
    const place = [venue.fullName, [addr.city, addr.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');

    const seen = new Set();
    const bcRows = [];
    // Top-level broadcasts can be an empty array while the competition still
    // lists one (verified on 401909874), so fall back on empty, not just absent.
    ((d.broadcasts && d.broadcasts.length ? d.broadcasts : comp.broadcasts) || []).forEach(b => {
        const name = (b.media && (b.media.shortName || b.media.name)) || b.station || '';
        if (!name || seen.has(name)) return;
        seen.add(name);
        const type = (b.type && b.type.shortName) || '';
        const mkt = b.market && b.market.type && b.market.type.toLowerCase() !== 'national' ? b.market.type.toLowerCase() : '';
        const note = [type, mkt].filter(Boolean).join(', ');
        bcRows.push(_escHtml(name) + (note ? ` <span class="bgc-muted">${_escHtml(note)}</span>` : ''));
    });
    const officials = ((d.gameInfo && d.gameInfo.officials) || []).map(o => o.displayName || o.fullName).filter(Boolean);

    const ss = (d.seasonseries || [])[0];
    let seriesLine = '';
    if (ss) {
        const evs = ss.events || [];
        const idx = evs.findIndex(e => String(e.id) === String(_blg.eventId));
        seriesLine = `${ss.summary || ('Series ' + (ss.seriesScore || '0-0'))}${idx >= 0 && ss.totalCompetitions ? ` · meeting ${idx + 1} of ${ss.totalCompetitions}` : ''}`;
    }

    // Odds stay a one-line, provider-labeled context note: no card, no
    // sportsbook link, no betting call to action.
    const pc = (d.pickcenter || [])[0];
    const oddsBits = pc ? [pc.details, pc.overUnder != null ? 'O/U ' + pc.overUnder : ''].filter(Boolean) : [];
    const oddsLine = oddsBits.length && pc.provider && pc.provider.name
        ? `<p class="pct-caption bgc-pad">Line, for context: ${_escHtml(oddsBits.join(' · '))} (${_escHtml(pc.provider.name)} via ESPN).</p>`
        : '';

    const info = [
        ['Tip-off', `${_escHtml(tipLine)}${validTip ? ` <span class="bgc-countdown" data-iso="${_escHtml(comp.date)}">${_escHtml(_bgcCountdown(comp.date))}</span>` : ''}`],
        place ? ['Venue', _escHtml(place)] : null,
        bcRows.length ? ['Watch', bcRows.slice(0, 5).join(' · ')] : null,
        seriesLine ? ['Season series', _escHtml(seriesLine)] : null,
        officials.length ? ['Officials', _escHtml(officials.join(', '))] : null,
    ].filter(Boolean);

    return [
        `<div class="nlg-card">
            <div class="nlg-sum">Game preview</div>
            <div class="bgc-info">${info.map(([l, v]) => `<div class="bgc-info-row"><span class="eyebrow">${l}</span><span>${v}</span></div>`).join('')}</div>
            ${oddsLine}
        </div>`,
        _bgcPredictorCard(ctx),
        _bgcFormCard(ctx),
        _bgcLeadersMain(ctx),
        _blgInjuriesCard(d),
        _bgcNewsCard(d, true),
    ].join('');
}

// data.predictor: ESPN's own pregame model; the two projections can miss
// 100 by rounding, so they're normalized before drawing.
function _bgcPredictorCard(ctx) {
    const p = ctx.data.predictor;
    if (!p || !p.homeTeam || !p.awayTeam) return '';
    const h = parseFloat(p.homeTeam.gameProjection), a = parseFloat(p.awayTeam.gameProjection);
    if (!(h >= 0) || !(a >= 0) || h + a <= 0) return '';
    const hp = Math.round(h / (h + a) * 100), ap = 100 - hp;
    return `<div class="nlg-card nlg-winproj">
        <div class="nlg-sum">Win projection <span class="nlg-sum-teams">ESPN Matchup Predictor</span></div>
        <div class="nlg-winproj-body">
            <div class="nlg-winproj-bar">
                <div class="nlg-winproj-seg" style="width:${ap}%;background:${_escHtml(ctx.colors.away)}"></div>
                <div class="nlg-winproj-seg" style="width:${hp}%;background:${_escHtml(ctx.colors.home)}"></div>
            </div>
            <div class="nlg-winproj-labels"><span>${_escHtml(ctx.abbr.away)} ${ap}%</span><span>${_escHtml(ctx.abbr.home)} ${hp}%</span></div>
        </div>
    </div>`;
}

function _bgcFormCard(ctx) {
    const teams = ctx.data.lastFiveGames || [];
    if (!teams.length) return '';
    const row = (side) => {
        const entry = teams.find(t => String((t.team || {}).id) === ctx.ids[side]);
        const evs = (entry && entry.events) || [];
        if (!evs.length) return '';
        const chips = evs.map(e => {
            const r = (e.gameResult || '').toUpperCase();
            const cls = r === 'W' ? 'w' : r === 'L' ? 'l' : 't';
            const opp = (e.opponent && e.opponent.abbreviation) || '';
            return `<span class="nlg-form-chip nlg-form-chip--${cls}" title="${_escHtml(`${r} ${e.atVs || ''} ${opp} ${e.score || ''}`.trim())}">${_escHtml(r || '–')}</span>`;
        }).join('');
        return `<div class="nlg-form-row"><span class="nlg-form-abbr">${_escHtml(ctx.abbr[side])}</span><span class="nlg-form-chips">${chips}</span></div>`;
    };
    const rows = row('away') + row('home');
    if (!rows) return '';
    return `<div class="nlg-card"><div class="nlg-sum">Recent form <span class="nlg-sum-teams">last 5 games</span></div><div class="nlg-form-body">${rows}</div></div>`;
}

// -- Sidebar: the same four cards in every state, so the layout never shifts

function _bgcSideCard(title, body) {
    return `<div class="nlg-side-card"><h3 class="nlg-side-title">${title}</h3>${body}</div>`;
}

function _bgcSidebarHtml(ctx) {
    const pending = (msg) => `<p class="pct-caption">${_escHtml(msg)}</p>`;
    const wp = _bgcChartHtml(ctx, 'wp', { id: 'wp-side' });
    const margin = _bgcChartHtml(ctx, 'margin', { id: 'margin-side' });
    const leaders = _blgSidebarLeaders(ctx.data);
    const standings = _blgStandingsCard(ctx.data, ctx.home, ctx.away);
    const before = ctx.state === 'pre' ? 'Charts from tip-off.' : null;
    return `<aside class="nlg-side">
        ${_bgcSideCard('Win probability', wp || pending(before || 'Charts after the first few plays.'))}
        ${leaders ? leaders.replace('Game Leaders', ctx.state === 'pre' ? 'Season leaders' : 'Game leaders') : _bgcSideCard('Game leaders', pending('Leaders post once players log stats.'))}
        ${_bgcSideCard('Score margin', margin || pending(before || 'Charts once both teams score.'))}
        ${standings || _bgcSideCard('Standings', pending('No standings in ESPN\'s feed for this game.'))}
    </aside>`;
}

if (typeof window !== 'undefined') {
    window._bgcSetShot = _bgcSetShot;
    window._bgcSetPbp = _bgcSetPbp;
    window._bgcJumpToNewest = _bgcJumpToNewest;
    window._bgcScrub = _bgcScrub;
    window._bgcScrubEnd = _bgcScrubEnd;
    window._bgcScrubKey = _bgcScrubKey;
}

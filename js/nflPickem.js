// ============================================================
// NFL Pick'em Confidence Helper (D-146) — promoted from an unlinked personal
// page (pickem.html) into a real nav-linked NFL feature. For each of the
// week's games, blends two free signals already reachable through the
// existing /api/nfl proxy -- DraftKings' own line (moneyline, vig removed)
// and ESPN's independent "Matchup Predictor" model (data.predictor on
// /summary, unrelated to any sportsbook) -- into one probability per team,
// defaults the confidence ranking to that, and flags games where the two
// signals disagree by a lot as the ones worth a manual second look.
//
// Not a full multi-sportsbook cross-reference: ESPN's odds/pickcenter array
// carries exactly one provider (DraftKings, confirmed live 2026-09-09) --
// market-vs-model is the free substitute for that. A paid odds API would be
// the real upgrade if this proves useful enough to justify the cost.
//
// Single-player by design (see DECISIONS.md) -- every visitor gets the same
// blended ranking and personalizes it with drag/click overrides; nobody's
// real pool lives inside SportStrata, this just tells you what order to
// submit wherever your pool actually is. Works fully signed-out via
// localStorage (same house rule as follows/prefs, D-031) -- cross-device
// sync via accounts is a deliberate later phase, not built yet.
// ============================================================

const _pk = { games: [], year: null, seasonType: null, week: null, storageKey: null, seasonPanelOpen: false };

function _pkMlToProb(ml) {
    const n = Number(ml);
    if (!isFinite(n) || n === 0) return null;
    return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100);
}
function _pkDevig(pA, pB) {
    if (pA == null || pB == null) return [pA, pB];
    const sum = pA + pB;
    if (!sum) return [pA, pB];
    return [pA / sum, pB / sum];
}
function _pkNormalizePair(a, b) {
    const x = Number(a), y = Number(b);
    if (!isFinite(x) || !isFinite(y)) return [null, null];
    const sum = x + y;
    if (!sum) return [null, null];
    return [x / sum, y / sum];
}
function _pkBlend(a, b) {
    const vals = [a, b].filter(v => v != null);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function _pkFetchScoreboard(params) {
    const qs = new URLSearchParams({ path: '/scoreboard' });
    Object.keys(params || {}).forEach(k => { if (params[k] != null && params[k] !== '') qs.set(k, params[k]); });
    return fetch('/api/nfl?' + qs.toString()).then(r => {
        if (!r.ok) throw new Error('scoreboard ' + r.status);
        return r.json();
    });
}
function _pkFetchSummary(eventId) {
    return fetch('/api/nfl?' + new URLSearchParams({ path: '/summary', event: eventId }).toString())
        .then(r => { if (!r.ok) throw new Error('summary ' + r.status); return r.json(); })
        .catch(() => null);
}

function _pkParseEvent(ev) {
    const comp = (ev.competitions && ev.competitions[0]) || {};
    const competitors = comp.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home') || {};
    const away = competitors.find(c => c.homeAway === 'away') || {};
    const odds = (comp.odds && comp.odds[0]) || null;
    const ml = odds && odds.moneyline;
    const dkHomeRaw = ml ? _pkMlToProb(ml.home && ml.home.close && ml.home.close.odds) : null;
    const dkAwayRaw = ml ? _pkMlToProb(ml.away && ml.away.close && ml.away.close.odds) : null;
    const dkPair = _pkDevig(dkHomeRaw, dkAwayRaw);

    function side(c) {
        const t = c.team || {};
        const rec = (c.records || []).find(r => r.type === 'total');
        return {
            id: t.id, abbr: t.abbreviation, name: t.displayName, logo: t.logo,
            record: rec ? rec.summary : null,
            score: c.score, winner: c.winner === true,
        };
    }

    return {
        id: ev.id,
        status: (comp.status && comp.status.type) || (ev.status && ev.status.type) || {},
        statusDetail: (comp.status && comp.status.type && comp.status.type.shortDetail) || '',
        home: side(home), away: side(away),
        spreadDetails: odds ? odds.details : null,
        overUnder: odds ? odds.overUnder : null,
        dkHomeProb: dkPair[0], dkAwayProb: dkPair[1],
        espnHomeProb: null, espnAwayProb: null,
    };
}

function _pkAttachEspnModel(games) {
    return Promise.all(games.map(g =>
        _pkFetchSummary(g.id).then(data => {
            const pr = data && data.predictor;
            if (pr && pr.homeTeam && pr.awayTeam) {
                const pair = _pkNormalizePair(pr.homeTeam.gameProjection, pr.awayTeam.gameProjection);
                g.espnHomeProb = pair[0];
                g.espnAwayProb = pair[1];
            }
            return g;
        })
    ));
}

function _pkComputeBlend(g) {
    g.blendHomeProb = _pkBlend(g.dkHomeProb, g.espnHomeProb);
    g.blendAwayProb = _pkBlend(g.dkAwayProb, g.espnAwayProb);
    if (g.blendHomeProb == null && g.blendAwayProb == null) { g.modelPick = null; g.modelProb = null; }
    else {
        const homeHigher = (g.blendHomeProb || 0) >= (g.blendAwayProb || 0);
        g.modelPick = homeHigher ? 'home' : 'away';
        g.modelProb = homeHigher ? g.blendHomeProb : g.blendAwayProb;
    }
    g.gapPts = (g.dkHomeProb != null && g.espnHomeProb != null)
        ? Math.abs(g.dkHomeProb - g.espnHomeProb) * 100
        : null;
    g.flagged = g.gapPts != null && g.gapPts >= 10;
}

// -- Persistence ----------------------------------------------------------
// Single-player, local-first (matches AuthState.follows' philosophy, js/auth.js):
// localStorage is the source of truth. Season tracking is derived entirely from
// these per-week snapshots, no refetching old weeks -- a game's result only
// gets recorded the moment this view happens to be open while/after it goes
// final, so a week never revisited post-final just won't count yet (v1
// limitation; revisiting it later still backfills it). Cross-device sync via
// accounts is a deliberate later phase -- see DECISIONS.md.
function _pkStorageKeyFor(year, seasonType, week) { return 'pk_picks_v1_' + year + '_' + seasonType + '_' + week; }
function _pkSeasonIndexKey(year, seasonType) { return 'pk_season_index_v1_' + year + '_' + seasonType; }
function _pkLoadSaved(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function _pkAddToSeasonIndex(year, seasonType, week) {
    try {
        const key = _pkSeasonIndexKey(year, seasonType);
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        if (arr.indexOf(week) === -1) {
            arr.push(week);
            arr.sort((a, b) => a - b);
            localStorage.setItem(key, JSON.stringify(arr));
        }
    } catch (e) { /* season index just won't include this week */ }
}
function _pkPersist() {
    if (!_pk.storageKey) return;
    try {
        const n = _pk.games.length;
        const payload = _pk.games.map((g, idx) => {
            let winnerSide = null;
            if (g.status && g.status.completed) {
                if (g.home.winner) winnerSide = 'home';
                else if (g.away.winner) winnerSide = 'away';
            }
            return { id: g.id, pick: g.pick, confidence: n - idx, winnerSide: winnerSide };
        });
        localStorage.setItem(_pk.storageKey, JSON.stringify(payload));
        _pkAddToSeasonIndex(_pk.year, _pk.seasonType, _pk.week);
    } catch (e) { /* localStorage unavailable/full -- picks just won't survive reload */ }
}
function _pkSeasonSummary(year, seasonType) {
    let weeks;
    try { weeks = JSON.parse(localStorage.getItem(_pkSeasonIndexKey(year, seasonType)) || '[]'); } catch (e) { weeks = []; }
    const rows = weeks.map(wk => {
        const saved = _pkLoadSaved(_pkStorageKeyFor(year, seasonType, wk)) || [];
        const final = saved.filter(g => g.winnerSide != null);
        const correct = final.filter(g => g.winnerSide === g.pick);
        const points = correct.reduce((s, g) => s + g.confidence, 0);
        const maxPoints = final.reduce((s, g) => s + g.confidence, 0);
        return { week: wk, correct: correct.length, total: final.length, points: points, maxPoints: maxPoints };
    }).filter(r => r.total > 0);
    const totals = rows.reduce((acc, r) => {
        acc.correct += r.correct; acc.total += r.total; acc.points += r.points; acc.maxPoints += r.maxPoints;
        return acc;
    }, { correct: 0, total: 0, points: 0, maxPoints: 0 });
    return { rows: rows, totals: totals };
}

// -- Render -----------------------------------------------------------------
function _pkTeamImg(side) {
    return side.logo ? '<img src="' + _escHtml(side.logo) + '" alt="" data-hide-on-error>' : '';
}
function _pkPctStr(p) { return p == null ? '—' : Math.round(p * 100) + '%'; }

function _pkEls() {
    return {
        year: document.getElementById('pkYear'),
        seasonType: document.getElementById('pkSeasonType'),
        week: document.getElementById('pkWeek'),
        loadBtn: document.getElementById('pkLoadBtn'),
        resetBtn: document.getElementById('pkResetBtn'),
        seasonBtn: document.getElementById('pkSeasonBtn'),
        seasonPanel: document.getElementById('pkSeasonPanel'),
        status: document.getElementById('pkStatus'),
        summary: document.getElementById('pkSummary'),
        list: document.getElementById('pkList'),
    };
}
function _pkSetStatus(msg, isErr) {
    const els = _pkEls();
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.hidden = !msg;
    els.status.classList.toggle('err', !!isErr);
}

function _pkRenderSeasonPanel() {
    const els = _pkEls();
    if (!els.seasonPanel) return;
    if (!_pk.year) { els.seasonPanel.innerHTML = '<div class="pk-summary-top"><span>Load a week first.</span></div>'; return; }
    const s = _pkSeasonSummary(_pk.year, _pk.seasonType);
    if (!s.rows.length) {
        els.seasonPanel.innerHTML = '<div class="pk-summary-top"><span>No weeks tracked yet for ' + _pk.year + ' — visit this page after each week\'s games go final and it\'ll build up here.</span></div>';
        return;
    }
    const rowsHtml = s.rows.map(r =>
        '<tr><td>Week ' + r.week + '</td><td class="num">' + r.correct + '-' + (r.total - r.correct) + '</td>' +
        '<td class="num">' + r.points + ' / ' + r.maxPoints + '</td></tr>'
    ).join('');
    els.seasonPanel.innerHTML =
        '<div class="pk-summary-top">' +
            '<span>Season (' + _pk.year + '): <span class="' + (s.totals.correct >= s.totals.total - s.totals.correct ? 'pk-record-win' : 'pk-record-loss') + '">' + s.totals.correct + '-' + (s.totals.total - s.totals.correct) + '</span></span>' +
            '<span>Total points: <b>' + s.totals.points + '</b> / ' + s.totals.maxPoints + '</span>' +
        '</div>' +
        '<table class="pk-season-table"><thead><tr><th>Week</th><th>Record</th><th>Points</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>';
}

function _pkRender() {
    const els = _pkEls();
    if (!els.list) return; // user navigated away mid-fetch
    const n = _pk.games.length;

    if (els.summary) {
        els.summary.hidden = n === 0;
        if (n) {
            const final = _pk.games.filter(g => g.status.completed);
            const correct = final.filter(g => g[g.pick] && g[g.pick].winner).length;
            const points = final.reduce((s, g) => s + (g[g.pick] && g[g.pick].winner ? g.confidence : 0), 0);
            const maxPoints = final.reduce((s, g) => s + g.confidence, 0);
            els.summary.innerHTML = '<div class="pk-summary-top">' +
                '<span><b>' + n + '</b> games, confidence 1&ndash;' + n + '</span>' +
                (final.length ? '<span>Final: <span class="' + (correct >= final.length - correct ? 'pk-record-win' : 'pk-record-loss') + '">' + correct + '-' + (final.length - correct) + '</span></span>' +
                    '<span>Points: <b>' + points + '</b> / ' + maxPoints + ' possible so far</span>' : '<span>No final games yet this week</span>') +
                '</div>';
        }
    }
    if (_pk.seasonPanelOpen) _pkRenderSeasonPanel();

    els.list.innerHTML = '';
    _pk.games.forEach((g, idx) => {
        g.confidence = n - idx;
        const li = document.createElement('li');
        li.className = 'pk-row' + (g.flagged ? ' pk-flagged' : '');
        li.draggable = true;
        li.dataset.gameId = g.id;

        const isFinal = g.status.completed;
        const isLive = g.status.state === 'in';
        const pillCls = isFinal ? 'pk-final' : isLive ? 'pk-live' : 'pk-pre';
        const pillTxt = isFinal ? 'Final' : isLive ? 'Live' : 'Scheduled';
        let resultBadge = '';
        if (isFinal) {
            const won = g[g.pick] && g[g.pick].winner;
            resultBadge = '<div class="' + (won ? 'pk-result-correct' : 'pk-result-wrong') + '">' + (won ? '✓ +' + g.confidence : '✗ 0') + '</div>';
        }

        const gapHtml = g.gapPts != null ? '<span class="pk-gap">Δ' + Math.round(g.gapPts) + 'pt gap</span>' : '';
        const pickedDk = g.pick === 'home' ? g.dkHomeProb : g.dkAwayProb;
        const pickedEspn = g.pick === 'home' ? g.espnHomeProb : g.espnAwayProb;
        const pickedBlend = g.pick === 'home' ? g.blendHomeProb : g.blendAwayProb;

        li.innerHTML =
            '<div class="pk-conf">' +
                '<span>' + g.confidence + '</span>' +
                '<div class="pk-conf-arrows">' +
                    '<button type="button" data-act="up" title="More confident">&#9650;</button>' +
                    '<button type="button" data-act="down" title="Less confident">&#9660;</button>' +
                '</div>' +
            '</div>' +
            '<div>' +
                '<span class="pk-pill ' + pillCls + '">' + pillTxt + (g.statusDetail && !isFinal ? ' · ' + _escHtml(g.statusDetail) : '') + '</span>' +
                '<div class="pk-matchup">' +
                    '<span class="pk-team' + (g.pick === 'away' ? ' pk-picked' : '') + '" data-side="away">' + _pkTeamImg(g.away) + _escHtml(g.away.abbr) + (g.away.record ? ' (' + _escHtml(g.away.record) + ')' : '') + (g.away.score != null ? ' ' + _escHtml(g.away.score) : '') + '</span>' +
                    '<span class="pk-at">@</span>' +
                    '<span class="pk-team' + (g.pick === 'home' ? ' pk-picked' : '') + '" data-side="home">' + _pkTeamImg(g.home) + _escHtml(g.home.abbr) + (g.home.record ? ' (' + _escHtml(g.home.record) + ')' : '') + (g.home.score != null ? ' ' + _escHtml(g.home.score) : '') + '</span>' +
                '</div>' +
                '<div class="pk-line">' + _escHtml(g.spreadDetails || 'No line') + (g.overUnder ? ' · O/U ' + _escHtml(g.overUnder) : '') + '</div>' +
                '<div class="pk-probs">' +
                    '<span>DK for your pick: ' + _pkPctStr(pickedDk) + '</span>' +
                    '<span>ESPN model for your pick: ' + _pkPctStr(pickedEspn) + '</span>' +
                    '<span>Blended: <b>' + _pkPctStr(pickedBlend) + '</b></span>' +
                    gapHtml +
                '</div>' +
            '</div>' +
            '<div class="pk-meta">' + resultBadge + '</div>';

        li.querySelectorAll('.pk-team').forEach(el => {
            el.addEventListener('click', () => { g.pick = el.dataset.side; _pkPersist(); _pkRender(); });
        });
        li.querySelector('[data-act="up"]').addEventListener('click', (e) => {
            e.stopPropagation();
            if (idx > 0) _pkMoveGame(idx, idx - 1);
        });
        li.querySelector('[data-act="down"]').addEventListener('click', (e) => {
            e.stopPropagation();
            if (idx < n - 1) _pkMoveGame(idx, idx + 1);
        });
        li.addEventListener('dragstart', () => { li.classList.add('pk-dragging'); li.dataset.dragIdx = idx; });
        li.addEventListener('dragend', () => li.classList.remove('pk-dragging'));
        li.addEventListener('dragover', (e) => e.preventDefault());
        li.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggingEl = els.list.querySelector('.pk-dragging');
            const from = Number(draggingEl && draggingEl.dataset.dragIdx);
            if (isFinite(from)) _pkMoveGame(from, idx);
        });

        els.list.appendChild(li);
    });
}

function _pkMoveGame(from, to) {
    if (from === to) return;
    const arr = _pk.games;
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    _pkPersist();
    _pkRender();
}

function _pkLoadWeek(params) {
    const els = _pkEls();
    _pkSetStatus('Loading…');
    if (els.list) els.list.innerHTML = '';
    if (els.summary) els.summary.hidden = true;
    _pkFetchScoreboard(params).then(data => {
        if (!data.events || !data.events.length) { _pkSetStatus('No games found for that week.', true); return null; }

        const year = data.season ? data.season.year : (params && params.year) || new Date().getFullYear();
        const seasonType = data.season && data.season.type ? data.season.type.type : (params && params.seasontype) || 2;
        const week = data.week ? data.week.number : (params && params.week) || '';
        const elsNow = _pkEls();
        if (elsNow.year) elsNow.year.value = year;
        if (elsNow.seasonType) elsNow.seasonType.value = String(seasonType);
        if (elsNow.week) elsNow.week.value = week;
        _pk.year = year; _pk.seasonType = seasonType; _pk.week = week;

        const games = data.events.map(_pkParseEvent);
        _pkSetStatus('Cross-referencing DraftKings vs. ESPN model for ' + games.length + ' games…');
        return _pkAttachEspnModel(games).then(() => {
            games.forEach(_pkComputeBlend);

            const key = _pkStorageKeyFor(year, seasonType, week);
            const saved = _pkLoadSaved(key);
            const byId = {}; games.forEach(g => { byId[g.id] = g; });

            if (saved && saved.length === games.length) {
                _pk.games = saved.map(s => { const g = byId[s.id]; if (g) g.pick = s.pick; return g; }).filter(Boolean);
            } else {
                games.sort((a, b) => (b.modelProb || 0) - (a.modelProb || 0));
                games.forEach(g => { g.pick = g.modelPick || 'home'; });
                _pk.games = games;
            }
            _pk.storageKey = key;
            _pkSetStatus('');
            _pkPersist();
            _pkRender();
        });
    }).catch(err => {
        _pkSetStatus('Failed to load: ' + err.message, true);
        if (window.Logger) Logger.warn('pickem load failed', err, 'NFL');
    });
}

function loadNFLPickem() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = ''; grid.style.cssText = '';
    if (window.setBreadcrumb) setBreadcrumb('nfl-pickem', null);

    grid.innerHTML = `
        <div class="pk-wrap">
            <p class="pk-hint">
                Default order blends DraftKings' line (moneyline, vig removed) with ESPN's own Matchup Predictor model —
                two independent signals, not multiple sportsbooks (ESPN only carries DraftKings' number). Games where the
                two disagree by a lot are flagged with an orange border — those are the ones worth your own judgment, not
                the safe chalk. Drag rows (or use the arrows) to reorder confidence points, click a team to flip the pick.
                Nobody's real pool lives here — this just helps you decide what order to submit wherever your pool is.
                Picks save locally in this browser only.
            </p>
            <div class="pk-controls">
                <label>Season <input id="pkYear" type="number" step="1"></label>
                <label>Type
                    <select id="pkSeasonType">
                        <option value="1">Preseason</option>
                        <option value="2" selected>Regular</option>
                        <option value="3">Postseason</option>
                    </select>
                </label>
                <label>Week <input id="pkWeek" type="number" min="1" max="22"></label>
                <button id="pkLoadBtn">Load</button>
                <button id="pkResetBtn" class="pk-secondary" title="Snap the ranking back to the blended-model order">Reset order to model</button>
                <button id="pkSeasonBtn" class="pk-secondary">Season totals</button>
            </div>
            <div id="pkSeasonPanel" class="pk-summary" hidden></div>
            <div id="pkStatus" class="pk-status">Loading current week…</div>
            <div id="pkSummary" class="pk-summary" hidden></div>
            <ol id="pkList" class="pk-list"></ol>
        </div>
    `;

    const els = _pkEls();
    els.seasonBtn.addEventListener('click', () => {
        _pk.seasonPanelOpen = !_pk.seasonPanelOpen;
        els.seasonPanel.hidden = !_pk.seasonPanelOpen;
        if (_pk.seasonPanelOpen) _pkRenderSeasonPanel();
    });
    els.loadBtn.addEventListener('click', () => {
        _pkLoadWeek({ year: els.year.value, seasontype: els.seasonType.value, week: els.week.value });
    });
    els.resetBtn.addEventListener('click', () => {
        if (!_pk.games.length) return;
        _pk.games.sort((a, b) => (b.modelProb || 0) - (a.modelProb || 0));
        _pk.games.forEach(g => { g.pick = g.modelPick || g.pick; });
        _pkPersist();
        _pkRender();
    });

    _pkLoadWeek({});
}

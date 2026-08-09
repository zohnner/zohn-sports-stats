// ============================================================
// SportStrata — Highlight Card Studio
// ISSUES.md "Highlight Card Studio — animated, user-customized player/game
// cards" (three-gate spec) / DECISIONS.md D-074.
//
// User picks a recent completed MLB game, a player from either roster, up
// to 4 stats from that single game's real boxscore line, an animation
// style, and a color — sees a live animated preview, exports a PNG.
//
// No new data source: the boxscore fetch below is the exact inline
// mlbFetch('/game/{pk}/boxscore', ...) pattern already used at
// js/mlb.js:3291 and elsewhere — MLB Stats API only, same TTL discipline.
// Export reuses shareCardElement() (js/shareCard.js, D-049) verbatim — the
// same plumbing already proven a second time by fantasy.js's mock-draft
// card, not a new render/export path.
//
// v1 scope (D-074): static PNG export only. Animated GIF/WebM export is a
// named, deferred fast-follow — canvas.captureStream()+MediaRecorder is
// the recommended direction, not repeated html2canvas frame capture. Not
// attempted here.
//
// Loads after shareCard.js (needs shareCardElement) and scorecard.js
// (shares its box-score-adjacent conventions), before nfl.js.
// ============================================================

const _HC_HITTING_STATS = [
    { key: 'hits', label: 'H' },
    { key: 'homeRuns', label: 'HR' },
    { key: 'rbi', label: 'RBI' },
    { key: 'runs', label: 'R' },
    { key: 'doubles', label: '2B' },
    { key: 'triples', label: '3B' },
    { key: 'baseOnBalls', label: 'BB' },
    { key: 'strikeOuts', label: 'SO' },
    { key: 'stolenBases', label: 'SB' },
    { key: 'atBats', label: 'AB' },
];

const _HC_PITCHING_STATS = [
    { key: 'inningsPitched', label: 'IP', raw: true },
    { key: 'strikeOuts', label: 'SO' },
    { key: 'hits', label: 'H' },
    { key: 'runs', label: 'R' },
    { key: 'earnedRuns', label: 'ER' },
    { key: 'baseOnBalls', label: 'BB' },
    { key: 'homeRuns', label: 'HR' },
    { key: 'numberOfPitches', label: 'PIT' },
];

const _HC_DEFAULT_HITTING = ['hits', 'homeRuns', 'rbi', 'runs'];
const _HC_DEFAULT_PITCHING = ['inningsPitched', 'strikeOuts', 'hits', 'earnedRuns'];

// Named, small, on-system color choices (DESIGN.md "color is a language
// with a small vocabulary") — never a raw hex picker.
const _HC_COLOR_CHOICES = [
    { key: 'team', label: 'Team' },
    { key: 'accent', label: 'Brand', varName: '--accent' },
    { key: 'win', label: 'Green', varName: '--color-win' },
    { key: 'pts', label: 'Amber', varName: '--color-pts' },
];

const _HC_ANIM_STYLES = [
    { key: 'countup', label: 'Count Up' },
    { key: 'slide', label: 'Slide In' },
    { key: 'fade', label: 'Fade' },
];

let _hcState = null;

// Set by openHighlightCardForGame() just before navigateTo('mlb-highlight-card')
// so a caller viewing a specific game (final boxscore or the live game panel)
// can jump straight into the studio with that game pre-selected, skipping the
// picker. navigateTo/_renderMLBView only pass the view string, not arguments,
// so this module-level handoff is the lowest-risk way to thread a gamePk
// through the hash router without changing its signature.
let _hcPendingGamePk = null;

function openHighlightCardForGame(gamePk) {
    _hcPendingGamePk = gamePk;
    navigateTo('mlb-highlight-card');
}

function _hcResetState() {
    _hcState = {
        games: [], gamePk: null, game: null, boxscore: null,
        side: null, personId: null, player: null, group: null,
        selectedStats: [], anim: 'countup', color: 'team',
    };
}

async function displayMLBHighlightCard() {
    const container = document.getElementById('playersGrid');
    if (!container) return;
    _hcResetState();
    const presetGamePk = _hcPendingGamePk;
    _hcPendingGamePk = null;
    container.innerHTML = _hcSkeletonHtml();
    try {
        if (presetGamePk) {
            // Single-game schedule lookup — same stub shape fetchMLBSchedule()
            // returns (teams.{away,home}.team/score, gameDate), just scoped to
            // the one game the user was already looking at, via mlbFetch (never
            // fetch(statsapi.mlb.com/...) directly).
            const data = await mlbFetch('/schedule', { gamePk: presetGamePk }, ApiCache.TTL.SHORT);
            const game = data?.dates?.[0]?.games?.[0] || null;
            _hcState.games = game ? [game] : [];
            Logger.info('Highlight Card Studio opened from game view', { gamePk: presetGamePk }, 'MLB');
            if (game) { await _hcPickGame(presetGamePk); return; }
        } else {
            const games = await fetchMLBSchedule(6);
            _hcState.games = (games || [])
                .filter(g => g.status?.abstractGameState === 'Final')
                .slice(0, 12);
            Logger.info('Highlight Card Studio opened', { gameCount: _hcState.games.length }, 'MLB');
        }
        _hcRenderStudio(container);
    } catch (err) {
        ErrorHandler.handle(container, err, () => displayMLBHighlightCard(), { tag: 'MLB', title: 'Failed to load recent games' });
    }
}

function _hcSkeletonHtml() {
    return `<div class="hcs-shell">
        <div class="skeleton-card"><div class="skeleton-card-header">
            <div>
                <div class="skeleton-line" style="width:260px;height:24px;margin-bottom:10px"></div>
                <div class="skeleton-line" style="width:180px;height:14px"></div>
            </div>
        </div></div>
        <div class="hcs-skel-grid">
            ${Array.from({ length: 6 }).map(() => '<div class="skeleton-card" style="height:64px"></div>').join('')}
        </div>
    </div>`;
}

function _hcRenderStudio(container) {
    const hasGame = !!_hcState.game;
    const hasPlayer = !!_hcState.player;
    container.innerHTML = `
        <div class="hcs-shell">
            <div class="hcs-head">
                <h2 class="ss-headline">Highlight Card Studio</h2>
                <p class="hcs-sub">Pick a recent game, pick a player, build a card worth sharing.</p>
            </div>
            <div class="hcs-layout">
                <div class="hcs-controls">
                    <div class="hcs-step">
                        <div class="hcs-step-label">1. Game</div>
                        ${_hcGamePickerHtml()}
                    </div>
                    ${hasGame ? `<div class="hcs-step">
                        <div class="hcs-step-label">2. Player</div>
                        ${_hcPlayerPickerHtml()}
                    </div>` : ''}
                    ${hasPlayer ? `<div class="hcs-step">
                        <div class="hcs-step-label">3. Stats <span class="hcs-step-hint">(up to 4)</span></div>
                        ${_hcStatPickerHtml()}
                    </div>
                    <div class="hcs-step">
                        <div class="hcs-step-label">4. Animation</div>
                        ${_hcAnimPickerHtml()}
                    </div>
                    <div class="hcs-step">
                        <div class="hcs-step-label">5. Color</div>
                        ${_hcColorPickerHtml()}
                    </div>` : ''}
                </div>
                <div class="hcs-preview-pane">
                    ${hasPlayer
                        ? `<div class="hcs-preview-mount" id="hcsPreviewMount"></div>
                           <button class="hcs-export-btn" id="hcsExportBtn" type="button">Download PNG</button>`
                        : `<div class="hcs-preview-empty">Pick a game and a player to start building your card.</div>`}
                </div>
            </div>
        </div>`;
    _hcWireControls(container);
    if (hasPlayer) _hcRenderPreview();
}

function _hcGamePickerHtml() {
    if (!_hcState.games.length) {
        return `<div class="hcs-empty-note">No completed games in the last week — check back after tonight's games finish.</div>`;
    }
    return `<div class="hcs-game-list">
        ${_hcState.games.map(g => {
            const away = g.teams?.away?.team, home = g.teams?.home?.team;
            const awayScore = g.teams?.away?.score, homeScore = g.teams?.home?.score;
            const date = g.gameDate ? new Date(g.gameDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
            const active = g.gamePk === _hcState.gamePk ? ' hcs-game-card--active' : '';
            return `<button type="button" class="hcs-game-card${active}" data-hc-game="${g.gamePk}">
                <span class="hcs-game-date">${_escHtml(date)}</span>
                <span class="hcs-game-matchup">${_escHtml(away?.abbreviation || away?.name || '')} ${awayScore ?? ''} @ ${_escHtml(home?.abbreviation || home?.name || '')} ${homeScore ?? ''}</span>
            </button>`;
        }).join('')}
    </div>`;
}

function _hcPlayerPickerHtml() {
    const bs = _hcState.boxscore;
    if (!bs) return '';
    const teamOptions = side => {
        const t = bs.teams[side];
        if (!t) return '';
        const teamName = t.team?.name || side;
        const batters = (t.battingOrder || []).map(id => t.players?.[`ID${id}`]).filter(Boolean);
        const pitchers = (t.pitchers || []).map(id => t.players?.[`ID${id}`]).filter(Boolean);
        const opt = (p, group) => {
            const selected = (_hcState.personId === p.person.id && _hcState.side === side) ? ' selected' : '';
            return `<option value="${side}:${group}:${p.person.id}"${selected}>${_escHtml(p.person.fullName)}</option>`;
        };
        return `<optgroup label="${_escHtml(teamName)} — Batters">${batters.map(p => opt(p, 'hitting')).join('')}</optgroup>
                <optgroup label="${_escHtml(teamName)} — Pitchers">${pitchers.map(p => opt(p, 'pitching')).join('')}</optgroup>`;
    };
    return `<select class="hcs-select" id="hcsPlayerSelect" aria-label="Pick a player">
        <option value="">Choose a player…</option>
        ${teamOptions('away')}
        ${teamOptions('home')}
    </select>`;
}

function _hcCurrentStatCatalog() {
    return _hcState.group === 'pitching' ? _HC_PITCHING_STATS : _HC_HITTING_STATS;
}

function _hcStatPickerHtml() {
    const catalog = _hcCurrentStatCatalog();
    return `<div class="hcs-stat-checks">
        ${catalog.map(s => {
            const checked = _hcState.selectedStats.includes(s.key);
            const atCap = _hcState.selectedStats.length >= 4 && !checked;
            return `<label class="hcs-stat-check${atCap ? ' hcs-stat-check--disabled' : ''}">
                <input type="checkbox" data-hc-stat="${s.key}" ${checked ? 'checked' : ''} ${atCap ? 'disabled' : ''}>
                ${_escHtml(s.label)}
            </label>`;
        }).join('')}
    </div>`;
}

function _hcAnimPickerHtml() {
    return `<div class="hcs-pill-row">
        ${_HC_ANIM_STYLES.map(a => `<button type="button" class="hcs-pill${_hcState.anim === a.key ? ' hcs-pill--active' : ''}" data-hc-anim="${a.key}">${_escHtml(a.label)}</button>`).join('')}
    </div>`;
}

function _hcColorPickerHtml() {
    return `<div class="hcs-pill-row">
        ${_HC_COLOR_CHOICES.map(c => `<button type="button" class="hcs-pill${_hcState.color === c.key ? ' hcs-pill--active' : ''}" data-hc-color="${c.key}">${_escHtml(c.label)}</button>`).join('')}
    </div>`;
}

function _hcWireControls(container) {
    container.querySelectorAll('[data-hc-game]').forEach(btn => {
        btn.addEventListener('click', () => _hcPickGame(Number(btn.dataset.hcGame)));
    });
    const playerSelect = container.querySelector('#hcsPlayerSelect');
    if (playerSelect) {
        playerSelect.addEventListener('change', () => {
            const v = playerSelect.value;
            if (!v) return;
            const [side, group, personId] = v.split(':');
            _hcPickPlayer(side, group, Number(personId));
        });
    }
    container.querySelectorAll('[data-hc-stat]').forEach(cb => {
        cb.addEventListener('change', () => _hcToggleStat(cb.dataset.hcStat, cb.checked));
    });
    container.querySelectorAll('[data-hc-anim]').forEach(btn => {
        btn.addEventListener('click', () => { _hcState.anim = btn.dataset.hcAnim; _hcRenderStudio(container); });
    });
    container.querySelectorAll('[data-hc-color]').forEach(btn => {
        btn.addEventListener('click', () => { _hcState.color = btn.dataset.hcColor; _hcRenderStudio(container); });
    });
    const exportBtn = container.querySelector('#hcsExportBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => _hcExportPNG(exportBtn));
}

async function _hcPickGame(gamePk) {
    const container = document.getElementById('playersGrid');
    const game = _hcState.games.find(g => g.gamePk === gamePk);
    if (!game || !container) return;
    _hcState.gamePk = gamePk;
    _hcState.game = game;
    _hcState.boxscore = null;
    _hcState.side = null; _hcState.personId = null; _hcState.player = null; _hcState.group = null;
    _hcState.selectedStats = [];
    container.innerHTML = _hcSkeletonHtml();
    try {
        const bs = await mlbFetch(`/game/${gamePk}/boxscore`, {}, ApiCache.TTL.LONG);
        _hcState.boxscore = bs;
        _hcRenderStudio(container);
    } catch (err) {
        ErrorHandler.handle(container, err, () => _hcPickGame(gamePk), { tag: 'MLB', title: 'Failed to load boxscore' });
    }
}

function _hcPickPlayer(side, group, personId) {
    const t = _hcState.boxscore?.teams?.[side];
    const entry = t?.players?.[`ID${personId}`];
    if (!entry) return;
    _hcState.side = side;
    _hcState.personId = personId;
    _hcState.player = entry;
    _hcState.group = group;
    _hcState.selectedStats = (group === 'pitching' ? _HC_DEFAULT_PITCHING : _HC_DEFAULT_HITTING).slice(0, 4);
    _hcRenderStudio(document.getElementById('playersGrid'));
}

function _hcToggleStat(key, checked) {
    if (checked) {
        if (_hcState.selectedStats.length >= 4) return;
        _hcState.selectedStats.push(key);
    } else {
        _hcState.selectedStats = _hcState.selectedStats.filter(k => k !== key);
    }
    _hcRenderStudio(document.getElementById('playersGrid'));
}

function _hcTeamAbbr(side) {
    const t = _hcState.boxscore?.teams?.[side]?.team;
    return t?.abbreviation || '';
}

function _hcOpponentAbbr(side) {
    return _hcTeamAbbr(side === 'home' ? 'away' : 'home');
}

function _hcColorValue() {
    const choice = _HC_COLOR_CHOICES.find(c => c.key === _hcState.color) || _HC_COLOR_CHOICES[0];
    if (choice.key === 'team') {
        const abbr = _hcTeamAbbr(_hcState.side);
        const colors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(abbr) : null;
        return colors?.primary || 'var(--accent)';
    }
    return `var(${choice.varName})`;
}

function _hcCardHtml() {
    // Boxscore JSON keys per-player stats as "batting"/"pitching" (MLB Stats API
    // convention) — distinct from AppState.mlbPlayerStats' season-stats grouping,
    // which uses "hitting". _hcState.group stays "hitting" as the UI-facing label
    // (matches the rest of this codebase's convention) but must map to "batting"
    // here specifically, or every hitter's stat line silently reads as all-zero.
    const apiStatsKey = _hcState.group === 'pitching' ? 'pitching' : 'batting';
    const stat = _hcState.player.stats?.[apiStatsKey] || {};
    const catalog = _hcCurrentStatCatalog();
    const abbr = _hcTeamAbbr(_hcState.side);
    const oppAbbr = _hcOpponentAbbr(_hcState.side);
    const dateLabel = _hcState.game?.gameDate ? new Date(_hcState.game.gameDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const statHtml = _hcState.selectedStats.map((key, i) => {
        const meta = catalog.find(s => s.key === key);
        const raw = stat[key];
        const displayVal = raw === undefined || raw === null || raw === '' ? '0' : String(raw);
        const isNumeric = !meta?.raw && /^-?\d+(\.\d+)?$/.test(displayVal);
        // Only the "Count Up" animation style animates from 0 -> real value (via
        // _hcAnimateCounts, called from _hcRenderPreview when anim === 'countup').
        // For "Slide In"/"Fade" the real value must render immediately — a real
        // bug shipped here once already: initializing every numeric stat's text
        // to "0" unconditionally meant slide/fade cards showed permanent zeros,
        // since nothing else ever set the real value in those two modes. Caught
        // live on production (Chrome, real boxscore data) before this fix.
        const animatesUp = isNumeric && _hcState.anim === 'countup';
        const initialText = animatesUp ? '0' : _escHtml(displayVal);
        return `<div class="hcs-stat" style="animation-delay:${i * 110}ms">
            <div class="hcs-stat-value"${animatesUp ? ` data-hc-count="${displayVal}"` : ''}>${initialText}</div>
            <div class="hcs-stat-label">${_escHtml(meta?.label || key)}</div>
        </div>`;
    }).join('');
    return `
        <div class="hcs-id-row">
            <div class="hcs-player">${_escHtml(_hcState.player.person.fullName)}</div>
            <div class="hcs-meta">${_escHtml(abbr)} vs ${_escHtml(oppAbbr)} · ${_escHtml(dateLabel)}</div>
        </div>
        <div class="hcs-stat-row">${statHtml}</div>
        <div class="hcs-brand">Sport<span class="accent">Strata</span></div>`;
}

function _hcRenderPreview() {
    const mount = document.getElementById('hcsPreviewMount');
    if (!mount) return;
    mount.className = `hcs-preview-mount hcs-card hcs-card--${_hcState.anim}`;
    mount.style.setProperty('--team-color', _hcColorValue());
    mount.innerHTML = _hcCardHtml();
    if (_hcState.anim === 'countup') _hcAnimateCounts(mount);
}

function _hcAnimateCounts(root) {
    root.querySelectorAll('[data-hc-count]').forEach(el => {
        const target = parseFloat(el.dataset.hcCount);
        if (!Number.isFinite(target)) return;
        const isInt = Number.isInteger(target);
        const duration = 900;
        const start = performance.now();
        function step(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const val = target * eased;
            el.textContent = isInt ? Math.round(val).toString() : val.toFixed(1);
            if (t < 1) requestAnimationFrame(step);
            else el.textContent = isInt ? String(target) : target.toFixed(1);
        }
        requestAnimationFrame(step);
    });
}

async function _hcExportPNG(btn) {
    const cardEl = document.createElement('div');
    cardEl.className = 'hcs-card hcs-export-card';
    cardEl.style.setProperty('--team-color', _hcColorValue());
    cardEl.innerHTML = _hcCardHtml();
    // Export is a static snapshot — render final (non-animating) values directly,
    // no count-up needed since html2canvas captures a single instant anyway.
    cardEl.querySelectorAll('[data-hc-count]').forEach(el => { el.textContent = el.dataset.hcCount; });
    const fileName = `sportstrata-${(_hcState.player.person.fullName || 'highlight').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    await shareCardElement({
        cardEl,
        fileName,
        title: `${_hcState.player.person.fullName} — SportStrata Highlight Card`,
        text: 'Built with SportStrata Highlight Card Studio',
        btn,
    });
}

// ============================================================
// NFL port (D-074 named NFL as a confirmed-data-ready, sequenced-after-MLB
// follow-through — this is that follow-through, 2026-08-09).
//
// Deliberately NOT unified with the MLB functions above into one generic
// sport-adapter, even though that's this codebase's usual pattern for
// shared chrome (detailFrame.js). Reason: the two data shapes aren't a
// thin config difference, they're structurally different. MLB's boxscore
// (statsapi.mlb.com) keys every stat by a stable name on a per-player
// object (stat.hits, stat.homeRuns...), so a fixed {key,label} catalog
// works. ESPN's /summary boxscore (data.boxscore.players[].statistics[])
// has no such keys — each stat group carries a `labels` array and each
// athlete a parallel positional `stats` array (already proven by
// js/nflLiveGame.js's _nlgBoxScore, which reads the same shape). The
// NFL catalog below is built from those labels by index, not a semantic
// key. Forcing both into one function would mean the "adapter" is just
// these functions again with extra indirection. Reuses everything that
// IS actually generic: every .hcs-* CSS class, _HC_COLOR_CHOICES,
// _HC_ANIM_STYLES, _hcAnimateCounts, shareCardElement.
//
// Data: fetchNFLSummary() (js/nflLiveGame.js) — same call the live game
// panel already makes, same /api/nfl?path=/summary edge-cached endpoint.
// No new data source, no new proxy path.
// ============================================================

const _HC_NFL_GROUP_ORDER = ['passing', 'rushing', 'receiving', 'defensive', 'kicking'];
const _HC_NFL_GROUP_LABELS = { passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving', defensive: 'Defense', kicking: 'Kicking' };

let _hcNflState = null;
let _hcNflPendingEventId = null;

function openNFLHighlightCardForGame(eventId) {
    _hcNflPendingEventId = eventId;
    navigateTo('nfl-highlight-card');
}

function _hcNflResetState() {
    _hcNflState = {
        games: [], eventId: null, game: null, summary: null,
        side: null, group: null, athleteIdx: null, player: null,
        selectedStats: [], anim: 'countup', color: 'team',
    };
}

async function displayNFLHighlightCard() {
    const container = document.getElementById('playersGrid');
    if (!container) return;
    _hcNflResetState();
    const presetEventId = _hcNflPendingEventId;
    _hcNflPendingEventId = null;
    container.innerHTML = _hcSkeletonHtml();
    try {
        if (presetEventId) {
            Logger.info('Highlight Card Studio opened from NFL game view', { eventId: presetEventId }, 'NFL');
            await _hcNflPickGame(presetEventId, true);
            return;
        }
        // "Recent completed games" for NFL means this week's finals — there's no
        // MLB-style N-days-back lookback endpoint, and weekly cadence makes "this
        // week" the natural analog (same default the Scores/landing "This Week's
        // Games" surfaces already use, D-071/D-076).
        const games = (typeof fetchNFLScoreboard === 'function') ? await fetchNFLScoreboard() : [];
        _hcNflState.games = (games || []).filter(g => g.isFinal).slice(0, 12);
        Logger.info('NFL Highlight Card Studio opened', { gameCount: _hcNflState.games.length }, 'NFL');
        _hcNflRenderStudio(container);
    } catch (err) {
        ErrorHandler.handle(container, err, () => displayNFLHighlightCard(), { tag: 'NFL', title: 'Failed to load recent games' });
    }
}

function _hcNflRenderStudio(container) {
    const hasGame = !!_hcNflState.game;
    const hasPlayer = !!_hcNflState.player;
    container.innerHTML = `
        <div class="hcs-shell">
            <div class="hcs-head">
                <h2 class="ss-headline">Highlight Card Studio — NFL</h2>
                <p class="hcs-sub">Pick a recent game, pick a player, build a card worth sharing.</p>
            </div>
            <div class="hcs-layout">
                <div class="hcs-controls">
                    <div class="hcs-step">
                        <div class="hcs-step-label">1. Game</div>
                        ${_hcNflGamePickerHtml()}
                    </div>
                    ${hasGame ? `<div class="hcs-step">
                        <div class="hcs-step-label">2. Player</div>
                        ${_hcNflPlayerPickerHtml()}
                    </div>` : ''}
                    ${hasPlayer ? `<div class="hcs-step">
                        <div class="hcs-step-label">3. Stats <span class="hcs-step-hint">(up to 4)</span></div>
                        ${_hcNflStatPickerHtml()}
                    </div>
                    <div class="hcs-step">
                        <div class="hcs-step-label">4. Animation</div>
                        ${_hcNflAnimPickerHtml()}
                    </div>
                    <div class="hcs-step">
                        <div class="hcs-step-label">5. Color</div>
                        ${_hcNflColorPickerHtml()}
                    </div>` : ''}
                </div>
                <div class="hcs-preview-pane">
                    ${hasPlayer
                        ? `<div class="hcs-preview-mount" id="hcsPreviewMount"></div>
                           <button class="hcs-export-btn" id="hcsExportBtn" type="button">Download PNG</button>`
                        : `<div class="hcs-preview-empty">Pick a game and a player to start building your card.</div>`}
                </div>
            </div>
        </div>`;
    _hcNflWireControls(container);
    if (hasPlayer) _hcNflRenderPreview();
}

function _hcNflGamePickerHtml() {
    if (!_hcNflState.games.length) {
        return `<div class="hcs-empty-note">No completed games this week yet — check back after this week's games finish.</div>`;
    }
    return `<div class="hcs-game-list">
        ${_hcNflState.games.map(g => {
            const date = g.date ? new Date(g.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
            const active = String(g.id) === String(_hcNflState.eventId) ? ' hcs-game-card--active' : '';
            return `<button type="button" class="hcs-game-card${active}" data-hc-nfl-game="${_escHtml(String(g.id))}">
                <span class="hcs-game-date">${_escHtml(date)}</span>
                <span class="hcs-game-matchup">${_escHtml(g.awayTeam?.abbr || '')} ${g.awayTeam?.score ?? ''} @ ${_escHtml(g.homeTeam?.abbr || '')} ${g.homeTeam?.score ?? ''}</span>
            </button>`;
        }).join('')}
    </div>`;
}

// Matches team blocks by abbreviation, not id — fetchNFLScoreboard()'s normalized
// shape doesn't carry a team id (js/nfl.js), and within one /summary response the
// header competitors and boxscore.players entries describe the same event, so
// abbreviation is a safe, simpler join key here (unlike joining across sources).
function _hcNflGroupsForSide(side) {
    const abbr = _hcNflTeamAbbr(side);
    if (!abbr) return [];
    const teamBlock = (_hcNflState.summary?.boxscore?.players || []).find(p => (p.team || {}).abbreviation === abbr);
    if (!teamBlock) return [];
    return _HC_NFL_GROUP_ORDER
        .map(key => ({ key, label: _HC_NFL_GROUP_LABELS[key], group: (teamBlock.statistics || []).find(s => s.name === key) }))
        .filter(g => g.group && g.group.athletes && g.group.athletes.length);
}

function _hcNflPlayerPickerHtml() {
    const sideOptions = side => {
        const groups = _hcNflGroupsForSide(side);
        if (!groups.length) return '';
        const teamLabel = _hcNflTeamAbbr(side);
        return groups.map(g => {
            const opts = g.group.athletes.map((a, i) => {
                const name = a.athlete?.displayName || a.athlete?.shortName || 'Player';
                const selected = (_hcNflState.side === side && _hcNflState.group === g.key && _hcNflState.athleteIdx === i) ? ' selected' : '';
                return `<option value="${side}:${g.key}:${i}"${selected}>${_escHtml(name)}</option>`;
            }).join('');
            return `<optgroup label="${_escHtml(teamLabel)} — ${_escHtml(g.label)}">${opts}</optgroup>`;
        }).join('');
    };
    return `<select class="hcs-select" id="hcsPlayerSelect" aria-label="Pick a player">
        <option value="">Choose a player…</option>
        ${sideOptions('away')}
        ${sideOptions('home')}
    </select>`;
}

function _hcNflCurrentGroupData() {
    const groups = _hcNflGroupsForSide(_hcNflState.side);
    const found = groups.find(g => g.key === _hcNflState.group);
    return found ? found.group : null;
}

function _hcNflStatCatalog() {
    const g = _hcNflCurrentGroupData();
    if (!g || !g.labels) return [];
    return g.labels.map((label, i) => ({ key: i, label }));
}

function _hcNflStatPickerHtml() {
    const catalog = _hcNflStatCatalog();
    return `<div class="hcs-stat-checks">
        ${catalog.map(s => {
            const checked = _hcNflState.selectedStats.includes(s.key);
            const atCap = _hcNflState.selectedStats.length >= 4 && !checked;
            return `<label class="hcs-stat-check${atCap ? ' hcs-stat-check--disabled' : ''}">
                <input type="checkbox" data-hc-nfl-stat="${s.key}" ${checked ? 'checked' : ''} ${atCap ? 'disabled' : ''}>
                ${_escHtml(s.label)}
            </label>`;
        }).join('')}
    </div>`;
}

function _hcNflAnimPickerHtml() {
    return `<div class="hcs-pill-row">
        ${_HC_ANIM_STYLES.map(a => `<button type="button" class="hcs-pill${_hcNflState.anim === a.key ? ' hcs-pill--active' : ''}" data-hc-nfl-anim="${a.key}">${_escHtml(a.label)}</button>`).join('')}
    </div>`;
}

function _hcNflColorPickerHtml() {
    return `<div class="hcs-pill-row">
        ${_HC_COLOR_CHOICES.map(c => `<button type="button" class="hcs-pill${_hcNflState.color === c.key ? ' hcs-pill--active' : ''}" data-hc-nfl-color="${c.key}">${_escHtml(c.label)}</button>`).join('')}
    </div>`;
}

function _hcNflWireControls(container) {
    container.querySelectorAll('[data-hc-nfl-game]').forEach(btn => {
        btn.addEventListener('click', () => _hcNflPickGame(btn.dataset.hcNflGame, false));
    });
    const playerSelect = container.querySelector('#hcsPlayerSelect');
    if (playerSelect) {
        playerSelect.addEventListener('change', () => {
            const v = playerSelect.value;
            if (!v) return;
            const [side, group, idx] = v.split(':');
            _hcNflPickPlayer(side, group, Number(idx));
        });
    }
    container.querySelectorAll('[data-hc-nfl-stat]').forEach(cb => {
        cb.addEventListener('change', () => _hcNflToggleStat(cb.dataset.hcNflStat, cb.checked));
    });
    container.querySelectorAll('[data-hc-nfl-anim]').forEach(btn => {
        btn.addEventListener('click', () => { _hcNflState.anim = btn.dataset.hcNflAnim; _hcNflRenderStudio(container); });
    });
    container.querySelectorAll('[data-hc-nfl-color]').forEach(btn => {
        btn.addEventListener('click', () => { _hcNflState.color = btn.dataset.hcNflColor; _hcNflRenderStudio(container); });
    });
    const exportBtn = container.querySelector('#hcsExportBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => _hcNflExportPNG(exportBtn));
}

async function _hcNflPickGame(eventId, fromPreset) {
    const container = document.getElementById('playersGrid');
    if (!container) return;
    container.innerHTML = _hcSkeletonHtml();
    try {
        const data = await fetchNFLSummary(eventId);
        const comp = (data.header && data.header.competitions && data.header.competitions[0]) || {};
        const home = (comp.competitors || []).find(c => c.homeAway === 'home') || {};
        const away = (comp.competitors || []).find(c => c.homeAway === 'away') || {};
        const pseudoGame = {
            id: eventId,
            date: comp.date || null,
            homeTeam: { abbr: (home.team && home.team.abbreviation) || '', score: home.score },
            awayTeam: { abbr: (away.team && away.team.abbreviation) || '', score: away.score },
        };
        // Preset entry (from the live/final game view) skips the scoreboard-week
        // fetch entirely, so the picker has no list yet — seed it with just this
        // one game so step 1 shows it selected rather than a misleading empty note.
        if (fromPreset) _hcNflState.games = [pseudoGame];
        _hcNflState.eventId = eventId;
        _hcNflState.summary = data;
        _hcNflState.game = pseudoGame;
        _hcNflState.side = null; _hcNflState.group = null; _hcNflState.athleteIdx = null; _hcNflState.player = null;
        _hcNflState.selectedStats = [];
        _hcNflRenderStudio(container);
    } catch (err) {
        ErrorHandler.handle(container, err, () => _hcNflPickGame(eventId, fromPreset), { tag: 'NFL', title: 'Failed to load boxscore' });
    }
}

function _hcNflPickPlayer(side, groupKey, athleteIdx) {
    const groups = _hcNflGroupsForSide(side);
    const g = groups.find(x => x.key === groupKey);
    const athlete = g && g.group.athletes[athleteIdx];
    if (!athlete) return;
    _hcNflState.side = side;
    _hcNflState.group = groupKey;
    _hcNflState.athleteIdx = athleteIdx;
    _hcNflState.player = athlete;
    const catalog = _hcNflStatCatalog();
    _hcNflState.selectedStats = catalog.slice(0, 4).map(c => c.key);
    _hcNflRenderStudio(document.getElementById('playersGrid'));
}

function _hcNflToggleStat(key, checked) {
    key = Number(key);
    if (checked) {
        if (_hcNflState.selectedStats.length >= 4) return;
        _hcNflState.selectedStats.push(key);
    } else {
        _hcNflState.selectedStats = _hcNflState.selectedStats.filter(k => k !== key);
    }
    _hcNflRenderStudio(document.getElementById('playersGrid'));
}

function _hcNflTeamAbbr(side) {
    if (!_hcNflState.game) return '';
    return side === 'home' ? (_hcNflState.game.homeTeam?.abbr || '') : (_hcNflState.game.awayTeam?.abbr || '');
}

function _hcNflOpponentAbbr(side) {
    return _hcNflTeamAbbr(side === 'home' ? 'away' : 'home');
}

function _hcNflColorValue() {
    const choice = _HC_COLOR_CHOICES.find(c => c.key === _hcNflState.color) || _HC_COLOR_CHOICES[0];
    if (choice.key === 'team') {
        const abbr = _hcNflTeamAbbr(_hcNflState.side);
        const c = (typeof getNFLTeamColor === 'function') ? getNFLTeamColor(abbr) : null;
        return c || 'var(--accent)';
    }
    return `var(${choice.varName})`;
}

function _hcNflDateLabel() {
    const iso = _hcNflState.game && _hcNflState.game.date;
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function _hcNflCardHtml() {
    const catalog = _hcNflStatCatalog();
    const abbr = _hcNflTeamAbbr(_hcNflState.side);
    const oppAbbr = _hcNflOpponentAbbr(_hcNflState.side);
    const dateLabel = _hcNflDateLabel();
    const name = (_hcNflState.player.athlete && (_hcNflState.player.athlete.displayName || _hcNflState.player.athlete.shortName)) || 'Player';
    const rawStats = _hcNflState.player.stats || [];
    const statHtml = _hcNflState.selectedStats.map((key, i) => {
        const meta = catalog.find(c => c.key === key);
        const raw = rawStats[key];
        const displayVal = (raw === undefined || raw === null || raw === '') ? '0' : String(raw);
        const isNumeric = /^-?\d+(\.\d+)?$/.test(displayVal);
        const animatesUp = isNumeric && _hcNflState.anim === 'countup';
        const initialText = animatesUp ? '0' : _escHtml(displayVal);
        return `<div class="hcs-stat" style="animation-delay:${i * 110}ms">
            <div class="hcs-stat-value"${animatesUp ? ` data-hc-count="${displayVal}"` : ''}>${initialText}</div>
            <div class="hcs-stat-label">${_escHtml(meta ? meta.label : '')}</div>
        </div>`;
    }).join('');
    return `
        <div class="hcs-id-row">
            <div class="hcs-player">${_escHtml(name)}</div>
            <div class="hcs-meta">${_escHtml(abbr)} vs ${_escHtml(oppAbbr)} · ${_escHtml(dateLabel)}</div>
        </div>
        <div class="hcs-stat-row">${statHtml}</div>
        <div class="hcs-brand">Sport<span class="accent">Strata</span></div>`;
}

function _hcNflRenderPreview() {
    const mount = document.getElementById('hcsPreviewMount');
    if (!mount) return;
    mount.className = `hcs-preview-mount hcs-card hcs-card--${_hcNflState.anim}`;
    mount.style.setProperty('--team-color', _hcNflColorValue());
    mount.innerHTML = _hcNflCardHtml();
    if (_hcNflState.anim === 'countup') _hcAnimateCounts(mount);
}

async function _hcNflExportPNG(btn) {
    const cardEl = document.createElement('div');
    cardEl.className = 'hcs-card hcs-export-card';
    cardEl.style.setProperty('--team-color', _hcNflColorValue());
    cardEl.innerHTML = _hcNflCardHtml();
    cardEl.querySelectorAll('[data-hc-count]').forEach(el => { el.textContent = el.dataset.hcCount; });
    const name = (_hcNflState.player.athlete && (_hcNflState.player.athlete.displayName || _hcNflState.player.athlete.shortName)) || 'highlight';
    const fileName = `sportstrata-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    await shareCardElement({
        cardEl,
        fileName,
        title: `${name} — SportStrata Highlight Card`,
        text: 'Built with SportStrata Highlight Card Studio',
        btn,
    });
}

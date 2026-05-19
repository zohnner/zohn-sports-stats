// ============================================================
// Arcade — mini-game hub
// Games: Statline Shuffle, Trade Tree Tracker
// ============================================================

// ── Persistence helpers ───────────────────────────────────────

function _arcToday() {
    // ET-anchored date string matching MLB API convention
    return typeof _mlbDateString === 'function' ? _mlbDateString(0) : new Date().toISOString().slice(0, 10);
}

function _arcSave(game, data) {
    try {
        localStorage.setItem(`zs_arcade_${game}`, JSON.stringify({ date: _arcToday(), ...data }));
    } catch (_) {}
}

function _arcLoad(game) {
    try {
        const raw = JSON.parse(localStorage.getItem(`zs_arcade_${game}`) || 'null');
        return raw?.date === _arcToday() ? raw : null;
    } catch (_) { return null; }
}

// ── Hub ───────────────────────────────────────────────────────

function loadArcade() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;padding:1.5rem 0;';

    const shuffleSave   = _arcLoad('shuffle');
    const tradeSave     = _arcLoad('trade');
    const blueprintSave = _arcLoad('blueprint');
    const whoamiSave    = _arcLoad('whoami');
    const statdleSave   = _arcLoad('statdle');
    const questSave     = _arcLoad('quest');
    const questStreak   = _questStreak();

    const _badge = (save, scoreText) => save
        ? `<div class="arcade-completed-badge">✓ Played — ${scoreText}</div>`
        : '';

    const _starScore = s => s
        ? `${'★'.repeat(s.score)}${'☆'.repeat(5 - s.score)} (${s.score}/5)`
        : '';

    const otdSave = _arcLoad('otd');

    grid.innerHTML = `
        <div class="arcade-hub">
            <div class="arcade-hub-header">
                <h1 class="arcade-hub-title">Arcade</h1>
                <p class="arcade-hub-sub">Daily sports mini-games · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>

            <div class="arcade-sport-section">
                <div class="arcade-sport-header">
                    <span class="arcade-sport-icon">⚾</span>
                    <span class="arcade-sport-name">MLB</span>
                    <span class="arcade-sport-count">5 games</span>
                </div>
                <div class="arcade-game-grid">
                    <div class="arcade-game-card arcade-game-card--otd ${otdSave ? 'arcade-game-card--done' : ''}">
                        ${otdSave ? `<div class="arcade-completed-badge">✓ ${otdSave.correct ? 'Correct 🟩' : 'Missed 🟥'}</div>` : ''}
                        <div class="arcade-game-icon">📅</div>
                        <h2 class="arcade-game-title">On This Day</h2>
                        <p class="arcade-game-desc">Guess the standout player from a game played on this date in MLB history.</p>
                        <div class="arcade-game-meta">
                            <span>⏱ ~1 min</span>
                            <span>⚡ Easy</span>
                        </div>
                        <button class="arcade-play-btn" onclick="startOnThisDay()">
                            ${otdSave ? 'Play Again' : 'Play Now'}
                        </button>
                    </div>

                    <div class="arcade-game-card arcade-game-card--statdle ${statdleSave?.answered ? 'arcade-game-card--done' : ''}">
                        ${statdleSave?.answered ? `<div class="arcade-completed-badge">✓ Played — ${statdleSave.won ? '🟩 Got it' : '🟥 Missed'}</div>` : ''}
                        <div class="arcade-game-icon">⚾</div>
                        <h2 class="arcade-game-title">Statdle</h2>
                        <p class="arcade-game-desc">Guess the mystery MLB hitter from their per-game statlines. One new clue per guess.</p>
                        <div class="arcade-game-meta">
                            <span>⏱ ~2 min</span>
                            <span>⚡ Medium</span>
                        </div>
                        <button class="arcade-play-btn" onclick="startStatdle()">
                            ${statdleSave?.answered ? 'Play Again' : 'Play Now'}
                        </button>
                    </div>

                    <div class="arcade-game-card arcade-game-card--shuffle ${shuffleSave ? 'arcade-game-card--done' : ''}">
                        ${_badge(shuffleSave, shuffleSave ? `${shuffleSave.score}/3 ${['😬','😅','👍','🎉'][shuffleSave.score]}` : '')}
                        <div class="arcade-game-icon">📊</div>
                        <h2 class="arcade-game-title">Statline Shuffle</h2>
                        <p class="arcade-game-desc">Match yesterday's anonymous statlines to the right player. New puzzle every day.</p>
                        <div class="arcade-game-meta">
                            <span>⏱ ~2 min</span>
                            <span>⚡ Easy–Hard</span>
                        </div>
                        <button class="arcade-play-btn" onclick="startStatlineShuffle()">
                            ${shuffleSave ? 'Play Again' : 'Play Now'}
                        </button>
                    </div>

                    <div class="arcade-game-card arcade-game-card--trade ${tradeSave ? 'arcade-game-card--done' : ''}">
                        ${_badge(tradeSave, tradeSave?.correct ? 'Correct 🟩' : 'Missed 🟥')}
                        <div class="arcade-game-icon">🔀</div>
                        <h2 class="arcade-game-title">Trade Tree Tracker</h2>
                        <p class="arcade-game-desc">Fill in the missing player from a famous MLB trade. Deep baseball knowledge rewarded.</p>
                        <div class="arcade-game-meta">
                            <span>⏱ ~2 min</span>
                            <span>⚡ Hard</span>
                        </div>
                        <button class="arcade-play-btn" onclick="startTradeTree()">
                            ${tradeSave ? 'Play Again' : 'Play Now'}
                        </button>
                    </div>

                    <div class="arcade-game-card arcade-game-card--blueprint ${blueprintSave ? 'arcade-game-card--done' : ''}">
                        ${_badge(blueprintSave, blueprintSave ? `${blueprintSave.score}/3 ${['😬','😅','👍','🎉'][blueprintSave.score]}` : '')}
                        <div class="arcade-game-icon">🏟</div>
                        <h2 class="arcade-game-title">Ballpark Blueprint</h2>
                        <p class="arcade-game-desc">Identify the MLB stadium from its field dimensions. Use fewer clues for a better score.</p>
                        <div class="arcade-game-meta">
                            <span>⏱ ~1 min</span>
                            <span>⚡ Medium</span>
                        </div>
                        <button class="arcade-play-btn" onclick="startBallparkBlueprint()">
                            ${blueprintSave ? 'Play Again' : 'Play Now'}
                        </button>
                    </div>
                </div>
            </div>

        </div>
    `;
}

// ── On This Day ───────────────────────────────────────────────

async function startOnThisDay() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;padding:1.5rem 0;';

    const _wrap = content => `
        <div class="arcade-game-wrap">
            <div class="arcade-back-row">
                <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                <span class="arcade-game-title-inline">📅 On This Day</span>
            </div>
            ${content}
        </div>`;

    grid.innerHTML = _wrap(`<div class="arcade-loading"><div class="loading-spinner"></div></div>`);

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
        } catch (_) { continue; }

        const finished = (sched?.dates?.[0]?.games || []).filter(g => g.status?.abstractGameState === 'Final');
        if (!finished.length) continue;

        const game = finished.reduce((best, g) => {
            const r = (g.linescore?.teams?.home?.runs ?? 0) + (g.linescore?.teams?.away?.runs ?? 0);
            const b = (best.linescore?.teams?.home?.runs ?? 0) + (best.linescore?.teams?.away?.runs ?? 0);
            return r > b ? g : best;
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
        } catch (_) { continue; }

        const homeTeam   = game.teams?.home?.team?.abbreviation || '?';
        const awayTeam   = game.teams?.away?.team?.abbreviation || '?';
        const homeScore  = game.linescore?.teams?.home?.runs ?? game.teams?.home?.score ?? '?';
        const awayScore  = game.linescore?.teams?.away?.runs ?? game.teams?.away?.score ?? '?';
        const homeLogo   = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(homeTeam) : '';
        const awayLogo   = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(awayTeam) : '';
        const homeColors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(homeTeam) : { primary: 'var(--accent)' };

        const top        = players[0] || null;
        const otdSave    = _arcLoad('otd');
        let challengeHTML = '';

        if (top) {
            const parts = [`${top.h}-for-${top.ab}`];
            if (top.hr  > 0) parts.push(`${top.hr} HR`);
            if (top.rbi > 0) parts.push(`${top.rbi} RBI`);
            const clueLine = parts.join(' · ');

            const distractors = players.slice(1, 4);

            if (distractors.length >= 1) {
                const pool = [{ ...top, correct: true }, ...distractors.map(p => ({ ...p, correct: false }))];
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
                window._otdChoices = pool;
                const alreadyDone  = !!otdSave;
                const choiceBtns   = pool.map((c, i) => {
                    let cls = 'otd-choice';
                    if (alreadyDone) cls += c.correct ? ' otd-choice--correct' : ' otd-choice--dim';
                    const handler = alreadyDone ? '' : `onclick="_otdArcadeReveal(${i})"`;
                    return `<button class="${cls}" ${alreadyDone ? 'disabled' : handler}>${_escHtml(c.name)}</button>`;
                }).join('');
                const resultHTML = alreadyDone
                    ? (otdSave.correct
                        ? `<span class="otd-result--right">&#10003; Correct!</span>`
                        : `<span class="otd-result--wrong">&#10007; It was <strong>${_escHtml(top.name)}</strong></span>`)
                    : '';
                challengeHTML = `
                    <div class="otd-challenge">
                        <p class="otd-prompt">Who had this game?</p>
                        <p class="otd-clue">${clueLine}</p>
                        <div class="otd-choices" id="otdChoices">${choiceBtns}</div>
                        <p class="otd-result" id="otdResult" ${alreadyDone ? '' : 'hidden'}>${resultHTML}</p>
                    </div>`;
            } else {
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

        grid.innerHTML = _wrap(`
            <div style="max-width:480px;margin:0 auto">
                <p class="arcade-game-sub" style="text-align:center;margin-bottom:1rem">${month}, ${year}</p>
                <div class="otd-card" style="border-left:3px solid ${homeColors.primary}">
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
            </div>`);
        return;
    }

    grid.innerHTML = _wrap(`<p style="color:var(--text-muted);text-align:center;padding:2rem 1rem">No historical game found for today's date.</p>`);
}

window._otdArcadeReveal = function(idx) {
    if (typeof window._otdReveal === 'function') window._otdReveal(idx);
    const chosen = window._otdChoices?.[idx];
    if (chosen !== undefined) _arcSave('otd', { answered: true, correct: !!chosen.correct });
};

// ── Shared RNG ────────────────────────────────────────────────

function _todaySeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function _seededRandom(seed) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xFFFFFFFF;
    };
}

function _seededShuffle(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ── Statline Shuffle ──────────────────────────────────────────

function _fmtHitterLine(s) {
    const parts = [];
    if (s.atBats != null && s.hits != null) parts.push(`${s.hits}-${s.atBats}`);
    if (s.homeRuns > 0)     parts.push(`${s.homeRuns} HR`);
    if (s.rbi > 0)          parts.push(`${s.rbi} RBI`);
    if (s.stolenBases > 0)  parts.push(`${s.stolenBases} SB`);
    if (s.baseOnBalls > 0)  parts.push(`${s.baseOnBalls} BB`);
    return parts.length ? parts.join(', ') : `${s.hits ?? 0}-${s.atBats ?? 0}`;
}

function _fmtPitcherLine(s) {
    const parts = [];
    if (s.inningsPitched != null) parts.push(`${s.inningsPitched} IP`);
    if (s.earnedRuns != null)     parts.push(`${s.earnedRuns} ER`);
    if (s.strikeOuts != null)     parts.push(`${s.strikeOuts} K`);
    if (s.baseOnBalls != null && s.baseOnBalls > 0) parts.push(`${s.baseOnBalls} BB`);
    return parts.join(', ') || '—';
}

function _hitterInterest(s) {
    return (s.hits ?? 0) * 2
        + (s.homeRuns ?? 0) * 5
        + (s.rbi ?? 0) * 2
        + (s.stolenBases ?? 0) * 3
        + (s.baseOnBalls ?? 0);
}

function _pitcherInterest(s) {
    const ip = parseFloat(s.inningsPitched ?? 0);
    return ip * 3 + (s.strikeOuts ?? 0) * 2 - (s.earnedRuns ?? 0) * 2;
}

let _shuffleState = null;

async function startStatlineShuffle() {
    const grid = document.getElementById('playersGrid');
    grid.innerHTML = `
        <div class="arcade-game-wrap">
            <div class="arcade-back-row">
                <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                <span class="arcade-game-title-inline">📊 Statline Shuffle</span>
                <span class="arcade-date-badge">${_arcToday()}</span>
            </div>
            <div class="arcade-loading">
                <div class="skeleton-card" style="height:200px;max-width:600px;margin:0 auto;border-radius:12px"></div>
            </div>
        </div>
    `;

    try {
        let gamePks = [];
        for (let offset = -1; offset >= -7 && gamePks.length === 0; offset--) {
            gamePks = await _fetchRecentGamePks(_mlbDateString(offset));
        }
        if (gamePks.length === 0) throw new Error('No recent games found — check back after tonight\'s games');

        const rng = _seededRandom(_todaySeed());
        const shuffled    = _seededShuffle(gamePks, rng);
        const targetGames = shuffled.slice(0, Math.min(5, shuffled.length));

        const allPerfs = [];
        await Promise.all(targetGames.map(async pk => {
            try {
                const perfs = await _fetchGamePerformances(pk);
                allPerfs.push(...perfs);
            } catch (_) {}
        }));

        if (allPerfs.length < 3) throw new Error('Not enough player data for today\'s puzzle');

        _buildShufflePuzzle(allPerfs, rng);
    } catch (err) {
        Logger.error('Statline Shuffle failed', err, 'ARCADE');
        grid.innerHTML = `
            <div class="arcade-game-wrap">
                <div class="arcade-back-row">
                    <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                </div>
                <div class="arcade-error">
                    <p style="font-size:1.5rem;margin:0 0 0.5rem">⚾</p>
                    <p>Could not load today's puzzle.</p>
                    <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.35rem">${err.message}</p>
                    <button class="arcade-play-btn" onclick="startStatlineShuffle()" style="margin-top:1rem">Retry</button>
                </div>
            </div>
        `;
    }
}

async function _fetchRecentGamePks(dateStr) {
    try {
        const data = await mlbFetch('/schedule', { sportId: 1, date: dateStr, gameType: 'R' }, ApiCache.TTL.SHORT);
        const pks = [];
        (data.dates || []).forEach(d => {
            (d.games || []).forEach(g => {
                if (g.status?.detailedState === 'Final') pks.push(g.gamePk);
            });
        });
        return pks;
    } catch (_) { return []; }
}

async function _fetchGamePerformances(gamePk) {
    const data = await mlbFetch(`/game/${gamePk}/boxscore`, {}, ApiCache.TTL.SHORT);
    if (!data) throw new Error(`Box score ${gamePk} failed`);

    const perfs = [];
    const processSide = (sideKey) => {
        const side = data.teams?.[sideKey];
        if (!side) return;

        (side.batters || []).forEach(id => {
            const p = side.players?.[`ID${id}`];
            if (!p) return;
            const s = p.stats?.batting;
            if (!s || (s.atBats ?? 0) === 0) return;
            perfs.push({
                id,
                name:     p.person?.fullName || '—',
                type:     'hitting',
                team:     side.team?.abbreviation || '?',
                opponent: '', // filled below
                stats:    s,
                interest: _hitterInterest(s),
                line:     _fmtHitterLine(s),
            });
        });

        (side.pitchers || []).slice(0, 2).forEach(id => {
            const p = side.players?.[`ID${id}`];
            if (!p) return;
            const s = p.stats?.pitching;
            if (!s || parseFloat(s.inningsPitched ?? 0) < 3) return;
            perfs.push({
                id,
                name:     p.person?.fullName || '—',
                type:     'pitching',
                team:     side.team?.abbreviation || '?',
                opponent: '',
                stats:    s,
                interest: _pitcherInterest(s),
                line:     _fmtPitcherLine(s),
            });
        });
    };

    // Tag home/away teams as opponent of each other
    const homeAbbr = data.teams?.home?.team?.abbreviation || '';
    const awayAbbr = data.teams?.away?.team?.abbreviation || '';
    processSide('home');
    processSide('away');
    // Set opponent field
    perfs.forEach(p => {
        p.opponent = p.team === homeAbbr ? awayAbbr : homeAbbr;
    });

    return perfs;
}

function _buildShufflePuzzle(allPerfs, rng) {
    const hitters  = allPerfs.filter(p => p.type === 'hitting').sort((a, b) => b.interest - a.interest);
    const pitchers = allPerfs.filter(p => p.type === 'pitching').sort((a, b) => b.interest - a.interest);

    let picked = [...hitters.slice(0, 2), ...pitchers.slice(0, 1)];
    if (picked.length < 3) {
        picked = allPerfs.sort((a, b) => b.interest - a.interest).slice(0, 3);
    }

    const correctIds = new Set(picked.map(p => p.id));
    const decoys = allPerfs
        .filter(p => !correctIds.has(p.id) && p.interest >= 1)
        .sort((a, b) => b.interest - a.interest)
        .slice(0, 5);

    const namePool = _seededShuffle(
        [...picked.map(p => ({ id: p.id, name: p.name })),
         ...decoys.map(p => ({ id: p.id, name: p.name }))],
        rng
    );

    const puzzle = _seededShuffle(picked, rng);

    _shuffleState = {
        puzzle,
        namePool,
        assignments:     {},
        submitted:       false,
        score:           null,
        _selectedNameId: null,
    };

    _renderShuffleGame();
}

function _renderShuffleGame() {
    const { puzzle, namePool, assignments, submitted, score } = _shuffleState;
    const grid = document.getElementById('playersGrid');
    const hasSelection = _shuffleState._selectedNameId != null;

    const slotsHtml = puzzle.map((perf, i) => {
        const assignedId = assignments[i];
        const assigned   = assignedId != null ? namePool.find(n => n.id === assignedId) : null;
        const correct    = submitted && assignedId === perf.id;
        const wrong      = submitted && assignedId !== perf.id;

        let slotClass = 'shuffle-slot';
        if (correct)      slotClass += ' shuffle-slot--correct';
        else if (wrong)   slotClass += ' shuffle-slot--wrong';
        else if (assigned) slotClass += ' shuffle-slot--filled';
        else if (hasSelection && !submitted) slotClass += ' shuffle-slot--ready';

        return `
            <div class="${slotClass}" data-slot="${i}">
                <div class="shuffle-slot-header">
                    <span class="shuffle-slot-num">${i + 1}</span>
                    <span class="shuffle-slot-type">${perf.type === 'hitting' ? '🏏 Hitter' : '⚾ Pitcher'} · <strong>${perf.team}</strong>${perf.opponent ? ` vs ${perf.opponent}` : ''}</span>
                    ${!submitted && assigned ? `<button class="shuffle-clear-btn" data-slot="${i}">×</button>` : ''}
                </div>
                <div class="shuffle-statline">${perf.line}</div>
                <div class="shuffle-slot-answer ${assigned ? 'shuffle-slot-answer--filled' : 'shuffle-slot-answer--empty'}">
                    ${assigned
                        ? `<span class="shuffle-assigned-name">${assigned.name}</span>`
                        : `<span class="shuffle-placeholder">${hasSelection ? 'Click to assign' : 'Select a name →'}</span>`
                    }
                </div>
                ${submitted ? `
                    <div class="shuffle-reveal-row ${correct ? 'shuffle-reveal--correct' : 'shuffle-reveal--wrong'}">
                        ${correct ? '✓' : '✗'} <strong>${perf.name}</strong>
                    </div>` : ''}
            </div>
        `;
    }).join('');

    const allAssigned = puzzle.every((_, i) => assignments[i] != null);

    // Score display with emoji boxes (Wordle-style)
    const emojiResult = submitted
        ? puzzle.map((perf, i) => assignments[i] === perf.id ? '🟩' : '🟥').join('')
        : '';

    const resultHtml = submitted ? `
        <div class="shuffle-result ${score === 3 ? 'shuffle-result--perfect' : score >= 2 ? 'shuffle-result--good' : 'shuffle-result--miss'}">
            <div class="shuffle-result-score">${score === 3 ? '🎉 Perfect!' : score === 2 ? '👍 Nice!' : score === 1 ? '😅 1/3' : '😬 0/3'}</div>
            <div class="shuffle-result-emoji">${emojiResult} ${score}/3</div>
        </div>
        <button class="shuffle-share-btn" onclick="_shareShuffleResult()">Share Result</button>
        <button class="arcade-back-link" onclick="loadArcade()">← Back to Arcade</button>
    ` : `
        <button class="arcade-submit-btn ${allAssigned ? '' : 'arcade-submit-btn--disabled'}"
            onclick="_submitShuffle()" ${allAssigned ? '' : 'disabled'}>
            Submit Answers
        </button>
    `;

    grid.innerHTML = `
        <div class="arcade-game-wrap">
            <div class="arcade-back-row">
                <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                <span class="arcade-game-title-inline">📊 Statline Shuffle</span>
                <span class="arcade-date-badge">${_arcToday()}</span>
            </div>
            <p class="shuffle-instructions">
                ${submitted
                    ? 'Today\'s answers revealed below.'
                    : 'Select a name from the pool, then click a statline slot to assign it.'}
            </p>

            <div class="shuffle-layout">
                <div class="shuffle-slots">${slotsHtml}</div>

                <div class="shuffle-name-pool">
                    <div class="shuffle-pool-label">Player Pool</div>
                    ${namePool.map(n => {
                        const used     = Object.values(_shuffleState.assignments).includes(n.id);
                        const selected = _shuffleState._selectedNameId === n.id;
                        return `<button
                            class="shuffle-name-btn ${used ? 'shuffle-name-btn--used' : ''} ${selected ? 'shuffle-name-btn--selected' : ''}"
                            data-name-id="${n.id}"
                            onclick="_selectName(${n.id})"
                            ${submitted || used ? 'disabled' : ''}>
                            ${n.name}
                        </button>`;
                    }).join('')}
                </div>
            </div>

            <div class="shuffle-actions">${resultHtml}</div>
        </div>
    `;

    if (!submitted) {
        grid.querySelectorAll('.shuffle-slot').forEach(slot => {
            slot.addEventListener('click', e => {
                if (e.target.classList.contains('shuffle-clear-btn')) return;
                const i   = parseInt(slot.dataset.slot, 10);
                const sel = _shuffleState._selectedNameId;
                if (sel != null) {
                    Object.keys(_shuffleState.assignments).forEach(k => {
                        if (_shuffleState.assignments[k] === sel) delete _shuffleState.assignments[k];
                    });
                    _shuffleState.assignments[i] = sel;
                    _shuffleState._selectedNameId = null;
                    _renderShuffleGame();
                }
            });
        });

        grid.querySelectorAll('.shuffle-clear-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const i = parseInt(btn.dataset.slot, 10);
                delete _shuffleState.assignments[i];
                _renderShuffleGame();
            });
        });
    }
}

function _selectName(id) {
    if (!_shuffleState || _shuffleState.submitted) return;
    _shuffleState._selectedNameId = (_shuffleState._selectedNameId === id) ? null : id;
    _renderShuffleGame();
}

function _submitShuffle() {
    if (!_shuffleState || _shuffleState.submitted) return;
    const { puzzle, assignments } = _shuffleState;
    let score = 0;
    puzzle.forEach((perf, i) => { if (assignments[i] === perf.id) score++; });
    _shuffleState.submitted = true;
    _shuffleState.score     = score;
    _arcSave('shuffle', { score, max: 3 });
    _renderShuffleGame();
}

function _shareShuffleResult() {
    if (!_shuffleState?.submitted) return;
    const { puzzle, assignments, score } = _shuffleState;
    const emoji = puzzle.map((p, i) => assignments[i] === p.id ? '🟩' : '🟥').join('');
    const text = `Statline Shuffle ${_arcToday()}\n${emoji} ${score}/3\nzohnstats.com`;
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (typeof ErrorHandler !== 'undefined') ErrorHandler.toast('Result copied to clipboard!', 'success');
        });
    }
}

// ── Trade Tree Tracker ────────────────────────────────────────

// Abbreviation → MLB Stats API team ID (for logo URLs)
const _TRADE_TEAM_IDS = {
    ARI:109, ATL:144, BAL:110, BOS:111, CHC:112, CIN:113, CLE:114, COL:115,
    DET:116, HOU:117, KC:118, LAA:108, LAD:119, MIA:146, FLA:146, MIL:158,
    MIN:142, MON:120, NYM:121, NYY:147, OAK:133, ATH:133, PHI:143, PIT:134,
    SD:135, SEA:136, SF:137, STL:138, TB:139, TEX:140, TOR:141, WSH:120,
    CAL:108, CWS:145,
};

let _tradesData      = null;
let _tradeState      = null;
let _tradeSessionIdx = 0;  // increments on "Play Another"

async function _loadTrades() {
    if (_tradesData) return _tradesData;
    const res = await fetch('data/trades.json');
    if (!res.ok) throw new Error('Could not load trades data');
    _tradesData = await res.json();
    return _tradesData;
}

function _pickTrade(trades, sessionOffset) {
    const seed = _todaySeed() + sessionOffset * 997;
    const rng  = _seededRandom(seed);
    const idx  = Math.floor(rng() * trades.length);
    const trade = trades[idx];

    const shuffledDecoys = _seededShuffle([...trade.decoys], rng).slice(0, 3);
    const options        = _seededShuffle([trade.hiddenPlayer, ...shuffledDecoys], rng);

    return { trade, options };
}

async function startTradeTree(sessionOffset = 0) {
    _tradeSessionIdx = sessionOffset;
    const grid = document.getElementById('playersGrid');
    grid.innerHTML = `
        <div class="arcade-game-wrap">
            <div class="arcade-back-row">
                <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                <span class="arcade-game-title-inline">🔀 Trade Tree Tracker</span>
            </div>
            <div class="arcade-loading">
                <div class="skeleton-card" style="height:240px;max-width:640px;margin:0 auto;border-radius:12px"></div>
            </div>
        </div>
    `;

    try {
        const trades         = await _loadTrades();
        const { trade, options } = _pickTrade(trades, sessionOffset);
        _tradeState = { trade, options, selected: null, revealed: false, sessionOffset };
        _renderTradeGame();
    } catch (err) {
        grid.innerHTML = `
            <div class="arcade-game-wrap">
                <div class="arcade-back-row">
                    <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                </div>
                <div class="arcade-error">
                    <p>Failed to load today's trade puzzle.</p>
                    <button class="arcade-play-btn" onclick="startTradeTree()" style="margin-top:1rem">Retry</button>
                </div>
            </div>
        `;
    }
}

function _renderTradeGame() {
    const { trade, options, selected, revealed, sessionOffset } = _tradeState;
    const grid      = document.getElementById('playersGrid');
    const isCorrect = revealed && selected === trade.hiddenPlayer;

    // Team logo helpers — resolve abbr → ID for MLB static CDN
    const _tradeLogo = abbr => typeof getMLBTeamLogoUrl === 'function' && _TRADE_TEAM_IDS[abbr]
        ? getMLBTeamLogoUrl(_TRADE_TEAM_IDS[abbr]) : null;
    const fromLogo = _tradeLogo(trade.fromTeamAbbr);
    const toLogo   = _tradeLogo(trade.toTeamAbbr);

    // Extract star player name from headline
    const starPlayer = (trade.headline.split(' acquired ')[1]?.split(' from ')[0] || '').trim();

    const optionButtons = options.map(name => {
        let cls = 'trade-option-btn';
        if (revealed) {
            if (name === trade.hiddenPlayer) cls += ' trade-option-btn--correct';
            else if (name === selected)      cls += ' trade-option-btn--wrong';
            else                             cls += ' trade-option-btn--dim';
        } else if (name === selected) {
            cls += ' trade-option-btn--selected';
        }
        return `<button class="${cls}"
            onclick="_selectTradeAnswer('${name.replace(/'/g, "\\'")}')"
            ${revealed ? 'disabled' : ''}>${name}</button>`;
    }).join('');

    // Mystery slot — shows ??? before reveal, answer after
    const mysterySlotHtml = revealed
        ? `<div class="trade-mystery-slot trade-mystery-slot--revealed ${isCorrect ? 'trade-mystery-slot--correct' : 'trade-mystery-slot--wrong'}">
               <span>${trade.hiddenPlayer}</span>
           </div>`
        : `<div class="trade-mystery-slot">
               <span class="trade-mystery-mark">???</span>
           </div>`;

    const additionalHtml = trade.additionalPieces
        ? `<div class="trade-also">+ ${trade.additionalPieces}</div>`
        : '';

    const revealSection = revealed ? `
        <div class="trade-reveal-banner ${isCorrect ? 'trade-reveal--correct' : 'trade-reveal--wrong'}">
            ${isCorrect
                ? `✓ Correct! <strong>${trade.hiddenPlayer}</strong>`
                : `✗ It was <strong>${trade.hiddenPlayer}</strong>`}
        </div>
        <div class="trade-context">${trade.context}</div>
        <div class="trade-end-actions">
            <button class="arcade-play-btn" onclick="startTradeTree(${sessionOffset + 1})">Play Another Trade</button>
            <button class="arcade-back-link" onclick="loadArcade()">← Back to Arcade</button>
        </div>
    ` : (selected ? `
        <button class="arcade-submit-btn" onclick="_confirmTradeAnswer()">Confirm Answer</button>
    ` : `<p class="trade-pick-hint">Select your answer above</p>`);

    const logoImg = (logo, abbr) => logo
        ? `<img src="${logo}" class="trade-team-logo" alt="${abbr}" data-hide-on-error>`
        : `<span class="trade-team-logo-fallback">${abbr}</span>`;

    grid.innerHTML = `
        <div class="arcade-game-wrap">
            <div class="arcade-back-row">
                <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                <span class="arcade-game-title-inline">🔀 Trade Tree Tracker</span>
                <span class="arcade-date-badge">${sessionOffset === 0 ? 'Daily' : `Round ${sessionOffset + 1}`}</span>
            </div>

            <div class="trade-card">
                <div class="trade-year-badge">${trade.year}</div>
                <p class="trade-headline">${trade.headline}</p>

                <div class="trade-diagram">
                    <div class="trade-team-col">
                        <div class="trade-team-logo-wrap">${logoImg(fromLogo, trade.fromTeamAbbr)}</div>
                        <div class="trade-team-name">${trade.fromTeamAbbr}</div>
                        <div class="trade-team-received">received</div>
                        ${mysterySlotHtml}
                        ${additionalHtml}
                    </div>

                    <div class="trade-diagram-arrow">
                        <div class="trade-arrow-line"></div>
                        <div class="trade-arrow-label">TRADE</div>
                        <div class="trade-arrow-line"></div>
                    </div>

                    <div class="trade-team-col">
                        <div class="trade-team-logo-wrap">${logoImg(toLogo, trade.toTeamAbbr)}</div>
                        <div class="trade-team-name">${trade.toTeamAbbr}</div>
                        <div class="trade-team-received">received</div>
                        <div class="trade-star-name">${starPlayer}</div>
                    </div>
                </div>

                <p class="trade-question">${trade.mystery}</p>
            </div>

            <div class="trade-options">${optionButtons}</div>

            <div class="trade-actions">${revealSection}</div>
        </div>
    `;
}

function _selectTradeAnswer(name) {
    if (!_tradeState || _tradeState.revealed) return;
    _tradeState.selected = (_tradeState.selected === name) ? null : name;
    _renderTradeGame();
}

function _confirmTradeAnswer() {
    if (!_tradeState || !_tradeState.selected || _tradeState.revealed) return;
    _tradeState.revealed = true;
    // Only save the daily (sessionOffset 0) result
    if (_tradeState.sessionOffset === 0) {
        _arcSave('trade', { correct: _tradeState.selected === _tradeState.trade.hiddenPlayer });
    }
    _renderTradeGame();
}

// ── Ballpark Blueprint ────────────────────────────────────────
// Guess the stadium from field dimensions + progressive clues.
// Fewer clues used = higher score (max 3 stars).

let _stadiumsData   = null;
let _blueprintState = null;

async function _loadStadiums() {
    if (_stadiumsData) return _stadiumsData;
    const res = await fetch('data/stadiums.json');
    if (!res.ok) throw new Error('Could not load stadiums data');
    _stadiumsData = await res.json();
    return _stadiumsData;
}

function _pickStadium(stadiums, sessionOffset) {
    const seed  = _todaySeed() + sessionOffset * 1009;
    const rng   = _seededRandom(seed);
    const idx   = Math.floor(rng() * stadiums.length);
    const stadium = stadiums[idx];

    // Build 4 options: correct + 3 decoys from the stadium's own decoy list
    const decoyNames = _seededShuffle([...stadium.decoys], rng).slice(0, 3);
    const options    = _seededShuffle([stadium.name, ...decoyNames], rng);

    return { stadium, options };
}

// Clue definitions — revealed one at a time in order
function _getBlueprintClues(stadium) {
    return [
        {
            label: 'Outfield Dimensions',
            value: `LF ${stadium.lf} ft · CF ${stadium.cf} ft · RF ${stadium.rf} ft`,
            icon:  '📐',
        },
        {
            label: 'Capacity & Era',
            value: `${stadium.capacity.toLocaleString()} seats · Opened ${stadium.opened}`,
            icon:  '📅',
        },
        {
            label: 'City',
            value: stadium.city,
            icon:  '📍',
        },
        {
            label: 'Surface',
            value: `${stadium.surface}${stadium.lfWall > 10 ? ` · LF wall ${stadium.lfWall} ft` : ''}`,
            icon:  '🌿',
        },
    ];
}

async function startBallparkBlueprint(sessionOffset = 0) {
    const grid = document.getElementById('playersGrid');
    grid.innerHTML = `
        <div class="arcade-game-wrap">
            <div class="arcade-back-row">
                <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                <span class="arcade-game-title-inline">🏟 Ballpark Blueprint</span>
            </div>
            <div class="arcade-loading">
                <div class="skeleton-card" style="height:200px;max-width:600px;margin:0 auto;border-radius:12px"></div>
            </div>
        </div>
    `;

    try {
        const stadiums = await _loadStadiums();
        const { stadium, options } = _pickStadium(stadiums, sessionOffset);
        const clues = _getBlueprintClues(stadium);

        _blueprintState = {
            stadium, options, clues,
            cluesRevealed: 1,  // always start with dimensions
            selected:      null,
            revealed:      false,
            sessionOffset,
        };

        _renderBlueprintGame();
    } catch (err) {
        grid.innerHTML = `
            <div class="arcade-game-wrap">
                <div class="arcade-back-row">
                    <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                </div>
                <div class="arcade-error">
                    <p>Failed to load today's ballpark puzzle.</p>
                    <button class="arcade-play-btn" onclick="startBallparkBlueprint()" style="margin-top:1rem">Retry</button>
                </div>
            </div>
        `;
    }
}

function _renderBlueprintGame() {
    const { stadium, options, clues, cluesRevealed, selected, revealed, sessionOffset } = _blueprintState;
    const grid = document.getElementById('playersGrid');

    const isCorrect = revealed && selected === stadium.name;
    // Score: 3 = 1 clue, 2 = 2 clues, 1 = 3+ clues used
    const score = revealed ? Math.max(1, 4 - cluesRevealed) : null;

    // Team logo
    const teamId  = _TRADE_TEAM_IDS[stadium.teamAbbr];
    const logoUrl = typeof getMLBTeamLogoUrl === 'function' && teamId ? getMLBTeamLogoUrl(teamId) : null;

    // Clue cards — show revealed ones, lock rest behind "reveal" button
    const clueCards = clues.map((c, i) => {
        const isRevealed = i < cluesRevealed;
        if (isRevealed) {
            return `
                <div class="bp-clue bp-clue--revealed">
                    <span class="bp-clue-icon">${c.icon}</span>
                    <div>
                        <div class="bp-clue-label">${c.label}</div>
                        <div class="bp-clue-value">${c.value}</div>
                    </div>
                </div>
            `;
        }
        return `
            <div class="bp-clue bp-clue--hidden">
                <span class="bp-clue-icon">🔒</span>
                <div class="bp-clue-label">Clue ${i + 1} — hidden</div>
            </div>
        `;
    }).join('');

    const canRevealMore = !revealed && cluesRevealed < clues.length;
    const allRevealed   = cluesRevealed >= clues.length;

    // Option buttons
    const optionBtns = options.map(name => {
        let cls = 'trade-option-btn';
        if (revealed) {
            if (name === stadium.name) cls += ' trade-option-btn--correct';
            else if (name === selected) cls += ' trade-option-btn--wrong';
            else cls += ' trade-option-btn--dim';
        } else if (name === selected) {
            cls += ' trade-option-btn--selected';
        }
        return `<button class="${cls}"
            onclick="_selectBlueprintAnswer('${name.replace(/'/g, "\\'")}')"
            ${revealed ? 'disabled' : ''}>${name}</button>`;
    }).join('');

    const actionsHtml = revealed ? `
        <div class="trade-reveal-banner ${isCorrect ? 'trade-reveal--correct' : 'trade-reveal--wrong'}">
            ${isCorrect ? `✓ Correct! <strong>${stadium.name}</strong>` : `✗ It was <strong>${stadium.name}</strong>`}
        </div>
        <div class="bp-score-row">
            ${'⭐'.repeat(score)}${'☆'.repeat(3 - score)} &nbsp; ${score}/3 clues
        </div>
        ${logoUrl ? `<img src="${logoUrl}" class="bp-reveal-logo" alt="${stadium.teamAbbr}" data-hide-on-error>` : ''}
        <div class="trade-context">${stadium.knownFor}</div>
        <div class="trade-end-actions">
            <button class="arcade-play-btn" onclick="startBallparkBlueprint(${sessionOffset + 1})">Another Ballpark</button>
            <button class="arcade-back-link" onclick="loadArcade()">← Back to Arcade</button>
        </div>
    ` : selected ? `
        <div class="bp-action-row">
            <button class="arcade-submit-btn" onclick="_confirmBlueprintAnswer()">Lock In Answer</button>
            ${canRevealMore ? `<button class="bp-reveal-btn" onclick="_revealNextClue()">Reveal Clue ${cluesRevealed + 1} of ${clues.length} <span class="bp-cost">−1★</span></button>` : ''}
        </div>
    ` : `
        <div class="bp-action-row">
            <p class="trade-pick-hint">Select your answer above</p>
            ${canRevealMore ? `<button class="bp-reveal-btn" onclick="_revealNextClue()">Reveal Clue ${cluesRevealed + 1} of ${clues.length} <span class="bp-cost">−1★</span></button>` : ''}
        </div>
    `;

    const clueCount = revealed
        ? `<span class="arcade-date-badge">Used ${cluesRevealed} of ${clues.length} clues</span>`
        : `<span class="arcade-date-badge">${sessionOffset === 0 ? 'Daily' : `Round ${sessionOffset + 1}`}</span>`;

    grid.innerHTML = `
        <div class="arcade-game-wrap">
            <div class="arcade-back-row">
                <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                <span class="arcade-game-title-inline">🏟 Ballpark Blueprint</span>
                ${clueCount}
            </div>

            <p class="shuffle-instructions">
                ${revealed
                    ? `${stadium.team} · ${stadium.city}`
                    : 'Identify the MLB stadium. Reveal more clues for help — but each clue costs a star.'}
            </p>

            <div class="bp-clues">${clueCards}</div>

            <div class="trade-options">${optionBtns}</div>

            <div class="trade-actions">${actionsHtml}</div>
        </div>
    `;
}

function _selectBlueprintAnswer(name) {
    if (!_blueprintState || _blueprintState.revealed) return;
    _blueprintState.selected = _blueprintState.selected === name ? null : name;
    _renderBlueprintGame();
}

function _revealNextClue() {
    if (!_blueprintState || _blueprintState.revealed) return;
    if (_blueprintState.cluesRevealed < _blueprintState.clues.length) {
        _blueprintState.cluesRevealed++;
        _renderBlueprintGame();
    }
}

function _confirmBlueprintAnswer() {
    if (!_blueprintState || !_blueprintState.selected || _blueprintState.revealed) return;
    _blueprintState.revealed = true;
    const { cluesRevealed, selected, stadium, sessionOffset } = _blueprintState;
    const score = Math.max(1, 4 - cluesRevealed);
    if (sessionOffset === 0) {
        _arcSave('blueprint', { score, correct: selected === stadium.name });
    }
    _renderBlueprintGame();
}

// ── Who Am I? — NBA daily player guesser ─────────────────────
//
// 5 clues revealed one at a time. Guess earlier = higher score.
// Scoring: 1 clue=5★  2=4★  3=3★  4=2★  5=1★  wrong=0★

let _wamState = null;

async function startWhoAmI(sessionOffset = 0) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;

    // Ensure player data + stats are loaded
    if (!AppState.allPlayers.length) {
        grid.className = '';
        grid.innerHTML = `
            <div class="arcade-loading">
                <div class="arcade-loading-spinner"></div>
                <p>Loading player data…</p>
            </div>`;
        try {
            AppState.allPlayers = await fetchAllPlayers();
            await loadStatsForPlayers(AppState.allPlayers);
        } catch (e) {
            grid.innerHTML = `<div class="arcade-loading"><p style="color:var(--color-error)">Failed to load players. Try again.</p><button class="arcade-play-btn" onclick="loadArcade()">← Back</button></div>`;
            return;
        }
    }

    // Eligible: players with meaningful stats
    const eligible = AppState.allPlayers.filter(p => {
        const s = AppState.playerStats[p.id];
        return s && s.pts >= 8 && s.games_played >= 10;
    });

    if (eligible.length < 8) {
        grid.innerHTML = `<div class="arcade-loading"><p style="color:var(--color-error)">Not enough player data loaded. Visit Players view first, then return.</p><button class="arcade-play-btn" onclick="loadArcade()">← Back</button></div>`;
        return;
    }

    const seed = _todaySeed() + sessionOffset * 7919;
    const rng  = _seededRandom(seed);

    // Pool: top-120 by PPG for recognisable names
    const sorted = [...eligible].sort((a, b) =>
        (AppState.playerStats[b.id].pts || 0) - (AppState.playerStats[a.id].pts || 0));
    const pool   = sorted.slice(0, Math.min(120, sorted.length));
    const target = pool[Math.floor(rng() * pool.length)];
    const ts     = AppState.playerStats[target.id];

    const decoys  = _wamPickDecoys(target, ts, eligible, 3, rng);
    const options = _seededShuffle([target, ...decoys], _seededRandom(seed + 1));

    _wamState = { target, ts, options, cluesRevealed: 1, selected: null, answered: false, sessionOffset };
    _renderWhoAmI();
}

function _wamPickDecoys(target, ts, pool, count, rng) {
    const pos    = target.position || '';
    const ptsTgt = ts?.pts || 0;
    let cands = pool
        .filter(p => {
            if (p.id === target.id) return false;
            const ps = AppState.playerStats[p.id];
            if (!ps) return false;
            const samePos  = !pos || p.position === pos || (p.position || '').includes(pos[0]);
            const closePts = Math.abs((ps.pts || 0) - ptsTgt) < 7;
            return samePos && closePts;
        })
        .sort(() => rng() - 0.5);

    // Fill if not enough same-position matches
    if (cands.length < count) {
        const fallback = pool
            .filter(p => p.id !== target.id && !cands.some(c => c.id === p.id))
            .sort((a, b) =>
                Math.abs((AppState.playerStats[a.id]?.pts || 0) - ptsTgt) -
                Math.abs((AppState.playerStats[b.id]?.pts || 0) - ptsTgt));
        cands.push(...fallback.slice(0, count - cands.length));
    }
    return cands.slice(0, count);
}

function _wamGetClues(player, stats) {
    const t = player.team || {};
    return [
        { icon: '🏙️', label: 'City',       value: t.city || t.name?.split(' ')[0] || '?' },
        { icon: '🌎',  label: 'Conference', value: t.conference || '?' },
        { icon: '📍',  label: 'Position',   value: player.position || '?' },
        { icon: '🏀',  label: 'Rebounds',   value: `${stats?.reb?.toFixed(1) ?? '?'} RPG` },
        { icon: '🎯',  label: 'Points',     value: `${stats?.pts?.toFixed(1) ?? '?'} PPG` },
    ];
}

function _wamStars(n, max = 5) {
    return Array.from({ length: max }, (_, i) =>
        `<span class="wam-star${i < n ? ' wam-star--lit' : ''}">${i < n ? '★' : '☆'}</span>`
    ).join('');
}

function _renderWhoAmI() {
    const st = _wamState;
    if (!st) return;
    const grid = document.getElementById('playersGrid');
    if (!grid) return;

    const clues    = _wamGetClues(st.target, st.ts);
    const maxScore = Math.max(1, 6 - st.cluesRevealed);
    const earnedScore = st.answered
        ? (st.selected?.id === st.target.id ? maxScore : 0)
        : maxScore;

    const clueHTML = clues.map((c, i) => {
        const revealed = i < st.cluesRevealed;
        return `
            <div class="wam-clue${revealed ? ' wam-clue--revealed' : ' wam-clue--hidden'}">
                <span class="wam-clue-icon">${revealed ? c.icon : '🔒'}</span>
                <span class="wam-clue-body">
                    ${revealed
                        ? `<span class="wam-clue-label">${c.label}</span>
                           <span class="wam-clue-value">${c.value}</span>`
                        : `<span class="wam-clue-label">Clue ${i + 1}</span>
                           <span class="wam-clue-locked">Reveal for −1★</span>`
                    }
                </span>
            </div>`;
    }).join('');

    const optionHTML = st.options.map(p => {
        let cls = 'wam-option';
        if (st.answered) {
            if (p.id === st.target.id)         cls += ' wam-option--correct';
            else if (p.id === st.selected?.id) cls += ' wam-option--wrong';
        } else if (st.selected?.id === p.id)   cls += ' wam-option--selected';
        return `<button class="${cls}" onclick="_wamSelect(${p.id})"
                    ${st.answered ? 'disabled' : ''}>
                    ${p.first_name} ${p.last_name}
                </button>`;
    }).join('');

    const canReveal = !st.answered && st.cluesRevealed < clues.length;
    const canSubmit = !st.answered && !!st.selected;

    let resultHTML = '';
    if (st.answered) {
        const correct = st.selected?.id === st.target.id;
        const abbr    = st.target.team?.abbreviation || '';
        const logoUrl = getNBATeamLogoUrl(abbr);
        resultHTML = `
            <div class="wam-result ${correct ? 'wam-result--correct' : 'wam-result--wrong'}">
                <div class="wam-result-icon">${correct ? '🎉' : '❌'}</div>
                <div class="wam-result-headline">${correct ? 'Correct!' : 'Missed it'}</div>
                <div class="wam-result-name">${st.target.first_name} ${st.target.last_name}</div>
                <div class="wam-result-meta">${st.target.team?.full_name || ''} · ${st.target.position || ''}</div>
                <div class="wam-result-stars">${_wamStars(earnedScore)}</div>
                <div class="wam-result-actions">
                    <button class="arcade-play-btn" onclick="startWhoAmI(${st.sessionOffset + 1})">Next Player →</button>
                    <button class="arcade-play-btn arcade-play-btn--secondary" onclick="loadArcade()">← Arcade Hub</button>
                </div>
            </div>`;
    }

    grid.className = '';
    grid.innerHTML = `
        <div class="wam-wrap">
            <div class="wam-header">
                <button class="wam-back-btn" onclick="loadArcade()">← Arcade</button>
                <div class="wam-title-row">
                    <h2 class="wam-title">Who Am I?</h2>
                    <span class="arcade-game-badge arcade-badge--nba">NBA</span>
                </div>
                <div class="wam-score-row">
                    <span class="wam-score-label">Max score</span>
                    <span class="wam-stars">${_wamStars(maxScore)}</span>
                </div>
            </div>

            <div class="wam-body">
                <div class="wam-clues">${clueHTML}</div>
                <div class="wam-options">${optionHTML}</div>
                ${resultHTML}
                ${!st.answered ? `
                <div class="wam-actions">
                    ${canReveal ? `
                    <button class="wam-reveal-btn" onclick="_wamReveal()">
                        🔒 Reveal Next Clue <span class="wam-cost">−1★</span>
                    </button>` : ''}
                    <button class="wam-submit-btn${canSubmit ? '' : ' wam-submit-btn--disabled'}"
                            onclick="_wamSubmit()" ${canSubmit ? '' : 'disabled'}>
                        ✓ Submit Answer
                    </button>
                </div>` : ''}
            </div>
        </div>`;
}

function _wamSelect(playerId) {
    if (!_wamState || _wamState.answered) return;
    _wamState.selected = _wamState.options.find(p => p.id === playerId) || null;
    _renderWhoAmI();
}

function _wamReveal() {
    if (!_wamState || _wamState.answered) return;
    const clues = _wamGetClues(_wamState.target, _wamState.ts);
    if (_wamState.cluesRevealed < clues.length) {
        _wamState.cluesRevealed++;
        _renderWhoAmI();
    }
}

function _wamSubmit() {
    if (!_wamState || !_wamState.selected || _wamState.answered) return;
    _wamState.answered = true;
    const correct = _wamState.selected.id === _wamState.target.id;
    const score   = correct ? Math.max(1, 6 - _wamState.cluesRevealed) : 0;
    if (_wamState.sessionOffset === 0) {
        _arcSave('whoami', { score, correct, cluesUsed: _wamState.cluesRevealed });
    }
    _renderWhoAmI();
}

// ── Statdle — Daily MLB Hitter Guesser ───────────────────────
//
// 5 per-game statlines revealed one at a time.
// Guess earlier = used fewer clues.

let _statdleState = null;

async function startStatdle(sessionOffset = 0) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;';
    grid.innerHTML = `<div class="arcade-loading"><div class="arcade-loading-spinner"></div><p>Loading lineup…</p></div>`;

    if (!AppState.mlbPlayers?.hitting?.length) {
        try { await loadMLBPlayers(); } catch (_) {
            grid.innerHTML = `<div class="arcade-loading"><p style="color:var(--color-error)">Failed to load MLB players. Visit the Players view first.</p><button class="arcade-play-btn" onclick="loadArcade()">← Back</button></div>`;
            return;
        }
    }

    const hitters = AppState.mlbPlayers.hitting || [];
    const pool = hitters
        .filter(p => (AppState.mlbPlayerStats?.hitting?.[p.id]?.plateAppearances || 0) >= 80)
        .sort((a, b) => (AppState.mlbPlayerStats?.hitting?.[b.id]?.plateAppearances || 0) - (AppState.mlbPlayerStats?.hitting?.[a.id]?.plateAppearances || 0))
        .slice(0, 150);

    if (pool.length < 5) {
        grid.innerHTML = `<div class="arcade-loading"><p style="color:var(--color-error)">Not enough MLB data loaded.</p><button class="arcade-play-btn" onclick="loadArcade()">← Back</button></div>`;
        return;
    }

    const seed   = _todaySeed() + sessionOffset * 7919;
    const rng    = _seededRandom(seed);
    const target = pool[Math.floor(rng() * pool.length)];

    let rawLogs;
    try { rawLogs = await _fetchMLBGameLog(target.id, 'hitting'); } catch (_) { rawLogs = []; }
    const clues = rawLogs.filter(g => (g.atBats || 0) > 0).slice(-5);

    if (clues.length < 3) return startStatdle(sessionOffset + 1);

    const saved = _arcLoad('statdle');
    _statdleState = {
        target, clues,
        revealed:  (saved?.seed === seed && saved.revealed)  ? saved.revealed  : 1,
        guesses:   (saved?.seed === seed && saved.guesses)   ? saved.guesses   : [],
        answered:  (saved?.seed === seed && saved.answered)  ? true             : false,
        won:       (saved?.seed === seed && saved.won)       ? true             : false,
        sessionOffset, seed,
    };
    _renderStatdle();
}

function _renderStatdle() {
    const grid = document.getElementById('playersGrid');
    const st   = _statdleState;
    if (!st) return;

    const allNames   = (AppState.mlbPlayers?.hitting || []).map(p => p.fullName).filter(Boolean);
    const datalistId = 'statdle-names-list';

    const clueRows = st.clues.map((g, i) => {
        if (i >= st.revealed) {
            return `<div class="statdle-row statdle-row--locked"><span>?</span><span>?</span><span>?</span><span>?</span><span>?</span><span class="statdle-num">${i + 1}</span></div>`;
        }
        const avg = g.atBats ? (g.hits / g.atBats).toFixed(3).replace(/^0\./, '.') : '.000';
        return `<div class="statdle-row statdle-row--live"><span>${g.atBats}</span><span>${g.hits}</span><span>${g.homeRuns}</span><span>${g.rbi}</span><span>${avg}</span><span class="statdle-num">${i + 1}</span></div>`;
    }).join('');

    const guessRows = st.guesses.map(g => {
        const ok = g === '(skip)' ? null : g.toLowerCase() === st.target.fullName.toLowerCase();
        const icon = g === '(skip)' ? '⬛' : ok ? '✅' : '❌';
        return `<div class="statdle-guess ${g === '(skip)' ? 'statdle-guess--skip' : ok ? 'statdle-guess--ok' : 'statdle-guess--bad'}">${icon} ${_escHtml(g === '(skip)' ? 'Skipped' : g)}</div>`;
    }).join('');

    let resultHtml = '';
    if (st.answered) {
        const hs     = typeof getMLBPlayerHeadshotUrl === 'function' ? getMLBPlayerHeadshotUrl(st.target.id) : '';
        const emojis = st.guesses.map(g => g === '(skip)' ? '⬛' : g.toLowerCase() === st.target.fullName.toLowerCase() ? '✅' : '❌');
        while (emojis.length < st.clues.length) emojis.push('⬛');
        const emojiStr  = emojis.slice(0, st.clues.length).join('');
        const dateStr   = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const scoreStr  = st.won ? `${st.guesses.findIndex(g => g.toLowerCase() === st.target.fullName.toLowerCase()) + 1}/${st.clues.length}` : `X/${st.clues.length}`;
        const shareText = `Statdle ${dateStr} ${scoreStr}\n${emojiStr}\nsportstrata.gg`;
        resultHtml = `
            <div class="statdle-result">
                <p class="statdle-result-title ${st.won ? 'statdle-result-title--win' : 'statdle-result-title--loss'}">${st.won ? '🎉 Got it!' : '💔 Better luck tomorrow!'}</p>
                <div class="statdle-result-player">
                    ${hs ? `<img src="${hs}" class="statdle-hs" alt="" loading="lazy" data-hide-on-error>` : ''}
                    <div>
                        <div class="statdle-result-name">${_escHtml(st.target.fullName)}</div>
                        <div class="statdle-result-meta">${_escHtml(st.target.teamAbbr || '')} · ${_escHtml(st.target.position || '')}</div>
                    </div>
                </div>
                <div class="statdle-emoji-row">${emojiStr}</div>
                <button class="statdle-share-btn" onclick="navigator.clipboard?.writeText(${JSON.stringify(shareText)}).then(()=>{this.textContent='Copied!✓';setTimeout(()=>this.textContent='📋 Copy Result',1600)})">📋 Copy Result</button>
            </div>`;
    }

    const inputHtml = st.answered ? '' : `
        <div class="statdle-input-section">
            <p class="statdle-prompt">Clue ${st.revealed}/${st.clues.length} shown · Guess ${st.guesses.length + 1} of 5</p>
            <div class="statdle-input-row">
                <input id="statdleInput" class="statdle-input" type="text" list="${datalistId}" placeholder="Player name…" autocomplete="off" spellcheck="false">
                <datalist id="${datalistId}">${allNames.map(n => `<option value="${_escHtml(n)}">`).join('')}</datalist>
                <button class="statdle-guess-btn" onclick="_submitStatdleGuess()">Guess</button>
            </div>
            ${st.guesses.length < 4 && st.revealed < st.clues.length
                ? `<button class="statdle-skip-btn" onclick="_skipStatdle()">Skip → reveal clue ${st.revealed + 1}</button>`
                : ''}
        </div>`;

    grid.innerHTML = `
        <div class="arcade-game-wrap">
            <div class="arcade-back-row">
                <button class="arcade-back-btn" onclick="loadArcade()">← Arcade</button>
                <span class="arcade-game-title-inline">⚾ Statdle</span>
            </div>
            <div class="statdle-wrap">
                <p class="statdle-sub">Guess the mystery MLB hitter from their per-game statlines</p>
                <div class="statdle-table">
                    <div class="statdle-hdr"><span>AB</span><span>H</span><span>HR</span><span>RBI</span><span>AVG</span><span></span></div>
                    ${clueRows}
                </div>
                ${guessRows ? `<div class="statdle-guesses">${guessRows}</div>` : ''}
                ${inputHtml}
                ${resultHtml}
            </div>
        </div>`;

    if (!st.answered) {
        const inp = document.getElementById('statdleInput');
        requestAnimationFrame(() => inp?.focus());
        inp?.addEventListener('keydown', e => { if (e.key === 'Enter') _submitStatdleGuess(); });
    }
}

function _submitStatdleGuess() {
    const st  = _statdleState;
    if (!st || st.answered) return;
    const inp   = document.getElementById('statdleInput');
    const guess = (inp?.value || '').trim();
    if (!guess) return;

    st.guesses.push(guess);
    const correct = guess.toLowerCase() === st.target.fullName.toLowerCase();

    if (correct || st.guesses.length >= 5) {
        st.answered = true;
        st.won      = correct;
        const streakKey = 'ss_statdle_streak';
        try {
            const streak = JSON.parse(localStorage.getItem(streakKey) || '{"wins":0,"total":0}');
            if (correct) streak.wins++;
            streak.total++;
            localStorage.setItem(streakKey, JSON.stringify(streak));
        } catch (_) {}
    } else {
        st.revealed = Math.min(st.revealed + 1, st.clues.length);
    }
    _arcSave('statdle', { seed: st.seed, guesses: st.guesses, revealed: st.revealed, answered: st.answered, won: st.won });
    _renderStatdle();
}

function _skipStatdle() {
    const st = _statdleState;
    if (!st || st.answered) return;
    st.guesses.push('(skip)');
    if (st.guesses.length >= 5) {
        st.answered = true; st.won = false;
    } else {
        st.revealed = Math.min(st.revealed + 1, st.clues.length);
    }
    _arcSave('statdle', { seed: st.seed, guesses: st.guesses, revealed: st.revealed, answered: st.answered, won: st.won });
    _renderStatdle();
}

// ── Daily Quest ───────────────────────────────────────────────

const _QUEST_TEMPLATES = [
    {
        id:    1,
        text:  'Find a hitter with OPS above .900 and strikeout rate below 18%',
        hint:  'Elite contact + power — sort leaders by OPS, watch the K%',
        group: 'hitting',
        minPA: 150,
        check: s => { const c = typeof _computeBattingRates === 'function' ? _computeBattingRates(s) : {}; return parseFloat(s.ops) > 0.900 && parseFloat(c.kPct) < 18; },
    },
    {
        id:    2,
        text:  'Find a starting pitcher with ERA under 3.00 and WHIP under 1.15',
        hint:  'Elite SP — sort pitching leaders by ERA',
        group: 'pitching',
        minIP: 30,
        check: s => parseFloat(s.era) < 3.00 && parseFloat(s.whip) < 1.15,
    },
    {
        id:    3,
        text:  'Find a hitter with ISO above .200 and walk rate above 10%',
        hint:  'Power + patience — ISO = SLG minus AVG',
        group: 'hitting',
        minPA: 150,
        check: s => { const c = typeof _computeBattingRates === 'function' ? _computeBattingRates(s) : {}; return (parseFloat(s.slg) - parseFloat(s.avg)) > 0.200 && parseFloat(c.bbPct) > 10; },
    },
    {
        id:    4,
        text:  'Find a pitcher with K/9 above 10.0 and BB/9 below 2.5',
        hint:  'Strikeout machine with control — check pitching leaders',
        group: 'pitching',
        minIP: 30,
        check: s => parseFloat(s.strikeoutsPer9Inn) > 10.0 && parseFloat(s.walksPer9Inn) < 2.5,
    },
    {
        id:    5,
        text:  'Find a hitter with a stolen base success rate above 85% with at least 10 attempts',
        hint:  'Speed merchant — look at SB and CS totals',
        group: 'hitting',
        minPA: 100,
        check: s => { const sb = s.stolenBases || 0; const cs = s.caughtStealing || 0; return (sb + cs) >= 10 && sb / (sb + cs) > 0.85; },
    },
    {
        id:    6,
        text:  'Find a pitcher with FIP below 3.20 and at least 40 innings pitched',
        hint:  'True talent arm — FIP strips out defense',
        group: 'pitching',
        minIP: 40,
        check: s => { const ip = parseFloat(s.inningsPitched) || 0; const fip = ip > 0 ? (13*(s.homeRuns||0)+3*(s.baseOnBalls||0)-2*(s.strikeOuts||0))/ip+3.10 : 99; return fip < 3.20 && ip >= 40; },
    },
    {
        id:    7,
        text:  'Find a hitter with BABIP above .340 and at least 100 plate appearances',
        hint:  'Running hot — could be a true contact monster or due for regression',
        group: 'hitting',
        minPA: 100,
        check: s => parseFloat(s.babip) > 0.340,
    },
    {
        id:    8,
        text:  'Find a hitter with 15+ home runs and a strikeout rate below 20%',
        hint:  'Power without the whiffs — rare combination',
        group: 'hitting',
        minPA: 150,
        check: s => { const c = typeof _computeBattingRates === 'function' ? _computeBattingRates(s) : {}; return (s.homeRuns || 0) >= 15 && parseFloat(c.kPct) < 20; },
    },
    {
        id:    9,
        text:  'Find a pitcher with a quality start percentage above 65%',
        hint:  'Consistency is king — at least 6 IP, 3 ER or fewer',
        group: 'pitching',
        minIP: 30,
        check: s => { const gs = s.gamesStarted || 0; const qs = s.qualityStarts || 0; return gs >= 8 && (qs / gs) > 0.65; },
    },
    {
        id:   10,
        text: 'Find a hitter batting above .300 with an OBP above .380',
        hint: 'Old-school batting title contender',
        group: 'hitting',
        minPA: 150,
        check: s => parseFloat(s.avg) > 0.300 && parseFloat(s.obp) > 0.380,
    },
];

function _todayQuest() {
    const rng = _seededRandom(_todaySeed());
    const idx = Math.floor(rng() * _QUEST_TEMPLATES.length);
    return _QUEST_TEMPLATES[idx];
}

function _questStreak() {
    try {
        const raw = JSON.parse(localStorage.getItem('zs_quest_streak') || '{}');
        return { count: raw.count || 0, lastDate: raw.lastDate || '' };
    } catch (_) { return { count: 0, lastDate: '' }; }
}

function _questSaveStreak(won) {
    try {
        const today   = _arcToday();
        const current = _questStreak();
        const newCount = won
            ? (current.lastDate === _arcToday() ? current.count : current.count + 1)
            : 0;
        localStorage.setItem('zs_quest_streak', JSON.stringify({ count: newCount, lastDate: today }));
    } catch (_) {}
}

function startDailyQuest() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;';

    const quest  = _todayQuest();
    const save   = _arcLoad('quest');
    const streak = _questStreak();

    const pool = AppState.mlbPlayers?.[quest.group] || [];
    if (!pool.length) {
        grid.innerHTML = `
            <div class="quest-wrap">
                <button class="back-button" onclick="loadArcade()">← Back</button>
                <div class="quest-card">
                    <p style="color:var(--text-muted);text-align:center;padding:2rem">
                        MLB player data not loaded yet — visit the Players tab first, then return.
                    </p>
                </div>
            </div>`;
        return;
    }

    // Build autocomplete pool sorted by display name
    const sortedPool = [...pool].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    const optHtml = sortedPool.map(p =>
        `<option value="${p.id}">${_escHtml(p.fullName || '—')} · ${_escHtml(p.teamAbbr || '')}</option>`
    ).join('');

    const streakBadge = streak.count >= 2
        ? `<span class="quest-streak">🔥 ${streak.count}-day streak</span>`
        : '';

    const completedHtml = save?.completed ? _renderQuestResult(quest, save) : '';

    grid.innerHTML = `
        <div class="quest-wrap">
            <button class="back-button" onclick="loadArcade()">← Back</button>

            <div class="quest-card">
                <div class="quest-hdr">
                    <span class="quest-label">⚡ Daily Quest · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    ${streakBadge}
                </div>

                <p class="quest-text">${_escHtml(quest.text)}</p>
                <p class="quest-hint">💡 ${_escHtml(quest.hint)}</p>

                ${completedHtml || `
                <div class="quest-search-row">
                    <select id="quest-player-sel" class="cmp-select" style="flex:1">
                        <option value="">— Search for a player —</option>
                        ${optHtml}
                    </select>
                    <button class="arcade-play-btn" style="margin:0;flex-shrink:0" onclick="_submitQuestAnswer('${quest.id}')">Submit</button>
                </div>
                <div id="quest-feedback" class="quest-feedback" style="display:none"></div>
                `}
            </div>

            <div class="quest-qualifiers-card">
                <div class="quest-qual-hdr">
                    <span class="quest-qual-title">Players who qualify</span>
                    <span class="quest-qual-note">${quest.group === 'hitting' ? `min ${quest.minPA || 100} PA` : `min ${quest.minIP || 30} IP`}</span>
                </div>
                <div id="quest-qual-list" class="quest-qual-list">
                    ${_buildQuestQualifiers(quest)}
                </div>
            </div>
        </div>
    `;
}

function _buildQuestQualifiers(quest) {
    const stats = AppState.mlbPlayerStats?.[quest.group] || {};
    const pool  = AppState.mlbPlayers?.[quest.group] || [];

    const qualifying = pool.filter(p => {
        const s = stats[p.id];
        if (!s) return false;
        const ip = parseFloat(s.inningsPitched) || 0;
        const pa = s.plateAppearances || 0;
        if (quest.group === 'pitching' && ip < (quest.minIP || 30)) return false;
        if (quest.group === 'hitting'  && pa < (quest.minPA || 100)) return false;
        try { return quest.check(s); } catch (_) { return false; }
    });

    if (!qualifying.length) return `<p class="quest-no-qual">No qualifying players yet this season.</p>`;

    const sorted = qualifying.sort((a, b) => {
        const sA = stats[a.id];
        const sB = stats[b.id];
        const key = quest.group === 'hitting' ? 'ops' : 'era';
        const vA  = parseFloat(sA?.[key]) || (quest.group === 'hitting' ? 0 : 99);
        const vB  = parseFloat(sB?.[key]) || (quest.group === 'hitting' ? 0 : 99);
        return quest.group === 'hitting' ? vB - vA : vA - vB;
    });

    return sorted.map((p, i) => {
        const s     = stats[p.id];
        const clr   = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(p.teamAbbr) : { primary: '#7c8df0' };
        const hs    = typeof getMLBPlayerHeadshotUrl === 'function' ? getMLBPlayerHeadshotUrl(p.id) : '';
        const init  = (p.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
        const key   = quest.group === 'hitting' ? 'ops' : 'era';
        const val   = parseFloat(s?.[key]);
        const disp  = isNaN(val) ? '—' : (quest.group === 'hitting' ? val.toFixed(3).replace(/^0\./, '.') : val.toFixed(2));
        const unit  = quest.group === 'hitting' ? 'OPS' : 'ERA';
        return `
            <div class="quest-qual-row" onclick="showMLBPlayerDetail(${p.id},'${quest.group}')" role="button" tabindex="0"
                onkeydown="if(event.key==='Enter')showMLBPlayerDetail(${p.id},'${quest.group}')">
                <span class="quest-qual-rank">${i + 1}</span>
                <div class="quest-qual-hs" style="background:${clr.primary}22">
                    ${hs ? `<img src="${hs}" alt="" loading="lazy" data-hide-on-error style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<span style="font-size:0.7rem;font-weight:700;color:${clr.primary}">${init}</span>`}
                </div>
                <div class="quest-qual-info">
                    <span class="quest-qual-name">${_escHtml(p.fullName || '—')}</span>
                    <span class="quest-qual-team">${_escHtml(p.teamAbbr || '')}</span>
                </div>
                <span class="quest-qual-val" style="color:${clr.primary}">${disp} <span class="quest-qual-unit">${unit}</span></span>
            </div>`;
    }).join('');
}

function _renderQuestResult(quest, save) {
    const won = save?.won;
    return `
        <div class="quest-result quest-result--${won ? 'win' : 'miss'}">
            <span class="quest-result-icon">${won ? '✅' : '❌'}</span>
            <span>${won ? 'Correct! That player qualifies.' : `${_escHtml(save.guessName || 'That player')} doesn't meet all the criteria.`}</span>
        </div>`;
}

window._submitQuestAnswer = function(questId) {
    const sel  = document.getElementById('quest-player-sel');
    const fb   = document.getElementById('quest-feedback');
    if (!sel || !fb || !sel.value) return;

    const quest    = _QUEST_TEMPLATES.find(q => q.id === parseInt(questId));
    if (!quest) return;

    const playerId = parseInt(sel.value);
    const player   = (AppState.mlbPlayers?.[quest.group] || []).find(p => p.id === playerId);
    const stats    = AppState.mlbPlayerStats?.[quest.group]?.[playerId];

    if (!player || !stats) {
        fb.style.display = 'block';
        fb.className = 'quest-feedback quest-feedback--miss';
        fb.textContent = 'Player data unavailable — try another.';
        return;
    }

    let won = false;
    try { won = quest.check(stats); } catch (_) {}

    _arcSave('quest', { questId, won, guessId: playerId, guessName: player.fullName, completed: true });
    _questSaveStreak(won);

    fb.style.display  = 'block';
    fb.className      = `quest-feedback quest-feedback--${won ? 'win' : 'miss'}`;
    fb.innerHTML      = won
        ? `✅ <strong>${_escHtml(player.fullName)}</strong> qualifies! Quest complete.`
        : `❌ <strong>${_escHtml(player.fullName)}</strong> doesn't meet all criteria. Check the qualifying players list below.`;

    // Reveal streak update
    if (won) {
        const streak = _questStreak();
        const streakEl = document.querySelector('.quest-streak');
        if (streakEl) streakEl.textContent = `🔥 ${streak.count}-day streak`;
        else {
            const hdr = document.querySelector('.quest-hdr');
            if (hdr) hdr.insertAdjacentHTML('beforeend', `<span class="quest-streak">🔥 ${streak.count}-day streak</span>`);
        }
    }
};

// ── Global exposure ───────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.loadArcade           = loadArcade;
    window.startStatlineShuffle = startStatlineShuffle;
    window._selectName          = _selectName;
    window._submitShuffle       = _submitShuffle;
    window._shareShuffleResult  = _shareShuffleResult;
    window.startTradeTree          = startTradeTree;
    window._selectTradeAnswer      = _selectTradeAnswer;
    window._confirmTradeAnswer     = _confirmTradeAnswer;
    window.startBallparkBlueprint  = startBallparkBlueprint;
    window._selectBlueprintAnswer  = _selectBlueprintAnswer;
    window._revealNextClue         = _revealNextClue;
    window._confirmBlueprintAnswer = _confirmBlueprintAnswer;
    window.startWhoAmI  = startWhoAmI;
    window._wamSelect   = _wamSelect;
    window._wamReveal   = _wamReveal;
    window._wamSubmit   = _wamSubmit;
    window.startStatdle          = startStatdle;
    window._submitStatdleGuess   = _submitStatdleGuess;
    window._skipStatdle          = _skipStatdle;
    window.startDailyQuest       = startDailyQuest;
}

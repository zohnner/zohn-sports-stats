// ============================================================
// Stat Builder — custom formula calculator with live preview
// ============================================================

function displayStatBuilder() {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('builder', null);

    const playersWithStats = AppState.allPlayers.filter(p => AppState.playerStats[p.id]);

    grid.className = 'builder-container';
    grid.innerHTML = `
        <!-- ── Builder panel ──────────────────────────────── -->
        <div class="builder-panel">
            <h2 class="builder-title">Stat Builder</h2>
            <p class="builder-subtitle">Write a formula using season averages — ranked across all players instantly.</p>

            <div class="builder-field">
                <label class="builder-label" for="statName">Stat Name</label>
                <input id="statName" class="builder-input" type="text" placeholder="e.g., Efficiency Rating" autocomplete="off">
            </div>

            <div class="builder-field">
                <label class="builder-label" for="statFormula">Formula</label>
                <div class="formula-input-wrap">
                    <input id="statFormula" class="builder-input formula-input" type="text"
                        placeholder="e.g., (pts + reb + ast) / min" autocomplete="off" spellcheck="false">
                    <div id="formulaStatus" class="formula-status"></div>
                </div>
            </div>

            <!-- Variable reference chips -->
            <div class="var-chips">
                ${[
                    ['pts','PPG'], ['reb','RPG'], ['ast','APG'], ['stl','SPG'], ['blk','BPG'],
                    ['turnover','TOV'], ['min','MIN'], ['fgm','FGM'], ['fga','FGA'], ['fg_pct','FG%'],
                    ['fg3m','3PM'], ['fg3a','3PA'], ['fg3_pct','3P%'], ['ftm','FTM'], ['fta','FTA'], ['ft_pct','FT%']
                ].map(([v, label]) => `<button class="var-chip" data-var="${v}" title="${v}">${label}</button>`).join('')}
            </div>

            <div class="builder-examples">
                <div class="builder-examples-title">Quick examples</div>
                <div class="builder-example-list">
                    <button class="builder-example-btn" data-name="Player Efficiency" data-formula="(pts + reb + ast + stl + blk - turnover) / min">Player Efficiency</button>
                    <button class="builder-example-btn" data-name="True Shooting %" data-formula="pts / (2 * (fga + 0.44 * fta)) * 100">True Shooting %</button>
                    <button class="builder-example-btn" data-name="Assist / Turnover" data-formula="ast / turnover">Ast/TO Ratio</button>
                    <button class="builder-example-btn" data-name="Box Score +" data-formula="pts + 1.2*reb + 1.5*ast + 3*stl + 3*blk - turnover">Box Score +</button>
                </div>
            </div>

            <button id="runFormulaBtn" class="builder-run-btn" disabled>Run Formula on All Players</button>
        </div>

        <!-- ── Results panel ─────────────────────────────── -->
        <div class="saved-stats-panel" id="builderResultsPanel">
            <div id="builderResultsEmpty" class="builder-empty">
                <div class="builder-empty-icon">🧮</div>
                <p>Enter a formula and hit <strong>Run</strong> to rank all players.</p>
            </div>
            <div id="builderResultsTable" style="display:none"></div>
        </div>

        <!-- ── Saved stats panel ─────────────────────────── -->
        <div class="saved-stats-panel" id="savedStatsContainer">
            <h2 class="builder-title">Saved Stats</h2>
            <div id="savedStatsList"></div>
        </div>
    `;

    _setupBuilder(playersWithStats);
    _loadSavedStats();
}

// ── Internal setup ────────────────────────────────────────────

function _setupBuilder(playersWithStats) {
    const formulaInput = document.getElementById('statFormula');
    const nameInput    = document.getElementById('statName');
    const runBtn       = document.getElementById('runFormulaBtn');
    const statusEl     = document.getElementById('formulaStatus');

    // Variable chips insert into formula
    document.querySelectorAll('.var-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const v   = chip.dataset.var;
            const pos = formulaInput.selectionStart;
            const val = formulaInput.value;
            formulaInput.value = val.slice(0, pos) + v + val.slice(pos);
            formulaInput.focus();
            formulaInput.selectionStart = formulaInput.selectionEnd = pos + v.length;
            formulaInput.dispatchEvent(new Event('input'));
        });
    });

    // Example buttons fill in name + formula
    document.querySelectorAll('.builder-example-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            nameInput.value    = btn.dataset.name;
            formulaInput.value = btn.dataset.formula;
            formulaInput.dispatchEvent(new Event('input'));
        });
    });

    // Live validation as user types
    const validate = debounce(() => {
        const formula = formulaInput.value.trim();
        if (!formula) {
            statusEl.textContent = '';
            statusEl.className   = 'formula-status';
            runBtn.disabled = true;
            return;
        }
        const { ok, error } = _tryFormula(formula, playersWithStats);
        if (ok) {
            statusEl.textContent = 'Valid formula';
            statusEl.className   = 'formula-status formula-ok';
            runBtn.disabled = playersWithStats.length === 0;
        } else {
            statusEl.textContent = error;
            statusEl.className   = 'formula-status formula-err';
            runBtn.disabled = true;
        }
    }, 350);

    formulaInput.addEventListener('input', validate);

    // Run formula across all players
    runBtn.addEventListener('click', () => {
        const formula = formulaInput.value.trim();
        const name    = nameInput.value.trim() || 'Custom Stat';
        _runFormula(formula, name, playersWithStats);
    });
}

function _tryFormula(formula, playersWithStats) {
    if (!playersWithStats?.length) return { ok: false, error: 'No player data loaded' };
    if (typeof math === 'undefined') return { ok: false, error: 'math.js not loaded' };
    // Try up to 5 sample players — pass as soon as one succeeds.
    // Avoids false rejections caused by a single player having a zero/null stat.
    let lastError = 'Formula error';
    for (const player of playersWithStats.slice(0, 5)) {
        try {
            let expr = formula;
            const stats = AppState.playerStats[player.id] || {};
            Object.entries(stats).forEach(([k, v]) => {
                if (typeof v === 'number') {
                    expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
                }
            });
            const result = math.evaluate(expr);
            if (!isFinite(result)) throw new Error('Division by zero or invalid result');
            return { ok: true };
        } catch (e) {
            lastError = e.message;
        }
    }
    return { ok: false, error: lastError };
}

function _runFormula(formula, name, players) {
    const tableEl = document.getElementById('builderResultsTable');
    const emptyEl = document.getElementById('builderResultsEmpty');

    // Compile the formula AST once; then evaluate with a scope object per player.
    // This avoids re-parsing the expression string 300+ times.
    let compiled;
    try {
        compiled = math.compile(formula);
    } catch (e) {
        ErrorHandler.toast(`Formula parse error: ${e.message}`, 'error');
        return;
    }

    // Determine which stat keys appear in the formula (word-bounded)
    const STAT_KEYS = ['pts','reb','ast','stl','blk','turnover','min',
                       'fgm','fga','fg_pct','fg3m','fg3a','fg3_pct','ftm','fta','ft_pct',
                       'oreb','dreb','games_played'];
    const usedKeys = STAT_KEYS.filter(k => new RegExp(`\\b${k}\\b`).test(formula));

    const results = [];
    players.forEach(player => {
        const stats = AppState.playerStats[player.id];
        if (!stats) return;
        try {
            const scope = {};
            usedKeys.forEach(k => { if (typeof stats[k] === 'number') scope[k] = stats[k]; });
            const val = compiled.evaluate(scope);
            if (isFinite(val)) results.push({ player, val });
        } catch (_) {}
    });

    if (results.length === 0) {
        ErrorHandler.toast('Formula produced no valid results', 'warn');
        return;
    }

    results.sort((a, b) => b.val - a.val);

    emptyEl.style.display  = 'none';
    tableEl.style.display  = 'block';

    const heading = document.createElement('h2');
    heading.className   = 'builder-title';
    heading.textContent = name;

    const saveWrap = document.createElement('div');
    saveWrap.style.cssText = 'display:flex;justify-content:flex-end;gap:var(--space-3);margin-bottom:var(--space-4)';
    saveWrap.innerHTML = `
        <button class="builder-export-btn" id="exportCsvBtn">Export CSV</button>
        <button class="builder-save-btn" id="saveFormulaBtn">Save Formula</button>
    `;

    const rows = results.slice(0, 20).map((r, i) => {
        const abbr    = r.player.team?.abbreviation || '';
        const colors  = getTeamColors(abbr);
        const initials = (r.player.first_name?.[0] || '') + (r.player.last_name?.[0] || '');
        const rankCls = i < 3 ? `lb-rank lb-rank-${i + 1}` : 'lb-rank';
        return `
            <div class="leaderboard-row" onclick="showPlayerDetail(${r.player.id})" style="cursor:pointer">
                <span class="${rankCls}">${i + 1}</span>
                <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">${initials}</div>
                <div class="lb-player">
                    <span class="lb-name">${r.player.first_name} ${r.player.last_name}</span>
                    <span class="lb-team">${abbr}${r.player.position ? ' · ' + r.player.position : ''}</span>
                </div>
                <span class="lb-value" style="color:var(--color-accent-light)">${r.val.toFixed(2)}</span>
            </div>
        `;
    }).join('');

    tableEl.innerHTML = '';
    tableEl.appendChild(heading);
    tableEl.appendChild(saveWrap);
    tableEl.insertAdjacentHTML('beforeend', `<div class="leaderboard-list">${rows}</div>`);

    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
        const statName  = document.getElementById('statName').value.trim() || 'Custom Stat';
        const csvHeader = ['Rank', 'Player', 'Team', 'Position', statName].join(',');
        const csvRows   = results.map((r, i) => [
            i + 1,
            `"${r.player.first_name} ${r.player.last_name}"`,
            r.player.team?.abbreviation || '',
            r.player.position || '',
            r.val.toFixed(4)
        ].join(','));
        const csv  = [csvHeader, ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${statName.replace(/\s+/g, '_')}_${CURRENT_SEASON}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        Logger.info(`CSV exported: ${csvRows.length} rows`, undefined, 'BUILDER');
    });

    document.getElementById('saveFormulaBtn')?.addEventListener('click', () => {
        const statName = document.getElementById('statName').value.trim();
        if (!statName) {
            ErrorHandler.toast('Enter a stat name before saving', 'warn');
            return;
        }
        const top = results[0];
        _saveStat({
            name:       statName,
            formula,
            result:     top.val.toFixed(2),
            playerName: `${top.player.first_name} ${top.player.last_name} (top)`,
            timestamp:  new Date().toISOString(),
        });
        ErrorHandler.toast(`"${statName}" saved`, 'success');
    });
}

// ── Persistence ───────────────────────────────────────────────

function _loadSavedStats() {
    try {
        const raw = localStorage.getItem('zs_saved_stats');
        if (raw) AppState.savedStats = JSON.parse(raw);
    } catch (_) {
        AppState.savedStats = [];
    }
    _renderSavedStats();
}

function _saveStat(stat) {
    stat.id = Date.now();
    AppState.savedStats.unshift(stat);
    try { localStorage.setItem('zs_saved_stats', JSON.stringify(AppState.savedStats)); } catch (_) {}
    _renderSavedStats();
}

function deleteSavedStat(id) {
    AppState.savedStats = AppState.savedStats.filter(s => s.id !== id);
    try { localStorage.setItem('zs_saved_stats', JSON.stringify(AppState.savedStats)); } catch (_) {}
    _renderSavedStats();
}

function _renderSavedStats() {
    const list = document.getElementById('savedStatsList');
    if (!list) return;

    if (!AppState.savedStats.length) {
        list.innerHTML = `
            <div class="builder-empty">
                <div class="builder-empty-icon">📋</div>
                <p>No saved stats yet.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = AppState.savedStats.map(s => `
        <div class="saved-stat-card">
            <div class="saved-stat-top">
                <div>
                    <div class="saved-stat-name">${s.name}</div>
                    <div class="saved-stat-meta">${s.playerName}</div>
                    <div class="saved-stat-meta" style="font-size:0.7rem;margin-top:0.1rem">${new Date(s.timestamp).toLocaleDateString()}</div>
                </div>
                <div style="display:flex;align-items:center;gap:0.75rem">
                    <span class="saved-stat-value">${s.result}</span>
                    <button class="saved-stat-del" onclick="deleteSavedStat(${s.id})" title="Delete">✕</button>
                </div>
            </div>
            <code class="saved-stat-formula">${s.formula}</code>
        </div>
    `).join('');
}

if (typeof window !== 'undefined') {
    window.displayStatBuilder = displayStatBuilder;
    window.deleteSavedStat    = deleteSavedStat;
}

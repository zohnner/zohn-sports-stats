// ============================================================
// Stat Builder — sport-aware formula calculator
// Works with MLB (hitting/pitching) and NBA data.
// Reads AppState.currentSport to determine which dataset to use.
// ============================================================

// ── Stat variable definitions ─────────────────────────────────

const _MLB_HITTING_VARS = [
    { key: 'avg',         label: 'AVG'  },
    { key: 'homeRuns',    label: 'HR'   },
    { key: 'rbi',         label: 'RBI'  },
    { key: 'obp',         label: 'OBP'  },
    { key: 'slg',         label: 'SLG'  },
    { key: 'ops',         label: 'OPS'  },
    { key: 'hits',        label: 'H'    },
    { key: 'atBats',      label: 'AB'   },
    { key: 'runs',        label: 'R'    },
    { key: 'doubles',     label: '2B'   },
    { key: 'triples',     label: '3B'   },
    { key: 'stolenBases', label: 'SB'   },
    { key: 'strikeOuts',  label: 'K'    },
    { key: 'baseOnBalls', label: 'BB'   },
    { key: 'gamesPlayed', label: 'G'    },
];

const _MLB_PITCHING_VARS = [
    { key: 'era',             label: 'ERA'  },
    { key: 'wins',            label: 'W'    },
    { key: 'losses',          label: 'L'    },
    { key: 'strikeOuts',      label: 'K'    },
    { key: 'baseOnBalls',     label: 'BB'   },
    { key: 'whip',            label: 'WHIP' },
    { key: 'inningsPitched',  label: 'IP'   },
    { key: 'earnedRuns',      label: 'ER'   },
    { key: 'homeRuns',        label: 'HR'   },
    { key: 'hits',            label: 'H'    },
    { key: 'battersFaced',    label: 'BF'   },
    { key: 'saves',           label: 'SV'   },
    { key: 'gamesStarted',    label: 'GS'   },
    { key: 'gamesPlayed',     label: 'G'    },
];

const _NBA_VARS = [
    ['pts','PPG'], ['reb','RPG'], ['ast','APG'], ['stl','SPG'], ['blk','BPG'],
    ['turnover','TOV'], ['min','MIN'], ['fgm','FGM'], ['fga','FGA'], ['fg_pct','FG%'],
    ['fg3m','3PM'], ['fg3a','3PA'], ['fg3_pct','3P%'], ['ftm','FTM'], ['fta','FTA'], ['ft_pct','FT%'],
];

// Filter stat definitions (for compound condition rows)
const _MLB_HITTING_FILTER = [
    { key: 'avg',         label: 'AVG',  scale: 1000 }, // .286 → input 286
    { key: 'homeRuns',    label: 'HR'   },
    { key: 'rbi',         label: 'RBI'  },
    { key: 'obp',         label: 'OBP',  scale: 1000 },
    { key: 'slg',         label: 'SLG',  scale: 1000 },
    { key: 'ops',         label: 'OPS',  scale: 1000 },
    { key: 'hits',        label: 'H'    },
    { key: 'runs',        label: 'R'    },
    { key: 'stolenBases', label: 'SB'   },
    { key: 'strikeOuts',  label: 'K'    },
    { key: 'baseOnBalls', label: 'BB'   },
    { key: 'gamesPlayed', label: 'G'    },
];

const _MLB_PITCHING_FILTER = [
    { key: 'era',            label: 'ERA',  scale: 100 },
    { key: 'wins',           label: 'W'    },
    { key: 'strikeOuts',     label: 'K'    },
    { key: 'baseOnBalls',    label: 'BB'   },
    { key: 'whip',           label: 'WHIP', scale: 100 },
    { key: 'inningsPitched', label: 'IP'   },
    { key: 'saves',          label: 'SV'   },
    { key: 'gamesStarted',   label: 'GS'   },
];

const _NBA_FILTER = [
    { key: 'pts',      label: 'PPG' },
    { key: 'reb',      label: 'RPG' },
    { key: 'ast',      label: 'APG' },
    { key: 'stl',      label: 'SPG' },
    { key: 'blk',      label: 'BPG' },
    { key: 'turnover', label: 'TOV' },
    { key: 'min',      label: 'MIN' },
    { key: 'fg_pct',   label: 'FG%',  scale: 100 },
    { key: 'fg3_pct',  label: '3P%',  scale: 100 },
    { key: 'ft_pct',   label: 'FT%',  scale: 100 },
    { key: 'games_played', label: 'GP' },
];

// ── Config resolver ───────────────────────────────────────────

function _getBuilderConfig(mlbGroup) {
    const sport = AppState.currentSport;
    const group = mlbGroup || AppState.mlbStatsGroup || 'hitting';

    if (sport === 'mlb' && group === 'hitting') {
        return {
            sport: 'mlb', mlbGroup: 'hitting',
            players:    () => AppState.mlbPlayers?.hitting || [],
            statsFor:   id => AppState.mlbPlayerStats?.hitting?.[id],
            teamAbbr:   p => p.teamAbbr || '—',
            playerName: p => p.fullName || '—',
            posKey:     p => p.position,
            vars:       _MLB_HITTING_VARS,
            filterOpts: _MLB_HITTING_FILTER,
            positions:  ['All', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF'],
            examples: [
                { name: 'Isolated Power',  formula: 'slg - avg',                                                                              label: 'ISO (SLG − AVG)' },
                { name: 'BABIP',           formula: '(hits - homeRuns) / (atBats - strikeOuts - homeRuns + 1)',                                label: 'BABIP' },
                { name: 'OPS+ Proxy',      formula: '(obp / 0.320 + slg / 0.395 - 1) * 100',                                                  label: 'OPS+ (vs avg)' },
                { name: 'Runs Created',    formula: '(hits + baseOnBalls) * (hits + doubles + 2 * triples + 3 * homeRuns) / (atBats + baseOnBalls + 0.001)', label: 'RC (Bill James)' },
                { name: 'BB%',             formula: 'baseOnBalls / (atBats + baseOnBalls + 0.001) * 100',                                      label: 'Walk Rate %' },
                { name: 'K%',             formula: 'strikeOuts / (atBats + baseOnBalls + 0.001) * 100',                                       label: 'Strikeout Rate %' },
                { name: 'Power-Speed #',   formula: 'homeRuns * stolenBases * 2 / (homeRuns + stolenBases + 0.001)',                           label: 'Power-Speed Number' },
                { name: 'Contact Rate',    formula: '(atBats - strikeOuts) / atBats',                                                          label: 'Contact %' },
            ],
        };
    }

    if (sport === 'mlb' && group === 'pitching') {
        return {
            sport: 'mlb', mlbGroup: 'pitching',
            players:    () => AppState.mlbPlayers?.pitching || [],
            statsFor:   id => AppState.mlbPlayerStats?.pitching?.[id],
            teamAbbr:   p => p.teamAbbr || '—',
            playerName: p => p.fullName || '—',
            posKey:     p => p.position,
            vars:       _MLB_PITCHING_VARS,
            filterOpts: _MLB_PITCHING_FILTER,
            positions:  ['All', 'SP', 'RP', 'CP'],
            examples: [
                { name: 'K/9',       formula: 'strikeOuts / inningsPitched * 9',                                            label: 'K per 9 innings' },
                { name: 'BB/9',      formula: 'baseOnBalls / inningsPitched * 9',                                           label: 'BB per 9 innings' },
                { name: 'FIP',       formula: '(13 * homeRuns + 3 * baseOnBalls - 2 * strikeOuts) / inningsPitched + 3.2',  label: 'FIP (approx)' },
                { name: 'K-BB%',     formula: '(strikeOuts - baseOnBalls) / (battersFaced + 0.001) * 100',                  label: 'K-BB% (strikeout-walk rate)' },
                { name: 'K:BB',      formula: 'strikeOuts / (baseOnBalls + 0.001)',                                         label: 'Strikeout-to-Walk' },
                { name: 'HR/9',      formula: 'homeRuns / inningsPitched * 9',                                              label: 'Home Runs per 9' },
                { name: 'H/9',       formula: 'hits / inningsPitched * 9',                                                  label: 'Hits per 9' },
                { name: 'Win %',     formula: 'wins / (wins + losses + 0.001) * 100',                                      label: 'Win Percentage' },
            ],
        };
    }

    // NBA (default)
    const players = AppState.allPlayers.filter(p => AppState.playerStats[p.id]);
    return {
        sport: 'nba', mlbGroup: null,
        players:    () => players,
        statsFor:   id => AppState.playerStats[id],
        teamAbbr:   p => p.team?.abbreviation || '—',
        playerName: p => `${p.first_name} ${p.last_name}`,
        posKey:     p => p.position,
        vars:       _NBA_VARS,
        filterOpts: _NBA_FILTER,
        positions:  ['All', 'PG', 'SG', 'SF', 'PF', 'C'],
        examples: [
            { name: 'Player Efficiency', formula: '(pts + reb + ast + stl + blk - turnover) / min', label: 'Player Efficiency' },
            { name: 'True Shooting %',   formula: 'pts / (2 * (fga + 0.44 * fta)) * 100',          label: 'True Shooting %' },
            { name: 'Assist / Turnover', formula: 'ast / turnover',                                 label: 'Ast/TO Ratio' },
            { name: 'Box Score +',       formula: 'pts + 1.2*reb + 1.5*ast + 3*stl + 3*blk - turnover', label: 'Box Score +' },
        ],
    };
}

// ── Main display function ─────────────────────────────────────

async function displayStatBuilder(mlbGroup) {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('builder', null);

    const sport = AppState.currentSport;
    const group = mlbGroup || AppState.mlbStatsGroup || 'hitting';

    // ── MLB: ensure data is loaded ────────────────────────────
    if (sport === 'mlb' && !AppState.mlbPlayers?.[group]?.length) {
        grid.className = 'builder-container';
        grid.innerHTML = `
            <div class="builder-panel">
                <div style="text-align:center;padding:3rem 1rem">
                    <div style="font-size:2.5rem;margin-bottom:1rem">⚾</div>
                    <p style="color:var(--text-muted);margin-bottom:1.5rem">Loading MLB ${group} stats…</p>
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;
        try {
            const splits = await fetchMLBLeagueStats(group, MLB_SEASON);
            if (!AppState.mlbPlayers) AppState.mlbPlayers = {};
            if (!AppState.mlbPlayerStats) AppState.mlbPlayerStats = {};
            AppState.mlbPlayerStats[group] = {};
            AppState.mlbPlayers[group]     = [];
            splits.forEach(split => {
                const id = split.player?.id;
                if (!id) return;
                AppState.mlbPlayerStats[group][id] = { ...split.stat, player_id: id };
                AppState.mlbPlayers[group].push({
                    id,
                    fullName: split.player.fullName || '—',
                    teamId:   split.team?.id,
                    teamName: split.team?.name,
                    teamAbbr: split.team?.abbreviation,
                    position: split.position?.abbreviation,
                });
            });
        } catch (e) {
            grid.innerHTML = `
                <div class="builder-panel">
                    <div class="error-state">
                        <div class="error-state-icon">⚠️</div>
                        <h3 class="error-state-title">Failed to Load MLB Stats</h3>
                        <button class="retry-btn" onclick="displayStatBuilder()">Retry</button>
                    </div>
                </div>
            `;
            return;
        }
    }

    const cfg = _getBuilderConfig(group);
    const playersWithStats = cfg.players().filter(p => cfg.statsFor(p.id));

    const varChipsHtml = cfg.sport === 'mlb'
        ? cfg.vars.map(v => `<button class="var-chip" data-var="${v.key}" title="${v.key}">${v.label}</button>`).join('')
        : _NBA_VARS.map(([v, label]) => `<button class="var-chip" data-var="${v}" title="${v}">${label}</button>`).join('');

    const filterOptHtml = cfg.filterOpts.map(o =>
        `<option value="${o.key}">${o.label}</option>`
    ).join('');
    const opOptHtml = ['≥','≤','>','<','='].map(op =>
        `<option value="${op}">${op}</option>`
    ).join('');

    const mlbToggleHtml = sport === 'mlb' ? `
        <div class="builder-group-toggle" id="builderGroupToggle">
            <button class="builder-group-btn${group === 'hitting'  ? ' active' : ''}" data-group="hitting">Hitters</button>
            <button class="builder-group-btn${group === 'pitching' ? ' active' : ''}" data-group="pitching">Pitchers</button>
        </div>
    ` : '';

    const examplesHtml = cfg.examples.map(ex =>
        `<button class="builder-example-btn" data-name="${ex.name}" data-formula="${ex.formula}">${ex.label}</button>`
    ).join('');

    const positionHtml = cfg.positions.map((p, i) =>
        `<button class="position-pill${i === 0 ? ' active' : ''}" data-pos="${p}">${p}</button>`
    ).join('');

    const sportLabel = sport === 'mlb' ? `MLB ${group === 'hitting' ? 'Hitters' : 'Pitchers'}` : 'NBA Players';

    grid.className = 'builder-container';
    grid.innerHTML = `
        <div class="builder-panel">
            <div class="builder-header-row">
                <h2 class="builder-title">Stat Builder</h2>
                ${mlbToggleHtml}
            </div>
            <p class="builder-subtitle">Filter and rank ${sportLabel} by any formula — instantly.</p>

            <div class="builder-filter-section">
                <button class="builder-filter-header" id="builderFilterToggle" aria-expanded="false">
                    <span class="builder-filter-title">Filters</span>
                    <span class="builder-filter-badge" id="builderFilterBadge" style="display:none">0</span>
                    <svg class="builder-filter-chevron" id="builderFilterChevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="builder-filter-body" id="builderFilterBody" hidden>
                    <div class="builder-filter-row">
                        <span class="builder-filter-label">Position</span>
                        <div class="position-pill-group" id="positionPills">${positionHtml}</div>
                    </div>
                    <div id="conditionRows"></div>
                    <button id="addConditionBtn" class="builder-add-cond-btn">+ Add Condition</button>
                    <template id="conditionRowTpl">
                        <div class="condition-row">
                            <select class="cond-stat builder-select">${filterOptHtml}</select>
                            <select class="cond-op builder-select">${opOptHtml}</select>
                            <input class="cond-val builder-cond-input" type="number" step="any" placeholder="value">
                            <button class="cond-remove" aria-label="Remove">✕</button>
                        </div>
                    </template>
                </div>
            </div>

            <div class="builder-field">
                <label class="builder-label" for="statName">Stat Name</label>
                <input id="statName" class="builder-input" type="text" placeholder="e.g., Contact Power Index" autocomplete="off">
            </div>

            <div class="builder-field">
                <label class="builder-label" for="statFormula">Formula</label>
                <div class="formula-input-wrap">
                    <input id="statFormula" class="builder-input formula-input" type="text"
                        placeholder="${sport === 'mlb' && group === 'hitting' ? 'e.g., (homeRuns + rbi) / atBats' : sport === 'mlb' ? 'e.g., strikeOuts / inningsPitched * 9' : 'e.g., (pts + reb + ast) / min'}"
                        autocomplete="off" spellcheck="false">
                    <div id="formulaStatus" class="formula-status"></div>
                </div>
            </div>

            <div class="var-chips">${varChipsHtml}</div>

            <div class="builder-examples">
                <div class="builder-examples-title">Quick examples</div>
                <div class="builder-example-list">${examplesHtml}</div>
            </div>

            <button id="runFormulaBtn" class="builder-run-btn" disabled>
                Run on ${playersWithStats.length} Players
            </button>
        </div>

        <div class="saved-stats-panel" id="builderResultsPanel">
            <div id="builderResultsEmpty" class="builder-empty">
                <div class="builder-empty-icon">🧮</div>
                <p>Enter a formula and hit <strong>Run</strong> to rank all players.</p>
            </div>
            <div id="builderResultsTable" style="display:none"></div>
        </div>

        <div class="saved-stats-panel" id="savedStatsContainer">
            <h2 class="builder-title">Saved Stats</h2>
            <div id="savedStatsList"></div>
        </div>
    `;

    _setupBuilder(cfg, playersWithStats);
    _loadSavedStats();

    // MLB group toggle
    document.getElementById('builderGroupToggle')?.addEventListener('click', e => {
        const btn = e.target.closest('.builder-group-btn');
        if (!btn || btn.classList.contains('active')) return;
        AppState.mlbStatsGroup = btn.dataset.group;
        displayStatBuilder(btn.dataset.group);
    });
}

// ── Internal setup ────────────────────────────────────────────

function _setupBuilder(cfg, playersWithStats) {
    const formulaInput = document.getElementById('statFormula');
    const nameInput    = document.getElementById('statName');
    const runBtn       = document.getElementById('runFormulaBtn');
    const statusEl     = document.getElementById('formulaStatus');

    _setupFilters(cfg);

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

    document.querySelectorAll('.builder-example-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            nameInput.value    = btn.dataset.name;
            formulaInput.value = btn.dataset.formula;
            formulaInput.dispatchEvent(new Event('input'));
        });
    });

    const validate = debounce(() => {
        const formula = formulaInput.value.trim();
        if (!formula) {
            statusEl.textContent = '';
            statusEl.className   = 'formula-status';
            runBtn.disabled = true;
            return;
        }
        const { ok, error } = _tryFormula(formula, playersWithStats, cfg);
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

    runBtn.addEventListener('click', () => {
        const formula  = formulaInput.value.trim();
        const name     = nameInput.value.trim() || 'Custom Stat';
        const filtered = _applyFilters(playersWithStats, cfg);
        _runFormula(formula, name, filtered, cfg);
    });
}

// ── Filter helpers ────────────────────────────────────────────

function _setupFilters(cfg) {
    const toggle  = document.getElementById('builderFilterToggle');
    const body    = document.getElementById('builderFilterBody');
    const chevron = document.getElementById('builderFilterChevron');
    const addBtn  = document.getElementById('addConditionBtn');
    const pills   = document.querySelectorAll('.position-pill');

    toggle?.addEventListener('click', () => {
        const open = !body.hidden;
        body.hidden = open;
        toggle.setAttribute('aria-expanded', String(!open));
        chevron?.style.setProperty('transform', open ? '' : 'rotate(180deg)');
    });

    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            _updateFilterBadge();
        });
    });

    addBtn?.addEventListener('click', () => {
        const tpl  = document.getElementById('conditionRowTpl');
        const rows = document.getElementById('conditionRows');
        if (!tpl || !rows) return;
        const clone = tpl.content.cloneNode(true);
        const row   = clone.querySelector('.condition-row');
        row.querySelector('.cond-remove').addEventListener('click', () => {
            row.remove();
            _updateFilterBadge();
        });
        row.querySelector('.cond-val').addEventListener('input', _updateFilterBadge);
        rows.appendChild(clone);
    });
}

function _updateFilterBadge() {
    const badge    = document.getElementById('builderFilterBadge');
    if (!badge) return;
    const pos      = document.querySelector('.position-pill.active')?.dataset.pos;
    const posCount = pos && pos !== 'All' ? 1 : 0;
    const condCount = document.querySelectorAll('.condition-row').length;
    const total    = posCount + condCount;
    badge.textContent   = total;
    badge.style.display = total > 0 ? '' : 'none';
}

function _applyFilters(players, cfg) {
    const pos = document.querySelector('.position-pill.active')?.dataset.pos || 'All';
    const conditions = Array.from(document.querySelectorAll('.condition-row')).map(row => ({
        key: row.querySelector('.cond-stat')?.value,
        op:  row.querySelector('.cond-op')?.value,
        val: parseFloat(row.querySelector('.cond-val')?.value),
    })).filter(c => c.key && c.op && !isNaN(c.val));

    return players.filter(player => {
        if (pos !== 'All' && cfg.posKey(player) !== pos) return false;

        const stats = cfg.statsFor(player.id);
        if (!stats) return false;

        return conditions.every(({ key, op, val }) => {
            const optMeta = cfg.filterOpts.find(o => o.key === key);
            let raw = parseFloat(stats[key]);
            if (isNaN(raw)) return false;
            // scale: user types human-readable values (e.g., 286 for .286 avg)
            if (optMeta?.scale) raw = raw * optMeta.scale;
            switch (op) {
                case '≥': return raw >= val;
                case '≤': return raw <= val;
                case '>': return raw >  val;
                case '<': return raw <  val;
                case '=': return Math.abs(raw - val) < 0.001;
                default:  return true;
            }
        });
    });
}

// ── Formula evaluation ────────────────────────────────────────

function _tryFormula(formula, players, cfg) {
    if (!players?.length) return { ok: false, error: 'No player data loaded' };
    if (typeof math === 'undefined') return { ok: false, error: 'math.js not loaded' };
    let lastError = 'Formula error';
    for (const player of players.slice(0, 5)) {
        try {
            const stats = cfg.statsFor(player.id) || {};
            const scope = _buildScope(stats);
            const result = math.evaluate(formula, scope);
            if (!isFinite(result)) throw new Error('Division by zero or invalid result');
            return { ok: true };
        } catch (e) {
            lastError = e.message;
        }
    }
    return { ok: false, error: lastError };
}

function _buildScope(stats) {
    const scope = {};
    Object.entries(stats).forEach(([k, v]) => {
        const n = parseFloat(v);  // handles both number and string stats (e.g. avg=".286")
        if (!isNaN(n)) scope[k] = n;
    });
    return scope;
}

function _runFormula(formula, name, players, cfg) {
    const tableEl = document.getElementById('builderResultsTable');
    const emptyEl = document.getElementById('builderResultsEmpty');

    let compiled;
    try {
        compiled = math.compile(formula);
    } catch (e) {
        ErrorHandler.toast(`Formula parse error: ${e.message}`, 'error');
        return;
    }

    const results = [];
    players.forEach(player => {
        const stats = cfg.statsFor(player.id);
        if (!stats) return;
        try {
            const scope = _buildScope(stats);
            const val = compiled.evaluate(scope);
            if (isFinite(val)) results.push({ player, val });
        } catch (_) {}
    });

    if (results.length === 0) {
        ErrorHandler.toast('Formula produced no valid results', 'warn');
        return;
    }

    results.sort((a, b) => b.val - a.val);

    emptyEl.style.display = 'none';
    tableEl.style.display = 'block';

    const pos = document.querySelector('.position-pill.active')?.dataset.pos || 'All';
    const condCount = document.querySelectorAll('.condition-row').length;
    const filterSummary = [
        pos !== 'All' ? pos : '',
        condCount > 0 ? `${condCount} condition${condCount > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' · ');

    const heading = document.createElement('h2');
    heading.className   = 'builder-title';
    heading.textContent = name;

    const saveWrap = document.createElement('div');
    saveWrap.style.cssText = 'display:flex;justify-content:flex-end;gap:var(--space-3);margin-bottom:var(--space-4)';
    saveWrap.innerHTML = `
        <button class="builder-export-btn" id="exportCsvBtn">Export CSV</button>
        <button class="builder-save-btn" id="saveFormulaBtn">Save Formula</button>
    `;

    const top20 = results.slice(0, 20);
    const rows = top20.map((r, i) => {
        const abbr    = cfg.teamAbbr(r.player);
        const name    = cfg.playerName(r.player);
        const colors  = typeof getTeamColors === 'function' && cfg.sport === 'nba'
            ? getTeamColors(abbr)
            : typeof getMLBTeamColors === 'function'
            ? getMLBTeamColors(r.player.teamId)
            : { primary: '#334155' };
        const initials = name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
        const rankCls = i < 3 ? `lb-rank lb-rank-${i + 1}` : 'lb-rank';
        const pos     = cfg.posKey(r.player) || '';
        return `
            <div class="leaderboard-row">
                <span class="${rankCls}">${i + 1}</span>
                <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">${initials}</div>
                <div class="lb-player">
                    <span class="lb-name">${_escHtml(name)}</span>
                    <span class="lb-team">${_escHtml(abbr)}${pos ? ' · ' + _escHtml(pos) : ''}</span>
                </div>
                <span class="lb-value" style="color:var(--color-accent-light)">${r.val.toFixed(3)}</span>
            </div>
        `;
    }).join('');

    tableEl.innerHTML = '';
    tableEl.appendChild(heading);
    if (filterSummary) {
        const sub = document.createElement('p');
        sub.className   = 'builder-filter-summary';
        sub.textContent = `${results.length} players matched · ${filterSummary}`;
        tableEl.appendChild(sub);
    }
    tableEl.appendChild(saveWrap);
    tableEl.insertAdjacentHTML('beforeend', `<div class="leaderboard-list">${rows}</div>`);

    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
        const statName  = document.getElementById('statName').value.trim() || 'Custom Stat';
        const csvHeader = ['Rank', 'Player', 'Team', 'Position', statName].join(',');
        const csvRows   = results.map((r, i) => [
            i + 1,
            `"${cfg.playerName(r.player)}"`,
            cfg.teamAbbr(r.player),
            cfg.posKey(r.player) || '',
            r.val.toFixed(4),
        ].join(','));
        const csv  = [csvHeader, ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${statName.replace(/\s+/g, '_')}_${typeof MLB_SEASON !== 'undefined' ? MLB_SEASON : ''}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('saveFormulaBtn')?.addEventListener('click', () => {
        const statName = document.getElementById('statName').value.trim();
        if (!statName) {
            ErrorHandler.toast('Enter a stat name before saving', 'warn');
            return;
        }
        const top = results[0];
        _saveStat({
            name,
            formula,
            result:     top.val.toFixed(3),
            playerName: `${cfg.playerName(top.player)} (top)`,
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

    if (!AppState.savedStats?.length) {
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
                    <div class="saved-stat-name">${_escHtml(s.name)}</div>
                    <div class="saved-stat-meta">${_escHtml(s.playerName)}</div>
                    <div class="saved-stat-meta" style="font-size:0.7rem;margin-top:0.1rem">${new Date(s.timestamp).toLocaleDateString()}</div>
                </div>
                <div style="display:flex;align-items:center;gap:0.75rem">
                    <span class="saved-stat-value">${s.result}</span>
                    <button class="saved-stat-del" onclick="deleteSavedStat(${s.id})" title="Delete">✕</button>
                </div>
            </div>
            <code class="saved-stat-formula">${_escHtml(s.formula)}</code>
        </div>
    `).join('');
}

if (typeof window !== 'undefined') {
    window.displayStatBuilder = displayStatBuilder;
    window.deleteSavedStat    = deleteSavedStat;
}

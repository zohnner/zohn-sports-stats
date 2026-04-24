// ============================================================
// Leaderboards — stat leaders per category
// ============================================================

const LEADERBOARD_CATEGORIES = [
    { key: 'pts',      label: 'Scoring',        unit: 'PPG',  color: '#fbbf24', decimals: 1 },
    { key: 'reb',      label: 'Rebounds',        unit: 'RPG',  color: '#34d399', decimals: 1 },
    { key: 'ast',      label: 'Assists',         unit: 'APG',  color: '#60a5fa', decimals: 1 },
    { key: 'stl',      label: 'Steals',          unit: 'SPG',  color: '#a78bfa', decimals: 1 },
    { key: 'blk',      label: 'Blocks',          unit: 'BPG',  color: '#f472b6', decimals: 1 },
    { key: 'fg_pct',   label: 'FG%',             unit: 'FG%',  color: '#fb923c', decimals: 1, pct: true },
    { key: 'fg3_pct',  label: '3-Point %',       unit: '3P%',  color: '#818cf8', decimals: 1, pct: true },
    { key: 'ft_pct',   label: 'Free Throw %',    unit: 'FT%',  color: '#38bdf8', decimals: 1, pct: true },
    { key: 'turnover', label: 'Turnovers',        unit: 'TOV',  color: '#f87171', decimals: 1 },
    { key: 'min',      label: 'Minutes',          unit: 'MIN',  color: '#94a3b8', decimals: 1 },
    {
        key: '__fp', label: 'Fantasy Score', unit: 'FP (DK)', color: '#10b981', decimals: 1,
        computed: s => (parseFloat(s.pts)||0)*1 + (parseFloat(s.reb)||0)*1.25 + (parseFloat(s.ast)||0)*1.5
                     + (parseFloat(s.stl)||0)*3 + (parseFloat(s.blk)||0)*3 - (parseFloat(s.turnover)||0)*1,
        tip: 'DraftKings fantasy points: PTS×1 + REB×1.25 + AST×1.5 + STL×3 + BLK×3 − TOV×1',
    },
];

// Computed at render time so it reflects the selected season
function _seasonLabel() {
    return `${CURRENT_SEASON}–${(CURRENT_SEASON + 1).toString().slice(-2)}`;
}

async function loadLeaderboards() {
    const grid = document.getElementById('playersGrid');

    if (window.setBreadcrumb) setBreadcrumb('leaders', null);

    grid.className = 'leaderboards-grid';
    grid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="skeleton-card">
            <div class="skeleton-line" style="width:55%;height:16px;margin-bottom:1rem"></div>
            ${Array.from({ length: 5 }, () => `
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
                    <div class="skeleton-line" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"></div>
                    <div class="skeleton-avatar" style="width:32px;height:32px;flex-shrink:0"></div>
                    <div style="flex:1"><div class="skeleton-line" style="width:70%;height:12px"></div></div>
                    <div class="skeleton-line" style="width:36px;height:20px"></div>
                </div>
            `).join('')}
        </div>
    `).join('');

    try {
        if (AppState.allPlayers.length === 0) {
            AppState.allPlayers = await fetchAllPlayers();
        }
        if (Object.keys(AppState.playerStats).length === 0) {
            await loadStatsForPlayers(AppState.allPlayers);
        }
        displayLeaderboards();
    } catch (error) {
        ErrorHandler.handle(grid, error, loadLeaderboards, { tag: 'LEADERS', title: 'Failed to Load Leaders' });
    }
}

// ── Shared pill-bar control ───────────────────────────────────
// labelText : string shown before the pills (e.g. "Min GP:" or "Position:")
// options   : array of { value, label } or plain values (0 = 'All' for GP)
// current   : currently selected value
// onSelect  : called with the selected value
function _buildPillControl(labelText, options, current, onSelect) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;padding:0.05rem 0 0.2rem;';

    const lbl = document.createElement('span');
    lbl.textContent = labelText;
    lbl.style.cssText = 'font-size:0.72rem;font-weight:700;color:#475569;letter-spacing:0.4px;margin-right:0.1rem;white-space:nowrap;flex-shrink:0;';
    wrap.appendChild(lbl);

    options.forEach(opt => {
        const val   = (typeof opt === 'object') ? opt.value : opt;
        const text  = (typeof opt === 'object') ? opt.label : (val === 0 ? 'All' : `${val} GP`);
        const active = val === current || String(val) === String(current);
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            padding:0.2rem 0.55rem;border-radius:20px;cursor:pointer;font-weight:600;
            font-size:0.72rem;font-family:inherit;transition:all 0.18s;
            border:1px solid ${active ? 'transparent' : 'rgba(255,255,255,0.1)'};
            background:${active ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.03)'};
            color:${active ? '#818cf8' : '#475569'};
        `;
        btn.addEventListener('click', () => onSelect(val));
        wrap.appendChild(btn);
    });

    return wrap;
}

// Backwards-compat alias used by mlb.js
function _buildMinGPControl(options, current, onSelect) {
    return _buildPillControl('Min GP:', options, current, onSelect);
}

const NBA_MINGP_OPTIONS = [0, 10, 20, 50, 70];
const NBA_POS_OPTIONS   = [
    { value: 'all', label: 'All' },
    { value: 'G',   label: 'Guard' },
    { value: 'F',   label: 'Forward' },
    { value: 'C',   label: 'Center' },
];
const NBA_FANTASY_OPTIONS = [
    { value: false, label: 'Off' },
    { value: true,  label: 'FP (DK)' },
];

function displayLeaderboards() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'leaderboards-grid';

    const fragment = document.createDocumentFragment();

    // Control row 1 — Min GP
    fragment.appendChild(_buildPillControl('Min GP:', NBA_MINGP_OPTIONS, AppState.nbaLeaderMinGP, val => {
        AppState.nbaLeaderMinGP = val;
        displayLeaderboards();
    }));

    // Control row 2 — Position
    fragment.appendChild(_buildPillControl('Position:', NBA_POS_OPTIONS, AppState.nbaLeaderPosition, val => {
        AppState.nbaLeaderPosition = val;
        displayLeaderboards();
    }));

    // Control row 3 — Fantasy overlay
    fragment.appendChild(_buildPillControl('Fantasy:', NBA_FANTASY_OPTIONS, AppState.nbaFantasyOverlay || false, val => {
        AppState.nbaFantasyOverlay = val;
        displayLeaderboards();
    }));

    const cats = AppState.nbaFantasyOverlay
        ? LEADERBOARD_CATEGORIES   // include the FP panel when overlay is on
        : LEADERBOARD_CATEGORIES.filter(c => c.key !== '__fp');

    cats.forEach(cat => fragment.appendChild(_buildPanel(cat)));
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

const LB_INIT_COUNT = 10;

function _nbaFP(s) {
    return (parseFloat(s.pts)||0)*1 + (parseFloat(s.reb)||0)*1.25 + (parseFloat(s.ast)||0)*1.5
         + (parseFloat(s.stl)||0)*3 + (parseFloat(s.blk)||0)*3 - (parseFloat(s.turnover)||0)*1;
}

function _buildLeaderboardRow(player, rank, cat, topVal) {
    const s   = AppState.playerStats[player.id];
    const val = cat.computed ? cat.computed(s) : s[cat.key];
    const display = cat.pct ? (val * 100).toFixed(cat.decimals) + '%' : val.toFixed(cat.decimals);
    const barPct  = topVal > 0 ? Math.round((val / topVal) * 100) : 0;
    const abbr    = player.team?.abbreviation || '';
    const colors  = getTeamColors(abbr);
    const initials = (player.first_name?.[0] || '') + (player.last_name?.[0] || '');
    const headshotUrl = getESPNHeadshotUrl(player);

    // Fantasy overlay badge (skip for the dedicated FP panel itself)
    const fpBadge = AppState.nbaFantasyOverlay && cat.key !== '__fp'
        ? `<span class="lb-fp-badge">${_nbaFP(s).toFixed(1)} FP</span>` : '';

    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.addEventListener('click', () => showPlayerDetail(player.id));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showPlayerDetail(player.id); });

    row.innerHTML = `
        <span class="lb-rank ${rank < 3 ? `lb-rank-${rank + 1}` : ''}">${rank + 1}</span>
        <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
            ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" data-hide-on-error onload="var s=this.parentElement.querySelector('.lb-avatar-initials');if(s)s.style.visibility='hidden'">` : ''}
            <span class="lb-avatar-initials">${initials}</span>
        </div>
        <div class="lb-player">
            <span class="lb-name">${player.first_name} ${player.last_name}</span>
            <span class="lb-team">${abbr}${player.position ? ' · ' + player.position : ''}${fpBadge}</span>
            <div class="lb-bar"><div class="lb-bar-fill" style="width:${barPct}%;background:${cat.color}22;border-right:2px solid ${cat.color}88"></div></div>
        </div>
        <span class="lb-value" style="color:${cat.color}">${display}</span>
    `;
    return row;
}

// Per-panel sort direction: key → 'desc' | 'asc' (default desc = highest first)
const _lbSortDir = {};

function _buildPanel(cat) {
    const minGP  = AppState.nbaLeaderMinGP    || 0;
    const posFilt = AppState.nbaLeaderPosition || 'all';
    const dir    = _lbSortDir[cat.key] || 'desc';
    const eligible = AppState.allPlayers
        .filter(p => {
            const s = AppState.playerStats[p.id];
            if (!s) return false;
            if (!cat.computed && s[cat.key] == null) return false;
            if (minGP > 0 && (s?.games_played ?? 0) < minGP) return false;
            if (posFilt !== 'all' && !p.position?.toUpperCase().includes(posFilt)) return false;
            return true;
        })
        .sort((a, b) => {
            const sa = AppState.playerStats[a.id];
            const sb = AppState.playerStats[b.id];
            const av = cat.computed ? cat.computed(sa) : sa[cat.key];
            const bv = cat.computed ? cat.computed(sb) : sb[cat.key];
            const diff = bv - av;
            return dir === 'desc' ? diff : -diff;
        });

    const panel = document.createElement('div');
    panel.className = 'leaderboard-panel';

    const unitTip = cat.tip
        ? `<span class="stat-tip" data-tip="${cat.tip.replace(/"/g,'&quot;')}" tabindex="0">${cat.unit}</span>`
        : cat.unit;

    const header = document.createElement('div');
    header.className = 'leaderboard-header leaderboard-header--sortable';
    header.style.borderLeftColor = cat.color;
    header.title = `Click to sort ${dir === 'desc' ? 'ascending' : 'descending'}`;
    header.innerHTML = `
        <span class="leaderboard-title">${cat.label}</span>
        <span class="leaderboard-unit" style="color:${cat.color}">${_seasonLabel()} · ${unitTip}${minGP > 0 ? ` · ${eligible.length} qualifying` : ` · ${eligible.length} players`}</span>
        <button class="lb-export-btn" aria-label="Export ${cat.label} as CSV" title="Download CSV" onclick="event.stopPropagation()">↓CSV</button>
        <span class="leaderboard-sort-arrow">${dir === 'desc' ? '▼' : '▲'}</span>
    `;
    header.addEventListener('click', () => {
        _lbSortDir[cat.key] = dir === 'desc' ? 'asc' : 'desc';
        displayLeaderboards();
    });

    // Wire CSV export — runs after the button is in DOM
    setTimeout(() => {
        const exportBtn = panel.querySelector('.lb-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', e => {
                e.stopPropagation();
                const headers = ['Rank', 'Player', 'Team', 'Position', 'GP', cat.unit];
                const rows = eligible.map((p, i) => {
                    const s = AppState.playerStats[p.id];
                    const val = cat.computed ? cat.computed(s) : s[cat.key];
                    const display = cat.pct ? (val * 100).toFixed(cat.decimals) + '%' : val.toFixed(cat.decimals);
                    return [i + 1, `${p.first_name} ${p.last_name}`, p.team?.abbreviation || '', p.position || '', s.games_played ?? '', display];
                });
                if (typeof exportCSV === 'function') exportCSV(`sportsstr-${cat.key}-${_seasonLabel()}.csv`, headers, rows);
            });
        }
    }, 0);

    const list = document.createElement('div');
    list.className = 'leaderboard-list';

    if (eligible.length === 0) {
        list.innerHTML = `<p style="color:var(--text-muted);padding:1.5rem;text-align:center;font-size:0.875rem">No data available</p>`;
    } else {
        const topPlayerStats = AppState.playerStats[eligible[0].id];
        const topVal = cat.computed ? cat.computed(topPlayerStats) : topPlayerStats[cat.key];

        // Always render the first LB_INIT_COUNT rows visible
        eligible.slice(0, LB_INIT_COUNT).forEach((player, i) => {
            list.appendChild(_buildLeaderboardRow(player, i, cat, topVal));
        });

        // Render the remainder hidden; revealed by the toggle button below
        const extra = eligible.slice(LB_INIT_COUNT);
        extra.forEach((player, i) => {
            const row = _buildLeaderboardRow(player, LB_INIT_COUNT + i, cat, topVal);
            row.style.display = 'none';
            row.dataset.extra = '1';
            list.appendChild(row);
        });

        if (extra.length > 0) {
            const moreBtn = document.createElement('button');
            moreBtn.className = 'leaderboard-more-btn';
            moreBtn.textContent = `Show ${extra.length} more`;
            moreBtn.style.cssText = `
                width:100%;padding:0.5rem;margin-top:0.5rem;background:var(--bg-subtle);
                border:1px solid var(--border-default);border-radius:var(--radius-sm);
                color:var(--text-muted);font-size:0.75rem;cursor:pointer;
                transition:background var(--transition-fast);
            `;
            moreBtn.addEventListener('mouseenter', () => moreBtn.style.background = 'var(--bg-card)');
            moreBtn.addEventListener('mouseleave', () => moreBtn.style.background = 'var(--bg-subtle)');
            moreBtn.addEventListener('click', () => {
                const hidden = [...list.querySelectorAll('[data-extra]')];
                const showing = hidden[0]?.style.display !== 'none';
                hidden.forEach(r => r.style.display = showing ? 'none' : '');
                moreBtn.textContent = showing ? `Show ${extra.length} more` : 'Show less';
            });
            panel.appendChild(header);
            panel.appendChild(list);
            panel.appendChild(moreBtn);
            return panel;
        }
    }

    panel.appendChild(header);
    panel.appendChild(list);
    return panel;
}

if (typeof window !== 'undefined') {
    window.loadLeaderboards   = loadLeaderboards;
    window.displayLeaderboards = displayLeaderboards;
}

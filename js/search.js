// ============================================================
// SportStrata — Global Search (UX-007) + Recently Viewed (UX-006)
//
// Cmd/Ctrl+K opens overlay. Searches NBA/MLB players + teams
// across already-loaded AppState data (no extra fetches).
// Recently viewed persisted to localStorage (last 10).
// ============================================================

// ── Recently Viewed ───────────────────────────────────────────

const _RECENTS_KEY = 'zs_recents';
const _RECENTS_MAX = 10;

function _loadRecents() {
    try {
        const parsed = JSON.parse(localStorage.getItem(_RECENTS_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        // Drop malformed entries (must have at minimum id, sport, type, name)
        return parsed.filter(r => r && r.id != null && r.sport && r.type && r.name);
    } catch (_) { return []; }
}

// entry: { id, sport, type: 'player'|'team', name, sub, badge }
function addRecent(entry) {
    if (!entry || entry.id == null || !entry.sport || !entry.type || !entry.name) return;
    const list = _loadRecents().filter(r => !(r.id === entry.id && r.sport === entry.sport));
    list.unshift(entry);
    if (list.length > _RECENTS_MAX) list.length = _RECENTS_MAX;
    try { localStorage.setItem(_RECENTS_KEY, JSON.stringify(list)); } catch (_) {}
}

// ── State ─────────────────────────────────────────────────────

let _searchOpen       = false;
let _searchSelIdx     = -1;
let _searchFlatItems  = [];   // flat array of { action } for keyboard nav

// ── Open / Close ──────────────────────────────────────────────

function openGlobalSearch() {
    const overlay = document.getElementById('searchOverlay');
    const input   = document.getElementById('searchModalInput');
    if (!overlay || !input) return;
    overlay.hidden = false;
    _searchOpen    = true;
    _searchSelIdx  = -1;
    input.value    = '';
    _renderResults('');
    // Delay so backdrop paint doesn't steal the focus event
    requestAnimationFrame(() => input.focus());
}

function closeGlobalSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) overlay.hidden = true;
    _searchOpen = false;
}

// ── Recent action builder ─────────────────────────────────────

function _recentAction(r) {
    if (r.type === 'player' && r.sport === 'nba') {
        return () => { closeGlobalSearch(); showPlayerDetail(r.id); };
    }
    if (r.type === 'player' && r.sport === 'mlb') {
        return () => { closeGlobalSearch(); showMLBPlayerDetail(r.id); };
    }
    if (r.type === 'team' && r.sport === 'nba') {
        return () => { closeGlobalSearch(); if (AppState.currentSport !== 'nba') switchSport('nba'); showTeamDetail(r.id); };
    }
    if (r.type === 'team' && r.sport === 'mlb') {
        return () => { closeGlobalSearch(); if (AppState.currentSport !== 'mlb') switchSport('mlb'); showMLBTeamDetail(r.id); };
    }
    return () => closeGlobalSearch();
}

// ── Search ────────────────────────────────────────────────────

function _doSearch(q) {
    q = q.trim().toLowerCase();
    _renderResults(q);
}

function _buildGroups(q) {
    const groups = [];

    // ── NBA Players ──────────────────────────────────────────
    const nbaHits = (AppState.allPlayers || []).filter(p => {
        const name = `${p.first_name} ${p.last_name}`.toLowerCase();
        return name.includes(q) || (p.team?.full_name || '').toLowerCase().includes(q)
                                || (p.team?.abbreviation || '').toLowerCase().startsWith(q);
    }).slice(0, 6).map(p => ({
        id:     p.id,
        sport:  'nba',
        type:   'player',
        name:   `${p.first_name} ${p.last_name}`,
        sub:    `${p.team?.abbreviation || '—'} · ${p.position || '—'}`,
        badge:  'NBA',
        action: () => { closeGlobalSearch(); showPlayerDetail(p.id); },
    }));
    if (nbaHits.length) groups.push({ label: 'NBA Players', items: nbaHits });

    // ── MLB Players (deduplicate hitting vs pitching by id) ──
    const mlbSeen = new Set();
    const mlbPool = [...(AppState.mlbPlayers?.hitting || []), ...(AppState.mlbPlayers?.pitching || [])];
    const mlbHits = mlbPool.filter(p => {
        if (mlbSeen.has(p.id)) return false;
        mlbSeen.add(p.id);
        return (p.fullName || '').toLowerCase().includes(q)
            || (p.teamName || '').toLowerCase().includes(q)
            || (p.teamAbbr || '').toLowerCase().startsWith(q);
    }).slice(0, 6).map(p => {
        const hitStats = AppState.mlbPlayerStats?.hitting?.[p.id];
        const pitStats = AppState.mlbPlayerStats?.pitching?.[p.id];
        let statHint = '';
        if (hitStats?.avg)              statHint = `AVG ${hitStats.avg}`;
        else if (pitStats?.era)         statHint = `ERA ${pitStats.era}`;
        const sub = statHint
            ? `${p.teamAbbr || '—'} · ${p.position || '—'} · ${statHint}`
            : `${p.teamAbbr || '—'} · ${p.position || '—'}`;
        return {
            id:     p.id,
            sport:  'mlb',
            type:   'player',
            name:   p.fullName || `Player ${p.id}`,
            sub,
            badge:  'MLB',
            action: () => { closeGlobalSearch(); showMLBPlayerDetail(p.id); },
        };
    });
    if (mlbHits.length) groups.push({ label: 'MLB Players', items: mlbHits });

    // ── Teams ────────────────────────────────────────────────
    const teamHits = [
        ...(AppState.allTeams || []).filter(t => {
            const n = (t.full_name || t.name || '').toLowerCase();
            return n.includes(q) || (t.abbreviation || '').toLowerCase().startsWith(q);
        }).slice(0, 3).map(t => ({
            id:     t.id,
            sport:  'nba',
            type:   'team',
            name:   t.full_name || t.name,
            sub:    `NBA · ${t.abbreviation || ''}`,
            badge:  'NBA',
            action: () => { closeGlobalSearch(); if (AppState.currentSport !== 'nba') switchSport('nba'); showTeamDetail(t.id); },
        })),
        ...(AppState.mlbTeams || []).filter(t => {
            const n = (t.name || '').toLowerCase();
            return n.includes(q) || (t.abbrev || t.abbreviation || '').toLowerCase().startsWith(q);
        }).slice(0, 3).map(t => ({
            id:     t.id,
            sport:  'mlb',
            type:   'team',
            name:   t.name,
            sub:    `MLB · ${t.abbrev || t.abbreviation || ''}`,
            badge:  'MLB',
            action: () => { closeGlobalSearch(); if (AppState.currentSport !== 'mlb') switchSport('mlb'); showMLBTeamDetail(t.id); },
        })),
    ];
    if (teamHits.length) groups.push({ label: 'Teams', items: teamHits });

    return groups;
}

// ── Render ────────────────────────────────────────────────────

function _renderResults(q) {
    const container = document.getElementById('searchModalResults');
    if (!container) return;
    _searchSelIdx = -1;
    _searchFlatItems = [];

    if (!q) {
        const recents = _loadRecents();
        if (!recents.length) {
            container.innerHTML = `<div class="search-empty">Start typing to search players &amp; teams</div>`;
            return;
        }
        // Rebuild action closures (they're stripped on JSON serialisation)
        _searchFlatItems = recents.map(r => ({ ...r, action: _recentAction(r) }));
        container.innerHTML = _groupHtml('Recently Viewed', recents.map((r, i) => _itemHtml(r, i)));
        _attachHandlers();
        return;
    }

    const groups = _buildGroups(q);
    if (!groups.length) {
        container.innerHTML = `<div class="search-empty">No results for <strong>${_esc(q)}</strong></div>`;
        return;
    }

    let html = '';
    groups.forEach(g => {
        const base = _searchFlatItems.length;
        _searchFlatItems.push(...g.items);
        html += _groupHtml(g.label, g.items.map((item, i) => _itemHtml(item, base + i)));
    });
    container.innerHTML = html;
    _attachHandlers();
}

function _groupHtml(label, rows) {
    return `<div class="search-group"><div class="search-group-label">${_esc(label)}</div>${rows.join('')}</div>`;
}

function _itemHtml(item, idx) {
    const initials = (item.name || '').split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
    const isTeam   = item.type === 'team';
    const icon     = isTeam ? (item.sport === 'nba' ? '🏀' : '⚾') : '';
    const avatar   = icon
        ? `<span class="search-result-avatar search-result-avatar--team">${icon}</span>`
        : `<span class="search-result-avatar">${_esc(initials)}</span>`;
    const bc       = item.sport === 'nba' ? 'search-badge--nba' : 'search-badge--mlb';
    return `<button class="search-result-item" data-idx="${idx}">
        ${avatar}
        <span class="search-result-name">${_esc(item.name)}</span>
        <span class="search-result-sub">${_esc(item.sub)}</span>
        <span class="search-badge ${bc}">${_esc(item.badge)}</span>
    </button>`;
}

function _attachHandlers() {
    document.querySelectorAll('#searchModalResults .search-result-item').forEach(btn => {
        const idx = parseInt(btn.dataset.idx, 10);
        btn.addEventListener('click', () => _searchFlatItems[idx]?.action?.());
        btn.addEventListener('mouseenter', () => _highlight(idx));
    });
}

function _highlight(idx) {
    document.querySelectorAll('#searchModalResults .search-result-item').forEach((el, i) => {
        el.classList.toggle('search-result-item--active', i === idx);
    });
    _searchSelIdx = idx;
}

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────

function initGlobalSearch() {
    const overlay  = document.getElementById('searchOverlay');
    const input    = document.getElementById('searchModalInput');
    const openBtn  = document.getElementById('globalSearchBtn');
    const closeBtn = document.getElementById('searchModalClose');
    if (!overlay || !input) return;

    openBtn?.addEventListener('click', openGlobalSearch);
    closeBtn?.addEventListener('click', closeGlobalSearch);

    // Backdrop click closes
    overlay.addEventListener('click', e => { if (e.target === overlay) closeGlobalSearch(); });

    // Live search on input
    input.addEventListener('input', () => _doSearch(input.value));

    // Keyboard nav within input
    input.addEventListener('keydown', e => {
        const items = document.querySelectorAll('#searchModalResults .search-result-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = Math.min(_searchSelIdx + 1, items.length - 1);
            _highlight(next);
            items[next]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = Math.max(_searchSelIdx - 1, 0);
            _highlight(prev);
            items[prev]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && _searchSelIdx >= 0) {
            items[_searchSelIdx]?.click();
        } else if (e.key === 'Escape') {
            closeGlobalSearch();
        }
    });

    // Global shortcut Cmd/Ctrl+K
    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            _searchOpen ? closeGlobalSearch() : openGlobalSearch();
        }
        // Escape anywhere while open
        if (e.key === 'Escape' && _searchOpen) closeGlobalSearch();
    });
}

if (typeof window !== 'undefined') {
    window.openGlobalSearch  = openGlobalSearch;
    window.closeGlobalSearch = closeGlobalSearch;
    window.addRecent         = addRecent;
    window.initGlobalSearch  = initGlobalSearch;
}

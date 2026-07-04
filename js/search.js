// ============================================================
// SportStrata — Global Search (UX-007) + Recently Viewed (UX-006)
//
// Cmd/Ctrl+K opens overlay. Searches NBA/MLB/NFL players + teams
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
let _searchReturnFocus = null; // element to return focus to on close

// ── Open / Close ──────────────────────────────────────────────

function openGlobalSearch() {
    const overlay = document.getElementById('searchOverlay');
    const input   = document.getElementById('searchModalInput');
    if (!overlay || !input) return;
    _searchReturnFocus = document.activeElement;
    overlay.hidden = false;
    _searchOpen    = true;
    _searchSelIdx  = -1;
    input.value    = '';
    // Lazily warm the NFL player pool so NFL is searchable even before visiting an NFL view.
    if (typeof fetchNFLSleeperPool === 'function' && (typeof _nflPool === 'undefined' || !_nflPool)) {
        fetchNFLSleeperPool().then(() => {
            const box = document.getElementById('searchModalInput');
            if (_searchOpen && box && box.value.trim()) _renderResults(box.value.trim().toLowerCase());
        }).catch(() => {});
    }
    // Warm the NFL team list so teams are searchable before visiting an NFL view (N-2).
    if (typeof fetchNFLTeams === 'function' && !(AppState.nflTeams && AppState.nflTeams.length)) {
        fetchNFLTeams().then(t => {
            AppState.nflTeams = t;
            const box = document.getElementById('searchModalInput');
            if (_searchOpen && box && box.value.trim()) _renderResults(box.value.trim().toLowerCase());
        }).catch(() => {});
    }
    // Warm MLB leader splits so Ask-bar answers work before visiting Leaders (D-039).
    if (typeof _fetchMLBLeaderSplits === 'function' && !AppState.mlbLeaderSplits) {
        _fetchMLBLeaderSplits(MLB_SEASON).then(() => {
            const box = document.getElementById('searchModalInput');
            if (_searchOpen && box && box.value.trim()) _renderResults(box.value.trim().toLowerCase());
        }).catch(() => {});
    }
    _renderResults('');
    // Delay so backdrop paint doesn't steal the focus event
    requestAnimationFrame(() => input.focus());
}

function closeGlobalSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) overlay.hidden = true;
    _searchOpen = false;
    _searchReturnFocus?.focus();
    _searchReturnFocus = null;
}

function _searchFocusable() {
    return [
        document.getElementById('searchModalInput'),
        document.getElementById('searchModalClose'),
        ...document.querySelectorAll('#searchModalResults .search-result-item'),
    ].filter(Boolean);
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
    if (r.type === 'player' && r.sport === 'nfl') {
        return () => { closeGlobalSearch(); _nflSearchGo(r.id); };
    }
    return () => closeGlobalSearch();
}

// Switch into NFL context (header/nav) then open a player detail.
function _nflSearchGo(id) {
    if (AppState.currentSport !== 'nfl') {
        AppState.currentSport = 'nfl';
        if (typeof _applySportUI === 'function') _applySportUI('nfl');
    }
    navigateTo('nfl-player-' + id);
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
        if (hitStats?.avg)      statHint = `AVG ${hitStats.avg}`;
        else if (pitStats?.era) statHint = `ERA ${parseFloat(pitStats.era).toFixed(2)}`;
        const sub = statHint
            ? `${p.teamAbbr || '—'} · ${p.position || '—'} · ${statHint}`
            : `${p.teamAbbr || '—'} · ${p.position || '—'}`;
        const avatarUrl = typeof getMLBPlayerHeadshotUrl === 'function' ? getMLBPlayerHeadshotUrl(p.id) : '';
        const teamColor = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(p.teamAbbr)?.primary : '';
        return {
            id:     p.id,
            sport:  'mlb',
            type:   'player',
            name:   p.fullName || `Player ${p.id}`,
            sub,
            badge:  'MLB',
            avatarUrl,
            teamColor,
            action: () => { closeGlobalSearch(); showMLBPlayerDetail(p.id); },
        };
    });
    if (mlbHits.length) groups.push({ label: 'MLB Players', items: mlbHits });

    // ── NFL Players (Sleeper pool; warmed lazily on overlay open) ──
    const nflPool = (typeof _nflPool !== 'undefined' && _nflPool) ? _nflPool : [];
    const nflHits = nflPool.filter(p => {
        const name = (p.full_name || '').toLowerCase();
        return name.includes(q) || (p.team || '').toLowerCase().startsWith(q)
            || (p.position || '').toLowerCase() === q;
    }).slice(0, 6).map(p => ({
        id:     p.player_id,
        sport:  'nfl',
        type:   'player',
        name:   p.full_name,
        sub:    `${p.team || 'FA'} · ${p.position || '—'}${p._adp ? ` · #${p._adp} ADP` : ''}`,
        badge:  'NFL',
        avatarUrl: typeof getNFLSleeperHeadshot === 'function' ? getNFLSleeperHeadshot(p.player_id) : '',
        action: () => {
            closeGlobalSearch();
            _nflSearchGo(p.player_id);
            addRecent({ id: p.player_id, sport: 'nfl', type: 'player', name: p.full_name, sub: `${p.team || 'FA'} · ${p.position || ''}`, badge: 'NFL' });
        },
    }));
    if (nflHits.length) groups.push({ label: 'NFL Players', items: nflHits });

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
        }).slice(0, 3).map(t => {
            const abbr = t.abbrev || t.abbreviation || '';
            const logoUrl = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(abbr) : '';
            const teamColor = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(abbr)?.primary : '';
            return {
                id:     t.id,
                sport:  'mlb',
                type:   'team',
                name:   t.name,
                sub:    `MLB · ${abbr}`,
                badge:  'MLB',
                avatarUrl: logoUrl,
                teamColor,
                action: () => { closeGlobalSearch(); if (AppState.currentSport !== 'mlb') switchSport('mlb'); showMLBTeamDetail(t.id); },
            };
        }),
        ...(AppState.nflTeams || []).filter(t => {
            const n = (t.name || t.shortName || '').toLowerCase();
            return n.includes(q) || (t.abbr || '').toLowerCase().startsWith(q);
        }).slice(0, 3).map(t => ({
            id:     t.abbr,
            sport:  'nfl',
            type:   'team',
            name:   t.name,
            sub:    `NFL · ${t.abbr || ''}`,
            badge:  'NFL',
            avatarUrl: t.logo || (typeof getNFLTeamLogoUrl === 'function' ? getNFLTeamLogoUrl(t.abbr) : ''),
            teamColor: t.color,
            action: () => { closeGlobalSearch(); if (AppState.currentSport !== 'nfl') { AppState.currentSport = 'nfl'; if (typeof _applySportUI === 'function') _applySportUI('nfl'); } navigateTo('nfl-team-' + t.abbr); },
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
        const teach = (typeof qaTeachHtml === 'function') ? qaTeachHtml() : '';
        if (!recents.length) {
            container.innerHTML = teach + `<div class="search-empty">Start typing to search players &amp; teams</div>`;
            return;
        }
        // Rebuild action closures (they're stripped on JSON serialisation)
        _searchFlatItems = recents.map(r => ({ ...r, action: _recentAction(r) }));
        container.innerHTML = teach + _groupHtml('Recently Viewed', recents.map((r, i) => _itemHtml(r, i)));
        _attachHandlers();
        return;
    }

    // Ask-bar answer panel (D-039) — additive; qa items are pushed FIRST so
    // the data-idx values qaBuild writes align with _searchFlatItems order.
    // When a parse leaves leftover tokens ("judge hr"), the name search runs
    // on the leftovers so both the answer AND the player surface.
    const qa = (typeof qaBuild === 'function') ? qaBuild(q) : null;
    const groups = _buildGroups(qa && qa.leftover ? qa.leftover : q);
    if (!groups.length && !qa) {
        container.innerHTML = `<div class="search-empty">No results for <strong>${_esc(q)}</strong></div>`;
        _appendNflAllTime(q);
        return;
    }

    let html = '';
    if (qa) { _searchFlatItems.push(...qa.items); html += qa.html; }
    groups.forEach(g => {
        const base = _searchFlatItems.length;
        _searchFlatItems.push(...g.items);
        html += _groupHtml(g.label, g.items.map((item, i) => _itemHtml(item, base + i)));
    });
    container.innerHTML = html;
    _attachHandlers();
    _appendNflAllTime(q);
}

// Async "All-Time Players" section (current + retired) via ESPN search. Appends
// below the local results so retired players are reachable from ⌘K. Debounced + cached.
let _nflSearchTimer = null;
function _appendNflAllTime(q) {
    clearTimeout(_nflSearchTimer);
    if (!q || q.length < 2) return;
    _nflSearchTimer = setTimeout(async () => {
        const box = document.getElementById('searchModalInput');
        if (!box || box.value.trim().toLowerCase() !== q) return;          // stale query
        let results = [];
        try { const r = await fetch(`/api/nflsearch?q=${encodeURIComponent(q)}`); if (r.ok) results = (await r.json()).results || []; } catch (_) {}
        const box2 = document.getElementById('searchModalInput');
        const container = document.getElementById('searchModalResults');
        if (!container || !box2 || box2.value.trim().toLowerCase() !== q) return;
        if (!results.length) return;
        const shown = new Set([...container.querySelectorAll('.search-result-name')].map(e => e.textContent.trim().toLowerCase()));
        const items = results.filter(pl => !shown.has((pl.name || '').toLowerCase())).slice(0, 6);
        if (!items.length) return;
        const emptyEl = container.querySelector('.search-empty'); if (emptyEl) emptyEl.remove();
        const rows = items.map(pl => {
            const initials = (pl.name || '').split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
            return `<button class="search-result-item" onclick="closeGlobalSearch();if(AppState.currentSport!=='nfl'){AppState.currentSport='nfl';if(typeof _applySportUI==='function')_applySportUI('nfl');}navigateTo('nfl-player-espn-${pl.id}')">
                <span class="search-result-avatar search-result-avatar--img"><img src="${_esc(pl.headshot)}" alt="" loading="lazy" data-hide-on-error style="width:100%;height:100%;border-radius:50%;object-fit:cover"><span class="search-avatar-fallback">${_esc(initials)}</span></span>
                <span class="search-result-name">${_esc(pl.name)}</span>
                <span class="search-result-sub">${_esc(pl.team || 'NFL')}</span>
                <span class="search-badge search-badge--nfl">NFL</span>
            </button>`;
        }).join('');
        container.insertAdjacentHTML('beforeend', `<div class="search-group"><div class="search-group-label">All-Time Players</div>${rows}</div>`);
    }, 320);
}

function _groupHtml(label, rows) {
    return `<div class="search-group"><div class="search-group-label">${_esc(label)}</div>${rows.join('')}</div>`;
}

function _itemHtml(item, idx) {
    const initials  = (item.name || '').split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
    const isTeam    = item.type === 'team';
    const bgStyle   = item.teamColor ? `background:linear-gradient(135deg,${item.teamColor}cc,${item.teamColor}44)` : '';
    const imgStyle  = isTeam ? 'object-fit:contain;padding:3px' : 'object-fit:cover';
    let avatar;
    if (item.avatarUrl) {
        avatar = `<span class="search-result-avatar search-result-avatar--img" style="${bgStyle}">
            <img src="${_esc(item.avatarUrl)}" alt="" loading="lazy" data-hide-on-error
                 style="width:100%;height:100%;border-radius:50%;${imgStyle}">
            <span class="search-avatar-fallback">${_esc(initials)}</span>
        </span>`;
    } else if (isTeam) {
        const icon = item.sport === 'nba' ? '🏀' : '⚾';
        avatar = `<span class="search-result-avatar search-result-avatar--team">${icon}</span>`;
    } else {
        avatar = `<span class="search-result-avatar" style="${bgStyle}">${_esc(initials)}</span>`;
    }
    const bc = item.sport === 'nba' ? 'search-badge--nba' : item.sport === 'nfl' ? 'search-badge--nfl' : 'search-badge--mlb';
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

    // Focus trap: Tab/Shift+Tab cycles within the overlay while open
    overlay.addEventListener('keydown', e => {
        if (!_searchOpen || e.key !== 'Tab') return;
        const focusable = _searchFocusable();
        if (!focusable.length) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
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

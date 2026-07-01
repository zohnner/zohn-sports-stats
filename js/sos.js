// ============================================================
// NFL Strength of Schedule (D-028) — fantasy matchup difficulty by position.
// Data joined server-side by /api/nflsos: last season's fantasy points allowed
// per game by each defense (nflverse weekly, CC-BY) mapped onto the upcoming
// schedule (ESPN). Ranks: 1 = easiest (opponents give up the most), 32 = toughest.
// Two windows: full regular season, and the fantasy-playoff weeks (15-17).
// ============================================================

const _sos = { data: null, split: 'full', pos: 'ALL' };
const _SOS_POS = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const _SOS_POS_COLOR = { QB: '#ef4444', RB: '#34d399', WR: '#60a5fa', TE: '#fbbf24', ALL: 'var(--accent)' };

// rank 1 (easiest) -> green, 32 (toughest) -> red, through amber.
function _sosColor(rank, total) {
    if (!rank) return 'var(--bg-raised)';
    const t = (rank - 1) / Math.max(1, (total || 32) - 1);
    const lerp = (a, b, k) => Math.round(a + (b - a) * k);
    let r, g, b;
    if (t < 0.5) { const k = t / 0.5; r = lerp(34, 234, k); g = lerp(197, 179, k); b = lerp(94, 8, k); }
    else { const k = (t - 0.5) / 0.5; r = lerp(234, 239, k); g = lerp(179, 68, k); b = lerp(8, 68, k); }
    return `rgba(${r},${g},${b},0.16)`;
}
function _sosTextColor(rank, total) {
    if (!rank) return 'var(--text-subtle)';
    const t = (rank - 1) / Math.max(1, (total || 32) - 1);
    const lerp = (a, b, k) => Math.round(a + (b - a) * k);
    let r, g, b;
    if (t < 0.5) { const k = t / 0.5; r = lerp(52, 202, k); g = lerp(168, 138, k); b = lerp(83, 4, k); }
    else { const k = (t - 0.5) / 0.5; r = lerp(202, 248, k); g = lerp(138, 81, k); b = lerp(4, 73, k); }
    return `rgb(${r},${g},${b})`;
}

async function loadNFLSOS() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = ''; grid.style.cssText = '';
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('nfl-sos', null);
    grid.innerHTML = `<div class="sos-loading"><div class="skeleton-line" style="height:40px;width:55%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Building strength of schedule…</p></div>`;

    try {
        let data = _sos.data;
        if (!data && window.ApiCache) data = ApiCache.get('nflsos');
        if (!data) {
            const res = await fetch('/api/nflsos');
            if (!res.ok) throw new Error('sos ' + res.status);
            data = await res.json();
            if (window.ApiCache) ApiCache.set('nflsos', data, ApiCache.TTL.DAILY);
        }
        _sos.data = data;
        if (!data.ok || !data.teams || !data.teams.length) {
            grid.innerHTML = `<div class="sos-empty"><p>Strength of schedule isn't available yet${data && data.season ? ` for ${data.season}` : ''}.</p><p class="pct-caption">It needs both last season's defensive data and the released schedule.</p></div>`;
            return;
        }
        _sosRender();
    } catch (err) {
        if (window.ErrorHandler && ErrorHandler.handle) ErrorHandler.handle(grid, err, () => loadNFLSOS(), { tag: 'SOS', title: 'Failed to Load Schedule Strength' });
        else grid.innerHTML = `<div class="sos-empty"><p>Couldn't load strength of schedule.</p><button class="md-btn" onclick="loadNFLSOS()">Retry</button></div>`;
        if (window.Logger) Logger.warn('sos load failed', err, 'SOS');
    }
}

function _sosRender() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = ''; grid.style.cssText = '';
    const d = _sos.data;
    const split = _sos.split;            // 'full' | 'post'
    const sortPos = _sos.pos;            // sort key
    const total = d.teams.length;

    const cellOf = (t, pos) => (t[split] && t[split][pos]) || { v: null, rank: null };
    const teams = d.teams.slice().sort((a, b) => {
        const ra = cellOf(a, sortPos).rank || 99, rb = cellOf(b, sortPos).rank || 99;
        return ra - rb;
    });

    const logo = (abbr) => (typeof getNFLTeamLogoUrl === 'function') ? getNFLTeamLogoUrl(_sosEspnAbbr(abbr)) : '';
    const splitBtn = (k, l) => `<button class="sos-seg ${split === k ? 'sos-seg--on' : ''}" data-sossplit="${k}">${l}</button>`;
    const posChip = (p) => `<button class="md-pos-btn ${p === sortPos ? 'md-pos-btn--on' : ''}" data-sospos="${p}" style="${p === sortPos && p !== 'ALL' ? `color:${_SOS_POS_COLOR[p]}` : ''}">${p === 'ALL' ? 'Overall' : p}</button>`;

    const headCols = ['QB', 'RB', 'WR', 'TE', 'ALL'];
    const colLabel = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', ALL: 'OVR' };

    const cell = (t, pos) => {
        const c = cellOf(t, pos);
        const bg = _sosColor(c.rank, total), fg = _sosTextColor(c.rank, total);
        const title = c.v != null ? `${c.v} fantasy pts/game allowed by opponents` : 'no data';
        return `<td class="sos-cell ${pos === sortPos ? 'sos-cell--sortcol' : ''}" style="background:${bg};color:${fg}" title="${title}">
            <span class="sos-rank">${c.rank || '—'}</span></td>`;
    };

    const rows = teams.map(t => {
        const lg = logo(t.team);
        return `<tr class="sos-row" onclick="navigateTo('nfl-team-${_escSos(_sosEspnAbbr(t.team))}')">
            <td class="sos-team">${lg ? `<img class="sos-team__logo" src="${_escSos(lg)}" alt="" loading="lazy" data-hide-on-error>` : ''}<span class="sos-team__abbr">${_escSos(t.team)}</span></td>
            <td class="sos-bye">${t.bye || '—'}</td>
            ${headCols.map(p => cell(t, p)).join('')}
        </tr>`;
    }).join('');

    const splitNote = split === 'post'
        ? `Fantasy playoffs — weeks ${d.playoffWeeks[0]}–${d.playoffWeeks[d.playoffWeeks.length - 1]}`
        : `Full ${d.weeks}-week regular season`;

    grid.innerHTML = ((typeof _hqStrip === 'function') ? _hqStrip('nfl-sos') : '') + `
      <div class="sos-wrap">
        <div class="sos-head">
          <div>
            <h1 class="md-title" style="margin:0">Strength of Schedule</h1>
            <p class="md-note">Fantasy points each team's opponents allowed per game in ${d.defSeason} · ranked 1 (easiest) – ${total} (toughest) for the ${d.season} schedule</p>
          </div>
        </div>

        <div class="sos-controls">
          <div class="sos-seg-group">${splitBtn('full', 'Full Season')}${splitBtn('post', 'Fantasy Playoffs')}</div>
          <div class="md-pos-filters">${_SOS_POS.map(posChip).join('')}</div>
        </div>

        <div class="sos-legend">
          <span class="sos-legend__label">Easier</span>
          <span class="sos-legend__bar"></span>
          <span class="sos-legend__label">Tougher</span>
          <span class="sos-legend__split">${splitNote}</span>
        </div>

        <div class="sos-tablewrap">
          <table class="sos-table">
            <thead><tr>
              <th class="sos-team">Team</th><th class="sos-bye">Bye</th>
              ${headCols.map(p => `<th class="sos-colh ${p === sortPos ? 'sos-colh--on' : ''}" data-sospos="${p}" style="${p === sortPos && p !== 'ALL' ? `color:${_SOS_POS_COLOR[p]}` : ''}">${colLabel[p]}</th>`).join('')}
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <p class="pct-caption">Each cell is the average of that team's opponents' fantasy points allowed to the position, per game, in ${d.defSeason} (PPR). Defense data: nflverse (CC-BY). Schedule: ESPN. Click a team for its full schedule.</p>
      </div>`;

    grid.querySelectorAll('[data-sossplit]').forEach(b => b.addEventListener('click', () => { _sos.split = b.dataset.sossplit; _sosRender(); }));
    grid.querySelectorAll('[data-sospos]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); _sos.pos = b.dataset.sospos; _sosRender(); }));
}

function _escSos(s) { return typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s); }

// nflverse canonical -> the abbr the rest of the app / ESPN expects (only WAS differs).
const _SOS_ESPN_ABBR = { WAS: 'WSH' };
function _sosEspnAbbr(a) { return _SOS_ESPN_ABBR[a] || a; }

if (typeof window !== 'undefined') {
    window.loadNFLSOS = loadNFLSOS;
}

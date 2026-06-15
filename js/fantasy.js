// ============================================================
// NFL Fantasy — Mock Draft Simulator (no-login, casual/redraft)
// Data: Sleeper public API via /api/sleeper proxy. ADP = search_rank.
// Monte Carlo "% to return" estimates survival to your next pick.
// Entry: loadMockDraft() (called from nfl-mock route). State is session-only.
// ============================================================

let _mdPool = null;          // ranked player pool [{id,name,pos,team,rank}]
let _md = null;              // active draft state

const _MD_POS = ['QB', 'RB', 'WR', 'TE', 'K'];
const _MD_POS_COLOR = { QB: '#ef4444', RB: '#34d399', WR: '#60a5fa', TE: '#fbbf24', K: '#a78bfa' };
// Roster targets per team (starters + sensible bench caps)
const _MD_NEED = { QB: 2, RB: 6, WR: 6, TE: 2, K: 1 };

async function _mdFetchPool() {
    if (_mdPool) return _mdPool;
    const data = await (await fetch('/api/sleeper?path=/v1/players/nfl')).json();
    const fp = new Set(_MD_POS);
    _mdPool = Object.values(data)
        .filter(p => p && p.active && fp.has(p.position) && p.search_rank != null && p.search_rank < 100000)
        .map(p => ({ id: p.player_id, name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                     pos: p.position, team: p.team || 'FA', rank: p.search_rank, exp: p.years_exp }))
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    _mdPool.forEach((p, i) => { p.adp = i + 1; });  // dense ADP (search_rank has ties)
    return _mdPool;
}

// ── Entry / setup ─────────────────────────────────────────────
async function loadMockDraft() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = '';
    grid.style.cssText = '';
    grid.innerHTML = `<div class="md-loading"><div class="skeleton-line" style="height:40px;width:60%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Loading player pool…</p></div>`;
    try {
        await _mdFetchPool();
    } catch (e) {
        if (typeof Logger !== 'undefined') Logger.error('Mock draft pool failed', e, 'NFL');
        grid.innerHTML = `<div class="md-empty"><p>Couldn't load the player pool. Try again.</p><button class="md-btn" onclick="loadMockDraft()">Retry</button></div>`;
        return;
    }
    _renderMockSetup(grid);
}

function _renderMockSetup(grid) {
    grid.innerHTML = `
      <div class="md-wrap">
        <div class="md-setup">
          <h1 class="md-title">Mock Draft</h1>
          <p class="md-sub">Practice a snake draft against ADP-based AI opponents. No account, fully resettable.</p>
          <div class="md-setup-row">
            <label>Teams<select id="mdTeams">${[8,10,12,14].map(n=>`<option value="${n}" ${n===12?'selected':''}>${n}</option>`).join('')}</select></label>
            <label>Your pick<select id="mdSlot"></select></label>
            <label>Rounds<select id="mdRounds">${[10,12,14,15,16].map(n=>`<option value="${n}" ${n===15?'selected':''}>${n}</option>`).join('')}</select></label>
            <label>Scoring<select id="mdScoring"><option>PPR</option><option>Half-PPR</option><option>Standard</option></select></label>
          </div>
          <button class="md-btn md-btn--primary" id="mdStart">Start draft</button>
          <p class="md-note">${_mdPool.length} players · ADP from Sleeper</p>
        </div>
      </div>`;
    const teamsSel = grid.querySelector('#mdTeams');
    const slotSel  = grid.querySelector('#mdSlot');
    const fillSlots = () => {
        const n = +teamsSel.value;
        slotSel.innerHTML = Array.from({length:n}, (_,i)=>`<option value="${i+1}" ${i+1===Math.ceil(n/2)?'selected':''}>${i+1}</option>`).join('');
    };
    fillSlots();
    teamsSel.addEventListener('change', fillSlots);
    grid.querySelector('#mdStart').addEventListener('click', () => {
        _mdStart({ teams:+teamsSel.value, slot:+slotSel.value, rounds:+grid.querySelector('#mdRounds').value, scoring: grid.querySelector('#mdScoring').value });
    });
}

// ── Draft engine ──────────────────────────────────────────────
function _mdSnakeTeam(overall, teams) {
    const round = Math.floor(overall / teams);          // 0-indexed
    const inRound = overall % teams;
    return round % 2 === 0 ? inRound : teams - 1 - inRound;
}

function _mdStart(cfg) {
    _md = {
        ...cfg,
        userTeam: cfg.slot - 1,
        totalPicks: cfg.teams * cfg.rounds,
        overall: 0,
        available: _mdPool.slice(),
        picks: [],
        rosters: Array.from({ length: cfg.teams }, () => []),
    };
    _mdAdvance();
}

function _mdRosterNeedScore(roster, pos) {
    const have = roster.filter(p => p.pos === pos).length;
    const cap = _MD_NEED[pos] || 0;
    if (have >= cap) return -1;                 // full — avoid
    return cap - have;                          // more needed = higher
}

function _mdAiPick(teamIdx) {
    const roster = _md.rosters[teamIdx];
    // candidate pool: best ~8 available the team can still roster
    const eligible = _md.available.filter(p => _mdRosterNeedScore(roster, p.pos) >= 0);
    const pool = (eligible.length ? eligible : _md.available).slice(0, 8);
    // weight toward better ADP and roster need, with variance
    const scored = pool.map((p, i) => ({ p, w: (pool.length - i) + 1.5 * Math.max(0, _mdRosterNeedScore(roster, p.pos)) + Math.random() * 3 }));
    scored.sort((a, b) => b.w - a.w);
    return scored[0].p;
}

function _mdDraftPlayer(player) {
    const teamIdx = _mdSnakeTeam(_md.overall, _md.teams);
    _md.picks.push({ overall: _md.overall + 1, round: Math.floor(_md.overall / _md.teams) + 1, team: teamIdx, player });
    _md.rosters[teamIdx].push(player);
    _md.available = _md.available.filter(p => p.id !== player.id);
    _md.overall++;
}

// Auto-run AI picks until it's the user's turn or the draft ends.
function _mdAdvance() {
    while (_md.overall < _md.totalPicks) {
        const teamIdx = _mdSnakeTeam(_md.overall, _md.teams);
        if (teamIdx === _md.userTeam) { _mdRenderDraft(); return; }
        _mdDraftPlayer(_mdAiPick(teamIdx));
    }
    _mdRenderComplete();
}

function _mdUserDraft(playerId) {
    const p = _md.available.find(x => x.id === playerId);
    if (!p) return;
    _mdDraftPlayer(p);
    _mdAdvance();
}

// ── Monte Carlo: P(player still available at user's NEXT pick) ──
function _mdNextUserOverall() {
    for (let o = _md.overall + 1; o < _md.totalPicks; o++) {
        if (_mdSnakeTeam(o, _md.teams) === _md.userTeam) return o;
    }
    return -1;
}
function _mdSurvival(candidates, sims = 300) {
    const nextU = _mdNextUserOverall();
    if (nextU < 0) return {};
    const between = [];
    for (let o = _md.overall + 1; o < nextU; o++) between.push(_mdSnakeTeam(o, _md.teams));
    const counts = {}; candidates.forEach(c => counts[c.id] = 0);
    for (let s = 0; s < sims; s++) {
        const avail = _md.available.slice();
        const rost = _md.rosters.map(r => r.slice());
        for (const t of between) {
            const elig = avail.filter(p => _mdRosterNeedScore(rost[t], p.pos) >= 0);
            const pool = (elig.length ? elig : avail).slice(0, 8);
            if (!pool.length) break;
            const scored = pool.map((p, i) => ({ p, w: (pool.length - i) + Math.random() * 3 }));
            scored.sort((a, b) => b.w - a.w);
            const taken = scored[0].p;
            rost[t].push(taken);
            const idx = avail.findIndex(p => p.id === taken.id);
            if (idx >= 0) avail.splice(idx, 1);
        }
        const left = new Set(avail.map(p => p.id));
        candidates.forEach(c => { if (left.has(c.id)) counts[c.id]++; });
    }
    const out = {}; candidates.forEach(c => out[c.id] = Math.round(counts[c.id] / sims * 100));
    return out;
}

// ── Render: live draft ────────────────────────────────────────
function _mdRenderDraft() {
    const grid = document.getElementById('playersGrid');
    const round = Math.floor(_md.overall / _md.teams) + 1;
    const userRoster = _md.rosters[_md.userTeam];
    const top = _md.available.slice(0, 60);
    const surv = _mdSurvival(_md.available.slice(0, 14));

    grid.innerHTML = `
      <div class="md-wrap md-draft">
        <div class="md-draft-head">
          <div><span class="md-onclock">On the clock — YOU</span><span class="md-pickno">Round ${round} · Pick ${_md.overall + 1} of ${_md.totalPicks}</span></div>
          <button class="md-btn md-btn--ghost" onclick="loadMockDraft()">Reset</button>
        </div>
        <div class="md-draft-grid">
          <div class="md-available">
            <div class="md-avail-controls">
              <input id="mdSearch" class="md-search" placeholder="Search players…" autocomplete="off">
              <div class="md-pos-filters">${['ALL',..._MD_POS].map(p=>`<button class="md-pos-btn ${p==='ALL'?'md-pos-btn--on':''}" data-pos="${p}">${p}</button>`).join('')}</div>
            </div>
            <div class="md-list" id="mdList">${_mdListHtml(top, surv)}</div>
          </div>
          <aside class="md-roster">
            <h3>Your roster</h3>
            ${_MD_POS.map(pos => { const c = userRoster.filter(p=>p.pos===pos).length; return `<div class="md-need"><span style="color:${_MD_POS_COLOR[pos]}">${pos}</span><span>${c}</span></div>`; }).join('')}
            <div class="md-roster-list">${userRoster.map(p=>`<div class="md-rl-row"><span class="md-rl-pos" style="color:${_MD_POS_COLOR[p.pos]}">${p.pos}</span> ${_escFan(p.name)} <span class="md-rl-team">${p.team}</span></div>`).join('') || '<p class="md-note">No picks yet</p>'}</div>
          </aside>
        </div>
      </div>`;

    const list = grid.querySelector('#mdList');
    grid.querySelector('#mdSearch').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        const pos = grid.querySelector('.md-pos-btn--on')?.dataset.pos || 'ALL';
        const filtered = _md.available.filter(p => (pos==='ALL'||p.pos===pos) && p.name.toLowerCase().includes(q)).slice(0,60);
        list.innerHTML = _mdListHtml(filtered, surv);
    });
    grid.querySelectorAll('.md-pos-btn').forEach(b => b.addEventListener('click', () => {
        grid.querySelectorAll('.md-pos-btn').forEach(x=>x.classList.remove('md-pos-btn--on'));
        b.classList.add('md-pos-btn--on');
        const q = grid.querySelector('#mdSearch').value.toLowerCase();
        const filtered = _md.available.filter(p => (b.dataset.pos==='ALL'||p.pos===b.dataset.pos) && p.name.toLowerCase().includes(q)).slice(0,60);
        list.innerHTML = _mdListHtml(filtered, surv);
    }));
    list.addEventListener('click', e => {
        const row = e.target.closest('[data-pid]');
        if (row) _mdUserDraft(row.dataset.pid);
    });
}

function _mdListHtml(players, surv) {
    return players.map(p => {
        const s = surv[p.id];
        const sv = s != null ? `<span class="md-surv ${s<35?'md-surv--low':s>70?'md-surv--high':''}" title="Monte Carlo: chance still available at your next pick">${s}%</span>` : '';
        return `<button class="md-row" data-pid="${p.id}">
            <span class="md-row-pos" style="color:${_MD_POS_COLOR[p.pos]||'var(--text-muted)'}">${p.pos}</span>
            <span class="md-row-name">${_escFan(p.name)}</span>
            <span class="md-row-team">${p.team}</span>
            <span class="md-row-adp">ADP ${p.adp}</span>${sv}
        </button>`;
    }).join('') || '<p class="md-note" style="padding:1rem">No players match.</p>';
}

// ── Render: complete + grade ──────────────────────────────────
function _mdRenderComplete() {
    const grid = document.getElementById('playersGrid');
    const roster = _md.rosters[_md.userTeam];
    const userPicks = _md.picks.filter(pk => pk.team === _md.userTeam);
    // ADP value: positive = got players later than ADP (value), negative = reached
    const totalValue = userPicks.reduce((a, pk) => a + (pk.overall - pk.player.adp), 0);
    const avg = userPicks.length ? totalValue / userPicks.length : 0;
    const grade = avg > 8 ? 'A+' : avg > 4 ? 'A' : avg > 1 ? 'B+' : avg > -1 ? 'B' : avg > -4 ? 'C' : 'D';

    grid.innerHTML = `
      <div class="md-wrap md-complete">
        <h1 class="md-title">Draft complete</h1>
        <div class="md-grade-card">
          <div class="md-grade">${grade}</div>
          <div class="md-grade-meta"><strong>Your team</strong><span class="md-note">Avg value vs ADP: ${avg>=0?'+':''}${avg.toFixed(1)} picks ${avg>=0?'(value)':'(reaches)'}</span></div>
        </div>
        <div class="md-final-roster">
          ${_MD_POS.map(pos => { const ps = roster.filter(p=>p.pos===pos); return ps.length?`<div class="md-fr-group"><div class="md-fr-pos" style="color:${_MD_POS_COLOR[pos]}">${pos}</div>${ps.map(p=>`<div class="md-fr-row">${_escFan(p.name)} <span class="md-rl-team">${p.team}</span> <span class="md-row-adp">ADP ${p.adp}</span></div>`).join('')}</div>`:''; }).join('')}
        </div>
        <button class="md-btn md-btn--primary" onclick="loadMockDraft()">New draft</button>
      </div>`;
}

function _escFan(s) { return typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s); }

if (typeof window !== 'undefined') {
    window.loadMockDraft = loadMockDraft;
}

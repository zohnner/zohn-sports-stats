// ============================================================
// NFL Fantasy — Mock Draft Simulator (no-login, casual/redraft)
// Data: Sleeper public API via /api/sleeper proxy. ADP = search_rank.
// "Next level" (D-027): tiers + cliffs, a real-time Draft Assistant, format
// awareness (scoring + Superflex), a full draft board, and deep post-draft
// analysis. All client-side; Monte Carlo estimates survival to your next pick.
// Entry: loadMockDraft() (nfl-mock route). State is session-only.
// ============================================================

let _mdPool = null;
let _md = null;

const _MD_POS = ['QB', 'RB', 'WR', 'TE', 'K'];
const _MD_POS_COLOR = { QB: '#ef4444', RB: '#34d399', WR: '#60a5fa', TE: '#fbbf24', K: '#a78bfa' };
const _MD_FLEX = ['RB', 'WR', 'TE'];
// Bench depth caps (starters handled separately by the lineup model)
const _MD_NEED = { QB: 3, RB: 6, WR: 6, TE: 2, K: 1 };

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
    _mdAssignTiers(_mdPool);
    return _mdPool;
}

// ── Tiers: per-position, gap-based (Boris-Chen-style) ─────────
function _mdAssignTiers(pool) {
    const byPos = {};
    pool.forEach(p => { (byPos[p.pos] = byPos[p.pos] || []).push(p); });
    Object.values(byPos).forEach(list => {
        list.sort((a, b) => a.adp - b.adp);
        let tier = 1;
        list.forEach((p, i) => {
            if (i > 0) {
                const gap = p.adp - list[i - 1].adp;
                const thresh = 5 + Math.floor(list[i - 1].adp / 14); // bigger gaps are normal later
                if (gap > thresh) tier++;
            }
            p.tier = tier;
        });
    });
}

// ── Format-aware value (we only have ADP, so this is a documented heuristic) ──
function _mdPosMult(pos) {
    const s = _md ? _md.scoring : 'PPR';
    const sf = _md ? _md.superflex : false;
    let m = 1;
    if (sf && pos === 'QB') m *= 1.7;                       // Superflex spikes QB value
    if (pos === 'WR' || pos === 'TE') m *= (s === 'PPR' ? 1.08 : s === 'Half-PPR' ? 1.04 : 0.95);
    if (pos === 'RB') m *= (s === 'Standard' ? 1.06 : s === 'Half-PPR' ? 1.0 : 0.97);
    return m;
}
// Lower = better. Format-adjusted draft rank used by the AI + assistant (display ADP stays raw).
function _mdAdjRank(p) { return p.adp / _mdPosMult(p.pos); }

// ── Lineup-aware roster need ──────────────────────────────────
function _mdStartReq() {
    return { QB: _md.superflex ? 2 : 1, RB: 2, WR: 2, TE: 1, K: 1 };
}
function _mdNeedScore(roster, pos) {
    const have = c => roster.filter(p => p.pos === c).length;
    const start = _mdStartReq();
    if (have(pos) < (start[pos] || 0)) return 3;                 // unfilled starter
    const flexHave = _MD_FLEX.reduce((a, c) => a + Math.max(0, have(c) - (start[c] || 0)), 0);
    if (_MD_FLEX.includes(pos) && flexHave < 1) return 2;        // fills FLEX
    if (_md.superflex && pos === 'QB' && have('QB') < 2) return 2;
    if (have(pos) >= (_MD_NEED[pos] || 0)) return -1;            // bench full
    return 1;
}
function _mdTierLeft(p) {
    return _md.available.filter(a => a.pos === p.pos && a.tier === p.tier).length;
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
          <p class="md-sub">Snake draft vs ADP-based AI, with a live Draft Assistant, tiers, and a full board. No account, fully resettable.</p>
          <div class="md-setup-row">
            <label>Teams<select id="mdTeams">${[8,10,12,14].map(n=>`<option value="${n}" ${n===12?'selected':''}>${n}</option>`).join('')}</select></label>
            <label>Your pick<select id="mdSlot"></select></label>
            <label>Rounds<select id="mdRounds">${[10,12,14,15,16].map(n=>`<option value="${n}" ${n===15?'selected':''}>${n}</option>`).join('')}</select></label>
            <label>Scoring<select id="mdScoring"><option>PPR</option><option>Half-PPR</option><option>Standard</option></select></label>
            <label class="md-check"><input type="checkbox" id="mdSuperflex"> Superflex (2 QB)</label>
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
        _mdStart({
            teams:+teamsSel.value, slot:+slotSel.value, rounds:+grid.querySelector('#mdRounds').value,
            scoring: grid.querySelector('#mdScoring').value, superflex: grid.querySelector('#mdSuperflex').checked,
        });
    });
}

// ── Draft engine ──────────────────────────────────────────────
function _mdSnakeTeam(overall, teams) {
    const round = Math.floor(overall / teams);
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
        view: 'players',
    };
    _mdAdvance();
}

function _mdAiPick(teamIdx) {
    const roster = _md.rosters[teamIdx];
    const eligible = _md.available.filter(p => _mdNeedScore(roster, p.pos) >= 0);
    const pool = (eligible.length ? eligible : _md.available)
        .slice().sort((a, b) => _mdAdjRank(a) - _mdAdjRank(b)).slice(0, 8);
    const scored = pool.map((p, i) => ({ p, w: (pool.length - i) + 1.6 * Math.max(0, _mdNeedScore(roster, p.pos)) + Math.random() * 3 }));
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
            const elig = avail.filter(p => _mdNeedScore(rost[t], p.pos) >= 0);
            const pool = (elig.length ? elig : avail).slice().sort((a, b) => _mdAdjRank(a) - _mdAdjRank(b)).slice(0, 8);
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

// ── Draft Assistant: the recommended pick + why ───────────────
function _mdRecommend(surv) {
    const roster = _md.rosters[_md.userTeam];
    const cands = _md.available.slice().sort((a, b) => _mdAdjRank(a) - _mdAdjRank(b)).slice(0, 24);
    const scored = cands.map(p => {
        const need = _mdNeedScore(roster, p.pos);
        if (need < 0) return null;
        const valueVsPick = (_md.overall + 1) - p.adp;     // + = sliding past ADP (value)
        const sv = surv[p.id];
        const tierLeft = _mdTierLeft(p);
        let score = 0;
        score += -_mdAdjRank(p) * 0.04;                    // raw quality
        score += need * 4;                                 // roster need
        score += Math.max(0, valueVsPick) * 0.45;          // value falling to you
        if (sv != null) score += (100 - sv) * 0.045;       // scarcity (won't last)
        if (tierLeft <= 2) score += (3 - tierLeft) * 2.5;  // tier-cliff urgency
        return { p, score, need, sv, tierLeft, valueVsPick };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return scored[0] || null;
}

function _mdRecReason(rec) {
    if (!rec) return '';
    const r = [];
    const startReq = _mdStartReq();
    const have = _md.rosters[_md.userTeam].filter(p => p.pos === rec.p.pos).length;
    if (rec.need >= 3) r.push(`fills your ${rec.p.pos}${(startReq[rec.p.pos]||1) > 1 ? (have + 1) : ''} starter`);
    else if (rec.need === 2) r.push(`fills your FLEX`);
    if (rec.sv != null && rec.sv <= 45) r.push(`only ${rec.sv}% to return at your next pick`);
    if (rec.tierLeft <= 2) r.push(rec.tierLeft <= 1 ? `last in the ${rec.p.pos} tier` : `only ${rec.tierLeft} left in this ${rec.p.pos} tier`);
    if (rec.valueVsPick >= 6) r.push(`slipping ${rec.valueVsPick} spots past ADP`);
    if (!r.length) r.push(`best value on the board`);
    return r.slice(0, 3).join(' · ');
}

// ── Render: live draft ────────────────────────────────────────
function _mdRenderDraft() {
    const grid = document.getElementById('playersGrid');
    const round = Math.floor(_md.overall / _md.teams) + 1;
    const userRoster = _md.rosters[_md.userTeam];
    const top = _md.available.slice(0, 60);
    const surv = _mdSurvival(_md.available.slice(0, 16));
    const rec = _mdRecommend(surv);
    _md._recId = rec ? rec.p.id : null;

    const recBanner = rec ? `
        <div class="md-rec" data-pid="${rec.p.id}" role="button" tabindex="0">
            <div class="md-rec-tag">★ Recommended</div>
            <div class="md-rec-body">
                <span class="md-rec-pos" style="color:${_MD_POS_COLOR[rec.p.pos]}">${rec.p.pos}</span>
                <strong>${_escFan(rec.p.name)}</strong> <span class="md-rl-team">${rec.p.team}</span>
                <span class="md-rec-why">${_escFan(_mdRecReason(rec))}</span>
            </div>
            <button class="md-btn md-btn--primary md-rec-draft" data-pid="${rec.p.id}">Draft</button>
        </div>` : '';

    grid.innerHTML = `
      <div class="md-wrap md-draft">
        <div class="md-draft-head">
          <div><span class="md-onclock">On the clock — YOU</span><span class="md-pickno">Round ${round} · Pick ${_md.overall + 1} of ${_md.totalPicks}${_md.superflex?' · Superflex':''} · ${_escFan(_md.scoring)}</span></div>
          <div class="md-head-actions">
            <div class="md-viewtoggle">
              <button class="md-vt ${_md.view==='players'?'md-vt--on':''}" data-view="players">Players</button>
              <button class="md-vt ${_md.view==='board'?'md-vt--on':''}" data-view="board">Board</button>
            </div>
            <button class="md-btn md-btn--ghost" onclick="loadMockDraft()">Reset</button>
          </div>
        </div>
        ${recBanner}
        <div class="md-draft-grid">
          <div class="md-available">
            ${_md.view === 'board' ? _mdBoardHtml() : `
            <div class="md-avail-controls">
              <input id="mdSearch" class="md-search" placeholder="Search players…" autocomplete="off">
              <div class="md-pos-filters">${['ALL',..._MD_POS].map(p=>`<button class="md-pos-btn ${p==='ALL'?'md-pos-btn--on':''}" data-pos="${p}">${p}</button>`).join('')}</div>
            </div>
            <div class="md-list" id="mdList">${_mdListHtml(top, surv)}</div>`}
          </div>
          <aside class="md-roster">
            <h3>Your roster</h3>
            ${_MD_POS.map(pos => { const c = userRoster.filter(p=>p.pos===pos).length; return `<div class="md-need"><span style="color:${_MD_POS_COLOR[pos]}">${pos}</span><span>${c}</span></div>`; }).join('')}
            <div class="md-roster-list">${userRoster.map(p=>`<div class="md-rl-row"><span class="md-rl-pos" style="color:${_MD_POS_COLOR[p.pos]}">${p.pos}</span> ${_escFan(p.name)} <span class="md-rl-team">${p.team}</span></div>`).join('') || '<p class="md-note">No picks yet</p>'}</div>
          </aside>
        </div>
      </div>`;

    // view toggle
    grid.querySelectorAll('.md-vt').forEach(b => b.addEventListener('click', () => { _md.view = b.dataset.view; _mdRenderDraft(); }));
    // recommended banner → draft
    grid.querySelectorAll('.md-rec, .md-rec-draft').forEach(el => el.addEventListener('click', e => {
        e.stopPropagation(); const pid = (e.currentTarget.dataset.pid) || (rec && rec.p.id); if (pid) _mdUserDraft(pid);
    }));

    if (_md.view !== 'board') {
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
        list.addEventListener('click', e => { const row = e.target.closest('[data-pid]'); if (row) _mdUserDraft(row.dataset.pid); });
    }
}

function _mdListHtml(players, surv) {
    return players.map(p => {
        const s = surv[p.id];
        const sv = s != null ? `<span class="md-surv ${s<35?'md-surv--low':s>70?'md-surv--high':''}" title="Monte Carlo: chance still available at your next pick">${s}%</span>` : '';
        const tierLeft = _mdTierLeft(p);
        const cliff = tierLeft <= 2 ? `<span class="md-cliff" title="Players left in this position tier">T${p.tier} · ${tierLeft} left</span>` : `<span class="md-tier">T${p.tier}</span>`;
        const isRec = p.id === _md._recId ? ' md-row--rec' : '';
        return `<button class="md-row${isRec}" data-pid="${p.id}">
            <span class="md-row-pos" style="color:${_MD_POS_COLOR[p.pos]||'var(--text-muted)'}">${p.pos}</span>
            <span class="md-row-name">${p.id===_md._recId?'★ ':''}${_escFan(p.name)}</span>
            <span class="md-row-team">${p.team}</span>
            ${cliff}
            <span class="md-row-adp">ADP ${p.adp}</span>${sv}
        </button>`;
    }).join('') || '<p class="md-note" style="padding:1rem">No players match.</p>';
}

// ── Full draft board (all teams × rounds, snake) ──────────────
function _mdBoardHtml() {
    const teams = _md.teams, rounds = _md.rounds;
    const cell = {};
    _md.picks.forEach(pk => { cell[`${pk.round}-${pk.team}`] = pk.player; });
    const head = `<div class="md-bd-row md-bd-head"><div class="md-bd-rd">R</div>${
        Array.from({length:teams},(_,t)=>`<div class="md-bd-cell md-bd-th ${t===_md.userTeam?'md-bd-me':''}">${t===_md.userTeam?'You':'T'+(t+1)}</div>`).join('')}</div>`;
    const rows = Array.from({length:rounds},(_,r)=>{
        const rd = r+1;
        const cells = Array.from({length:teams},(_,t)=>{
            const p = cell[`${rd}-${t}`];
            const onClock = (p == null && _mdSnakeTeam((rd-1)*teams + (rd%2===1?t:teams-1-t), teams) === t); // best-effort
            if (!p) return `<div class="md-bd-cell md-bd-empty ${t===_md.userTeam?'md-bd-me':''}"></div>`;
            return `<div class="md-bd-cell ${t===_md.userTeam?'md-bd-me':''}" style="border-left:3px solid ${_MD_POS_COLOR[p.pos]||'var(--border-mid)'}">
                <span class="md-bd-pos" style="color:${_MD_POS_COLOR[p.pos]}">${p.pos}</span><span class="md-bd-name">${_escFan(p.name.split(' ').slice(-1)[0])}</span></div>`;
        }).join('');
        return `<div class="md-bd-row"><div class="md-bd-rd">${rd}</div>${cells}</div>`;
    }).join('');
    return `<div class="md-board"><div class="md-board-scroll">${head}${rows}</div></div>`;
}

// ── Render: complete + deep analysis ──────────────────────────
function _mdTeamValue(roster) {
    // crude projected value: sum of (poolSize - adjRank) so better players score higher
    return roster.reduce((a, p) => a + Math.max(0, 300 - _mdAdjRank(p)), 0);
}
function _mdRenderComplete() {
    const grid = document.getElementById('playersGrid');
    const roster = _md.rosters[_md.userTeam];
    const userPicks = _md.picks.filter(pk => pk.team === _md.userTeam);
    const totalValue = userPicks.reduce((a, pk) => a + (pk.overall - pk.player.adp), 0);
    const avg = userPicks.length ? totalValue / userPicks.length : 0;
    const grade = avg > 8 ? 'A+' : avg > 4 ? 'A' : avg > 1 ? 'B+' : avg > -1 ? 'B' : avg > -4 ? 'C' : 'D';

    // projected finish: rank all teams by total roster value
    const teamVals = _md.rosters.map((r, i) => ({ i, v: _mdTeamValue(r) })).sort((a, b) => b.v - a.v);
    const finish = teamVals.findIndex(t => t.i === _md.userTeam) + 1;
    const ord = n => (n%10===1&&n%100!==11)?'st':(n%10===2&&n%100!==12)?'nd':(n%10===3&&n%100!==13)?'rd':'th';

    // positional rank vs league
    const posRank = {};
    _MD_POS.forEach(pos => {
        const vals = _md.rosters.map((r, i) => ({ i, v: r.filter(p=>p.pos===pos).reduce((a,p)=>a+Math.max(0,300-_mdAdjRank(p)),0) })).sort((a,b)=>b.v-a.v);
        posRank[pos] = vals.findIndex(t => t.i === _md.userTeam) + 1;
    });

    // best value / biggest reach
    const sortedByVal = userPicks.slice().sort((a,b)=>(b.overall-b.player.adp)-(a.overall-a.player.adp));
    const bestVal = sortedByVal[0], reach = sortedByVal[sortedByVal.length-1];

    // starter check
    const start = _mdStartReq();
    const unfilled = _MD_POS.filter(pos => roster.filter(p=>p.pos===pos).length < (start[pos]||0));

    grid.innerHTML = `
      <div class="md-wrap md-complete">
        <h1 class="md-title">Draft complete</h1>
        <div class="md-grade-card">
          <div class="md-grade">${grade}</div>
          <div class="md-grade-meta">
            <strong>Projected finish: ${finish}${ord(finish)} of ${_md.teams}</strong>
            <span class="md-note">Avg value vs ADP: ${avg>=0?'+':''}${avg.toFixed(1)} picks ${avg>=0?'(value)':'(reaches)'}</span>
          </div>
        </div>

        <div class="md-analysis">
          <div class="md-an-card">
            <h3>Positional strength <span class="md-note">(rank in league)</span></h3>
            <div class="md-an-pos">${_MD_POS.map(pos=>`<div class="md-an-prow"><span style="color:${_MD_POS_COLOR[pos]}">${pos}</span><span class="md-an-rank">${posRank[pos]}${ord(posRank[pos])}</span></div>`).join('')}</div>
          </div>
          <div class="md-an-card">
            <h3>Draft highlights</h3>
            ${bestVal?`<p class="md-an-line"><span class="md-an-tag md-an-tag--good">Best value</span> ${_escFan(bestVal.player.name)} — pick ${bestVal.overall} vs ADP ${bestVal.player.adp}</p>`:''}
            ${reach && reach!==bestVal?`<p class="md-an-line"><span class="md-an-tag md-an-tag--bad">Biggest reach</span> ${_escFan(reach.player.name)} — pick ${reach.overall} vs ADP ${reach.player.adp}</p>`:''}
            <p class="md-an-line">${unfilled.length?`<span class="md-an-tag md-an-tag--bad">Lineup gap</span> Missing starter${unfilled.length>1?'s':''}: ${unfilled.join(', ')}`:`<span class="md-an-tag md-an-tag--good">Lineup</span> All starters filled`}</p>
          </div>
        </div>

        <div class="md-final-roster">
          ${_MD_POS.map(pos => { const ps = roster.filter(p=>p.pos===pos); return ps.length?`<div class="md-fr-group"><div class="md-fr-pos" style="color:${_MD_POS_COLOR[pos]}">${pos}</div>${ps.map(p=>`<div class="md-fr-row">${_escFan(p.name)} <span class="md-rl-team">${p.team}</span> <span class="md-row-adp">ADP ${p.adp}</span></div>`).join('')}</div>`:''; }).join('')}
        </div>
        <div class="md-head-actions" style="justify-content:center">
          <button class="md-btn md-btn--ghost" id="mdViewBoard">View full board</button>
          <button class="md-btn md-btn--primary" onclick="loadMockDraft()">New draft</button>
        </div>
        <div id="mdCompleteBoard"></div>
      </div>`;
    const vb = grid.querySelector('#mdViewBoard');
    if (vb) vb.addEventListener('click', () => {
        const host = grid.querySelector('#mdCompleteBoard');
        host.innerHTML = host.innerHTML ? '' : _mdBoardHtml();
    });
}

function _escFan(s) { return typeof _escHtml === 'function' ? _escHtml(s) : String(s == null ? '' : s); }

if (typeof window !== 'undefined') {
    window.loadMockDraft = loadMockDraft;
}

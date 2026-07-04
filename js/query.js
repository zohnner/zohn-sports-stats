// ============================================================
// Ask Bar v1 (D-039 Track 1) — natural-language stat queries.
// Deterministic grammar, zero model, zero runtime cost: parse the
// query against entity tables, answer from AppState.mlbLeaderSplits.
// Lives inside the ⌘K overlay as an ADDITIVE section — search.js
// focus trap / keyboard nav untouched (answer rows reuse the
// .search-result-item + data-idx contract, pushed first so their
// data-idx values align with _searchFlatItems order).
// MLB only in v1; the parser is sport-agnostic — NFL is entity tables.
// ============================================================

// ── Entity tables ─────────────────────────────────────────────
// Colloquial stat aliases → MLB_LEADER_CATS key. The cats array itself
// provides label/unit/key matches at runtime; this table adds speech.
const _QA_STAT_ALIASES = {
    'hr': 'homeRuns', 'homers': 'homeRuns', 'home runs': 'homeRuns', 'homeruns': 'homeRuns',
    'average': 'avg', 'batting average': 'avg', 'ba': 'avg',
    'rbi': 'rbi', 'rbis': 'rbi', 'runs batted in': 'rbi',
    'steals': 'stolenBases', 'stolen bases': 'stolenBases', 'sb': 'stolenBases',
    'walks': 'baseOnBalls', 'bb': 'baseOnBalls',
    'runs': 'runs', 'hits': 'hits', 'doubles': 'doubles', 'triples': 'triples',
    'strikeouts': 'strikeOuts', 'ks': 'strikeOuts', 'k': 'strikeOuts', 'punchouts': 'strikeOuts',
    'wins': 'wins', 'saves': 'saves', 'holds': 'holds',
    'era': 'era', 'whip': 'whip', 'fip': 'fip', 'ops': 'ops', 'obp': 'obp', 'slg': 'slg',
    'slugging': 'slg', 'on base': 'obp', 'on-base': 'obp', 'iso': 'iso', 'babip': 'babip',
    'woba': 'woba',
    'k rate': 'kPct', 'k%': 'kPct', 'walk rate': 'bbPct', 'bb%': 'bbPct',
    'innings': 'inningsPitched', 'ip': 'inningsPitched',
};
// Ambiguous aliases that exist in both groups — preferred group when the
// query gives no other hint (announcers mean pitchers by "strikeouts").
const _QA_GROUP_PREF = { strikeOuts: 'pitching', baseOnBalls: 'hitting', runs: 'hitting', hits: 'hitting' };

const _QA_TEAMS = {
    'diamondbacks': 'ARI', 'dbacks': 'ARI', 'd-backs': 'ARI', 'arizona': 'ARI',
    'braves': 'ATL', 'atlanta': 'ATL', 'orioles': 'BAL', 'baltimore': 'BAL',
    'red sox': 'BOS', 'boston': 'BOS', 'cubs': 'CHC', 'white sox': 'CWS',
    'reds': 'CIN', 'cincinnati': 'CIN', 'guardians': 'CLE', 'cleveland': 'CLE',
    'rockies': 'COL', 'colorado': 'COL', 'tigers': 'DET', 'detroit': 'DET',
    'astros': 'HOU', 'houston': 'HOU', 'royals': 'KC', 'angels': 'LAA',
    'dodgers': 'LAD', 'marlins': 'MIA', 'miami': 'MIA', 'brewers': 'MIL',
    'milwaukee': 'MIL', 'twins': 'MIN', 'minnesota': 'MIN', 'mets': 'NYM',
    'yankees': 'NYY', 'athletics': 'ATH', 'as': 'ATH', "a's": 'ATH',
    'phillies': 'PHI', 'philadelphia': 'PHI', 'pirates': 'PIT', 'pittsburgh': 'PIT',
    'padres': 'SD', 'san diego': 'SD', 'giants': 'SF', 'mariners': 'SEA',
    'seattle': 'SEA', 'cardinals': 'STL', 'cards': 'STL', 'rays': 'TB',
    'rangers': 'TEX', 'texas': 'TEX', 'blue jays': 'TOR', 'jays': 'TOR',
    'toronto': 'TOR', 'nationals': 'WSH', 'nats': 'WSH', 'washington': 'WSH',
};

const _QA_POS = {
    'c': 'c', 'catcher': 'c', 'catchers': 'c',
    '1b': '1b', 'first base': '1b', 'first basemen': '1b', 'first baseman': '1b',
    '2b': '2b', 'second base': '2b', 'second basemen': '2b', 'second baseman': '2b',
    '3b': '3b', 'third base': '3b', 'third basemen': '3b', 'third baseman': '3b',
    'ss': 'ss', 'shortstop': 'ss', 'shortstops': 'ss',
    'of': 'of', 'outfield': 'of', 'outfielders': 'of', 'outfielder': 'of',
    'dh': 'dh', 'sp': 'sp', 'starters': 'sp', 'starter': 'sp', 'starting pitchers': 'sp',
    'rp': 'rp', 'relievers': 'rp', 'reliever': 'rp', 'cl': 'cl', 'closers': 'cl', 'closer': 'cl',
};
const _QA_PIT_POS = new Set(['sp', 'rp', 'cl']);

const _QA_NOISE = new Set(['leaders', 'leader', 'top', 'best', 'most', 'in', 'the', 'mlb',
    'this', 'season', 'of', 'for', 'players', 'player', 'show', 'me', 'who', 'whos', 'list',
    'by', 'with', 'league', 'baseball']);

const QA_EXAMPLES = ['hr leaders', 'dodgers ops', 'era leaders min 50 ip'];

// ── Parser ────────────────────────────────────────────────────
// Longest-phrase-first matching over the token array for each entity
// class, in a fixed order (stat → team → position → group hint), so
// "batting average" wins before "batting" could read as a group word.
function _qaCats() {
    return (typeof MLB_LEADER_CATS !== 'undefined') ? MLB_LEADER_CATS : [];
}
function _qaMatchPhrase(tokens, table) {
    for (let len = Math.min(3, tokens.length); len >= 1; len--) {
        for (let i = 0; i + len <= tokens.length; i++) {
            const phrase = tokens.slice(i, i + len).join(' ');
            if (table[phrase] !== undefined) {
                return { value: table[phrase], rest: tokens.slice(0, i).concat(tokens.slice(i + len)) };
            }
        }
    }
    return null;
}
function _qaStatTable() {
    const t = {};
    _qaCats().forEach(c => {
        t[c.label.toLowerCase()] = c.key;
        t[c.unit.toLowerCase()]  = c.key;
        t[c.key.toLowerCase()]   = c.key;
    });
    Object.assign(t, _QA_STAT_ALIASES);
    return t;
}

function parseStatQuery(text) {
    const cats = _qaCats();
    if (!cats.length || !text) return null;
    let q = String(text).toLowerCase().replace(/[.,?!]/g, ' ').replace(/\s+/g, ' ').trim();

    // qualifier: "min 50 ip" / "minimum 100 pa"
    let qual = null;
    q = q.replace(/\bmin(?:imum)?\s+(\d+)\s*(ip|pa)\b/, (_, n, type) => {
        qual = { type, n: parseInt(n, 10) };
        return ' ';
    });

    let tokens = q.split(' ').filter(Boolean);

    const statM = _qaMatchPhrase(tokens, _qaStatTable());
    if (!statM) return null;
    tokens = statM.rest;

    const teamM = _qaMatchPhrase(tokens, _QA_TEAMS);
    if (teamM) tokens = teamM.rest;

    const posM = _qaMatchPhrase(tokens, _QA_POS);
    if (posM) tokens = posM.rest;

    let groupHint = null;
    tokens = tokens.filter(t => {
        if (t === 'pitching' || t === 'pitchers' || t === 'pitcher') { groupHint = 'pitching'; return false; }
        if (t === 'hitting' || t === 'hitters' || t === 'hitter' || t === 'batters' || t === 'batting') { groupHint = 'hitting'; return false; }
        return !_QA_NOISE.has(t);
    });

    // Resolve the cat: the same key can exist in both groups.
    const key = statM.value;
    const candidates = cats.filter(c => c.key === key);
    if (!candidates.length) return null;
    const posGroup = posM ? (_QA_PIT_POS.has(posM.value) ? 'pitching' : 'hitting') : null;
    const want = groupHint || posGroup || _QA_GROUP_PREF[key] || candidates[0].group;
    const cat = candidates.find(c => c.group === want) || candidates[0];

    return {
        cat, group: cat.group,
        team: teamM ? teamM.value : null,
        pos: posM ? posM.value : null,
        qual,
        leftover: tokens,          // unmatched words — panel still renders; name search continues below
    };
}

// ── Engine ────────────────────────────────────────────────────
function runStatQuery(p, limit = 10) {
    const splits = (typeof AppState !== 'undefined' && AppState.mlbLeaderSplits) ? AppState.mlbLeaderSplits[p.group] : null;
    if (!splits || !splits.length) return null;   // pool not warmed yet — panel skipped

    const isRate = (p.cat.decimals || 0) > 0;
    // Default qualification for rate stats mirrors the percentile-engine
    // minimums so "era leaders" doesn't crown a 2-inning September call-up.
    const qual = p.qual || (isRate ? (p.group === 'hitting' ? { type: 'pa', n: 80 } : { type: 'ip', n: 15 }) : null);
    const ipNum = s => (typeof _mlbIpToNum === 'function') ? _mlbIpToNum(s) : parseFloat(s) || 0;

    const rows = splits.filter(s => {
        const st = s.stat || {};
        if (p.team && (s.team?.abbreviation || '').toUpperCase() !== p.team) return false;
        if (p.pos) {
            if (_QA_PIT_POS.has(p.pos)) {
                const gs = parseFloat(st.gamesStarted) || 0;
                const g  = parseFloat(st.gamesPlayed) || parseFloat(st.gamesPitched) || 0;
                const sv = parseFloat(st.saves) || 0;
                const role = gs >= Math.max(3, g * 0.5) ? 'sp' : (sv >= 3 ? 'cl' : 'rp');
                if (role !== p.pos) return false;
            } else if (typeof _mlbPosMatch === 'function') {
                if (!_mlbPosMatch((s.position?.abbreviation || '').toLowerCase(), p.pos)) return false;
            }
        }
        if (qual) {
            if (qual.type === 'pa' && (parseFloat(st.plateAppearances) || 0) < qual.n) return false;
            if (qual.type === 'ip' && ipNum(st.inningsPitched) < qual.n) return false;
        }
        return !isNaN(parseFloat(st[p.cat.key]));
    });

    rows.sort((a, b) => {
        const av = parseFloat(a.stat[p.cat.key]), bv = parseFloat(b.stat[p.cat.key]);
        return p.cat.desc === false ? av - bv : bv - av;
    });
    return { rows: rows.slice(0, limit), qual, defaultQual: !p.qual && !!qual };
}

function _qaFmtVal(v, cat) {
    const n = parseFloat(v);
    if (isNaN(n)) return '—';
    const d = cat.decimals || 0;
    const s = n.toFixed(d);
    return d === 3 ? s.replace(/^0\./, '.') : s;
}

// ── Panel builder — called by search.js _renderResults ────────
// Contract: qaBuild is invoked BEFORE any group items are pushed, so the
// data-idx values written here (0..items.length-1) align with the answer
// items' positions in _searchFlatItems.
function qaBuild(qText) {
    if (typeof AppState === 'undefined' || AppState.currentSport !== 'mlb') return null;
    const p = parseStatQuery(qText);
    if (!p) return null;
    const res = runStatQuery(p);
    const esc = (typeof _escHtml === 'function') ? _escHtml : (s => String(s));

    // Understood-as echo: the parse made visible (provenance pattern).
    const chips = [
        `<span class="qa-chip" style="border-color:${p.cat.color}88;color:${p.cat.color}">${esc(p.cat.label)}</span>`,
        p.team ? `<span class="qa-chip">${esc(p.team)}</span>` : '',
        p.pos ? `<span class="qa-chip">${esc(p.pos.toUpperCase())}</span>` : '',
        res && res.qual ? `<span class="qa-chip qa-chip--muted">min ${res.qual.n} ${res.qual.type.toUpperCase()}${res.defaultQual ? ' (default)' : ''}</span>` : '',
    ].filter(Boolean).join('');

    const items = [];
    let rowsHtml = '';
    if (res && res.rows.length) {
        try { localStorage.setItem('zs_qa_taught', '1'); } catch (_) {}
        res.rows.forEach((s, i) => {
            const pid = s.player?.id, name = s.player?.fullName || '—';
            const abbr = s.team?.abbreviation || '';
            items.push({ action: () => { closeGlobalSearch(); showMLBPlayerDetail(pid, p.group); } });
            rowsHtml += `<button class="search-result-item" data-idx="${i}">
                <span class="qa-rank">${i + 1}</span>
                <span class="search-result-name">${esc(name)}</span>
                <span class="search-result-sub">${esc(abbr)}</span>
                <span class="qa-val" style="color:${p.cat.color}">${_qaFmtVal(s.stat[p.cat.key], p.cat)}</span>
            </button>`;
        });
        items.push({ action: () => { closeGlobalSearch(); navigateTo('mlb-leaders'); } });
        rowsHtml += `<button class="search-result-item qa-more" data-idx="${items.length - 1}">Full leaderboards →</button>`;
    } else if (res) {
        const hint = res.qual ? ` — try removing "min ${res.qual.n} ${res.qual.type.toUpperCase()}"` : '';
        rowsHtml = `<div class="search-empty">No qualified players match${esc(hint)}</div>`;
    } else {
        rowsHtml = `<div class="qa-loading"><div class="skeleton-line" style="height:34px;margin-bottom:4px"></div><div class="skeleton-line" style="height:34px"></div></div>`;
    }

    // Leftover tokens (e.g. "judge" in "judge hr") are handed back so the
    // name search below the panel runs on THEM, not the full query — that's
    // how "judge hr" shows both the HR board and Aaron Judge.
    const html = `<div class="search-group qa-panel" role="region" aria-label="Query answer">
        <div class="search-group-label qa-echo" aria-live="polite">Understood as: ${chips}</div>
        ${rowsHtml}
    </div>`;
    return { html, items, leftover: (p.leftover || []).join(' ') };
}

// Teach chips for the empty overlay — until the first successful parse.
function qaTeachHtml() {
    try { if (localStorage.getItem('zs_qa_taught')) return ''; } catch (_) {}
    if (typeof AppState !== 'undefined' && AppState.currentSport !== 'mlb') return '';
    const chips = QA_EXAMPLES.map(e =>
        `<button class="qa-chip qa-chip--teach" onclick="_qaFillExample('${e}')">${e}</button>`).join('');
    return `<div class="qa-teach"><span class="qa-teach-label">Try asking:</span>${chips}</div>`;
}
function _qaFillExample(text) {
    const input = document.getElementById('searchModalInput');
    if (!input) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
}

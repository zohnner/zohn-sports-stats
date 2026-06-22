// ============================================================
// NFL Standings (D-029) — current + every season back to 2002.
//
// These functions intentionally REDEFINE loadNFLStandings / displayNFLStandings /
// fetchNFLStandings from nfl.js. Those read site.api.espn.com/.../standings, which
// ESPN turned into a dead stub (returns only a fullViewLink), so the old page only
// ever showed the offseason placeholder. This file is loaded after nfl.js, so its
// declarations win in global scope, and it sources the working season-aware feed
// via /api/nflstandings. Synergy with MLB standings; NFL-specific seeding + bracket.
// ============================================================

const _NSTD_MIN_SEASON = 2002;
const _nstd = { season: null, view: 'div', bySeason: {} };

// Super Bowl winners & runners-up by SEASON (game played the following Feb),
// in modern abbreviations. 2002 = first year of the current 32-team alignment.
const _NSTD_SB = {
    2002: ['TB', 'LV'],  2003: ['NE', 'CAR'], 2004: ['NE', 'PHI'], 2005: ['PIT', 'SEA'],
    2006: ['IND', 'CHI'], 2007: ['NYG', 'NE'], 2008: ['PIT', 'ARI'], 2009: ['NO', 'IND'],
    2010: ['GB', 'PIT'], 2011: ['NYG', 'NE'], 2012: ['BAL', 'SF'],  2013: ['SEA', 'DEN'],
    2014: ['NE', 'SEA'], 2015: ['DEN', 'CAR'], 2016: ['NE', 'ATL'], 2017: ['PHI', 'NE'],
    2018: ['NE', 'LAR'], 2019: ['KC', 'SF'],  2020: ['TB', 'KC'],  2021: ['LAR', 'CIN'],
    2022: ['KC', 'PHI'], 2023: ['KC', 'SF'],  2024: ['PHI', 'KC'], 2025: ['SEA', 'NE'],
};
const _NSTD_CANON = { OAK: 'LV', SD: 'LAC', STL: 'LAR', LA: 'LAR', WSH: 'WAS', ARZ: 'ARI', JAC: 'JAX' };
const _nstdCanon = (a) => _NSTD_CANON[(a || '').toUpperCase()] || (a || '').toUpperCase();

function _nstdSeasonDefault() {
    return (typeof NFL_STATS_SEASON !== 'undefined') ? NFL_STATS_SEASON
        : ((new Date().getMonth() + 1 >= 9) ? new Date().getFullYear() : new Date().getFullYear() - 1);
}
const _nstdCut = (season) => season >= 2020 ? 7 : 6;          // playoff teams per conference
const _nstdByes = (season) => season >= 2020 ? 1 : 2;         // first-round byes per conference

const _nstdStat = (stats, ...names) => { for (const n of names) if (stats[n]) return stats[n]; return null; };

async function fetchNFLStandings(season) {
    season = season || _nstdSeasonDefault();
    const res = await fetch(`/api/nflstandings?season=${season}`);
    if (!res.ok) throw new Error(`standings ${res.status}`);
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.reason || 'standings unavailable');
    const rows = [];
    for (const conf of (data.children || [])) {
        const confAbbr = conf.abbreviation || conf.name;
        for (const div of (conf.children || [])) {
            const divName = div.name || div.abbreviation;
            for (const entry of (div.standings?.entries || [])) {
                const team = entry.team;
                const s = {};
                (entry.stats || []).forEach(x => { s[x.name] = x; });
                const num = (st, d = 0) => st ? (st.value != null ? st.value : parseFloat(st.displayValue)) : d;
                const dv = (st) => st ? (st.displayValue || '') : '';
                rows.push({
                    conference: confAbbr,
                    division: divName,
                    id: team.id,
                    abbr: team.abbreviation,
                    name: team.displayName,
                    shortName: team.shortDisplayName || team.name,
                    logo: team.logos?.[0]?.href || (typeof getNFLTeamLogoUrl === 'function' ? getNFLTeamLogoUrl(team.abbreviation) : ''),
                    wins: Math.round(num(_nstdStat(s, 'wins'))),
                    losses: Math.round(num(_nstdStat(s, 'losses'))),
                    ties: Math.round(num(_nstdStat(s, 'ties'))),
                    pct: num(_nstdStat(s, 'winPercent')),
                    pf: Math.round(num(_nstdStat(s, 'pointsFor'))),
                    pa: Math.round(num(_nstdStat(s, 'pointsAgainst'))),
                    diff: Math.round(num(_nstdStat(s, 'pointDifferential', 'differential'))),
                    homeRec: dv(_nstdStat(s, 'home', 'Home')),
                    awayRec: dv(_nstdStat(s, 'road', 'Road', 'away')),
                    divRec: dv(_nstdStat(s, 'vsDiv', 'divisionRecord')),
                    confRec: dv(_nstdStat(s, 'vsConf', 'conferenceRecord')),
                    streak: dv(_nstdStat(s, 'streak')),
                    espnSeed: Math.round(num(_nstdStat(s, 'playoffSeed', 'rank'))),
                });
            }
        }
    }
    return rows;
}

// Assign 1..N conference seeds. Trust ESPN's playoffSeed when it's a clean 1..16
// permutation; otherwise apply the NFL rule (4 division winners seed above all
// wildcards), tie-broken by win%, then point differential.
function _nstdSeed(confTeams) {
    const cmp = (a, b) => b.pct - a.pct || b.diff - a.diff || b.wins - a.wins;
    const seeds = confTeams.map(t => t.espnSeed).filter(n => n >= 1 && n <= 16);
    const clean = seeds.length === confTeams.length && new Set(seeds).size === confTeams.length;
    if (clean) {
        confTeams.forEach(t => { t.seed = t.espnSeed; });
    } else {
        const byDiv = {};
        confTeams.forEach(t => { (byDiv[t.division] || (byDiv[t.division] = [])).push(t); });
        const winners = Object.values(byDiv).map(d => d.slice().sort(cmp)[0]);
        winners.sort(cmp).forEach((t, i) => { t.seed = i + 1; });
        const rest = confTeams.filter(t => !winners.includes(t)).sort(cmp);
        rest.forEach((t, i) => { t.seed = winners.length + i + 1; });
    }
    return confTeams.slice().sort((a, b) => a.seed - b.seed);
}

async function loadNFLStandings() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = ''; grid.style.cssText = '';
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('nfl-standings', null);
    if (!_nstd.season) _nstd.season = _nstdSeasonDefault();
    grid.innerHTML = `<div class="nstd-loading"><div class="skeleton-line" style="height:40px;width:55%;margin:3rem auto"></div><p style="text-align:center;color:var(--text-muted)">Loading ${_nstd.season} standings…</p></div>`;
    try {
        if (!_nstd.bySeason[_nstd.season]) _nstd.bySeason[_nstd.season] = await fetchNFLStandings(_nstd.season);
        displayNFLStandings(_nstd.bySeason[_nstd.season], _nstd.season);
    } catch (err) {
        if (window.ErrorHandler && ErrorHandler.handle) ErrorHandler.handle(grid, err, loadNFLStandings, { tag: 'NFL', title: 'Failed to Load Standings' });
        else grid.innerHTML = `<div class="nstd-empty"><p>Couldn't load ${_nstd.season} standings.</p><button class="md-btn" onclick="loadNFLStandings()">Retry</button></div>`;
        if (window.Logger) Logger.warn('nfl standings failed', err, 'NFL');
    }
}

function _nstdDiffBar(diff, maxAbs) {
    const pct = maxAbs ? Math.min(100, Math.round(Math.abs(diff) / maxAbs * 100)) : 0;
    const pos = diff >= 0;
    const color = pos ? 'var(--color-win)' : 'var(--color-loss)';
    const side = pos ? 'left:50%' : `right:50%`;
    return `<span class="nstd-bar"><span class="nstd-bar__fill" style="${side};width:${pct / 2}%;background:${color}"></span></span>`;
}

function _nstdBadges(t, season) {
    const cut = _nstdCut(season);
    const sb = _NSTD_SB[season];
    const champ = sb && _nstdCanon(t.abbr) === _nstdCanon(sb[0]);
    const runner = sb && _nstdCanon(t.abbr) === _nstdCanon(sb[1]);
    let b = '';
    if (champ) b += `<span class="nstd-badge nstd-badge--champ" title="Super Bowl champion">🏆</span>`;
    else if (runner) b += `<span class="nstd-badge nstd-badge--runner" title="Super Bowl runner-up">🥈</span>`;
    if (t.seed <= 4) b += `<span class="nstd-badge nstd-badge--div" title="Division winner — seed ${t.seed}">${t.seed}</span>`;
    else if (t.seed <= cut) b += `<span class="nstd-badge nstd-badge--wc" title="Wild card — seed ${t.seed}">${t.seed}</span>`;
    return b;
}

function displayNFLStandings(rows, season) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = ''; grid.style.cssText = '';
    if (!rows || !rows.length) {
        grid.innerHTML = `<div class="nstd-empty"><p>No standings found for ${season}.</p></div>`;
        return;
    }
    // seed each conference
    const confs = {};
    rows.forEach(t => { (confs[t.conference] || (confs[t.conference] = [])).push(t); });
    Object.values(confs).forEach(_nstdSeed);
    const maxAbs = Math.max(1, ...rows.map(t => Math.abs(t.diff)));

    const seasonOpts = (() => {
        let o = '';
        for (let y = _nstdSeasonDefault(); y >= _NSTD_MIN_SEASON; y--) o += `<option value="${y}" ${y === season ? 'selected' : ''}>${y}</option>`;
        return o;
    })();
    const seg = (k, l) => `<button class="nstd-seg ${_nstd.view === k ? 'nstd-seg--on' : ''}" data-nstdview="${k}">${l}</button>`;

    const confOrder = ['AFC', 'NFC'];
    const body = _nstd.view === 'div' ? _nstdDivisionView(confs, confOrder, season, maxAbs)
        : _nstdConferenceView(confs, confOrder, season, maxAbs);

    grid.innerHTML = `
      <div class="nstd-wrap">
        <div class="nstd-head">
          <div>
            <h1 class="md-title" style="margin:0">NFL Standings</h1>
            <p class="md-note">${season} regular season${_NSTD_SB[season] ? ` · champion tagged 🏆` : ''} · seeds & playoff cut shown</p>
          </div>
          <label class="nstd-season">Season
            <select id="nstdSeason">${seasonOpts}</select>
          </label>
        </div>
        <div class="nstd-controls">
          <div class="nstd-seg-group">${seg('div', 'Division')}${seg('conf', 'Playoff Seeding')}</div>
        </div>
        ${_nstdBracket(confs, confOrder, season)}
        ${body}
        <p class="pct-caption">Records, points and tiebreak seeds via ESPN. Seeds 1–4 are division winners; the line marks the ${_nstdCut(season)}-team playoff cut${season >= 2020 ? '' : ' (6 teams pre-2020)'}. Click a team for its page.</p>
      </div>`;

    grid.querySelector('#nstdSeason').addEventListener('change', e => {
        _nstd.season = parseInt(e.target.value, 10);
        loadNFLStandings();
    });
    grid.querySelectorAll('[data-nstdview]').forEach(b => b.addEventListener('click', () => { _nstd.view = b.dataset.nstdview; displayNFLStandings(rows, season); }));
}

function _nstdNav(abbr) {
    // team-detail pages key on ESPN's abbr; only Washington diverges (WAS -> WSH)
    return `navigateTo('nfl-team-${_escHtml(abbr === 'WAS' ? 'WSH' : abbr)}')`;
}

function _nstdDivisionView(confs, confOrder, season, maxAbs) {
    const divOrder = {
        AFC: ['AFC East', 'AFC North', 'AFC South', 'AFC West'],
        NFC: ['NFC East', 'NFC North', 'NFC South', 'NFC West'],
    };
    return confOrder.filter(c => confs[c]).map(conf => {
        const byDiv = {};
        confs[conf].forEach(t => { (byDiv[t.division] || (byDiv[t.division] = [])).push(t); });
        const order = divOrder[conf].filter(d => byDiv[d]).concat(Object.keys(byDiv).filter(d => !divOrder[conf].includes(d)));
        const cards = order.map(div => {
            const teams = byDiv[div].slice().sort((a, b) => a.seed - b.seed);
            const rowsHtml = teams.map((t, i) => `
                <div class="nstd-row ${i === 0 ? 'nstd-row--winner' : ''}" onclick="${_nstdNav(t.abbr)}">
                    <span class="nstd-row__logo"><img src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error></span>
                    <span class="nstd-row__name">${_escHtml(t.shortName)}${_nstdBadges(t, season)}</span>
                    <span class="nstd-row__rec">${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''}</span>
                    <span class="nstd-row__pct">${t.pct.toFixed(3).replace(/^0/, '')}</span>
                    <span class="nstd-row__diff">${t.diff > 0 ? '+' : ''}${t.diff}${_nstdDiffBar(t.diff, maxAbs)}</span>
                </div>`).join('');
            return `<div class="nstd-div-card">
                <div class="nstd-div-head"><span>${_escHtml(div)}</span><span class="nstd-div-head__cols"><span>W-L</span><span>PCT</span><span>DIFF</span></span></div>
                ${rowsHtml}
            </div>`;
        }).join('');
        return `<section class="nstd-conf">
            <h2 class="nstd-conf-title">${conf}</h2>
            <div class="nstd-div-grid">${cards}</div>
        </section>`;
    }).join('');
}

function _nstdConferenceView(confs, confOrder, season, maxAbs) {
    const cut = _nstdCut(season);
    return `<div class="nstd-conf-cols">` + confOrder.filter(c => confs[c]).map(conf => {
        const teams = confs[conf].slice().sort((a, b) => a.seed - b.seed);
        const rowsHtml = teams.map(t => {
            const playoff = t.seed <= cut;
            return `${t.seed === cut + 1 ? `<tr class="nstd-cutrow"><td colspan="11">Playoff cut line — top ${cut} make the postseason</td></tr>` : ''}
            <tr class="nstd-trow ${playoff ? 'nstd-trow--in' : ''}" onclick="${_nstdNav(t.abbr)}">
                <td class="nstd-seedcell">${_nstdBadges(t, season) || t.seed}</td>
                <td class="nstd-teamcell"><img src="${_escHtml(t.logo)}" alt="" loading="lazy" data-hide-on-error><span>${_escHtml(t.shortName)}</span></td>
                <td>${t.wins}</td><td>${t.losses}</td><td>${t.ties}</td>
                <td class="nstd-strong">${t.pct.toFixed(3).replace(/^0/, '')}</td>
                <td>${t.pf}</td><td>${t.pa}</td>
                <td class="${t.diff >= 0 ? 'nstd-pos' : 'nstd-neg'}">${t.diff > 0 ? '+' : ''}${t.diff}</td>
                <td class="nstd-dim">${_escHtml(t.divRec || '—')}</td>
                <td class="nstd-dim">${_escHtml(t.streak || '—')}</td>
            </tr>`;
        }).join('');
        return `<section class="nstd-conf">
            <h2 class="nstd-conf-title">${conf}</h2>
            <div class="nstd-tablewrap"><table class="nstd-table">
                <thead><tr><th>SEED</th><th class="nstd-teamcell">Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th><th>PF</th><th>PA</th><th>DIFF</th><th>DIV</th><th>STRK</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table></div>
        </section>`;
    }).join('') + `</div>`;
}

function _nstdBracket(confs, confOrder, season) {
    const cut = _nstdCut(season), byes = _nstdByes(season);
    const sb = _NSTD_SB[season];
    const chipsFor = (conf) => {
        const teams = confs[conf].slice().sort((a, b) => a.seed - b.seed).filter(t => t.seed <= cut);
        // wild-card pairings: highest remaining seed hosts lowest, byes excluded
        const playing = teams.filter(t => t.seed > byes);
        const pairs = [];
        for (let i = 0; i < playing.length / 2; i++) pairs.push([playing[i], playing[playing.length - 1 - i]]);
        const byeTeams = teams.filter(t => t.seed <= byes);
        const chip = (t) => t ? `<button class="nstd-bk-team" onclick="${_nstdNav(t.abbr)}"><span class="nstd-bk-seed">${t.seed}</span><img src="${_escHtml(t.logo)}" alt="" data-hide-on-error><span class="nstd-bk-abbr">${_escHtml(t.abbr)}</span></button>` : '';
        const byeHtml = byeTeams.map(t => `<div class="nstd-bk-bye">${chip(t)}<span class="nstd-bk-tag">BYE</span></div>`).join('');
        const gameHtml = pairs.map(p => `<div class="nstd-bk-game">${chip(p[0])}<span class="nstd-bk-vs">v</span>${chip(p[1])}</div>`).join('');
        return `<div class="nstd-bk-col"><h3 class="nstd-bk-conf">${conf}</h3>${byeHtml}<div class="nstd-bk-wc-label">Wild Card</div>${gameHtml}</div>`;
    };
    const champAbbr = sb ? sb[0] : null;
    const findByAbbr = (ab) => rowsFlat().find(t => _nstdCanon(t.abbr) === _nstdCanon(ab));
    function rowsFlat() { return [].concat(...confOrder.map(c => confs[c] || [])); }
    const champTeam = champAbbr ? findByAbbr(champAbbr) : null;
    const runnerTeam = sb ? findByAbbr(sb[1]) : null;
    const center = sb && champTeam
        ? `<div class="nstd-bk-sb">
             <div class="nstd-bk-sb-title">Super Bowl</div>
             <div class="nstd-bk-champ"><span class="nstd-bk-trophy">🏆</span><img src="${_escHtml(champTeam.logo)}" alt="" data-hide-on-error><span>${_escHtml(champTeam.shortName)}</span></div>
             ${runnerTeam ? `<div class="nstd-bk-runner">def. ${_escHtml(runnerTeam.shortName)}</div>` : ''}
           </div>`
        : `<div class="nstd-bk-sb"><div class="nstd-bk-sb-title">Super Bowl</div><div class="nstd-bk-runner">${season >= _nstdSeasonDefault() ? 'TBD' : '—'}</div></div>`;
    return `<details class="nstd-bracket" open>
        <summary class="nstd-bracket__sum">Playoff picture <span class="nstd-bracket__hint">seeds & wild-card pairings</span></summary>
        <div class="nstd-bracket__body">${chipsFor(confOrder[0])}${center}${chipsFor(confOrder[1])}</div>
    </details>`;
}

if (typeof window !== 'undefined') {
    window.loadNFLStandings = loadNFLStandings;
    window.displayNFLStandings = displayNFLStandings;
    window.fetchNFLStandings = fetchNFLStandings;
}

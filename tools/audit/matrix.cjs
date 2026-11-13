#!/usr/bin/env node
// Parity matrix: which sport has which page type, read from the code rather
// than from docs (CLAUDE.md's own warning: the docs go stale).
//
//   node tools/audit/matrix.cjs          markdown table
//   node tools/audit/matrix.cjs --gaps   one line per gap, most-covered first
//   node tools/audit/matrix.cjs --json   the matrix as JSON
//
// A cell is 'yes', 'no' or 'n/a'. 'yes' means the code has the route or the
// file. It does not mean the page is good: tools/audit/page-walk.cjs looks
// at what a reader sees.
const fs = require('node:fs');
const path = require('node:path');

const SPORTS = ['mlb', 'nfl', 'ncaaf', 'ncaab', 'nba', 'wnba'];
const PRO = new Set(['mlb', 'nfl', 'nba', 'wnba']);

// The SPA code that can define a sport's views.
const viewCode = (r, s) => r.text('js/navigation.js') + '\n' + r.text(`js/${s}.js`);
// `wnba-team-` must not count as `nba-team-`: require a non-letter before the sport.
const mentions = (code, s, rest) => new RegExp(`(^|[^a-z])${s}-${rest}`).test(code);
const listView = (...names) => (r, s) => names.some(n => new RegExp(`['"\`]${s}-${n}['"\`]`).test(viewCode(r, s)));
const detailView = kind => (r, s) => mentions(viewCode(r, s), s, `${kind}-`);

const ROWS = [
    { id: 'scores', label: 'Scores', test: listView('games', 'scores') },
    { id: 'standings', label: 'Standings', test: listView('standings') },
    { id: 'teams', label: 'Teams list', test: listView('teams') },
    { id: 'teamPage', label: 'Team page', test: detailView('team') },
    { id: 'leaders', label: 'Leaders', test: listView('leaders') },
    { id: 'playerPage', label: 'Player page', test: detailView('player') },
    { id: 'gameView', label: 'Game view', test: (r, s) => detailView('game')(r, s) || (s === 'mlb' && detailView('live')(r, s)) },
    { id: 'gameLog', label: 'Player game log', test: (r, s) => /game ?log/i.test(r.text(`js/${s}.js`)) },
    { id: 'powerRankings', label: 'Power rankings', test: (r, s) => mentions(viewCode(r, s), s, 'powerrankings') || (s === 'mlb' && /displayMLBPowerRankings/.test(r.text('js/mlb.js'))) },
    { id: 'rankings', label: 'Polls', na: s => PRO.has(s), test: listView('rankings') },
    { id: 'edgeStandings', label: 'Crawlable standings', test: (r, s) => r.has(`functions/${s}/standings.js`) },
    { id: 'edgeLeaders', label: 'Crawlable leaders', test: (r, s) => r.has(`functions/${s}/leaders.js`) },
    { id: 'edgeTeam', label: 'Crawlable team page', test: (r, s) => r.has(`functions/${s}/team/`) },
    { id: 'edgePlayer', label: 'Crawlable player page', test: (r, s) => r.has(`functions/${s}/player/`) },
    { id: 'edgeGame', label: 'Crawlable game page', test: (r, s) => r.has(`functions/${s}/game/`) },
    { id: 'stories', label: 'Stories', test: (r, s) => r.has(`content/${s}/stories/index.json`) },
    { id: 'followSync', label: 'Follows sync', test: (r, s) => {
        const set = (r.text('functions/api/follows.js').match(/VALID_SPORTS\s*=\s*new Set\(\[([^\]]*)\]/) || [])[1] || '';
        return new RegExp(`['"]${s}['"]`).test(set);
    } },
    { id: 'contract', label: 'Nightly contract', test: (r, s) => r.has(`tools/contracts/${s}.cjs`) },
];

function buildMatrix(reader) {
    return {
        sports: SPORTS,
        rows: ROWS.map(row => ({
            id: row.id, label: row.label,
            cells: Object.fromEntries(SPORTS.map(s => [s, row.na && row.na(s) ? 'n/a' : row.test(reader, s) ? 'yes' : 'no'])),
        })),
    };
}

// A gap is a 'no' where at least one other sport says 'yes'. Something no
// sport has is a new feature, not a parity gap. Most-covered capabilities
// come first: the more sports already have it, the more proven the pattern.
function gaps(matrix) {
    const out = [];
    for (const row of matrix.rows) {
        const have = matrix.sports.filter(s => row.cells[s] === 'yes');
        if (!have.length) continue;
        for (const s of matrix.sports) {
            if (row.cells[s] === 'no') out.push({ sport: s, capability: row.id, label: row.label, have });
        }
    }
    return out.sort((a, b) => b.have.length - a.have.length);
}

function repoReader(root) {
    return {
        text: p => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } },
        has: p => fs.existsSync(path.join(root, p)),
    };
}

function toMarkdown(matrix) {
    const mark = { yes: 'yes', no: '**no**', 'n/a': 'n/a' };
    const head = `| Capability | ${matrix.sports.map(s => s.toUpperCase()).join(' | ')} |`;
    const rule = `|---|${matrix.sports.map(() => '---').join('|')}|`;
    const body = matrix.rows.map(r => `| ${r.label} | ${matrix.sports.map(s => mark[r.cells[s]]).join(' | ')} |`);
    return [head, rule, ...body].join('\n');
}

if (require.main === module) {
    const matrix = buildMatrix(repoReader(path.join(__dirname, '..', '..')));
    const arg = process.argv[2];
    if (arg === '--json') console.log(JSON.stringify(matrix, null, 2));
    else if (arg === '--gaps') gaps(matrix).forEach(g => console.log(`${g.sport}: ${g.label} (have: ${g.have.join(', ')})`));
    else console.log(toMarkdown(matrix));
}

module.exports = { SPORTS, buildMatrix, gaps, repoReader, toMarkdown };

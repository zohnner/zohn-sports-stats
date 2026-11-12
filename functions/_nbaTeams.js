// NBA team identity and record helpers for the /nba/team/:abbr edge template
// (parity #87 Phase B). Import-free so tests can load it in a vm.
//
// The team list is static because ESPN blocks Cloudflare egress (D-176): a
// template that needed ESPN's /teams to know a team exists would serve the bare
// shell to every reader. Abbreviations and names were checked against
// site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams on 2026-11-12.
// Keys are ESPN's own abbreviations, which the SPA route (js/nba.js
// _nbaTeamKey), follow keys and story `teams` frontmatter also use.

export const NBA_TEAMS = [
    ['ATL', 'Atlanta Hawks'], ['BOS', 'Boston Celtics'], ['BKN', 'Brooklyn Nets'],
    ['CHA', 'Charlotte Hornets'], ['CHI', 'Chicago Bulls'], ['CLE', 'Cleveland Cavaliers'],
    ['DAL', 'Dallas Mavericks'], ['DEN', 'Denver Nuggets'], ['DET', 'Detroit Pistons'],
    ['GS', 'Golden State Warriors'], ['HOU', 'Houston Rockets'], ['IND', 'Indiana Pacers'],
    ['LAC', 'LA Clippers'], ['LAL', 'Los Angeles Lakers'], ['MEM', 'Memphis Grizzlies'],
    ['MIA', 'Miami Heat'], ['MIL', 'Milwaukee Bucks'], ['MIN', 'Minnesota Timberwolves'],
    ['NO', 'New Orleans Pelicans'], ['NY', 'New York Knicks'], ['OKC', 'Oklahoma City Thunder'],
    ['ORL', 'Orlando Magic'], ['PHI', 'Philadelphia 76ers'], ['PHX', 'Phoenix Suns'],
    ['POR', 'Portland Trail Blazers'], ['SAC', 'Sacramento Kings'], ['SA', 'San Antonio Spurs'],
    ['TOR', 'Toronto Raptors'], ['UTAH', 'Utah Jazz'], ['WSH', 'Washington Wizards'],
].map(([abbr, name]) => ({ abbr, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));

// Mirrors _NBA_TEAM_ALIASES in js/nba.js.
export const NBA_TEAM_ALIASES = { SAS: 'SA', GSW: 'GS', NYK: 'NY', NOP: 'NO', UTA: 'UTAH', WAS: 'WSH' };

export function nbaTeamKey(abbr) {
    const a = String(abbr || '').toUpperCase().replace(/[^A-Z]/g, '');
    return NBA_TEAM_ALIASES[a] || a;
}

export function findNBATeam(abbr) {
    const key = nbaTeamKey(abbr);
    return NBA_TEAMS.find(t => t.abbr === key) || null;
}

export function nbaTeamPath(team) {
    return `/nba/team/${team.abbr.toLowerCase()}/${team.slug}`;
}

// ESPN standings tree (/api/nbastandings, level=3: league > conference >
// division > entries) → this team's row, or null.
export function nbaStandingFromTree(tree, abbr) {
    const key = nbaTeamKey(abbr);
    let found = null;
    function walk(node, trail) {
        if (found || !node) return;
        const nm = node.name || node.abbreviation;
        const t2 = nm ? [...trail, nm] : trail;
        for (const e of ((node.standings && node.standings.entries) || [])) {
            if (nbaTeamKey(e.team && e.team.abbreviation) !== key) continue;
            const stat = n => {
                const s = (e.stats || []).find(x => x.name === n || x.type === n);
                return s ? String(s.displayValue == null ? '' : s.displayValue) : '';
            };
            const w = stat('wins'), l = stat('losses');
            if (!w || !l) return;
            found = {
                record: `${w}-${l}`, pct: stat('winPercent'), division: t2.slice(-2).join(' — '),
                seed: stat('playoffSeed'), streak: stat('streak'), home: stat('Home'), road: stat('Road'),
                ppg: stat('avgPointsFor'), oppg: stat('avgPointsAgainst'), lastTen: stat('Last Ten Games'),
            };
            return;
        }
        for (const c of (node.children || [])) walk(c, t2);
    }
    // The root is the league itself; start at its conferences so the label
    // reads "Eastern Conference — Atlantic", the same as the fallback file.
    for (const c of ((tree && tree.children) || [])) walk(c, []);
    return found;
}

// content/nba/standings.json (D-181, computed daily from Ball Don't Lie) →
// this team's W-L and division, matched by display name.
export function nbaStandingFromFallback(doc, name) {
    for (const s of ((doc && doc.sections) || [])) {
        const t = (s.teams || []).find(x => x.name === name);
        if (t && t.record) return { record: t.record, division: s.name };
    }
    return null;
}

// Stories carry either spelling (SAS and SA both appear in published frontmatter).
export function nbaStoriesFor(stories, abbr) {
    const key = nbaTeamKey(abbr);
    return (stories || []).filter(s => (s.teams || []).some(t => nbaTeamKey(t) === key));
}

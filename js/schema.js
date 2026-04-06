// ============================================================
// ZohnStats Data Schema
// Single source of truth for all tracked field definitions.
// Used by StatsDB, the Q&A engine, and display utilities.
// ============================================================

// ── Team name resolution ─────────────────────────────────────
// Maps every reasonable alias (full name, city, nickname, abbr) → canonical 3-letter abbr.
const TEAM_ALIASES = {
    // Atlanta Hawks
    'atl':'ATL','hawks':'ATL','atlanta':'ATL','atlanta hawks':'ATL',
    // Boston Celtics
    'bos':'BOS','celtics':'BOS','boston':'BOS','boston celtics':'BOS',
    // Brooklyn Nets
    'bkn':'BKN','nets':'BKN','brooklyn':'BKN','brooklyn nets':'BKN',
    // Charlotte Hornets
    'cha':'CHA','hornets':'CHA','charlotte':'CHA','charlotte hornets':'CHA',
    // Chicago Bulls
    'chi':'CHI','bulls':'CHI','chicago':'CHI','chicago bulls':'CHI',
    // Cleveland Cavaliers
    'cle':'CLE','cavs':'CLE','cavaliers':'CLE','cleveland':'CLE','cleveland cavaliers':'CLE',
    // Dallas Mavericks
    'dal':'DAL','mavs':'DAL','mavericks':'DAL','dallas':'DAL','dallas mavericks':'DAL',
    // Denver Nuggets
    'den':'DEN','nuggets':'DEN','denver':'DEN','denver nuggets':'DEN',
    // Detroit Pistons
    'det':'DET','pistons':'DET','detroit':'DET','detroit pistons':'DET',
    // Golden State Warriors
    'gsw':'GSW','warriors':'GSW','golden state':'GSW','golden state warriors':'GSW','dubs':'GSW',
    // Houston Rockets
    'hou':'HOU','rockets':'HOU','houston':'HOU','houston rockets':'HOU',
    // Indiana Pacers
    'ind':'IND','pacers':'IND','indiana':'IND','indiana pacers':'IND',
    // LA Clippers
    'lac':'LAC','clippers':'LAC','la clippers':'LAC',
    // Los Angeles Lakers
    'lal':'LAL','lakers':'LAL','los angeles lakers':'LAL','la lakers':'LAL',
    // Memphis Grizzlies
    'mem':'MEM','grizzlies':'MEM','grizz':'MEM','memphis':'MEM','memphis grizzlies':'MEM',
    // Miami Heat
    'mia':'MIA','heat':'MIA','miami':'MIA','miami heat':'MIA',
    // Milwaukee Bucks
    'mil':'MIL','bucks':'MIL','milwaukee':'MIL','milwaukee bucks':'MIL',
    // Minnesota Timberwolves
    'min':'MIN','wolves':'MIN','timberwolves':'MIN','minnesota':'MIN','minnesota timberwolves':'MIN',
    // New Orleans Pelicans
    'nop':'NOP','pelicans':'NOP','new orleans':'NOP','new orleans pelicans':'NOP',
    // New York Knicks
    'nyk':'NYK','knicks':'NYK','new york':'NYK','new york knicks':'NYK',
    // Oklahoma City Thunder
    'okc':'OKC','thunder':'OKC','oklahoma city':'OKC','oklahoma city thunder':'OKC',
    // Orlando Magic
    'orl':'ORL','magic':'ORL','orlando':'ORL','orlando magic':'ORL',
    // Philadelphia 76ers
    'phi':'PHI','sixers':'PHI','76ers':'PHI','philadelphia':'PHI','philadelphia 76ers':'PHI',
    // Phoenix Suns
    'phx':'PHX','suns':'PHX','phoenix':'PHX','phoenix suns':'PHX',
    // Portland Trail Blazers
    'por':'POR','blazers':'POR','trail blazers':'POR','portland':'POR','portland trail blazers':'POR',
    // Sacramento Kings
    'sac':'SAC','kings':'SAC','sacramento':'SAC','sacramento kings':'SAC',
    // San Antonio Spurs
    'sas':'SAS','spurs':'SAS','san antonio':'SAS','san antonio spurs':'SAS',
    // Toronto Raptors
    'tor':'TOR','raptors':'TOR','toronto':'TOR','toronto raptors':'TOR',
    // Utah Jazz
    'uta':'UTA','jazz':'UTA','utah':'UTA','utah jazz':'UTA',
    // Washington Wizards
    'was':'WAS','wizards':'WAS','washington':'WAS','washington wizards':'WAS',
};

// ── Standings field schema ───────────────────────────────────
// Each key is what we store in AppState.nbaStandings rows.
// Used by the Q&A engine to know how to sort, format, and describe fields.
const STANDINGS_SCHEMA = {
    // Identity
    teamId:        { label: 'Team ID',       category: 'identity' },
    teamAbbr:      { label: 'Abbr',          category: 'identity' },
    teamName:      { label: 'Team',          category: 'identity' },
    teamCity:      { label: 'City',          category: 'identity' },
    conference:    { label: 'Conference',    category: 'identity' },
    division:      { label: 'Division',      category: 'identity' },

    // Core record
    rank:          { label: 'Conf Rank',     category: 'record',   betterWhen: 'lower',  format: v => `#${v}`,           desc: 'Playoff seeding rank in conference' },
    wins:          { label: 'W',             category: 'record',   betterWhen: 'higher', format: v => v,                  desc: 'Total wins this season' },
    losses:        { label: 'L',             category: 'record',   betterWhen: 'lower',  format: v => v,                  desc: 'Total losses this season' },
    pct:           { label: 'PCT',           category: 'record',   betterWhen: 'higher', format: v => v?.toFixed(3),       desc: 'Win percentage' },
    gb:            { label: 'GB',            category: 'record',   betterWhen: 'lower',  format: v => (!v || v === 0) ? '—' : v, desc: 'Games behind the conference leader' },

    // Splits
    home:          { label: 'Home',          category: 'splits',   betterWhen: 'higher', format: v => v,                  desc: 'Record in home games' },
    road:          { label: 'Road',          category: 'splits',   betterWhen: 'higher', format: v => v,                  desc: 'Record in away games' },
    l10:           { label: 'Last 10',       category: 'splits',   betterWhen: 'higher', format: v => v,                  desc: 'Record in the last 10 games' },
    confRecord:    { label: 'Conf Rec',      category: 'splits',   betterWhen: 'higher', format: v => v,                  desc: 'Record vs. conference opponents' },
    divRecord:     { label: 'Div Rec',       category: 'splits',   betterWhen: 'higher', format: v => v,                  desc: 'Record vs. division opponents' },
    otRecord:      { label: 'OT',            category: 'splits',   betterWhen: 'higher', format: v => v,                  desc: 'Overtime record' },

    // Scoring
    pointsPg:      { label: 'PPG',           category: 'scoring',  betterWhen: 'higher', format: v => v?.toFixed(1),      desc: 'Average points scored per game' },
    oppPointsPg:   { label: 'Opp PPG',       category: 'scoring',  betterWhen: 'lower',  format: v => v?.toFixed(1),      desc: 'Average points allowed per game' },
    diffPointsPg:  { label: 'Point Diff',    category: 'scoring',  betterWhen: 'higher', format: v => v != null ? (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : '—', desc: 'Average point differential per game' },

    // Situational
    above500:      { label: 'vs .500+',      category: 'situational', betterWhen: 'higher', format: v => v, desc: 'Record vs. teams at or above .500' },
    score100:      { label: 'Score 100+',    category: 'situational', betterWhen: 'higher', format: v => v, desc: 'Record when team scores 100+ points' },
    oppScore100:   { label: 'Allow 100+',    category: 'situational', betterWhen: 'lower',  format: v => v, desc: 'Record when opponent scores 100+ points' },
    blowouts3:     { label: 'Close (≤3)',    category: 'situational', betterWhen: 'higher', format: v => v, desc: 'Record in games decided by 3 or fewer points' },
    blowouts10:    { label: 'Blowout (10+)', category: 'situational', betterWhen: 'higher', format: v => v, desc: 'Record in games decided by 10+ points' },
    leadHalf:      { label: 'Lead at Half',  category: 'situational', betterWhen: 'higher', format: v => v, desc: 'Record when leading at halftime' },
    behindHalf:    { label: 'Trail at Half', category: 'situational', betterWhen: 'higher', format: v => v, desc: 'Record when trailing at halftime' },

    // Streaks
    streak:        { label: 'Streak',        category: 'streak',   format: v => v,                        desc: 'Current win/loss streak' },
    longWinStreak: { label: 'Best Streak',   category: 'streak',   betterWhen: 'higher', format: v => v != null ? `W${v}` : '—', desc: 'Longest win streak this season' },
    longLossStreak:{ label: 'Worst Streak',  category: 'streak',   betterWhen: 'lower',  format: v => v != null ? `L${v}` : '—', desc: 'Longest losing streak this season' },
    curHomeStreak: { label: 'Home Streak',   category: 'streak',   format: v => v,                        desc: 'Current home court streak' },
    curRoadStreak: { label: 'Road Streak',   category: 'streak',   format: v => v,                        desc: 'Current road streak' },

    // Clinch / elimination
    clinchedDiv:   { label: 'Clinched Div',  category: 'clinch',   format: v => v ? 'Yes' : 'No',         desc: 'Has clinched division title' },
    clinchedPO:    { label: 'Clinched PO',   category: 'clinch',   format: v => v ? 'Yes' : 'No',         desc: 'Has clinched playoff berth' },
    clinchedConf:  { label: 'Clinched Conf', category: 'clinch',   format: v => v ? 'Yes' : 'No',         desc: 'Has clinched conference title' },
    eliminated:    { label: 'Eliminated',    category: 'clinch',   format: v => v ? 'Yes' : 'No',         desc: 'Mathematically eliminated from playoffs' },
};

// ── Player stats schema ──────────────────────────────────────
const PLAYER_STATS_SCHEMA = {
    pts:          { label: 'PPG',  unit: 'PPG', category: 'scoring',  betterWhen: 'higher', format: v => v?.toFixed(1), color: 'var(--color-pts)', desc: 'Points per game' },
    reb:          { label: 'RPG',  unit: 'RPG', category: 'rebounds', betterWhen: 'higher', format: v => v?.toFixed(1), color: 'var(--color-reb)', desc: 'Rebounds per game' },
    ast:          { label: 'APG',  unit: 'APG', category: 'assists',  betterWhen: 'higher', format: v => v?.toFixed(1), color: 'var(--color-ast)', desc: 'Assists per game' },
    stl:          { label: 'SPG',  unit: 'SPG', category: 'defense',  betterWhen: 'higher', format: v => v?.toFixed(1), color: 'var(--color-stl)', desc: 'Steals per game' },
    blk:          { label: 'BPG',  unit: 'BPG', category: 'defense',  betterWhen: 'higher', format: v => v?.toFixed(1), color: 'var(--color-blk)', desc: 'Blocks per game' },
    turnover:     { label: 'TOV',  unit: 'TOV', category: 'defense',  betterWhen: 'lower',  format: v => v?.toFixed(1), color: '#f87171',          desc: 'Turnovers per game' },
    min:          { label: 'MIN',  unit: 'MIN', category: 'usage',    betterWhen: 'higher', format: v => v?.toFixed(1), color: 'var(--color-min)', desc: 'Minutes per game' },
    fg_pct:       { label: 'FG%',  unit: 'FG%', category: 'shooting', betterWhen: 'higher', format: v => v != null ? (v*100).toFixed(1)+'%' : null, color: 'var(--color-pct)', desc: 'Field goal percentage', scale: 100 },
    fg3_pct:      { label: '3P%',  unit: '3P%', category: 'shooting', betterWhen: 'higher', format: v => v != null ? (v*100).toFixed(1)+'%' : null, color: '#818cf8',          desc: '3-point percentage', scale: 100 },
    ft_pct:       { label: 'FT%',  unit: 'FT%', category: 'shooting', betterWhen: 'higher', format: v => v != null ? (v*100).toFixed(1)+'%' : null, color: '#38bdf8',          desc: 'Free throw percentage', scale: 100 },
    games_played: { label: 'GP',   unit: 'GP',  category: 'usage',    betterWhen: 'higher', format: v => v, desc: 'Games played' },
};

// ── Stat keyword aliases → AppState stat field ───────────────
// Used by Q&A engine to resolve "points", "scoring", "blocks" → field name
const STAT_ALIASES = {
    // Player stats
    'points':'pts','scoring':'pts','ppg':'pts','point':'pts',
    'rebounds':'reb','rpg':'reb','boards':'reb','rebounding':'reb','rebound':'reb',
    'assists':'ast','apg':'ast','dimes':'ast','assist':'ast',
    'steals':'stl','spg':'stl','steal':'stl',
    'blocks':'blk','bpg':'blk','block':'blk','swats':'blk',
    'turnovers':'turnover','tov':'turnover','turnovers':'turnover',
    'minutes':'min','min':'min','time':'min','playing time':'min',
    'fg%':'fg_pct','field goal':'fg_pct','field goals':'fg_pct','fg pct':'fg_pct',
    '3%':'fg3_pct','3 point':'fg3_pct','three point':'fg3_pct','3p%':'fg3_pct',
    'ft%':'ft_pct','free throw':'ft_pct','free throws':'ft_pct',
    // Standings fields (team-level)
    'record':'wins','win pct':'pct','winning pct':'pct','win percentage':'pct',
    'games behind':'gb','home record':'home','road record':'road','away record':'road',
    'last 10':'l10','point diff':'diffPointsPg','differential':'diffPointsPg',
    'offense':'pointsPg','defense':'oppPointsPg','allow':'oppPointsPg',
};

if (typeof window !== 'undefined') {
    window.TEAM_ALIASES         = TEAM_ALIASES;
    window.STANDINGS_SCHEMA     = STANDINGS_SCHEMA;
    window.PLAYER_STATS_SCHEMA  = PLAYER_STATS_SCHEMA;
    window.STAT_ALIASES         = STAT_ALIASES;
}

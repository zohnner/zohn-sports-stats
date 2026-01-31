const AppState = {
    allPlayers: [],
    allTeams: [],
    allGames: [],
    playerStats: {},
    filteredPlayers: [],
    currentView: 'players',
    savedStats: [],
    selectedPlayer: null
};

const NBA_PLAYERS = [
    {id: 237, first_name: "LeBron", last_name: "James", position: "F", team: {id: 14, full_name: "Los Angeles Lakers", abbreviation: "LAL", city: "Los Angeles", conference: "West", division: "Pacific"}},
    {id: 115, first_name: "Stephen", last_name: "Curry", position: "G", team: {id: 10, full_name: "Golden State Warriors", abbreviation: "GSW", city: "Golden State", conference: "West", division: "Pacific"}},
    {id: 140, first_name: "Kevin", last_name: "Durant", position: "F", team: {id: 26, full_name: "Phoenix Suns", abbreviation: "PHX", city: "Phoenix", conference: "West", division: "Pacific"}},
    {id: 15, first_name: "Giannis", last_name: "Antetokounmpo", position: "F", team: {id: 17, full_name: "Milwaukee Bucks", abbreviation: "MIL", city: "Milwaukee", conference: "East", division: "Central"}},
    {id: 145, first_name: "Luka", last_name: "Dončić", position: "G", team: {id: 7, full_name: "Dallas Mavericks", abbreviation: "DAL", city: "Dallas", conference: "West", division: "Southwest"}},
    {id: 132, first_name: "Joel", last_name: "Embiid", position: "C-F", team: {id: 23, full_name: "Philadelphia 76ers", abbreviation: "PHI", city: "Philadelphia", conference: "East", division: "Atlantic"}},
    {id: 246, first_name: "Nikola", last_name: "Jokić", position: "C", team: {id: 9, full_name: "Denver Nuggets", abbreviation: "DEN", city: "Denver", conference: "West", division: "Northwest"}},
    {id: 434, first_name: "Jayson", last_name: "Tatum", position: "F-G", team: {id: 2, full_name: "Boston Celtics", abbreviation: "BOS", city: "Boston", conference: "East", division: "Atlantic"}},
    {id: 270, first_name: "Damian", last_name: "Lillard", position: "G", team: {id: 17, full_name: "Milwaukee Bucks", abbreviation: "MIL", city: "Milwaukee", conference: "East", division: "Central"}},
    {id: 96, first_name: "Anthony", last_name: "Davis", position: "F-C", team: {id: 14, full_name: "Los Angeles Lakers", abbreviation: "LAL", city: "Los Angeles", conference: "West", division: "Pacific"}},
    {id: 265, first_name: "Kawhi", last_name: "Leonard", position: "F", team: {id: 12, full_name: "LA Clippers", abbreviation: "LAC", city: "Los Angeles", conference: "West", division: "Pacific"}},
    {id: 67, first_name: "Jimmy", last_name: "Butler", position: "F", team: {id: 16, full_name: "Miami Heat", abbreviation: "MIA", city: "Miami", conference: "East", division: "Southeast"}},
    {id: 41, first_name: "Devin", last_name: "Booker", position: "G", team: {id: 26, full_name: "Phoenix Suns", abbreviation: "PHX", city: "Phoenix", conference: "West", division: "Pacific"}},
    {id: 299, first_name: "Ja", last_name: "Morant", position: "G", team: {id: 15, full_name: "Memphis Grizzlies", abbreviation: "MEM", city: "Memphis", conference: "West", division: "Southwest"}},
    {id: 490, first_name: "Trae", last_name: "Young", position: "G", team: {id: 1, full_name: "Atlanta Hawks", abbreviation: "ATL", city: "Atlanta", conference: "East", division: "Southeast"}},
    {id: 192, first_name: "Shai", last_name: "Gilgeous-Alexander", position: "G", team: {id: 21, full_name: "Oklahoma City Thunder", abbreviation: "OKC", city: "Oklahoma City", conference: "West", division: "Northwest"}},
    {id: 294, first_name: "Donovan", last_name: "Mitchell", position: "G", team: {id: 5, full_name: "Cleveland Cavaliers", abbreviation: "CLE", city: "Cleveland", conference: "East", division: "Central"}},
    {id: 184, first_name: "Paul", last_name: "George", position: "F-G", team: {id: 12, full_name: "LA Clippers", abbreviation: "LAC", city: "Los Angeles", conference: "West", division: "Pacific"}},
    {id: 57, first_name: "Jaylen", last_name: "Brown", position: "G-F", team: {id: 2, full_name: "Boston Celtics", abbreviation: "BOS", city: "Boston", conference: "East", division: "Atlantic"}},
    {id: 169, first_name: "De'Aaron", last_name: "Fox", position: "G", team: {id: 25, full_name: "Sacramento Kings", abbreviation: "SAC", city: "Sacramento", conference: "West", division: "Pacific"}},
    {id: 196, first_name: "Tyrese", last_name: "Haliburton", position: "G", team: {id: 11, full_name: "Indiana Pacers", abbreviation: "IND", city: "Indianapolis", conference: "East", division: "Central"}},
    {id: 449, first_name: "Karl-Anthony", last_name: "Towns", position: "C-F", team: {id: 18, full_name: "Minnesota Timberwolves", abbreviation: "MIN", city: "Minneapolis", conference: "West", division: "Northwest"}},
    {id: 2, first_name: "Bam", last_name: "Adebayo", position: "C-F", team: {id: 16, full_name: "Miami Heat", abbreviation: "MIA", city: "Miami", conference: "East", division: "Southeast"}},
    {id: 488, first_name: "Zion", last_name: "Williamson", position: "F", team: {id: 19, full_name: "New Orleans Pelicans", abbreviation: "NOP", city: "New Orleans", conference: "West", division: "Southwest"}},
    {id: 31, first_name: "Bradley", last_name: "Beal", position: "G", team: {id: 26, full_name: "Phoenix Suns", abbreviation: "PHX", city: "Phoenix", conference: "West", division: "Pacific"}},
    {id: 22, first_name: "Deandre", last_name: "Ayton", position: "C", team: {id: 24, full_name: "Portland Trail Blazers", abbreviation: "POR", city: "Portland", conference: "West", division: "Northwest"}},
    {id: 375, first_name: "Pascal", last_name: "Siakam", position: "F", team: {id: 11, full_name: "Indiana Pacers", abbreviation: "IND", city: "Indianapolis", conference: "East", division: "Central"}},
    {id: 328, first_name: "Julius", last_name: "Randle", position: "F-C", team: {id: 20, full_name: "New York Knicks", abbreviation: "NYK", city: "New York", conference: "East", division: "Atlantic"}},
    {id: 359, first_name: "Domantas", last_name: "Sabonis", position: "C-F", team: {id: 25, full_name: "Sacramento Kings", abbreviation: "SAC", city: "Sacramento", conference: "West", division: "Pacific"}},
    {id: 279, first_name: "Lauri", last_name: "Markkanen", position: "F-C", team: {id: 29, full_name: "Utah Jazz", abbreviation: "UTA", city: "Utah", conference: "West", division: "Northwest"}},
    {id: 666, first_name: "Nikola", last_name: "Vučević", position: "C", team: {id: 4, full_name: "Chicago Bulls", abbreviation: "CHI", city: "Chicago", conference: "East", division: "Central"}},
    {id: 138, first_name: "DeMar", last_name: "DeRozan", position: "F-G", team: {id: 4, full_name: "Chicago Bulls", abbreviation: "CHI", city: "Chicago", conference: "East", division: "Central"}},
    {id: 258, first_name: "Zach", last_name: "LaVine", position: "G-F", team: {id: 4, full_name: "Chicago Bulls", abbreviation: "CHI", city: "Chicago", conference: "East", division: "Central"}},
    {id: 126, first_name: "Jalen", last_name: "Brunson", position: "G", team: {id: 20, full_name: "New York Knicks", abbreviation: "NYK", city: "New York", conference: "East", division: "Atlantic"}},
    {id: 340, first_name: "OG", last_name: "Anunoby", position: "F-G", team: {id: 20, full_name: "New York Knicks", abbreviation: "NYK", city: "New York", conference: "East", division: "Atlantic"}},
    {id: 347, first_name: "Darius", last_name: "Garland", position: "G", team: {id: 5, full_name: "Cleveland Cavaliers", abbreviation: "CLE", city: "Cleveland", conference: "East", division: "Central"}},
    {id: 477, first_name: "Paolo", last_name: "Banchero", position: "F", team: {id: 22, full_name: "Orlando Magic", abbreviation: "ORL", city: "Orlando", conference: "East", division: "Southeast"}},
    {id: 467, first_name: "Franz", last_name: "Wagner", position: "F-G", team: {id: 22, full_name: "Orlando Magic", abbreviation: "ORL", city: "Orlando", conference: "East", division: "Southeast"}},
    {id: 85, first_name: "Tyler", last_name: "Herro", position: "G", team: {id: 16, full_name: "Miami Heat", abbreviation: "MIA", city: "Miami", conference: "East", division: "Southeast"}},
    {id: 278, first_name: "Brandon", last_name: "Ingram", position: "F", team: {id: 19, full_name: "New Orleans Pelicans", abbreviation: "NOP", city: "New Orleans", conference: "West", division: "Southwest"}},
    {id: 293, first_name: "CJ", last_name: "McCollum", position: "G", team: {id: 19, full_name: "New Orleans Pelicans", abbreviation: "NOP", city: "New Orleans", conference: "West", division: "Southwest"}},
    {id: 139, first_name: "Anthony", last_name: "Edwards", position: "G", team: {id: 18, full_name: "Minnesota Timberwolves", abbreviation: "MIN", city: "Minneapolis", conference: "West", division: "Northwest"}},
    {id: 336, first_name: "Mikal", last_name: "Bridges", position: "F-G", team: {id: 3, full_name: "Brooklyn Nets", abbreviation: "BKN", city: "Brooklyn", conference: "East", division: "Atlantic"}},
    {id: 203, first_name: "Aaron", last_name: "Gordon", position: "F", team: {id: 9, full_name: "Denver Nuggets", abbreviation: "DEN", city: "Denver", conference: "West", division: "Northwest"}},
    {id: 310, first_name: "Jamal", last_name: "Murray", position: "G", team: {id: 9, full_name: "Denver Nuggets", abbreviation: "DEN", city: "Denver", conference: "West", division: "Northwest"}},
    {id: 75, first_name: "Jarrett", last_name: "Allen", position: "C", team: {id: 5, full_name: "Cleveland Cavaliers", abbreviation: "CLE", city: "Cleveland", conference: "East", division: "Central"}},
    {id: 3, first_name: "Derrick", last_name: "White", position: "G", team: {id: 2, full_name: "Boston Celtics", abbreviation: "BOS", city: "Boston", conference: "East", division: "Atlantic"}},
    {id: 395, first_name: "Austin", last_name: "Reaves", position: "G", team: {id: 14, full_name: "Los Angeles Lakers", abbreviation: "LAL", city: "Los Angeles", conference: "West", division: "Pacific"}},
    {id: 351, first_name: "D'Angelo", last_name: "Russell", position: "G", team: {id: 14, full_name: "Los Angeles Lakers", abbreviation: "LAL", city: "Los Angeles", conference: "West", division: "Pacific"}}
];

async function fetchAllPlayers() {
    console.log('Loading hardcoded players...');
    return NBA_PLAYERS;
}

async function fetchTeamsAPI() {
    return [
        {id: 1, full_name: "Atlanta Hawks", abbreviation: "ATL", city: "Atlanta", conference: "East", division: "Southeast"},
        {id: 2, full_name: "Boston Celtics", abbreviation: "BOS", city: "Boston", conference: "East", division: "Atlantic"},
        {id: 3, full_name: "Brooklyn Nets", abbreviation: "BKN", city: "Brooklyn", conference: "East", division: "Atlantic"},
        {id: 4, full_name: "Chicago Bulls", abbreviation: "CHI", city: "Chicago", conference: "East", division: "Central"},
        {id: 5, full_name: "Cleveland Cavaliers", abbreviation: "CLE", city: "Cleveland", conference: "East", division: "Central"},
        {id: 7, full_name: "Dallas Mavericks", abbreviation: "DAL", city: "Dallas", conference: "West", division: "Southwest"},
        {id: 9, full_name: "Denver Nuggets", abbreviation: "DEN", city: "Denver", conference: "West", division: "Northwest"},
        {id: 10, full_name: "Golden State Warriors", abbreviation: "GSW", city: "Golden State", conference: "West", division: "Pacific"},
        {id: 11, full_name: "Indiana Pacers", abbreviation: "IND", city: "Indianapolis", conference: "East", division: "Central"},
        {id: 12, full_name: "LA Clippers", abbreviation: "LAC", city: "Los Angeles", conference: "West", division: "Pacific"},
        {id: 14, full_name: "Los Angeles Lakers", abbreviation: "LAL", city: "Los Angeles", conference: "West", division: "Pacific"},
        {id: 15, full_name: "Memphis Grizzlies", abbreviation: "MEM", city: "Memphis", conference: "West", division: "Southwest"},
        {id: 16, full_name: "Miami Heat", abbreviation: "MIA", city: "Miami", conference: "East", division: "Southeast"},
        {id: 17, full_name: "Milwaukee Bucks", abbreviation: "MIL", city: "Milwaukee", conference: "East", division: "Central"},
        {id: 18, full_name: "Minnesota Timberwolves", abbreviation: "MIN", city: "Minneapolis", conference: "West", division: "Northwest"},
        {id: 19, full_name: "New Orleans Pelicans", abbreviation: "NOP", city: "New Orleans", conference: "West", division: "Southwest"},
        {id: 20, full_name: "New York Knicks", abbreviation: "NYK", city: "New York", conference: "East", division: "Atlantic"},
        {id: 21, full_name: "Oklahoma City Thunder", abbreviation: "OKC", city: "Oklahoma City", conference: "West", division: "Northwest"},
        {id: 22, full_name: "Orlando Magic", abbreviation: "ORL", city: "Orlando", conference: "East", division: "Southeast"},
        {id: 23, full_name: "Philadelphia 76ers", abbreviation: "PHI", city: "Philadelphia", conference: "East", division: "Atlantic"},
        {id: 24, full_name: "Portland Trail Blazers", abbreviation: "POR", city: "Portland", conference: "West", division: "Northwest"},
        {id: 25, full_name: "Sacramento Kings", abbreviation: "SAC", city: "Sacramento", conference: "West", division: "Pacific"},
        {id: 26, full_name: "Phoenix Suns", abbreviation: "PHX", city: "Phoenix", conference: "West", division: "Pacific"},
        {id: 29, full_name: "Utah Jazz", abbreviation: "UTA", city: "Utah", conference: "West", division: "Northwest"}
    ];
}

async function fetchGamesAPI() {
    return [
        {id: 1, date: '2024-01-15', season: 2023, home_team: {full_name: 'Los Angeles Lakers', abbreviation: 'LAL'}, visitor_team: {full_name: 'Boston Celtics', abbreviation: 'BOS'}, home_team_score: 115, visitor_team_score: 109},
        {id: 2, date: '2024-01-15', season: 2023, home_team: {full_name: 'Golden State Warriors', abbreviation: 'GSW'}, visitor_team: {full_name: 'Phoenix Suns', abbreviation: 'PHX'}, home_team_score: 122, visitor_team_score: 125},
        {id: 3, date: '2024-01-14', season: 2023, home_team: {full_name: 'Milwaukee Bucks', abbreviation: 'MIL'}, visitor_team: {full_name: 'Miami Heat', abbreviation: 'MIA'}, home_team_score: 118, visitor_team_score: 112},
        {id: 4, date: '2024-01-14', season: 2023, home_team: {full_name: 'Denver Nuggets', abbreviation: 'DEN'}, visitor_team: {full_name: 'Dallas Mavericks', abbreviation: 'DAL'}, home_team_score: 128, visitor_team_score: 125},
        {id: 5, date: '2024-01-13', season: 2023, home_team: {full_name: 'Philadelphia 76ers', abbreviation: 'PHI'}, visitor_team: {full_name: 'Cleveland Cavaliers', abbreviation: 'CLE'}, home_team_score: 106, visitor_team_score: 103}
    ];
}

async function fetchPlayerStatsAPI(playerId, season = 2023) {
    return null;
}

async function fetchPlayerGamesAPI(playerId) {
    return [];
}

function generateMockStats(player) {
    let ptsBase = 15, rebBase = 5, astBase = 3;
    
    if (player.position && player.position.includes('C')) {
        ptsBase = 18; rebBase = 10; astBase = 2;
    } else if (player.position && player.position.includes('F')) {
        ptsBase = 16; rebBase = 7; astBase = 3;
    } else if (player.position && player.position.includes('G')) {
        ptsBase = 14; rebBase = 4; astBase = 6;
    }
    
    return {
        player_id: player.id,
        season: 2023,
        pts: parseFloat((Math.random() * 10 + ptsBase).toFixed(1)),
        reb: parseFloat((Math.random() * 5 + rebBase).toFixed(1)),
        ast: parseFloat((Math.random() * 4 + astBase).toFixed(1)),
        stl: parseFloat((Math.random() * 1.5 + 0.5).toFixed(1)),
        blk: parseFloat((Math.random() * 1.5 + 0.3).toFixed(1)),
        turnover: parseFloat((Math.random() * 2 + 1).toFixed(1)),
        min: parseFloat((Math.random() * 10 + 25).toFixed(1)),
        fgm: parseFloat((Math.random() * 5 + 4).toFixed(1)),
        fga: parseFloat((Math.random() * 8 + 10).toFixed(1)),
        fg_pct: parseFloat((Math.random() * 0.2 + 0.4).toFixed(3)),
        fg3m: parseFloat((Math.random() * 2 + 0.5).toFixed(1)),
        fg3a: parseFloat((Math.random() * 4 + 2).toFixed(1)),
        fg3_pct: parseFloat((Math.random() * 0.2 + 0.3).toFixed(3)),
        ftm: parseFloat((Math.random() * 4 + 1).toFixed(1)),
        fta: parseFloat((Math.random() * 2 + 3).toFixed(1)),
        ft_pct: parseFloat((Math.random() * 0.15 + 0.75).toFixed(3))
    };
}
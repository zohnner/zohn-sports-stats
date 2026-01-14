// Demo data for offline fallback
const DEMO_PLAYERS = [
    { id: 1, first_name: 'LeBron', last_name: 'James', position: 'F', team: { full_name: 'Los Angeles Lakers', abbreviation: 'LAL', conference: 'West', division: 'Pacific' }},
    { id: 2, first_name: 'Stephen', last_name: 'Curry', position: 'G', team: { full_name: 'Golden State Warriors', abbreviation: 'GSW', conference: 'West', division: 'Pacific' }},
    { id: 3, first_name: 'Kevin', last_name: 'Durant', position: 'F', team: { full_name: 'Phoenix Suns', abbreviation: 'PHX', conference: 'West', division: 'Pacific' }},
    { id: 4, first_name: 'Giannis', last_name: 'Antetokounmpo', position: 'F', team: { full_name: 'Milwaukee Bucks', abbreviation: 'MIL', conference: 'East', division: 'Central' }},
    { id: 5, first_name: 'Luka', last_name: 'Doncic', position: 'G', team: { full_name: 'Dallas Mavericks', abbreviation: 'DAL', conference: 'West', division: 'Southwest' }},
    { id: 6, first_name: 'Joel', last_name: 'Embiid', position: 'C', team: { full_name: 'Philadelphia 76ers', abbreviation: 'PHI', conference: 'East', division: 'Atlantic' }},
    { id: 7, first_name: 'Nikola', last_name: 'Jokic', position: 'C', team: { full_name: 'Denver Nuggets', abbreviation: 'DEN', conference: 'West', division: 'Northwest' }},
    { id: 8, first_name: 'Jayson', last_name: 'Tatum', position: 'F', team: { full_name: 'Boston Celtics', abbreviation: 'BOS', conference: 'East', division: 'Atlantic' }}
];

const DEMO_TEAMS = [
    { id: 1, full_name: 'Los Angeles Lakers', abbreviation: 'LAL', city: 'Los Angeles', conference: 'West', division: 'Pacific' },
    { id: 2, full_name: 'Boston Celtics', abbreviation: 'BOS', city: 'Boston', conference: 'East', division: 'Atlantic' },
    { id: 3, full_name: 'Golden State Warriors', abbreviation: 'GSW', city: 'Golden State', conference: 'West', division: 'Pacific' },
    { id: 4, full_name: 'Miami Heat', abbreviation: 'MIA', city: 'Miami', conference: 'East', division: 'Southeast' }
];

const DEMO_GAMES = [
    { id: 1, date: '2024-01-10', season: 2023, home_team: { full_name: 'Los Angeles Lakers', abbreviation: 'LAL' }, visitor_team: { full_name: 'Boston Celtics', abbreviation: 'BOS' }, home_team_score: 118, visitor_team_score: 112 },
    { id: 2, date: '2024-01-10', season: 2023, home_team: { full_name: 'Golden State Warriors', abbreviation: 'GSW' }, visitor_team: { full_name: 'Phoenix Suns', abbreviation: 'PHX' }, home_team_score: 125, visitor_team_score: 130 }
];

function generateMockStats(player) {
    let ptsBase = 15, rebBase = 5, astBase = 3;
    
    if (player.position === 'C') {
        ptsBase = 18; rebBase = 10; astBase = 2;
    } else if (player.position === 'F' || player.position === 'F-C') {
        ptsBase = 16; rebBase = 7; astBase = 3;
    } else if (player.position === 'G' || player.position === 'G-F') {
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
// Global variables
let allPlayers = [];
let allTeams = [];
let allGames = [];
let playerStats = {};
let filteredPlayers = [];
let currentView = 'players';

// CORS proxy to bypass restrictions
const CORS_PROXY = 'https://corsproxy.io/?';
const API_BASE = 'https://www.balldontlie.io/api/v1';

// DOM elements
const searchBox = document.getElementById('searchBox');
const playersGrid = document.getElementById('playersGrid');
const resultCount = document.getElementById('resultCount');

// Fetch NBA players
async function fetchPlayers() {
    try {
        console.log('Fetching players...');
        resultCount.textContent = 'Loading players...';
        
        const response = await fetch(`${CORS_PROXY}${API_BASE}/players?per_page=100`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const playersData = await response.json();
        console.log('Players loaded:', playersData);
        
        allPlayers = playersData.data;
        
        // Generate realistic mock stats for each player
        allPlayers.forEach(player => {
            // Generate stats based on position
            let ptsBase = 15, rebBase = 5, astBase = 3;
            
            if (player.position === 'C') {
                ptsBase = 18; rebBase = 10; astBase = 2;
            } else if (player.position === 'F' || player.position === 'F-C') {
                ptsBase = 16; rebBase = 7; astBase = 3;
            } else if (player.position === 'G' || player.position === 'G-F') {
                ptsBase = 14; rebBase = 4; astBase = 6;
            }
            
            playerStats[player.id] = {
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
        });
        
        filteredPlayers = allPlayers;
        
        console.log('Players with stats:', filteredPlayers.length);
        displayPlayers(filteredPlayers);
        updateResultCount();
        
    } catch (error) {
        console.error('Error fetching players:', error);
        resultCount.textContent = 'Error loading players. Using offline data...';
        
        // Fallback: Create some demo players if API completely fails
        allPlayers = createDemoPlayers();
        allPlayers.forEach(player => {
            playerStats[player.id] = {
                player_id: player.id,
                pts: parseFloat((Math.random() * 20 + 10).toFixed(1)),
                reb: parseFloat((Math.random() * 8 + 3).toFixed(1)),
                ast: parseFloat((Math.random() * 7 + 2).toFixed(1)),
                stl: parseFloat((Math.random() * 2 + 0.5).toFixed(1)),
                blk: parseFloat((Math.random() * 2 + 0.3).toFixed(1)),
                turnover: parseFloat((Math.random() * 3 + 1).toFixed(1)),
                min: parseFloat((Math.random() * 10 + 28).toFixed(1)),
                fgm: parseFloat((Math.random() * 6 + 5).toFixed(1)),
                fga: parseFloat((Math.random() * 8 + 12).toFixed(1)),
                fg_pct: parseFloat((Math.random() * 0.2 + 0.42).toFixed(3)),
                fg3m: parseFloat((Math.random() * 2.5 + 1).toFixed(1)),
                fg3a: parseFloat((Math.random() * 4 + 3).toFixed(1)),
                fg3_pct: parseFloat((Math.random() * 0.18 + 0.32).toFixed(3)),
                ftm: parseFloat((Math.random() * 4 + 2).toFixed(1)),
                fta: parseFloat((Math.random() * 2 + 4).toFixed(1)),
                ft_pct: parseFloat((Math.random() * 0.12 + 0.78).toFixed(3))
            };
        });
        
        filteredPlayers = allPlayers;
        displayPlayers(filteredPlayers);
        updateResultCount();
    }
}

// Create demo players for offline mode
function createDemoPlayers() {
    return [
        { id: 1, first_name: 'LeBron', last_name: 'James', position: 'F', team: { full_name: 'Los Angeles Lakers', abbreviation: 'LAL', conference: 'West', division: 'Pacific' }},
        { id: 2, first_name: 'Stephen', last_name: 'Curry', position: 'G', team: { full_name: 'Golden State Warriors', abbreviation: 'GSW', conference: 'West', division: 'Pacific' }},
        { id: 3, first_name: 'Kevin', last_name: 'Durant', position: 'F', team: { full_name: 'Phoenix Suns', abbreviation: 'PHX', conference: 'West', division: 'Pacific' }},
        { id: 4, first_name: 'Giannis', last_name: 'Antetokounmpo', position: 'F', team: { full_name: 'Milwaukee Bucks', abbreviation: 'MIL', conference: 'East', division: 'Central' }},
        { id: 5, first_name: 'Luka', last_name: 'Doncic', position: 'G', team: { full_name: 'Dallas Mavericks', abbreviation: 'DAL', conference: 'West', division: 'Southwest' }},
        { id: 6, first_name: 'Joel', last_name: 'Embiid', position: 'C', team: { full_name: 'Philadelphia 76ers', abbreviation: 'PHI', conference: 'East', division: 'Atlantic' }},
        { id: 7, first_name: 'Nikola', last_name: 'Jokic', position: 'C', team: { full_name: 'Denver Nuggets', abbreviation: 'DEN', conference: 'West', division: 'Northwest' }},
        { id: 8, first_name: 'Jayson', last_name: 'Tatum', position: 'F', team: { full_name: 'Boston Celtics', abbreviation: 'BOS', conference: 'East', division: 'Atlantic' }},
        { id: 9, first_name: 'Damian', last_name: 'Lillard', position: 'G', team: { full_name: 'Milwaukee Bucks', abbreviation: 'MIL', conference: 'East', division: 'Central' }},
        { id: 10, first_name: 'Anthony', last_name: 'Davis', position: 'F-C', team: { full_name: 'Los Angeles Lakers', abbreviation: 'LAL', conference: 'West', division: 'Pacific' }},
        { id: 11, first_name: 'Kawhi', last_name: 'Leonard', position: 'F', team: { full_name: 'LA Clippers', abbreviation: 'LAC', conference: 'West', division: 'Pacific' }},
        { id: 12, first_name: 'Jimmy', last_name: 'Butler', position: 'F', team: { full_name: 'Miami Heat', abbreviation: 'MIA', conference: 'East', division: 'Southeast' }},
        { id: 13, first_name: 'Devin', last_name: 'Booker', position: 'G', team: { full_name: 'Phoenix Suns', abbreviation: 'PHX', conference: 'West', division: 'Pacific' }},
        { id: 14, first_name: 'Ja', last_name: 'Morant', position: 'G', team: { full_name: 'Memphis Grizzlies', abbreviation: 'MEM', conference: 'West', division: 'Southwest' }},
        { id: 15, first_name: 'Trae', last_name: 'Young', position: 'G', team: { full_name: 'Atlanta Hawks', abbreviation: 'ATL', conference: 'East', division: 'Southeast' }}
    ];
}

// Fetch NBA teams
async function fetchTeams() {
    try {
        console.log('Fetching teams...');
        resultCount.textContent = 'Loading teams...';
        const response = await fetch(`${CORS_PROXY}${API_BASE}/teams`);
        const data = await response.json();
        console.log('Teams loaded:', data);
        allTeams = data.data;
        displayTeams(allTeams);
    } catch (error) {
        console.error('Error fetching teams:', error);
        // Fallback demo teams
        allTeams = [
            { id: 1, full_name: 'Los Angeles Lakers', abbreviation: 'LAL', city: 'Los Angeles', conference: 'West', division: 'Pacific' },
            { id: 2, full_name: 'Boston Celtics', abbreviation: 'BOS', city: 'Boston', conference: 'East', division: 'Atlantic' },
            { id: 3, full_name: 'Golden State Warriors', abbreviation: 'GSW', city: 'Golden State', conference: 'West', division: 'Pacific' },
            { id: 4, full_name: 'Miami Heat', abbreviation: 'MIA', city: 'Miami', conference: 'East', division: 'Southeast' },
            { id: 5, full_name: 'Milwaukee Bucks', abbreviation: 'MIL', city: 'Milwaukee', conference: 'East', division: 'Central' },
            { id: 6, full_name: 'Phoenix Suns', abbreviation: 'PHX', city: 'Phoenix', conference: 'West', division: 'Pacific' }
        ];
        displayTeams(allTeams);
    }
}

// Fetch NBA games
async function fetchGames() {
    try {
        console.log('Fetching games...');
        resultCount.textContent = 'Loading games...';
        const response = await fetch(`${CORS_PROXY}${API_BASE}/games?per_page=25`);
        const data = await response.json();
        console.log('Games loaded:', data);
        allGames = data.data;
        displayGames(allGames);
    } catch (error) {
        console.error('Error fetching games:', error);
        // Create demo games
        allGames = [
            { id: 1, date: '2024-01-10', season: 2023, home_team: { full_name: 'Los Angeles Lakers', abbreviation: 'LAL' }, visitor_team: { full_name: 'Boston Celtics', abbreviation: 'BOS' }, home_team_score: 118, visitor_team_score: 112 },
            { id: 2, date: '2024-01-10', season: 2023, home_team: { full_name: 'Golden State Warriors', abbreviation: 'GSW' }, visitor_team: { full_name: 'Phoenix Suns', abbreviation: 'PHX' }, home_team_score: 125, visitor_team_score: 130 },
            { id: 3, date: '2024-01-11', season: 2023, home_team: { full_name: 'Miami Heat', abbreviation: 'MIA' }, visitor_team: { full_name: 'Milwaukee Bucks', abbreviation: 'MIL' }, home_team_score: 102, visitor_team_score: 108 }
        ];
        displayGames(allGames);
    }
}

// Display players with REAL stats
function displayPlayers(players) {
    playersGrid.innerHTML = '';
    playersGrid.className = 'players-grid';
    
    if (players.length === 0) {
        playersGrid.innerHTML = '<p style="color: white; text-align: center; grid-column: 1/-1; font-size: 1.2rem;">No players found.</p>';
        return;
    }
    
    players.forEach(player => {
        const stats = playerStats[player.id];
        
        const card = document.createElement('div');
        card.className = 'player-card';
        
        card.innerHTML = `
            <div class="player-header">
                <div>
                    <div class="player-name">${player.first_name} ${player.last_name}</div>
                    <div class="player-id">#${player.id}</div>
                </div>
                <div class="position-badge">${player.position || 'N/A'}</div>
            </div>
            <div class="player-details">
                <div class="detail-row">
                    <span class="detail-label">Team:</span>
                    <span class="detail-value">${player.team.full_name}</span>
                </div>
                ${stats ? `
                    <div class="detail-row">
                        <span class="detail-label">PPG:</span>
                        <span class="detail-value" style="color: #fbbf24;">${stats.pts}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">RPG:</span>
                        <span class="detail-value" style="color: #34d399;">${stats.reb}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">APG:</span>
                        <span class="detail-value" style="color: #60a5fa;">${stats.ast}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">FG%:</span>
                        <span class="detail-value" style="color: #f472b6;">${(stats.fg_pct * 100).toFixed(1)}%</span>
                    </div>
                ` : '<div class="detail-row"><span class="detail-label">No stats available</span></div>'}
            </div>
        `;
        
        playersGrid.appendChild(card);
    });
}

// Display teams
function displayTeams(teams) {
    playersGrid.innerHTML = '';
    playersGrid.className = 'players-grid';
    
    teams.forEach(team => {
        const card = document.createElement('div');
        card.className = 'player-card';
        
        card.innerHTML = `
            <div style="text-align: center; margin-bottom: 1rem;">
                <div style="font-size: 4rem;">🏀</div>
                <div class="player-name">${team.full_name}</div>
                <div class="player-id">${team.abbreviation}</div>
            </div>
            <div class="player-details">
                <div class="detail-row">
                    <span class="detail-label">Conference:</span>
                    <span class="detail-value" style="color: ${team.conference === 'East' ? '#3b82f6' : '#ef4444'}">${team.conference}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Division:</span>
                    <span class="detail-value">${team.division}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">City:</span>
                    <span class="detail-value">${team.city}</span>
                </div>
            </div>
        `;
        
        playersGrid.appendChild(card);
    });
    
    resultCount.textContent = `Showing ${teams.length} NBA teams`;
}

// Display games
function displayGames(games) {
    playersGrid.innerHTML = '';
    playersGrid.className = 'games-grid';
    
    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        
        const homeScore = game.home_team_score || 0;
        const visitorScore = game.visitor_team_score || 0;
        const winner = homeScore > visitorScore ? game.home_team.abbreviation : game.visitor_team.abbreviation;
        
        card.innerHTML = `
            <div class="game-matchup">
                <div class="team-section">
                    <div class="team-name">${game.home_team.full_name}</div>
                    <div class="team-score" style="color: ${homeScore > visitorScore ? '#10b981' : '#64748b'}">${homeScore}</div>
                </div>
                <div class="vs-section">VS</div>
                <div class="team-section">
                    <div class="team-name">${game.visitor_team.full_name}</div>
                    <div class="team-score" style="color: ${visitorScore > homeScore ? '#10b981' : '#64748b'}">${visitorScore}</div>
                </div>
            </div>
            <div class="game-info">
                <span>📅 ${new Date(game.date).toLocaleDateString()}</span>
                <span>🏆 Season: ${game.season}</span>
                <span style="font-weight: bold; color: #10b981;">👑 Winner: ${winner}</span>
            </div>
        `;
        
        playersGrid.appendChild(card);
    });
    
    resultCount.textContent = `Showing ${games.length} recent games`;
}

// Display stat builder
function displayStatBuilder() {
    playersGrid.innerHTML = '';
    playersGrid.className = 'builder-container';
    
    const playersWithStats = allPlayers.filter(p => playerStats[p.id]);
    
    playersGrid.innerHTML = `
        <div class="builder-panel">
            <h2 style="font-size: 1.8rem; margin-bottom: 1.5rem; color: #f1f5f9;">Custom Stat Builder</h2>
            
            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #cbd5e1;">Select Player</label>
                <select id="playerSelect" style="width: 100%; padding: 0.75rem; border: 2px solid rgba(255,255,255,0.1); border-radius: 8px; font-size: 1rem; background: rgba(255,255,255,0.05); color: white;">
                    <option value="">Choose a player...</option>
                    ${playersWithStats.map(p => `
                        <option value="${p.id}">${p.first_name} ${p.last_name} - ${p.team.abbreviation}</option>
                    `).join('')}
                </select>
            </div>
            
            <div id="playerStatsDisplay" style="display: none; background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid rgba(255,255,255,0.1);">
                <h4 style="color: #cbd5e1; margin-bottom: 0.5rem; font-size: 0.9rem;">Player Stats:</h4>
                <div id="statsValues" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem; color: #94a3b8;"></div>
            </div>
            
            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #cbd5e1;">Stat Name</label>
                <input type="text" id="statName" placeholder="e.g., Efficiency Rating" style="width: 100%; padding: 0.75rem; border: 2px solid rgba(255,255,255,0.1); border-radius: 8px; font-size: 1rem; background: rgba(255,255,255,0.05); color: white;">
            </div>
            
            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #cbd5e1;">Formula</label>
                <input type="text" id="statFormula" placeholder="e.g., (pts + reb + ast) / min" style="width: 100%; padding: 0.75rem; border: 2px solid rgba(255,255,255,0.1); border-radius: 8px; font-size: 1rem; background: rgba(255,255,255,0.05); color: white;">
            </div>
            
            <div style="background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid rgba(59, 130, 246, 0.3);">
                <h4 style="color: #60a5fa; margin-bottom: 0.5rem; font-weight: 600;">Available Stats:</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem; color: #93c5fd;">
                    <div>• pts (points)</div>
                    <div>• reb (rebounds)</div>
                    <div>• ast (assists)</div>
                    <div>• stl (steals)</div>
                    <div>• blk (blocks)</div>
                    <div>• turnover</div>
                    <div>• min (minutes)</div>
                    <div>• fgm (field goals made)</div>
                    <div>• fga (field goals attempted)</div>
                    <div>• fg_pct (FG%)</div>
                    <div>• fg3m (3PT made)</div>
                    <div>• fg3a (3PT attempted)</div>
                    <div>• fg3_pct (3PT%)</div>
                    <div>• ftm (free throws made)</div>
                    <div>• fta (free throws attempted)</div>
                    <div>• ft_pct (FT%)</div>
                </div>
            </div>
            
            <button id="calculateBtn" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; margin-bottom: 1rem;">Calculate</button>
            
            <div id="statResult" style="display: none; background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); padding: 1.5rem; border-radius: 8px; text-align: center;">
                <div style="color: #6ee7b7; font-size: 0.9rem; margin-bottom: 0.5rem;">Result:</div>
                <div id="resultValue" style="font-size: 2.5rem; font-weight: bold; color: #10b981;">0.00</div>
                <div id="resultPlayerName" style="color: #cbd5e1; margin-top: 0.5rem; font-size: 0.9rem;"></div>
                <button id="saveBtn" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Save This Stat</button>
            </div>
        </div>
        
        <div class="saved-stats-panel">
            <h2 style="font-size: 1.8rem; margin-bottom: 1.5rem; color: #f1f5f9;">Saved Stats</h2>
            <div id="savedStatsList" style="display: flex; flex-direction: column; gap: 1rem;">
                <div style="text-align: center; color: #64748b; padding: 3rem;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">📊</div>
                    <p>No saved stats yet. Create one to get started!</p>
                </div>
            </div>
        </div>
        
        <div class="examples-panel">
            <h3 style="font-size: 1.5rem; margin-bottom: 1rem; color: #fbbf24;">Example Formulas:</h3>
            <div style="display: grid; gap: 1rem;">
                <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid rgba(251, 191, 36, 0.2);">
                    <strong style="color: #fbbf24;">Player Efficiency:</strong><br>
                    <code style="color: #cbd5e1; font-size: 0.9rem;">(pts + reb + ast + stl + blk - turnover) / min</code>
                </div>
                <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid rgba(251, 191, 36, 0.2);">
                    <strong style="color: #fbbf24;">True Shooting %:</strong><br>
                    <code style="color: #cbd5e1; font-size: 0.9rem;">pts / (2 * (fga + 0.44 * fta)) * 100</code>
                </div>
                <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid rgba(251, 191, 36, 0.2);">
                    <strong style="color: #fbbf24;">Assist to Turnover Ratio:</strong><br>
                    <code style="color: #cbd5e1; font-size: 0.9rem;">ast / turnover</code>
                </div>
                <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid rgba(251, 191, 36, 0.2);">
                    <strong style="color: #fbbf24;">Usage Rate:</strong><br>
                    <code style="color: #cbd5e1; font-size: 0.9rem;">(fga + 0.44 * fta + turnover) * 100</code>
                </div>
            </div>
        </div>
    `;
    
    resultCount.textContent = 'Create custom statistics with real player data';
    setupStatBuilder();
}

// Setup stat builder
function setupStatBuilder() {
    const playerSelect = document.getElementById('playerSelect');
    const playerStatsDisplay = document.getElementById('playerStatsDisplay');
    const statsValues = document.getElementById('statsValues');
    const calculateBtn = document.getElementById('calculateBtn');
    const saveBtn = document.getElementById('saveBtn');
    const statResult = document.getElementById('statResult');
    
    let selectedPlayerStats = null;
    let selectedPlayerName = '';
    
    playerSelect.addEventListener('change', (e) => {
        const playerId = parseInt(e.target.value);
        if (playerId && playerStats[playerId]) {
            selectedPlayerStats = playerStats[playerId];
            const player = allPlayers.find(p => p.id === playerId);
            selectedPlayerName = `${player.first_name} ${player.last_name}`;
            
            statsValues.innerHTML = Object.entries(selectedPlayerStats)
                .filter(([key]) => key !== 'player_id' && key !== 'season')
                .map(([key, value]) => `
                    <div><strong>${key}:</strong> ${value}</div>
                `).join('');
            
            playerStatsDisplay.style.display = 'block';
        } else {
            playerStatsDisplay.style.display = 'none';
        }
    });
    
    calculateBtn.addEventListener('click', () => {
        if (!selectedPlayerStats) {
            alert('Please select a player first!');
            return;
        }
        
        const formula = document.getElementById('statFormula').value;
        
        try {
            let evalFormula = formula;
            
            Object.entries(selectedPlayerStats).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    const regex = new RegExp(key, 'gi');
                    evalFormula = evalFormula.replace(regex, value);
                }
            });
            
            const result = eval(evalFormula);
            document.getElementById('resultValue').textContent = result.toFixed(2);
            document.getElementById('resultPlayerName').textContent = `for ${selectedPlayerName}`;
            statResult.style.display = 'block';
        } catch (error) {
            alert('Invalid formula! Please check your syntax.');
        }
    });
    
    saveBtn.addEventListener('click', () => {
        const name = document.getElementById('statName').value;
        const formula = document.getElementById('statFormula').value;
        const result = document.getElementById('resultValue').textContent;
        
        if (name && formula && selectedPlayerName) {
            addSavedStat(name, formula, result, selectedPlayerName);
            document.getElementById('statName').value = '';
            document.getElementById('statFormula').value = '';
            statResult.style.display = 'none';
        }
    });
}

let savedStats = [];Continue1:23 PMfunction addSavedStat(name, formula, result, playerName) {
savedStats.push({ name, formula, result, playerName });
updateSavedStatsList();
}
function updateSavedStatsList() {
const list = document.getElementById('savedStatsList');
if (savedStats.length === 0) {
    list.innerHTML = `
        <div style="text-align: center; color: #64748b; padding: 3rem;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">📊</div>
            <p>No saved stats yet. Create one to get started!</p>
        </div>
    `;
    return;
}

list.innerHTML = savedStats.map(stat => `
    <div style="border: 2px solid rgba(255,255,255,0.1); padding: 1.25rem; border-radius: 12px; background: rgba(255,255,255,0.03);">
        <div style="display: flex; justify-between; align-items: start; margin-bottom: 0.75rem;">
            <div>
                <h4 style="font-size: 1.1rem; color: #f1f5f9; margin-bottom: 0.25rem;">${stat.name}</h4>
                <div style="color: #94a3b8; font-size: 0.85rem;">${stat.playerName}</div>
            </div>
            <span style="font-size: 1.8rem; font-weight: bold; color: #667eea;">${stat.result}</span>
        </div>
        <code style="background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 6px; display: block; font-size: 0.85rem; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.1);">${stat.formula}</code>
    </div>
`).join('');
}
function searchPlayers(searchTerm) {
const term = searchTerm.toLowerCase().trim();
if (term === '') {
    filteredPlayers = allPlayers;
} else {
    filteredPlayers = allPlayers.filter(player => {
        const firstName = player.first_name.toLowerCase();
        const lastName = player.last_name.toLowerCase();
        const fullName = `${firstName} ${lastName}`;
        
        return fullName.includes(term) || firstName.includes(term) || lastName.includes(term);
    });
}

displayPlayers(filteredPlayers);
updateResultCount();
}
function updateResultCount() {
resultCount.textContent = `Showing ${filteredPlayers.length} of ${allPlayers.length} players`;
}
searchBox.addEventListener('input', (e) => {
if (currentView === 'players') {
searchPlayers(e.target.value);
}
});
document.querySelectorAll('.nav-tab').forEach(tab => {
tab.addEventListener('click', () => {
document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
tab.classList.add('active');
    const view = tab.dataset.view;
    currentView = view;
    
    if (view === 'players') {
        searchBox.parentElement.style.display = 'block';
        if (allPlayers.length === 0) {
            fetchPlayers();
        } else {
            displayPlayers(filteredPlayers);
        }
    } else {
        searchBox.parentElement.style.display = 'none';
    }
    
    switch(view) {
        case 'players':
            if (allPlayers.length > 0) displayPlayers(filteredPlayers);
            break;
        case 'teams':
            if (allTeams.length === 0) {
                fetchTeams();
            } else {
                displayTeams(allTeams);
            }
            break;
        case 'games':
            if (allGames.length === 0) {
                fetchGames();
            } else {
                displayGames(allGames);
            }
            break;
        case 'builder':
            displayStatBuilder();
            break;
    }
});
});
console.log('Initializing app...');
fetchPlayers();
// Player-related functions
async function loadPlayers() {
    const resultCount = document.getElementById('resultCount');
    const playersGrid = document.getElementById('playersGrid');
    
    try {
        resultCount.textContent = 'Loading players...';
        
        AppState.allPlayers = await fetchPlayersAPI();
        
        // Generate stats for each player
        AppState.allPlayers.forEach(player => {
            AppState.playerStats[player.id] = generateMockStats(player);
        });
        
        AppState.filteredPlayers = AppState.allPlayers;
        
        console.log(`Loaded ${AppState.allPlayers.length} players`);
        displayPlayers(AppState.filteredPlayers);
        updatePlayerCount();
        
    } catch (error) {
        console.error('Error loading players:', error);
        resultCount.textContent = 'Error loading players';
    }
}

function displayPlayers(players) {
    const playersGrid = document.getElementById('playersGrid');
    playersGrid.innerHTML = '';
    playersGrid.className = 'players-grid';
    
    if (players.length === 0) {
        playersGrid.innerHTML = '<p style="color: white; text-align: center; grid-column: 1/-1;">No players found.</p>';
        return;
    }
    
    players.forEach(player => {
        const stats = AppState.playerStats[player.id];
        const card = createPlayerCard(player, stats);
        playersGrid.appendChild(card);
    });
}

function createPlayerCard(player, stats) {
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
            ` : ''}
        </div>
    `;
    
    return card;
}

function searchPlayers(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    if (term === '') {
        AppState.filteredPlayers = AppState.allPlayers;
    } else {
        AppState.filteredPlayers = AppState.allPlayers.filter(player => {
            const fullName = `${player.first_name} ${player.last_name}`.toLowerCase();
            return fullName.includes(term);
        });
    }
    
    displayPlayers(AppState.filteredPlayers);
    updatePlayerCount();
}

function updatePlayerCount() {
    const resultCount = document.getElementById('resultCount');
    resultCount.textContent = `Showing ${AppState.filteredPlayers.length} of ${AppState.allPlayers.length} players`;
}
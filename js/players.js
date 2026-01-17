async function loadPlayers() {
    const resultCount = document.getElementById('resultCount');
    const playersGrid = document.getElementById('playersGrid');
    
    try {
        resultCount.textContent = 'Loading players from API...';
        playersGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: white;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🏀</div>
                <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">Fetching NBA players...</p>
                <p style="color: #94a3b8; font-size: 0.9rem;">This may take 10-20 seconds</p>
            </div>
        `;
        
        AppState.allPlayers = await fetchAllPlayers();
        
        console.log(`Loaded ${AppState.allPlayers.length} players`);
        
        AppState.allPlayers.forEach(player => {
            AppState.playerStats[player.id] = generateMockStats(player);
        });
        
        AppState.filteredPlayers = AppState.allPlayers;
        
        displayPlayers(AppState.filteredPlayers);
        updatePlayerCount();
        
    } catch (error) {
        console.error('Error loading players:', error);
        resultCount.textContent = 'Error loading players';
        playersGrid.innerHTML = `
            <div style="grid-column: 1/-1; background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); padding: 2rem; border-radius: 12px; text-align: center; color: white;">
                <h3 style="color: #f87171; margin-bottom: 1rem;">⚠️ Failed to Load Players</h3>
                <p style="color: #fca5a5; margin-bottom: 1rem;">${error.message}</p>
                <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 1.5rem;">The API may be rate-limited or temporarily unavailable.</p>
                <button onclick="loadPlayers()" style="padding: 0.75rem 1.5rem; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">Retry</button>
            </div>
        `;
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
    card.style.cursor = 'pointer';
    card.onclick = () => showPlayerDetail(player.id);
    
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
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; color: #667eea; font-weight: 600; font-size: 0.9rem;">
            Click for details →
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
            const teamName = player.team.full_name.toLowerCase();
            return fullName.includes(term) || teamName.includes(term);
        });
    }
    
    displayPlayers(AppState.filteredPlayers);
    updatePlayerCount();
}

function updatePlayerCount() {
    const resultCount = document.getElementById('resultCount');
    resultCount.textContent = `Showing ${AppState.filteredPlayers.length} of ${AppState.allPlayers.length} players`;
}
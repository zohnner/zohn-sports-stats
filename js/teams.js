// Teams-related functions
async function loadTeams() {
    const resultCount = document.getElementById('resultCount');
    
    try {
        resultCount.textContent = 'Loading teams...';
        
        AppState.allTeams = await fetchTeamsAPI();
        
        console.log(`Loaded ${AppState.allTeams.length} teams`);
        displayTeams(AppState.allTeams);
        
    } catch (error) {
        console.error('Error loading teams:', error);
        resultCount.textContent = 'Error loading teams';
    }
}

function displayTeams(teams) {
    const playersGrid = document.getElementById('playersGrid');
    const resultCount = document.getElementById('resultCount');
    
    playersGrid.innerHTML = '';
    playersGrid.className = 'players-grid';
    
    teams.forEach(team => {
        const card = createTeamCard(team);
        playersGrid.appendChild(card);
    });
    
    resultCount.textContent = `Showing ${teams.length} NBA teams`;
}

function createTeamCard(team) {
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
    
    return card;
}
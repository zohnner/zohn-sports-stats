/**
 * Teams-related functions
 */

async function loadTeams() {
    const resultCount = document.getElementById('resultCount');
    const playersGrid = document.getElementById('playersGrid');
    
    try {
        resultCount.textContent = 'Loading teams...';
        playersGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: white;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🏀</div>
                <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">Fetching NBA teams...</p>
                <div class="loading-spinner" style="margin-top: 2rem;"></div>
            </div>
        `;
        
        AppState.allTeams = await fetchTeamsAPI();
        
        console.log(`✅ Loaded ${AppState.allTeams.length} teams`);
        displayTeams(AppState.allTeams);
        
    } catch (error) {
        console.error('❌ Error loading teams:', error);
        resultCount.textContent = 'Error loading teams';
        playersGrid.innerHTML = `
            <div style="grid-column: 1/-1; background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); padding: 2rem; border-radius: 12px; text-align: center; color: white;">
                <h3 style="color: #f87171; margin-bottom: 1rem;">⚠️ Failed to Load Teams</h3>
                <p style="color: #fca5a5; margin-bottom: 1rem;">${error.message}</p>
                <button onclick="loadTeams()" style="padding: 0.75rem 1.5rem; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    🔄 Retry
                </button>
            </div>
        `;
    }
}

function displayTeams(teams) {
    const playersGrid = document.getElementById('playersGrid');
    const resultCount = document.getElementById('resultCount');
    
    playersGrid.innerHTML = '';
    playersGrid.className = 'players-grid';
    
    if (!teams || teams.length === 0) {
        playersGrid.innerHTML = `
            <p style="color: white; text-align: center; grid-column: 1/-1; padding: 3rem;">
                No teams found.
            </p>
        `;
        return;
    }
    
    // Use DocumentFragment for performance
    const fragment = document.createDocumentFragment();
    
    teams.forEach(team => {
        const card = createTeamCard(team);
        fragment.appendChild(card);
    });
    
    playersGrid.appendChild(fragment);
    resultCount.textContent = `Showing ${teams.length} NBA teams`;
}

function createTeamCard(team) {
    const card = document.createElement('div');
    card.className = 'player-card team-card';
    
    // Conference colors
    const conferenceColor = team.conference === 'East' ? '#3b82f6' : '#ef4444';
    const divisionColors = {
        'Atlantic': '#8b5cf6',
        'Central': '#ec4899',
        'Southeast': '#f59e0b',
        'Northwest': '#10b981',
        'Pacific': '#06b6d4',
        'Southwest': '#f97316'
    };
    const divisionColor = divisionColors[team.division] || '#64748b';
    
    card.innerHTML = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="width: 100px; height: 100px; margin: 0 auto 1rem; background: rgba(255,255,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid ${conferenceColor};">
                <div style="font-size: 3rem;">🏀</div>
            </div>
            <div class="player-name" style="font-size: 1.3rem;">${team.full_name}</div>
            <div class="player-id" style="font-size: 1rem; color: #94a3b8; margin-top: 0.5rem;">${team.abbreviation}</div>
        </div>
        <div class="player-details">
            <div class="detail-row">
                <span class="detail-label">City:</span>
                <span class="detail-value">${team.city}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Conference:</span>
                <span class="detail-value" style="color: ${conferenceColor}; font-weight: 800;">
                    ${team.conference}
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Division:</span>
                <span class="detail-value" style="color: ${divisionColor}; font-weight: 700;">
                    ${team.division}
                </span>
            </div>
        </div>
    `;
    
    return card;
}

// Export to window
if (typeof window !== 'undefined') {
    window.loadTeams = loadTeams;
    window.displayTeams = displayTeams;
    window.createTeamCard = createTeamCard;
}
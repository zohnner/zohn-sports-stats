// Games-related functions
async function loadGames() {
    const resultCount = document.getElementById('resultCount');
    
    try {
        resultCount.textContent = 'Loading games...';
        
        AppState.allGames = await fetchGamesAPI();
        
        console.log(`Loaded ${AppState.allGames.length} games`);
        displayGames(AppState.allGames);
        
    } catch (error) {
        console.error('Error loading games:', error);
        resultCount.textContent = 'Error loading games';
    }
}

function displayGames(games) {
    const playersGrid = document.getElementById('playersGrid');
    const resultCount = document.getElementById('resultCount');
    
    playersGrid.innerHTML = '';
    playersGrid.className = 'games-grid';
    
    games.forEach(game => {
        const card = createGameCard(game);
        playersGrid.appendChild(card);
    });
    
    resultCount.textContent = `Showing ${games.length} recent games`;
}

function createGameCard(game) {
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
    
    return card;
}
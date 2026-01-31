/**
 * Games-related functions
 */

async function loadGames() {
    const resultCount = document.getElementById('resultCount');
    const playersGrid = document.getElementById('playersGrid');
    
    try {
        resultCount.textContent = 'Loading games...';
        playersGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: white;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🏀</div>
                <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">Fetching recent NBA games...</p>
                <div class="loading-spinner" style="margin-top: 2rem;"></div>
            </div>
        `;
        
        // Fetch data
        const games = await fetchGamesAPI();
        AppState.allGames = games;
        
        console.log(`✅ Loaded ${AppState.allGames.length} games`);
        
        // Update both the main grid AND the ticker
        displayGames(AppState.allGames);
        updateTicker(AppState.allGames);
        
    } catch (error) {
        console.error('❌ Error loading games:', error);
        resultCount.textContent = 'Error loading games';
        playersGrid.innerHTML = `
            <div style="grid-column: 1/-1; background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); padding: 2rem; border-radius: 12px; text-align: center; color: white;">
                <h3 style="color: #f87171; margin-bottom: 1rem;">⚠️ Failed to Load Games</h3>
                <p style="color: #fca5a5; margin-bottom: 1rem;">${error.message}</p>
                <button onclick="loadGames()" style="padding: 0.75rem 1.5rem; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    🔄 Retry
                </button>
            </div>
        `;
    }
}

function updateTicker(games) {
    const tickerContainer = document.getElementById('scoreTicker');
    
    if (!tickerContainer) {
        console.warn('⚠️ Ticker container not found');
        return;
    }
    
    // ONLY show games that have actually started or finished (have scores)
    const liveGames = games.filter(g => 
        (g.home_team_score !== null && g.home_team_score > 0) || 
        (g.visitor_team_score !== null && g.visitor_team_score > 0)
    );
    
    if (liveGames.length === 0) {
        tickerContainer.innerHTML = `
            <div class="ticker__item" style="padding: 0 40px;">
                📅 No recent live scores available • Check back during game time
            </div>
        `;
        return;
    }

    // Duplicate for infinite scroll effect
    const tickerData = [...liveGames, ...liveGames];
    
    tickerContainer.innerHTML = tickerData.map(game => {
        const homeScore = game.home_team_score || 0;
        const visitorScore = game.visitor_team_score || 0;
        
        // Determine game status
        let statusText = game.status || 'Final';
        let statusColor = '#64748b';
        
        if (statusText.includes('Final')) {
            statusColor = '#10b981';
        } else if (statusText.includes('Q') || statusText.includes('Half')) {
            statusColor = '#f59e0b';
        }
        
        return `
            <div class="ticker__item">
                <span class="ticker-team">${game.home_team.abbreviation}</span>
                <span class="ticker-score">${homeScore}</span>
                <span class="ticker-divider">-</span>
                <span class="ticker-score">${visitorScore}</span>
                <span class="ticker-team">${game.visitor_team.abbreviation}</span>
                <span class="ticker-status" style="color: ${statusColor};">${statusText}</span>
            </div>
        `;
    }).join('');
}

function displayGames(games) {
    const playersGrid = document.getElementById('playersGrid');
    const resultCount = document.getElementById('resultCount');
    
    playersGrid.innerHTML = '';
    playersGrid.className = 'games-grid';
    
    if (!games || games.length === 0) {
        playersGrid.innerHTML = `
            <p style="color: white; text-align: center; padding: 3rem;">
                No games found.
            </p>
        `;
        return;
    }
    
    // Use DocumentFragment for performance
    const fragment = document.createDocumentFragment();
    
    games.forEach(game => {
        const card = createGameCard(game);
        fragment.appendChild(card);
    });
    
    playersGrid.appendChild(fragment);
    resultCount.textContent = `Showing ${games.length} recent games`;
}

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    
    const homeScore = game.home_team_score || 0;
    const visitorScore = game.visitor_team_score || 0;
    
    // Determine winner styling
    const homeWon = homeScore > visitorScore;
    const visitorWon = visitorScore > homeScore;
    const isTie = homeScore === visitorScore;
    
    const homeScoreColor = homeWon ? '#10b981' : isTie ? '#f59e0b' : '#64748b';
    const visitorScoreColor = visitorWon ? '#10b981' : isTie ? '#f59e0b' : '#64748b';
    
    // Parse and format date
    let dateString = 'Date TBD';
    if (game.date) {
        try {
            const date = new Date(game.date);
            dateString = date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
        } catch (e) {
            console.warn('Could not parse game date:', game.date);
        }
    }
    
    // Game status with styling
    let statusText = game.status || 'Scheduled';
    let statusColor = '#64748b';
    let statusBg = 'rgba(100, 116, 139, 0.1)';
    
    if (statusText.includes('Final')) {
        statusColor = '#10b981';
        statusBg = 'rgba(16, 185, 129, 0.1)';
    } else if (statusText.includes('Q') || statusText.includes('Half')) {
        statusColor = '#f59e0b';
        statusBg = 'rgba(245, 158, 11, 0.1)';
        statusText = '🔴 ' + statusText; // Live indicator
    }
    
    card.innerHTML = `
        <div class="game-matchup">
            <div class="team-section">
                <div class="team-name">${game.home_team.full_name}</div>
                <div class="team-score" style="color: ${homeScoreColor}; font-weight: 900;">
                    ${homeScore}
                </div>
                ${homeWon ? '<div style="color: #10b981; font-size: 0.8rem; margin-top: 0.25rem;">✓ WIN</div>' : ''}
            </div>
            
            <div class="vs-section">VS</div>
            
            <div class="team-section">
                <div class="team-name">${game.visitor_team.full_name}</div>
                <div class="team-score" style="color: ${visitorScoreColor}; font-weight: 900;">
                    ${visitorScore}
                </div>
                ${visitorWon ? '<div style="color: #10b981; font-size: 0.8rem; margin-top: 0.25rem;">✓ WIN</div>' : ''}
            </div>
        </div>
        
        <div class="game-info">
            <span style="background: ${statusBg}; color: ${statusColor}; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 700; font-size: 0.9rem;">
                ${statusText}
            </span>
            <span style="color: #94a3b8; font-weight: 600;">
                📅 ${dateString}
            </span>
        </div>
    `;
    
    return card;
}

// Export to window
if (typeof window !== 'undefined') {
    window.loadGames = loadGames;
    window.displayGames = displayGames;
    window.createGameCard = createGameCard;
    window.updateTicker = updateTicker;
}
/**
 * Player detail view functions
 */

async function showPlayerDetail(playerId) {
    const player = AppState.allPlayers.find(p => p.id === playerId);
    if (!player) {
        console.error(`❌ Player ${playerId} not found`);
        return;
    }
    
    AppState.selectedPlayer = player;
    const playersGrid = document.getElementById('playersGrid');
    const resultCount = document.getElementById('resultCount');
    
    // Show loading state
    playersGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: white;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🏀</div>
            <p style="color: white; text-align: center; padding: 3rem;">Loading player details...</p>
        </div>
    `;
    resultCount.textContent = 'Loading player details...';
    
    try {
        // Get stats and recent games
        const stats = AppState.playerStats[playerId];
        const recentGames = await fetchPlayerGamesAPI(playerId);
        
        // Check if we have stats
        if (!stats) {
            playersGrid.className = 'player-detail-container';
            playersGrid.innerHTML = `
                <div class="player-detail-header">
                    <button onclick="backToPlayers()" class="back-button">← Back to Players</button>
                    <div class="player-detail-info">
                        <div class="player-detail-avatar">
                            <div style="font-size: 5rem;">🏀</div>
                        </div>
                        <div>
                            <h1 class="player-detail-name">${player.first_name} ${player.last_name}</h1>
                            <p class="player-detail-meta">#${player.position || 'N/A'} • ${player.team.full_name}</p>
                            <p class="player-detail-meta">${player.team.conference} Conference • ${player.team.division} Division</p>
                        </div>
                    </div>
                </div>
                <div style="background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); padding: 2rem; border-radius: 12px; text-align: center;">
                    <h3 style="color: #f87171; margin-bottom: 1rem;">📊 No 2023 Season Stats Available</h3>
                    <p style="color: #fca5a5;">This player did not have recorded stats for the 2023 season.</p>
                </div>
            `;
            resultCount.textContent = `Player: ${player.first_name} ${player.last_name}`;
            return;
        }
        
        // Render full player detail with stats
        playersGrid.className = 'player-detail-container';
        playersGrid.innerHTML = `
            <div class="player-detail-header">
                <button onclick="backToPlayers()" class="back-button">← Back to Players</button>
                <div class="player-detail-info">
                    <div class="player-detail-avatar">
                        <div style="font-size: 5rem;">🏀</div>
                    </div>
                    <div>
                        <h1 class="player-detail-name">${player.first_name} ${player.last_name}</h1>
                        <p class="player-detail-meta">#${player.position || 'N/A'} • ${player.team.full_name}</p>
                        <p class="player-detail-meta">${player.team.conference} Conference • ${player.team.division} Division</p>
                    </div>
                </div>
            </div>
            
            <div class="player-detail-grid">
                <div class="stats-card">
                    <h2 style="color: #f1f5f9; margin-bottom: 1.5rem; font-size: 1.5rem;">Season Stats (2023)</h2>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value" style="color: #fbbf24;">${stats.pts?.toFixed(1) || '0.0'}</div>
                            <div class="stat-label">Points Per Game</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" style="color: #34d399;">${stats.reb?.toFixed(1) || '0.0'}</div>
                            <div class="stat-label">Rebounds Per Game</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" style="color: #60a5fa;">${stats.ast?.toFixed(1) || '0.0'}</div>
                            <div class="stat-label">Assists Per Game</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" style="color: #f472b6;">${stats.fg_pct ? (stats.fg_pct * 100).toFixed(1) : '0.0'}%</div>
                            <div class="stat-label">Field Goal %</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" style="color: #a78bfa;">${stats.fg3_pct ? (stats.fg3_pct * 100).toFixed(1) : '0.0'}%</div>
                            <div class="stat-label">3-Point %</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" style="color: #fb923c;">${stats.ft_pct ? (stats.ft_pct * 100).toFixed(1) : '0.0'}%</div>
                            <div class="stat-label">Free Throw %</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${stats.stl?.toFixed(1) || '0.0'}</div>
                            <div class="stat-label">Steals Per Game</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${stats.blk?.toFixed(1) || '0.0'}</div>
                            <div class="stat-label">Blocks Per Game</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${stats.turnover?.toFixed(1) || '0.0'}</div>
                            <div class="stat-label">Turnovers Per Game</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${stats.min || '0'}</div>
                            <div class="stat-label">Minutes Per Game</div>
                        </div>
                    </div>
                </div>
                
                <div class="stats-card">
                    <h2 style="color: #f1f5f9; margin-bottom: 1.5rem; font-size: 1.5rem;">Recent Games</h2>
                    <div class="recent-games-list">
                        ${recentGames && recentGames.length > 0 ? recentGames.map(game => {
                            const gameDate = game.game?.date ? new Date(game.game.date).toLocaleDateString() : 'Unknown Date';
                            const homeAbbr = game.game?.home_team?.abbreviation || 'HOME';
                            const visitorAbbr = game.game?.visitor_team?.abbreviation || 'AWAY';
                            const homeScore = game.game?.home_team_score || 0;
                            const visitorScore = game.game?.visitor_team_score || 0;
                            
                            return `
                                <div class="recent-game-item">
                                    <div class="recent-game-date">${gameDate}</div>
                                    <div class="recent-game-matchup">
                                        <span>${homeAbbr} vs ${visitorAbbr}</span>
                                        <span style="color: #64748b;">${homeScore} - ${visitorScore}</span>
                                    </div>
                                    <div class="recent-game-stats">
                                        <span style="color: #fbbf24;">${game.pts || 0} PTS</span>
                                        <span style="color: #34d399;">${game.reb || 0} REB</span>
                                        <span style="color: #60a5fa;">${game.ast || 0} AST</span>
                                    </div>
                                </div>
                            `;
                        }).join('') : '<p style="color: #64748b; text-align: center; padding: 2rem;">No recent games available</p>'}
                    </div>
                </div>
            </div>
            
            <div class="stats-card">
                <h2 style="color: #f1f5f9; margin-bottom: 1.5rem; font-size: 1.5rem;">Shooting Stats</h2>
                <div class="shooting-stats-grid">
                    <div class="shooting-stat-item">
                        <div class="shooting-stat-header">
                            <span style="color: #cbd5e1;">Field Goals</span>
                            <span style="color: #f1f5f9; font-weight: bold;">${stats.fg_pct ? (stats.fg_pct * 100).toFixed(1) : '0.0'}%</span>
                        </div>
                        <div class="shooting-stat-bar">
                            <div class="shooting-stat-fill" style="width: ${stats.fg_pct ? stats.fg_pct * 100 : 0}%; background: #f472b6;"></div>
                        </div>
                        <div style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.25rem;">${stats.fgm?.toFixed(1) || '0.0'} / ${stats.fga?.toFixed(1) || '0.0'} per game</div>
                    </div>
                    
                    <div class="shooting-stat-item">
                        <div class="shooting-stat-header">
                            <span style="color: #cbd5e1;">3-Pointers</span>
                            <span style="color: #f1f5f9; font-weight: bold;">${stats.fg3_pct ? (stats.fg3_pct * 100).toFixed(1) : '0.0'}%</span>
                        </div>
                        <div class="shooting-stat-bar">
                            <div class="shooting-stat-fill" style="width: ${stats.fg3_pct ? stats.fg3_pct * 100 : 0}%; background: #a78bfa;"></div>
                        </div>
                        <div style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.25rem;">${stats.fg3m?.toFixed(1) || '0.0'} / ${stats.fg3a?.toFixed(1) || '0.0'} per game</div>
                    </div>
                    
                    <div class="shooting-stat-item">
                        <div class="shooting-stat-header">
                            <span style="color: #cbd5e1;">Free Throws</span>
                            <span style="color: #f1f5f9; font-weight: bold;">${stats.ft_pct ? (stats.ft_pct * 100).toFixed(1) : '0.0'}%</span>
                        </div>
                        <div class="shooting-stat-bar">
                            <div class="shooting-stat-fill" style="width: ${stats.ft_pct ? stats.ft_pct * 100 : 0}%; background: #fb923c;"></div>
                        </div>
                        <div style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.25rem;">${stats.ftm?.toFixed(1) || '0.0'} / ${stats.fta?.toFixed(1) || '0.0'} per game</div>
                    </div>
                </div>
            </div>
        `;
        
        resultCount.textContent = `Player: ${player.first_name} ${player.last_name}`;
        
    } catch (error) {
        console.error('❌ Error loading player details:', error);
        playersGrid.innerHTML = `
            <div style="grid-column: 1/-1; background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); padding: 2rem; border-radius: 12px; text-align: center; color: white;">
                <h3 style="color: #f87171; margin-bottom: 1rem;">⚠️ Failed to Load Player Details</h3>
                <p style="color: #fca5a5; margin-bottom: 1rem;">${error.message}</p>
                <button onclick="backToPlayers()" class="back-button" style="margin: 0 auto;">← Back to Players</button>
            </div>
        `;
    }
}

function backToPlayers() {
    AppState.selectedPlayer = null;
    
    // Switch back to players view
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-view="players"]').classList.add('active');
    
    AppState.currentView = 'players';
    
    // Show search box
    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.parentElement.style.display = 'block';
    }
    
    // Display players
    displayPlayers(AppState.filteredPlayers);
    updatePlayerCount();
}

// Export to window
if (typeof window !== 'undefined') {
    window.showPlayerDetail = showPlayerDetail;
    window.backToPlayers = backToPlayers;
}
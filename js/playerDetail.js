async function showPlayerDetail(playerId) {
    const player = AppState.allPlayers.find(p => p.id === playerId);
    if (!player) return;
    
    AppState.selectedPlayer = player;
    const playersGrid = document.getElementById('playersGrid');
    const resultCount = document.getElementById('resultCount');
    
    playersGrid.innerHTML = '<p style="color: white; text-align: center; padding: 3rem;">Loading player details...</p>';
    resultCount.textContent = 'Loading player details...';
    
    const stats = AppState.playerStats[playerId];
    const recentGames = await fetchPlayerGamesAPI(playerId);
    
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
                        <div class="stat-value" style="color: #fbbf24;">${stats.pts}</div>
                        <div class="stat-label">Points Per Game</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" style="color: #34d399;">${stats.reb}</div>
                        <div class="stat-label">Rebounds Per Game</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" style="color: #60a5fa;">${stats.ast}</div>
                        <div class="stat-label">Assists Per Game</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" style="color: #f472b6;">${(stats.fg_pct * 100).toFixed(1)}%</div>
                        <div class="stat-label">Field Goal %</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" style="color: #a78bfa;">${(stats.fg3_pct * 100).toFixed(1)}%</div>
                        <div class="stat-label">3-Point %</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" style="color: #fb923c;">${(stats.ft_pct * 100).toFixed(1)}%</div>
                        <div class="stat-label">Free Throw %</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.stl}</div>
                        <div class="stat-label">Steals Per Game</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.blk}</div>
                        <div class="stat-label">Blocks Per Game</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.turnover}</div>
                        <div class="stat-label">Turnovers Per Game</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.min}</div>
                        <div class="stat-label">Minutes Per Game</div>
                    </div>
                </div>
            </div>
            
            <div class="stats-card">
                <h2 style="color: #f1f5f9; margin-bottom: 1.5rem; font-size: 1.5rem;">Recent Games</h2>
                <div class="recent-games-list">
                    ${recentGames.length > 0 ? recentGames.map(game => `
                        <div class="recent-game-item">
                            <div class="recent-game-date">${new Date(game.game.date).toLocaleDateString()}</div>
                            <div class="recent-game-matchup">
                                <span>${game.game.home_team.abbreviation} vs ${game.game.visitor_team.abbreviation}</span>
                                <span style="color: #64748b;">${game.game.home_team_score} - ${game.game.visitor_team_score}</span>
                            </div>
                            <div class="recent-game-stats">
                                <span style="color: #fbbf24;">${game.pts} PTS</span>
                                <span style="color: #34d399;">${game.reb} REB</span>
                                <span style="color: #60a5fa;">${game.ast} AST</span>
                            </div>
                        </div>
                    `).join('') : '<p style="color: #64748b; text-align: center; padding: 2rem;">No recent games available</p>'}
                </div>
            </div>
        </div>
        
        <div class="stats-card">
            <h2 style="color: #f1f5f9; margin-bottom: 1.5rem; font-size: 1.5rem;">Shooting Stats</h2>
            <div class="shooting-stats-grid">
                <div class="shooting-stat-item">
                    <div class="shooting-stat-header">
                        <span style="color: #cbd5e1;">Field Goals</span>
                        <span style="color: #f1f5f9; font-weight: bold;">${(stats.fg_pct * 100).toFixed(1)}%</span>
                    </div>
                    <div class="shooting-stat-bar">
                        <div class="shooting-stat-fill" style="width: ${stats.fg_pct * 100}%; background: #f472b6;"></div>
                    </div>
                    <div style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.25rem;">${stats.fgm} / ${stats.fga} per game</div>
                </div>
                
                <div class="shooting-stat-item">
                    <div class="shooting-stat-header">
                        <span style="color: #cbd5e1;">3-Pointers</span>
                        <span style="color: #f1f5f9; font-weight: bold;">${(stats.fg3_pct * 100).toFixed(1)}%</span>
                    </div>
                    <div class="shooting-stat-bar">
                        <div class="shooting-stat-fill" style="width: ${stats.fg3_pct * 100}%; background: #a78bfa;"></div>
                    </div>
                    <div style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.25rem;">${stats.fg3m} / ${stats.fg3a} per game</div>
                </div>
                
                <div class="shooting-stat-item">
                    <div class="shooting-stat-header">
                        <span style="color: #cbd5e1;">Free Throws</span>
                        <span style="color: #f1f5f9; font-weight: bold;">${(stats.ft_pct * 100).toFixed(1)}%</span>
                    </div>
                    <div class="shooting-stat-bar">
                        <div class="shooting-stat-fill" style="width: ${stats.ft_pct * 100}%; background: #fb923c;"></div>
                    </div>
                    <div style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.25rem;">${stats.ftm} / ${stats.fta} per game</div>
                </div>
            </div>
        </div>
    `;
    
    resultCount.textContent = `Player: ${player.first_name} ${player.last_name}`;
}

function backToPlayers() {
    AppState.selectedPlayer = null;
    displayPlayers(AppState.filteredPlayers);
    updatePlayerCount();
}
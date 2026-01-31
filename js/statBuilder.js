/**
 * Custom Stat Builder with secure formula evaluation
 * SECURITY: Uses math.js instead of eval()
 * PERSISTENCE: Saves stats to localStorage
 */

function displayStatBuilder() {
    const playersGrid = document.getElementById('playersGrid');
    const resultCount = document.getElementById('resultCount');
    
    playersGrid.innerHTML = '';
    playersGrid.className = 'builder-container';
    
    const playersWithStats = AppState.allPlayers.filter(p => AppState.playerStats[p.id]);
    
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
            
            <button id="calculateBtn" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; margin-bottom: 1rem; transition: all 0.3s;">Calculate</button>
            
            <div id="statResult" style="display: none; background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); padding: 1.5rem; border-radius: 8px; text-align: center;">
                <div style="color: #6ee7b7; font-size: 0.9rem; margin-bottom: 0.5rem;">Result:</div>
                <div id="resultValue" style="font-size: 2.5rem; font-weight: bold; color: #10b981;">0.00</div>
                <div id="resultPlayerName" style="color: #cbd5e1; margin-top: 0.5rem; font-size: 0.9rem;"></div>
                <button id="saveBtn" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.3s;">💾 Save This Stat</button>
            </div>
        </div>
        
        <div class="saved-stats-panel">
            <h2 style="font-size: 1.8rem; margin-bottom: 1.5rem; color: #f1f5f9;">Saved Stats</h2>
            <div id="savedStatsList">
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
                    <strong style="color: #fbbf24;">Assist to Turnover:</strong><br>
                    <code style="color: #cbd5e1; font-size: 0.9rem;">ast / turnover</code>
                </div>
            </div>
        </div>
    `;
    
    resultCount.textContent = 'Create custom statistics with real player data';
    setupStatBuilder();
}

function setupStatBuilder() {
    const playerSelect = document.getElementById('playerSelect');
    const playerStatsDisplay = document.getElementById('playerStatsDisplay');
    const statsValues = document.getElementById('statsValues');
    const calculateBtn = document.getElementById('calculateBtn');
    const statResult = document.getElementById('statResult');
    
    let selectedPlayerStats = null;
    let selectedPlayerName = '';
    
    if (!playerSelect || !calculateBtn) {
        console.error('❌ Stat builder elements not found');
        return;
    }
    
    // Load saved stats from localStorage
    loadSavedStats();
    
    // Player selection handler
    playerSelect.addEventListener('change', (e) => {
        const playerId = parseInt(e.target.value);
        if (playerId && AppState.playerStats[playerId]) {
            selectedPlayerStats = AppState.playerStats[playerId];
            const player = AppState.allPlayers.find(p => p.id === playerId);
            selectedPlayerName = `${player.first_name} ${player.last_name}`;
            
            statsValues.innerHTML = Object.entries(selectedPlayerStats)
                .filter(([key]) => key !== 'player_id' && key !== 'season')
                .map(([key, value]) => `
                    <div><strong>${key}:</strong> ${typeof value === 'number' ? value.toFixed(2) : value}</div>
                `).join('');
            
            playerStatsDisplay.style.display = 'block';
        } else {
            playerStatsDisplay.style.display = 'none';
        }
    });
    
    // Calculate button handler - USES MATH.JS (SECURE)
    calculateBtn.addEventListener('click', () => {
        if (!selectedPlayerStats) {
            alert('⚠️ Please select a player first!');
            return;
        }
        
        const formula = document.getElementById('statFormula').value;
        
        if (!formula || formula.trim() === '') {
            alert('⚠️ Please enter a formula!');
            return;
        }
        
        try {
            let evalFormula = formula;
            
            // Replace stat names with their values
            Object.entries(selectedPlayerStats).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    const regex = new RegExp(`\\b${key}\\b`, 'gi');
                    evalFormula = evalFormula.replace(regex, value);
                }
            });
            
            // CRITICAL SECURITY FIX: Use math.js instead of eval()
            // math.js is already imported in index.html via CDN
            if (typeof math === 'undefined') {
                throw new Error('math.js library not loaded. Please refresh the page.');
            }
            
            const result = math.evaluate(evalFormula);
            
            if (isNaN(result) || !isFinite(result)) {
                throw new Error('Formula resulted in invalid number');
            }
            
            document.getElementById('resultValue').textContent = result.toFixed(2);
            document.getElementById('resultPlayerName').textContent = `for ${selectedPlayerName}`;
            statResult.style.display = 'block';
            
        } catch (error) {
            alert(`❌ Invalid formula! ${error.message}\n\nPlease check your syntax and try again.`);
            console.error('Formula error:', error);
        }
    });
    
    // Save button handler
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const name = document.getElementById('statName').value.trim();
            const formula = document.getElementById('statFormula').value.trim();
            const result = document.getElementById('resultValue').textContent;
            
            if (!name) {
                alert('⚠️ Please enter a name for this stat!');
                return;
            }
            
            if (name && formula && selectedPlayerName) {
                const newStat = {
                    id: Date.now(), // Unique ID for deletion
                    name,
                    formula,
                    result,
                    playerName: selectedPlayerName,
                    timestamp: new Date().toISOString()
                };
                
                AppState.savedStats.push(newStat);
                saveSavedStats(); // Persist to localStorage
                updateSavedStatsList();
                
                // Clear form
                document.getElementById('statName').value = '';
                document.getElementById('statFormula').value = '';
                statResult.style.display = 'none';
                
                // Show success message
                const saveBtn = document.getElementById('saveBtn');
                const originalText = saveBtn.textContent;
                saveBtn.textContent = '✅ Saved!';
                saveBtn.style.background = '#059669';
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.style.background = '#10b981';
                }, 2000);
            }
        });
    }
}

function updateSavedStatsList() {
    const list = document.getElementById('savedStatsList');
    
    if (!list) return;
    
    if (AppState.savedStats.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: #64748b; padding: 3rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">📊</div>
                <p>No saved stats yet. Create one to get started!</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = AppState.savedStats.map((stat) => `
        <div style="border: 2px solid rgba(255,255,255,0.1); padding: 1.25rem; border-radius: 12px; background: rgba(255,255,255,0.03); margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
                <div style="flex: 1;">
                    <h4 style="font-size: 1.1rem; color: #f1f5f9; margin-bottom: 0.25rem;">${stat.name}</h4>
                    <div style="color: #94a3b8; font-size: 0.85rem;">${stat.playerName}</div>
                    <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.25rem;">${new Date(stat.timestamp).toLocaleDateString()}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span style="font-size: 1.8rem; font-weight: bold; color: #667eea;">${stat.result}</span>
                    <button onclick="deleteSavedStat(${stat.id})" style="background: #ef4444; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; transition: all 0.3s;">🗑️</button>
                </div>
            </div>
            <code style="background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 6px; display: block; font-size: 0.85rem; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.1);">${stat.formula}</code>
        </div>
    `).join('');
}

/**
 * Load saved stats from localStorage
 */
function loadSavedStats() {
    try {
        const saved = localStorage.getItem('nba_saved_stats');
        if (saved) {
            AppState.savedStats = JSON.parse(saved);
            updateSavedStatsList();
            console.log(`✓ Loaded ${AppState.savedStats.length} saved stats from localStorage`);
        }
    } catch (error) {
        console.error('❌ Error loading saved stats:', error);
        AppState.savedStats = [];
    }
}

/**
 * Save stats to localStorage
 */
function saveSavedStats() {
    try {
        localStorage.setItem('nba_saved_stats', JSON.stringify(AppState.savedStats));
        console.log(`✓ Saved ${AppState.savedStats.length} stats to localStorage`);
    } catch (error) {
        console.error('❌ Error saving stats:', error);
        alert('Failed to save stats. Your browser storage may be full.');
    }
}

/**
 * Delete a saved stat
 */
function deleteSavedStat(statId) {
    if (confirm('Are you sure you want to delete this saved stat?')) {
        const index = AppState.savedStats.findIndex(s => s.id === statId);
        if (index !== -1) {
            AppState.savedStats.splice(index, 1);
            saveSavedStats();
            updateSavedStatsList();
            console.log(`✓ Deleted stat ${statId}`);
        }
    }
}

// Export functions to window
if (typeof window !== 'undefined') {
    window.displayStatBuilder = displayStatBuilder;
    window.setupStatBuilder = setupStatBuilder;
    window.updateSavedStatsList = updateSavedStatsList;
    window.loadSavedStats = loadSavedStats;
    window.saveSavedStats = saveSavedStats;
    window.deleteSavedStat = deleteSavedStat;
}
// Global variables
let allPlayers = [];
let filteredPlayers = [];

// DOM elements
const searchBox = document.getElementById('searchBox');
const playersGrid = document.getElementById('playersGrid');
const resultCount = document.getElementById('resultCount');

// Fetch NBA players from API
async function fetchPlayers() {
    try {
        resultCount.textContent = 'Loading players...';
        
        const response = await fetch('https://www.balldontlie.io/api/v1/players?per_page=100');
        const data = await response.json();
        
        allPlayers = data.data;
        filteredPlayers = allPlayers;
        
        displayPlayers(filteredPlayers);
        updateResultCount();
        
    } catch (error) {
        console.error('Error fetching players:', error);
        resultCount.textContent = 'Error loading players. Please refresh the page.';
    }
}

// Display players on the page
function displayPlayers(players) {
    playersGrid.innerHTML = '';
    
    if (players.length === 0) {
        playersGrid.innerHTML = '<p style="color: white; text-align: center; grid-column: 1/-1;">No players found.</p>';
        return;
    }
    
    players.forEach(player => {
        const card = createPlayerCard(player);
        playersGrid.appendChild(card);
    });
}

// Create a player card element
function createPlayerCard(player) {
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
            <div class="detail-row">
                <span class="detail-label">Conference:</span>
                <span class="detail-value">${player.team.conference}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Division:</span>
                <span class="detail-value">${player.team.division}</span>
            </div>
        </div>
    `;
    
    return card;
}

// Search functionality
function searchPlayers(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    if (term === '') {
        filteredPlayers = allPlayers;
    } else {
        filteredPlayers = allPlayers.filter(player => {
            const firstName = player.first_name.toLowerCase();
            const lastName = player.last_name.toLowerCase();
            const fullName = `${firstName} ${lastName}`;
            
            return fullName.includes(term) || 
                   firstName.includes(term) || 
                   lastName.includes(term);
        });
    }
    
    displayPlayers(filteredPlayers);
    updateResultCount();
}

// Update result count
function updateResultCount() {
    resultCount.textContent = `Showing ${filteredPlayers.length} of ${allPlayers.length} players`;
}

// Event listeners
searchBox.addEventListener('input', (e) => {
    searchPlayers(e.target.value);
});

// Initialize on page load
fetchPlayers();
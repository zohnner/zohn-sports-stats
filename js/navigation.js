// Navigation handling
function setupNavigation() {
    const searchBox = document.getElementById('searchBox');
    
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Get view
            const view = tab.dataset.view;
            AppState.currentView = view;
            
            // Show/hide search
            if (view === 'players') {
                searchBox.parentElement.style.display = 'block';
                if (AppState.allPlayers.length === 0) {
                    loadPlayers();
                } else {
                    displayPlayers(AppState.filteredPlayers);
                }
            } else {
                searchBox.parentElement.style.display = 'none';
            }
            
            // Load appropriate view
            switch(view) {
                case 'players':
                    if (AppState.allPlayers.length > 0) {
                        displayPlayers(AppState.filteredPlayers);
                    }
                    break;
                case 'teams':
                    if (AppState.allTeams.length === 0) {
                        loadTeams();
                    } else {
                        displayTeams(AppState.allTeams);
                    }
                    break;
                case 'games':
                    if (AppState.allGames.length === 0) {
                        loadGames();
                    } else {
                        displayGames(AppState.allGames);
                    }
                    break;
                case 'builder':
                    displayStatBuilder();
                    break;
            }
        });
    });
    
    // Search functionality
    searchBox.addEventListener('input', (e) => {
        if (AppState.currentView === 'players') {
            searchPlayers(e.target.value);
        }
    });
}
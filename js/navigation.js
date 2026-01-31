/**
 * Navigation and search handling
 */

function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

function setupNavigation() {
    const searchBox = document.getElementById('searchBox');
    
    if (!searchBox) {
        console.error('❌ Search box not found');
        return;
    }
    
    // Handle Tab Clicking
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const view = tab.dataset.view;
            AppState.currentView = view;
            
            // Toggle Search Visibility (only show for players)
            searchBox.parentElement.style.display = view === 'players' ? 'block' : 'none';
            
            // Load the appropriate view
            renderCurrentView(view);
        });
    });

    // DEBOUNCED Search
    const handleSearch = debounce((e) => {
        if (AppState.currentView === 'players') {
            searchPlayers(e.target.value);
        }
    }, 300);

    searchBox.addEventListener('input', handleSearch);
}

function renderCurrentView(view) {
    console.log(`📍 Switching to view: ${view}`);
    
    switch(view) {
        case 'players':
            if (AppState.allPlayers.length === 0) {
                loadPlayers();
            } else {
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
            
        default:
            console.error(`❌ Unknown view: ${view}`);
    }
}

// Export to window
if (typeof window !== 'undefined') {
    window.setupNavigation = setupNavigation;
    window.renderCurrentView = renderCurrentView;
    window.debounce = debounce;
}
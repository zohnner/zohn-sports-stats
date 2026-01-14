console.log('🏀 Initializing Zohn Sports Stats...');

// Load saved stats from localStorage
if (typeof loadSavedStats === 'function') {
    loadSavedStats();
}

setupNavigation();
loadPlayers();

console.log('✅ App initialized successfully!');
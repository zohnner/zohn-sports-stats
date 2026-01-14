// API Configuration
const CORS_PROXY = 'https://corsproxy.io/?';
const API_BASE = 'https://www.balldontlie.io/api/v1';



// Global state
const AppState = {
    allPlayers: [],
    allTeams: [],
    allGames: [],
    playerStats: {},
    filteredPlayers: [],
    currentView: 'players',
    savedStats: []
};

// Fetch players from API
async function fetchPlayersAPI() {
    try {
        console.log('Fetching players from API...');
        const response = await fetch(`${CORS_PROXY}${API_BASE}/players?per_page=100`);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('API Error:', error);
        console.log('Using demo data instead...');
        return DEMO_PLAYERS;
    }
}

// Fetch teams from API
async function fetchTeamsAPI() {
    try {
        console.log('Fetching teams from API...');
        const response = await fetch(`${CORS_PROXY}${API_BASE}/teams`);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('API Error:', error);
        return DEMO_TEAMS;
    }
}

// Fetch games from API
async function fetchGamesAPI() {
    try {
        console.log('Fetching games from API...');
        const response = await fetch(`${CORS_PROXY}${API_BASE}/games?per_page=25`);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('API Error:', error);
        return DEMO_GAMES;
    }
}

// Cache for API responses
const APICache = {
    players: null,
    teams: null,
    games: null,
    timestamp: {}
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function isCacheValid(key) {
    if (!APICache.timestamp[key]) return false;
    return (Date.now() - APICache.timestamp[key]) < CACHE_DURATION;
}

async function fetchPlayersAPI() {
    // Check cache first
    if (isCacheValid('players') && APICache.players) {
        console.log('Using cached players');
        return APICache.players;
    }
    
    try {
        console.log('Fetching players from API...');
        const response = await fetch(`${CORS_PROXY}${API_BASE}/players?per_page=100`);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        // Cache the result
        APICache.players = data.data;
        APICache.timestamp.players = Date.now();
        
        return data.data;
    } catch (error) {
        console.error('API Error:', error);
        console.log('Using demo data instead...');
        return DEMO_PLAYERS;
    }
}

// Do the same for teams and games
async function fetchTeamsAPI() {
    if (isCacheValid('teams') && APICache.teams) {
        console.log('Using cached teams');
        return APICache.teams;
    }
    
    try {
        console.log('Fetching teams from API...');
        const response = await fetch(`${CORS_PROXY}${API_BASE}/teams`);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        APICache.teams = data.data;
        APICache.timestamp.teams = Date.now();
        
        return data.data;
    } catch (error) {
        console.error('API Error:', error);
        return DEMO_TEAMS;
    }
}

async function fetchGamesAPI() {
    if (isCacheValid('games') && APICache.games) {
        console.log('Using cached games');
        return APICache.games;
    }
    
    try {
        console.log('Fetching games from API...');
        const response = await fetch(`${CORS_PROXY}${API_BASE}/games?per_page=25`);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        APICache.games = data.data;
        APICache.timestamp.games = Date.now();
        
        return data.data;
    } catch (error) {
        console.error('API Error:', error);
        return DEMO_GAMES;
    }
}
Summary
Severity	Issue	Root file
🔴 Critical	currentSport overwritten to 'nba' by mlb.js — kills live polling	mlb.js:3847
🔴 Critical	/season_averages + /stats → BDL paid tier → 401 on any NBA stat fetch	api.js:275,341,586
🟠 High	Hash fallback routes to NBA players skeleton instead of home	navigation.js:540
🟠 High	All NBA views still call BDL — players, teams, games, leaderboards, arcade	api.js entire NBA block
🟡 Medium	fetchStatcast() sends Savant URL through the MLB Stats API proxy	mlb.js:221
🟡 Medium	AppState MLB fields don't exist until mlb.js initializes	api.js / mlb.js:3846
🟡 Medium	fetchNBAStatsMap() and fetchNBAStandings() hit stats.nba.com with CORS headers that break in some environments	api.js:435,507
🔵 Known	BDL API key hardcoded in source (P1-006)	api.js:11
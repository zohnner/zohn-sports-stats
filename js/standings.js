// ============================================================
// _parseStreak — streak string ("W3", "L2") to a signed count, capped at 10.
// Shared by the home page, js/mlb.js and js/nflStandings.js streak badges.
// The rest of this file was the pre-D-161 NBA Standings page, unreachable
// since D-161 and removed in D-212 part 3.
// ============================================================
function _parseStreak(streak) {
    if (!streak) return 0;
    const m = String(streak).match(/([WL])(\d+)/i);
    if (!m) return 0;
    const n = Math.min(parseInt(m[2], 10), 10);
    return m[1].toUpperCase() === 'W' ? n : -n;
}

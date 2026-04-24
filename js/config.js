// ============================================================
// NBA Team Configuration
// Primary colours keyed by team abbreviation (BDL format).
// Used for avatar backgrounds, card accents, and detail views.
// ============================================================

const NBA_TEAM_COLORS = {
    ATL: { primary: '#E03A3E', secondary: '#C1D32F', name: 'Atlanta Hawks' },
    BOS: { primary: '#007A33', secondary: '#BA9653', name: 'Boston Celtics' },
    BKN: { primary: '#000000', secondary: '#FFFFFF', name: 'Brooklyn Nets' },
    CHA: { primary: '#1D1160', secondary: '#00788C', name: 'Charlotte Hornets' },
    CHI: { primary: '#CE1141', secondary: '#000000', name: 'Chicago Bulls' },
    CLE: { primary: '#860038', secondary: '#FDBB30', name: 'Cleveland Cavaliers' },
    DAL: { primary: '#00538C', secondary: '#002B5E', name: 'Dallas Mavericks' },
    DEN: { primary: '#0E2240', secondary: '#FEC524', name: 'Denver Nuggets' },
    DET: { primary: '#C8102E', secondary: '#006BB6', name: 'Detroit Pistons' },
    GSW: { primary: '#1D428A', secondary: '#FFC72C', name: 'Golden State Warriors' },
    HOU: { primary: '#CE1141', secondary: '#000000', name: 'Houston Rockets' },
    IND: { primary: '#002D62', secondary: '#FDBB30', name: 'Indiana Pacers' },
    LAC: { primary: '#C8102E', secondary: '#1D428A', name: 'LA Clippers' },
    LAL: { primary: '#552583', secondary: '#FDB927', name: 'Los Angeles Lakers' },
    MEM: { primary: '#5D76A9', secondary: '#12173F', name: 'Memphis Grizzlies' },
    MIA: { primary: '#98002E', secondary: '#F9A01B', name: 'Miami Heat' },
    MIL: { primary: '#00471B', secondary: '#EEE1C6', name: 'Milwaukee Bucks' },
    MIN: { primary: '#0C2340', secondary: '#236192', name: 'Minnesota Timberwolves' },
    NOP: { primary: '#0C2340', secondary: '#85714D', name: 'New Orleans Pelicans' },
    NYK: { primary: '#006BB6', secondary: '#F58426', name: 'New York Knicks' },
    OKC: { primary: '#007AC1', secondary: '#EF3B24', name: 'Oklahoma City Thunder' },
    ORL: { primary: '#0077C0', secondary: '#C4CED4', name: 'Orlando Magic' },
    PHI: { primary: '#006BB6', secondary: '#ED174C', name: 'Philadelphia 76ers' },
    PHX: { primary: '#1D1160', secondary: '#E56020', name: 'Phoenix Suns' },
    POR: { primary: '#E03A3E', secondary: '#000000', name: 'Portland Trail Blazers' },
    SAC: { primary: '#5A2D81', secondary: '#63727A', name: 'Sacramento Kings' },
    SAS: { primary: '#C4CED4', secondary: '#000000', name: 'San Antonio Spurs' },
    TOR: { primary: '#CE1141', secondary: '#000000', name: 'Toronto Raptors' },
    UTA: { primary: '#002B5C', secondary: '#00471B', name: 'Utah Jazz' },
    WAS: { primary: '#002B5C', secondary: '#E31837', name: 'Washington Wizards' },
};

/**
 * Get colours for a team by abbreviation.
 * Falls back to a neutral dark colour if the team is not found.
 */
function getTeamColors(abbreviation) {
    if (abbreviation && !NBA_TEAM_COLORS[abbreviation]) {
        Logger.debug(`Unknown team abbreviation: "${abbreviation}"`, undefined, 'CONFIG');
    }
    return NBA_TEAM_COLORS[abbreviation] || { primary: '#334155', secondary: '#64748b', name: '' };
}

/**
 * Generate a CSS background style string for a player/team avatar.
 * Uses a subtle gradient from primary to a darkened version.
 */
function getAvatarStyle(abbreviation) {
    const { primary } = getTeamColors(abbreviation);
    return `background: linear-gradient(135deg, ${primary}cc, ${primary}66);`;
}

function getNBATeamLogoUrl(abbr) {
    return abbr ? `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png` : null;
}

// Normalize a player name for cross-source matching (BDL vs NBA.com).
// Strips dots, Jr./Sr./I/II/III/IV suffixes, and extra whitespace.
// "P.J. Washington Jr." → "pj washington"  |  "PJ Washington" → "pj washington"
function _normName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\./g, '')
        .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Escape user-facing API text before inserting into innerHTML.
function _escHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Single capture-phase listener replaces all inline onerror="this.style.display='none'" handlers.
// Mark any <img> with data-hide-on-error to opt in.
if (typeof window !== 'undefined') {
    document.addEventListener('error', e => {
        if (e.target.tagName !== 'IMG') return;
        if ('hideOnError' in e.target.dataset) {
            e.target.style.display = 'none';
        } else if ('logoFallback' in e.target.dataset) {
            const span = document.createElement('span');
            span.style.cssText = 'font-size:1.4rem;font-weight:800;color:#fff';
            span.textContent = e.target.dataset.logoFallback;
            e.target.replaceWith(span);
        }
    }, true);

    window.NBA_TEAM_COLORS    = NBA_TEAM_COLORS;
    window.getTeamColors      = getTeamColors;
    window.getAvatarStyle     = getAvatarStyle;
    window._escHtml           = _escHtml;
    window._normName          = _normName;
    window.getNBATeamLogoUrl  = getNBATeamLogoUrl;
}

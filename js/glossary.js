// ============================================================
// Stat Glossary — definitions + CSV export utility
// ============================================================

const StatGlossary = (() => {
    const NBA = {
        PTS:  'Points per game',
        REB:  'Rebounds per game (offensive + defensive)',
        AST:  'Assists per game',
        STL:  'Steals per game',
        BLK:  'Blocks per game',
        TOV:  'Turnovers per game',
        MIN:  'Minutes played per game',
        OREB: 'Offensive rebounds per game',
        DREB: 'Defensive rebounds per game',
        GP:   'Games played',
        'FG%':  'Field Goal % — field goals made ÷ attempted',
        '3P%':  'Three-Point % — 3-pointers made ÷ attempted',
        'FT%':  'Free Throw % — free throws made ÷ attempted',
        'TS%':  'True Shooting % — points per shooting attempt including free throws. Formula: PTS ÷ (2 × (FGA + 0.44 × FTA))',
        'eFG%': 'Effective FG% — adjusts for 3-pointers being worth more. Formula: (FGM + 0.5 × 3PM) ÷ FGA',
        'TOV%': 'Turnover % — estimated share of possessions that end in a turnover',
        'AST/TO': 'Assist-to-Turnover ratio',
        '3PAr': '3-Point Attempt Rate — share of field goal attempts that are 3-pointers',
        FTr:    'Free Throw Rate — free throw attempts per field goal attempt',
        'FP (DK)': 'DraftKings fantasy points: PTS×1 + REB×1.25 + AST×1.5 + STL×3 + BLK×3 − TOV×1',
    };

    const MLB = {
        AVG:  'Batting Average — hits ÷ at-bats',
        HR:   'Home Runs',
        RBI:  'Runs Batted In',
        OBP:  'On-Base % — how often a batter reaches base per plate appearance',
        SLG:  'Slugging % — total bases per at-bat',
        OPS:  'On-Base Plus Slugging (OBP + SLG)',
        SB:   'Stolen Bases',
        R:    'Runs scored',
        H:    'Hits',
        '2B': 'Doubles',
        '3B': 'Triples',
        BB:   'Walks (Bases on Balls)',
        SO:   'Strikeouts (batter)',
        ERA:  'Earned Run Average — earned runs allowed per 9 innings pitched',
        WHIP: 'WHIP — (Walks + Hits) per Inning Pitched',
        W:    'Wins (pitcher)',
        SV:   'Saves (pitcher)',
        IP:   'Innings Pitched',
        K:    'Strikeouts (pitcher)',
        'K/9': 'Strikeouts per 9 innings pitched',
        FIP:  'Fielding Independent Pitching — ERA estimator using only HR, BB, and K. Removes defense from the equation.',
        xBA:  'Expected Batting Average based on exit velocity and launch angle (Statcast)',
        xSLG: 'Expected Slugging % based on quality of contact (Statcast)',
        xwOBA:'Expected wOBA based on quality of contact (Statcast)',
        EV:   'Exit Velocity — average speed of the ball off the bat (mph)',
        'Barrel%': 'Barrel % — share of batted balls classified as "barrels" (optimal exit velocity + launch angle)',
        LA:   'Launch Angle — average vertical angle of batted balls (degrees)',
        'Sprint Speed': 'Sprint Speed — feet per second in best running situations',
        ISO:   'Isolated Power — extra-base power. Formula: SLG − AVG',
        BABIP: 'Batting Average on Balls In Play — how often balls in play fall for hits. Formula: (H − HR) ÷ (AB − K − HR + SF)',
        'K%':  'Strikeout % — share of plate appearances ending in a strikeout',
        'BB%': 'Walk % — share of plate appearances ending in a walk',
        'BB/9':'Walks per 9 Innings — walks allowed per 9 innings pitched',
        'K-BB%': 'K minus BB % — strikeout rate minus walk rate (command + stuff composite)',
        HLD:   'Holds — pitcher enters in a save situation, records at least 1 out, leaves with the lead',
        BSV:   'Blown Saves — save opportunities in which the pitcher fails to preserve the lead',
        QS:    'Quality Starts — starts with ≥6 IP and ≤3 earned runs',
        PA:    'Plate Appearances — total times at the plate (includes walks, HBP, sac flies)',
        AB:    'At-Bats — plate appearances excluding walks, HBP, sac flies, and sac bunts',
        '2B':  'Doubles',
        '3B':  'Triples',
        RDIFF: 'Run Differential — runs scored minus runs allowed',
        GB:    'Games Behind the division leader',
        L10:   'Record in the last 10 games',
        STRK:  'Current win or loss streak',
    };

    function wrap(label, tip) {
        if (!tip) return label;
        return `<span class="stat-tip" data-tip="${String(tip).replace(/"/g, '&quot;')}" tabindex="0">${label}</span>`;
    }

    // Looks up the label as-is in NBA or MLB dictionaries, wraps if found
    function auto(label) {
        const tip = NBA[label] || MLB[label];
        return wrap(label, tip);
    }

    return { NBA, MLB, wrap, auto };
})();

// ── CSV export utility ─────────────────────────────────────────

function exportCSV(filename, headers, rows) {
    const esc = v => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
    };
    const lines = [headers.map(esc).join(',')];
    rows.forEach(row => lines.push(row.map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

if (typeof window !== 'undefined') {
    window.StatGlossary = StatGlossary;
    window.exportCSV    = exportCSV;
}

// ============================================================
// Trophy Case — cross-sport career achievements (D-116)
// Generic engine + per-sport taxonomy config, same pattern as
// detailFrame.js's detailHeader()/detailSection(): sports differ
// only in the config passed in, never in the render logic.
//
// Renders as a sticky side-rail widget, reusing the existing
// .nlg-layout / .nlg-main / .nlg-side / .nlg-side-card / .nlg-side-title
// classes (css/nflLiveGame.css, loaded site-wide) — the same two-column
// "main content + sticky sidebar" pattern the NFL live-game page already
// uses, per owner direction (2026-08-23) to place this prominently
// rather than buried after the stat tables. See DECISIONS.md D-116 and
// ISSUES.md T-1 for the full spec/build history.
//
// Data: hand-curated static JSON per sport (data/awards-<sport>.json),
// NOT fetched from any live API — no source this site already uses
// (MLB Stats API, ESPN, Sleeper, nflverse) exposes career award or
// championship history for any sport it covers (Relay, D-116). Same
// pattern as the existing data/trades.json / data/stadiums.json —
// static curated assets are not new to this repo, just a new use.
//
// Keyed by _normName(full name) rather than any one API's player ID,
// since ID schemes differ per sport/source (Sleeper for NFL, MLB
// Stats API id for MLB, ESPN id for NCAAF, etc.) — reuses the exact
// cross-source name-matching convention config.js's _normName already
// established for NBA/NBA.com stat matching. Known limitation: two
// real players sharing a normalized name would collide; out of scope
// for v1, no such collision exists in the seeded NFL data.
// ============================================================

// type -> { label, short, icon, group }. group also selects the icon
// shape (1 = trophy cup, 2 = medal, 3 = rosette) and sort order
// (championship first, then major individual awards, then other/
// conference honors). A type not listed here still renders — see
// _achvMeta's fallback — so curated data can land ahead of a
// taxonomy-config update instead of breaking.
const ACHIEVEMENT_TAXONOMY = {
    nfl: {
        championship:             { label: 'Super Bowl Championship',           short: 'Super Bowl',      group: 1 },
        championship_mvp:         { label: 'Super Bowl MVP',                     short: 'Super Bowl MVP',  group: 2 },
        season_mvp:                { label: 'NFL Most Valuable Player',           short: 'NFL MVP',         group: 2 },
        opoy:                      { label: 'AP Offensive Player of the Year',    short: 'Off. POY',        group: 2 },
        dpoy:                      { label: 'AP Defensive Player of the Year',    short: 'Def. POY',        group: 2 },
        conference_championship:  { label: 'Conference Championship',            short: 'Conf. Champion',  group: 3 },
        all_pro:                  { label: 'First-Team All-Pro',                 short: 'All-Pro',         group: 3 },
        oroty:                     { label: 'AP Offensive Rookie of the Year',    short: 'Off. ROY',        group: 3 },
        droty:                     { label: 'AP Defensive Rookie of the Year',    short: 'Def. ROY',        group: 3 },
        walter_payton_moty:        { label: 'Walter Payton NFL Man of the Year',  short: 'Walter Payton MOTY', group: 3 },
        comeback_poy:              { label: 'AP Comeback Player of the Year',     short: 'Comeback POY',    group: 3 },
        pro_bowl:                  { label: 'Pro Bowl',                           short: 'Pro Bowl',        group: 4 },
    },
    mlb: {
        championship:      { label: 'World Series Championship', short: 'World Series', group: 1 },
        championship_mvp:  { label: 'World Series MVP',           short: 'WS MVP',       group: 2 },
        season_mvp:          { label: 'Most Valuable Player',       short: 'MVP',          group: 2 },
        cy_young:            { label: 'Cy Young Award',              short: 'Cy Young',     group: 2 },
    },
    ncaaf: {
        championship: { label: 'National Championship', short: "Nat'l Champion", group: 1 },
        heisman:       { label: 'Heisman Trophy',         short: 'Heisman',        group: 2 },
    },
    ncaab: {
        championship: { label: 'National Championship',       short: "Nat'l Champion", group: 1 },
        season_mvp:    { label: 'Naismith Player of the Year',  short: 'Naismith POY',   group: 2 },
    },
    wnba: {
        championship:      { label: 'WNBA Championship',        short: 'WNBA Champion', group: 1 },
        championship_mvp:  { label: 'WNBA Finals MVP',           short: 'Finals MVP',    group: 2 },
        season_mvp:          { label: 'WNBA Most Valuable Player', short: 'WNBA MVP',      group: 2 },
    },
};

function _achvMeta(sport, type) {
    const t = (ACHIEVEMENT_TAXONOMY[sport] || {})[type];
    if (t) return t;
    // Unknown type: still render sanely (group 9, rosette icon) rather
    // than break, so curated data can land ahead of a taxonomy update.
    const words = String(type || '').replace(/_/g, ' ').trim();
    const label = words ? words.replace(/\b\w/g, c => c.toUpperCase()) : 'Achievement';
    return { label, short: label, group: 9 };
}

// Small gold-gradient SVG icon set standing in for real trophy/medal
// photography (no image-generation tool available this session, and
// real photos of official league hardware carry copyright/trademark
// risk on a live public site — owner-confirmed direction, D-116/T-1).
// group 1 = trophy cup (team championship), group 2 = medal (individual
// award), everything else = rosette. One shared gradient def per grid
// (see _trophyDefs), referenced by a caller-supplied unique id so
// multiple tiles never collide on duplicate SVG ids.
function _trophyDefs(gradId) {
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
        <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--accent-light)"/>
                <stop offset="100%" stop-color="var(--color-award)"/>
            </linearGradient>
        </defs>
    </svg>`;
}

function _trophyIconSvg(group, gradId) {
    const fill = `url(#${gradId})`;
    if (group === 1) {
        // Cup: bowl + two handles + stem + two-tier base
        return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M6 3h12v5a6 6 0 0 1-12 0V3z" fill="${fill}" stroke="rgba(0,0,0,0.28)" stroke-width="0.4"/>
            <path d="M6 4.6c-2.15 0-3.5 1.55-3.5 3.25S3.85 11 6 11" fill="none" stroke="${fill}" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M18 4.6c2.15 0 3.5 1.55 3.5 3.25S20.15 11 18 11" fill="none" stroke="${fill}" stroke-width="1.3" stroke-linecap="round"/>
            <rect x="10.7" y="12.5" width="2.6" height="4" fill="${fill}"/>
            <rect x="7.4" y="17" width="9.2" height="1.7" rx="0.6" fill="${fill}"/>
            <rect x="9" y="19.1" width="6" height="1.7" rx="0.6" fill="${fill}"/>
        </svg>`;
    }
    if (group === 2) {
        // Medal: two ribbon streamers + circular medallion with inner ring
        return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M9.2 2 5 8.4l3.1 1.9 3.1-6.1-2-2.2z" fill="var(--color-award)" opacity="0.5"/>
            <path d="M14.8 2 19 8.4l-3.1 1.9-3.1-6.1 2-2.2z" fill="var(--color-award)" opacity="0.5"/>
            <circle cx="12" cy="14.6" r="6.3" fill="${fill}" stroke="rgba(0,0,0,0.28)" stroke-width="0.4"/>
            <circle cx="12" cy="14.6" r="3.3" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="0.8"/>
        </svg>`;
    }
    // Rosette: circular badge with two ribbon tails
    return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <circle cx="12" cy="9.5" r="6" fill="${fill}" stroke="rgba(0,0,0,0.28)" stroke-width="0.4"/>
        <circle cx="12" cy="9.5" r="2.6" fill="rgba(255,255,255,0.4)"/>
        <path d="M9 14.4 7 22l5-3 5 3-2-7.6z" fill="var(--color-award)"/>
    </svg>`;
}

// One in-memory cache per sport — a same-origin static asset, not an
// external API call, so this doesn't go through ApiCache/mlbFetch.
const _achvDataCache = {};

async function _loadAwardsData(sport) {
    if (_achvDataCache[sport]) return _achvDataCache[sport];
    try {
        const res = await fetch(`/data/awards-${sport}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        _achvDataCache[sport] = data;
        return data;
    } catch (err) {
        if (typeof Logger !== 'undefined') {
            Logger.warn(`Trophy Case: no awards data for "${sport}" (${err.message})`, undefined, 'ACHV');
        }
        _achvDataCache[sport] = {};
        return {};
    }
}

let _achvGradSeq = 0;

// Renders into an existing empty container (a bare <aside>/<div id="...">
// in the caller's initial template). Leaves the container empty — not
// an empty-state card — when the player has no verified achievements:
// the ~99% case (rookies, journeymen, most of any roster). A permanent
// "0 trophies" card on every such profile is noise dressed as
// information, and DESIGN.md's "empty states name their way out" rule
// doesn't apply here — there's no way out of not having won a
// championship yet. Deliberate, not an afterthought (Vera, D-116/T-1).
async function initTrophyCase(sport, playerFullName, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const key = typeof _normName === 'function' ? _normName(playerFullName) : String(playerFullName || '').toLowerCase();

    let records;
    try {
        const data = await _loadAwardsData(sport);
        records = data[key];
    } catch (err) {
        if (typeof Logger !== 'undefined') Logger.warn('Trophy Case render failed', err, 'ACHV');
        return; // fail closed, same as "no data" — never a broken card
    }
    if (!records || !records.length) return;

    const byType = {};
    for (const r of records) {
        if (!r || !r.type) continue;
        (byType[r.type] = byType[r.type] || []).push(r);
    }
    const types = Object.keys(byType);
    if (!types.length) return;

    types.sort((a, b) => {
        const ma = _achvMeta(sport, a), mb = _achvMeta(sport, b);
        return (ma.group - mb.group) || ma.label.localeCompare(mb.label);
    });

    const esc = typeof _escHtml === 'function' ? _escHtml : (s => String(s == null ? '' : s));
    const gradId = `trophyGoldGrad-${++_achvGradSeq}`;

    const tiles = types.map(type => {
        const meta = _achvMeta(sport, type);
        const rows = byType[type].slice().sort((a, b) => (a.season || 0) - (b.season || 0));
        const seasons = rows.map(r => esc(r.season != null ? String(r.season) : '—')).join(' · ');
        return `<div class="trophy-tile">
            <div class="trophy-tile-icon">${_trophyIconSvg(meta.group, gradId)}</div>
            <div class="trophy-tile-body">
                <div class="trophy-tile-count-row">
                    <span class="trophy-tile-count">${rows.length}</span>
                    <span class="trophy-tile-label">${esc(meta.short)}</span>
                </div>
                <div class="trophy-tile-seasons">${seasons}</div>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `${_trophyDefs(gradId)}<div class="nlg-side-card trophy-case-card">
        <h2 class="nlg-side-title">Trophy Case</h2>
        <div class="trophy-case-grid">${tiles}</div>
    </div>`;
}

if (typeof window !== 'undefined') {
    window.ACHIEVEMENT_TAXONOMY = ACHIEVEMENT_TAXONOMY;
    window.initTrophyCase = initTrophyCase;
}

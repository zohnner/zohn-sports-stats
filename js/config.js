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

// Normalize a player name for cross-source matching (BDL vs NBA.com,
// and — as of D-116's MLB Trophy Case build — MLB Stats API vs the
// hand-curated data/awards-mlb.json, where raw accented characters are
// common, e.g. "José Ramírez" / "Julio Rodríguez"). Strips diacritics
// (same .normalize('NFD') + combining-mark-strip pattern already used
// for the Baseball Savant slug builder, js/mlb.js ~L1782), dots,
// Jr./Sr./I/II/III/IV suffixes, and extra whitespace.
// "P.J. Washington Jr." → "pj washington"  |  "PJ Washington" → "pj washington"
// "José Ramírez" → "jose ramirez"
function _normName(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
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

// WCAG contrast helpers (2026-09-08) — ported from tools/check-themes.cjs's own
// parseColor/lum/ratio (same formula, ~15 lines, not worth requiring a Node
// tool into the browser for). Added to pick a bar-fill-safe team color: the
// White Sox/Pirates/Padres all have a near-black primary hex (#27251F/
// #27251F/#2F241D) that's nearly indistinguishable from its own progress-bar
// track once composited over the dark theme's card surface — a real,
// reproducible bug (the pennant-race division-odds bar for a team like that
// reads as blank), distinct from the S5 darkSafe flag, which only covers
// LOGO artwork contrast, not solid-color fills. Resolving live via
// getComputedStyle rather than a hardcoded per-team list (like darkSafe) so
// this works correctly across every theme (dark/light/nl-monarchs) without
// needing to hand-verify each one.
function _parseCssColor(v) {
    if (!v) return null;
    v = v.trim();
    let m = v.match(/^#([0-9a-f]{3})$/i);
    if (m) return [...m[1]].map(c => parseInt(c + c, 16)).concat(1);
    m = v.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(o => parseInt(m[1].slice(o, o + 2), 16)).concat(1);
    m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    return null;
}
function _compositeOverBg(fg, bg) {
    if (fg[3] >= 1) return fg;
    return [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
}
function _relLuminance([r, g, b]) {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function _contrastRatio(hexOrRgb1, hexOrRgb2) {
    const c1 = Array.isArray(hexOrRgb1) ? hexOrRgb1 : _parseCssColor(hexOrRgb1);
    const c2 = Array.isArray(hexOrRgb2) ? hexOrRgb2 : _parseCssColor(hexOrRgb2);
    if (!c1 || !c2) return null;
    const [l1, l2] = [_relLuminance(c1), _relLuminance(c2)].sort((a, b) => b - a);
    return (l1 + 0.05) / (l2 + 0.05);
}
// Picks whichever of a team's primary/secondary colors reads clearly as a
// solid-fill bar against the page's real card surface (composited live from
// --bg-card over --bg-base, since --bg-card is itself a translucent rgba
// layer in every theme, not a flat hex) — falls back to primary on any
// parse failure or if neither color's contrast can be improved.
function _barSafeTeamColor(colors) {
    const primary = colors?.primary;
    if (!primary) return primary;
    try {
        const bgBase = _parseCssColor(getComputedStyle(document.documentElement).getPropertyValue('--bg-base'));
        const bgCard = _parseCssColor(getComputedStyle(document.documentElement).getPropertyValue('--bg-card'));
        if (!bgBase || !bgCard) return primary;
        const effectiveBg = _compositeOverBg(bgCard, bgBase);
        const primaryRatio = _contrastRatio(primary, effectiveBg);
        if (primaryRatio == null || primaryRatio >= 1.6) return primary;
        const secondary = colors?.secondary;
        if (!secondary) return primary;
        const secondaryRatio = _contrastRatio(secondary, effectiveBg);
        return (secondaryRatio != null && secondaryRatio > primaryRatio) ? secondary : primary;
    } catch (_) { return primary; }
}

// Shared Savant-style percentile color: diverging blue → gray → red (red = elite).
// Fixed hex by design — a data-encoding scale, not a themed surface. Used by MLB + NFL.
function _pctColor(p) {
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    if (p >= 50) { const t = (p - 50) / 50; return `rgb(${lerp(138,214,t)},${lerp(141,58,t)},${lerp(147,49,t)})`; }
    const t = p / 50;
    return `rgb(${lerp(54,138,t)},${lerp(97,141,t)},${lerp(173,147,t)})`;
}

// ============================================================
// Shared icon system (site-wide emoji removal, 2026-09-07)
// ============================================================
// Every icon in this map is a bare SVG shape (no wrapper) drawn to the SAME
// convention already established by _SL_ICON (js/app.js) and _NAV_ICONS
// (js/navigation.js) — viewBox 0 0 16 16, stroke=currentColor, stroke-width
// 1.5, round caps/joins. This is not a new house style being invented, it's
// the existing dominant pattern (documented in DESIGN.md's Iconography
// section) finally given one shared home so the ~85 call sites that used to
// interpolate a raw emoji character don't each hand-roll their own shape.
// Lives in config.js specifically because it's the first file in the script
// chain (see CLAUDE.md's load order) — every other file, however early it
// loads, can reference _ICON/_iconSvg.
//
// Deliberately does NOT consolidate _SL_ICON/_NAV_ICONS's existing shapes —
// those are already SVG, already correct, and migrating their working call
// sites would be pure risk for zero visible benefit. "trophy" here is a
// separate, self-contained copy of _SL_ICON's trophy shape rather than a
// cross-file reference: app.js loads LAST, so an early file that needs a
// trophy can't safely depend on _SL_ICON existing yet at its own top-level
// scope, only inside a function body that happens to run after boot. A few
// bytes of duplicated path data is a fine trade for not having a hidden,
// load-order-dependent coupling.
const _ICON = {
    // Self-contained copies of _SL_ICON's clipboard/bars shapes (same
    // reasoning as trophy above) — needed by files that load before app.js.
    clipboard:     '<rect x="3.5" y="3" width="9" height="11" rx="1.5"/><path d="M6 3V2.2a2 2 0 0 1 4 0V3"/><path d="M6 8h4M6 11h2.5"/>',
    bars:          '<path d="M2 14V9M7 14V6M12 14V2"/><path d="M1 14h14" opacity=".5"/>',
    baseball:      '<circle cx="8" cy="8" r="6"/><path d="M4.2 4.2c1.5 1.5 1.5 6.1 0 7.6M11.8 4.2c-1.5 1.5-1.5 6.1 0 7.6"/>',
    football:      '<path d="M2 8Q4 2.5 8 2.5Q12 2.5 14 8Q12 13.5 8 13.5Q4 13.5 2 8Z"/><path d="M6.3 7v2M8 6.6v2.8M9.7 7v2"/>',
    basketball:    '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2v12M3.5 3.8c2.4 2.4 6.6 2.4 9 0M3.5 12.2c2.4-2.4 6.6-2.4 9 0"/>',
    puck:          '<rect x="2" y="6" width="12" height="4" rx="2"/>',
    house:         '<path d="M3 8.5 8 3l5 5.5"/><path d="M4.5 7.5V13h7V7.5"/>',
    calendar:      '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    schedule:      '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/><path d="M5 9h.01M8 9h.01M11 9h.01M5 11.5h.01M8 11.5h.01"/>',
    calculator:    '<rect x="3.5" y="2" width="9" height="12" rx="1.5"/><path d="M5.5 4.5h5"/><path d="M5.5 7.5h.01M8 7.5h.01M10.5 7.5h.01M5.5 10h.01M8 10h.01M10.5 10h.01M5.5 12.3h.01M8 12.3h.01M10.5 12.3h.01"/>',
    film:          '<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M5.5 3.5v9M10.5 3.5v9M2 6.5h3M2 9.5h3M11 6.5h3M11 9.5h3"/>',
    lightning:     '<path d="M9 2 4 9h3.5L7 14l5-7H8.5L9 2z"/>',
    save:          '<path d="M3 2.5h8l2.5 2.5v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M5 2.5v3.5h5V2.5M5 14v-4.5h6V14"/>',
    link:          '<path d="M6.5 9.5a3 3 0 0 0 4 0l1.5-1.5a3 3 0 0 0-4-4l-1 1"/><path d="M9.5 6.5a3 3 0 0 0-4 0L4 8a3 3 0 0 0 4 4l1-1"/>',
    fire:          '<path d="M8 14c-2.5 0-4.2-1.7-4.2-4 0-1.8 1-2.8 1.5-4 .3 1 1 1.3 1.5.8-.3-2 .5-4 2-4.8-.5 1.5 0 2.5 1 3.3 1.2 1 1.9 2.2 1.9 3.7 0 2.3-1.2 5-3.7 5z"/>',
    stethoscope:   '<path d="M4 2.5v4a3 3 0 0 0 6 0v-4"/><path d="M4 2.5h-1M10 2.5h1"/><path d="M10 8.5v1.5a3.5 3.5 0 0 1-7 0"/><circle cx="12.5" cy="9.5" r="1.5"/>',
    trendUp:       '<path d="M2 12 6.5 7.5 9 10l4.5-5"/><path d="M10 5h3.5v3.5"/>',
    trendDown:     '<path d="M2 5l4.5 4.5L9 7l4.5 4.5"/><path d="M13.5 8.5V12H10"/>',
    trophy:        '<path d="M4.5 3h7v2.5a3.5 3.5 0 0 1-7 0V3z"/><path d="M4.5 4H2.6v.8A2.2 2.2 0 0 0 4.8 7M11.5 4h1.9v.8A2.2 2.2 0 0 1 11.2 7M6.5 11h3M5.5 13.5h5"/>',
    medal:         '<circle cx="8" cy="10" r="3.5"/><path d="M6 6.5 4.5 2h2L8 5.5 9.5 2h2L10 6.5"/>',
    gamepad:       '<rect x="1.5" y="4.5" width="13" height="7" rx="2.5"/><path d="M5 8h2M6 7v2"/><circle cx="11" cy="7.5" r="0.75" fill="currentColor" stroke="none"/><circle cx="13" cy="7.5" r="0.75" fill="currentColor" stroke="none"/>',
    warning:       '<path d="M8 2 1.5 13.5h13L8 2z"/><path d="M8 6.5v3.5M8 12h.01"/>',
    checkCircle:   '<circle cx="8" cy="8" r="6"/><path d="M5.5 8.2 7.2 10 10.8 6"/>',
    info:          '<circle cx="8" cy="8" r="6"/><path d="M8 7.5v4M8 5.2h.01"/>',
    bell:          '<path d="M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8L4 11z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/>',
    net:           '<path d="M2 3h12v10l-4-2v-8M2 3l4 2v8M6 5h4M4 8h8M4 11h8"/>',
    star:          '<path d="M8 2 9.9 6.2 14.5 6.7 11 9.7 12 14.3 8 11.9 4 14.3 5 9.7 1.5 6.7 6.1 6.2 8 2z"/>',
    shield:        '<path d="M8 2 13.5 4v4.3c0 3.4-2.3 5.9-5.5 7.2-3.2-1.3-5.5-3.8-5.5-7.2V4L8 2z"/>',
    lock:          '<rect x="3" y="7.5" width="10" height="6.5" rx="1.5"/><path d="M5 7.5V5a3 3 0 0 1 6 0v2.5"/>',
    clock:         '<circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.5 1.5"/>',
    arrowRight:    '<path d="M2.5 8h11M9.5 4l4 4-4 4"/>',
    snowflake:     '<path d="M8 1.5v13M8 1.5 6.3 3.2M8 1.5l1.7 1.7M8 14.5l-1.7-1.7M8 14.5l1.7-1.7M2 4.75l12 6.5M2 4.75l2.3.4M2 4.75l1.2-2M14 11.25l-2.3-.4M14 11.25l-1.2 2M14 4.75 2 11.25M14 4.75l-2.3.4M14 4.75l-1.2-2M2 11.25l2.3.4M2 11.25l1.2 2"/>',
    mountain:      '<path d="M1.5 13.5 6 6l2.3 3.1L9.8 7l4.7 6.5z"/><path d="M6.6 8.4 5.4 10h2.4"/>',
    burst:         '<path d="M8 1.5 9.3 5.8 13 3.3 11 7.3 15 8 11 8.7 13 12.7 9.3 10.2 8 14.5 6.7 10.2 3 12.7 5 8.7 1 8 5 7.3 3 3.3 6.7 5.8 8 1.5z"/>',
    swap:          '<path d="M2 5h9M8 2l3 3-3 3"/><path d="M14 11H5M8 8l-3 3 3 3"/>',
    ruler:         '<path d="M2 11 11 2"/><path d="M4 9l1.5 1.5M6.5 6.5 8 8M9 4l1.5 1.5"/>',
    pin:           '<path d="M8 14s5-4.5 5-8a5 5 0 0 0-10 0c0 3.5 5 8 5 8z"/><circle cx="8" cy="6" r="1.7"/>',
    leaf:          '<path d="M4 12c0-5 3-8.5 8-9-0.5 5-4 8-8 9z"/><path d="M4.5 11.5 9 7"/>',
    globe:         '<circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="2.5" ry="6"/><path d="M2 8h12"/>',
    building:      '<rect x="3" y="5" width="4" height="9"/><rect x="9" y="2" width="4" height="12"/><path d="M4.5 7.5h1M4.5 10h1M10.5 4.5h1M10.5 7h1M10.5 9.5h1"/>',
    target:        '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3.2"/><circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none"/>',
    xCircle:       '<circle cx="8" cy="8" r="6"/><path d="M6 6l4 4M10 6l-4 4"/>',
    lightbulb:     '<path d="M5.5 11.5h5M6 13.5h4"/><path d="M8 2a4.5 4.5 0 0 0-2.5 8.2c.3.2.5.6.5 1h4c0-.4.2-.8.5-1A4.5 4.5 0 0 0 8 2z"/>',
};
// Full <svg> wrapper for an _ICON key — the ~85 call sites this replaces
// used to each interpolate a bare emoji character, so most need the whole
// element, not just the inner shape (unlike _SL_ICON's two call sites,
// which already had their own local wrapper markup written out).
function _iconSvg(key, size = 16) {
    const shape = _ICON[key];
    if (!shape) { Logger.debug(`Unknown icon key: "${key}"`, undefined, 'CONFIG'); return ''; }
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
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

    // When a headshot finishes loading, hide the initials/abbr behind it — a transparent
    // cutout should never bleed over the fallback text. load doesn't bubble → capture phase.
    document.addEventListener('load', e => {
        if (e.target.tagName !== 'IMG' || !e.target.classList.contains('player-headshot')) return;
        const txt = e.target.parentElement && e.target.parentElement.querySelector('.avatar-text');
        if (txt) txt.style.visibility = 'hidden';
    }, true);

    window.NBA_TEAM_COLORS    = NBA_TEAM_COLORS;
    window.getTeamColors      = getTeamColors;
    window.getAvatarStyle     = getAvatarStyle;
    window._escHtml           = _escHtml;
    window.ssLoader           = function (label) {
        var l = label ? _escHtml(label) : 'Loading';
        return '<div class="ss-loading" role="status" aria-label="' + l + '">' +
               '<div class="ss-loader" aria-hidden="true"><i></i><i></i><i></i></div>' +
               (label ? '<span class="ss-loading__label">' + l + '</span>' : '') +
               '</div>';
    };
    window._pctColor          = _pctColor;
    window._normName          = _normName;
    window.getNBATeamLogoUrl  = getNBATeamLogoUrl;
    window._ICON              = _ICON;
    window._iconSvg           = _iconSvg;
    window._contrastRatio     = _contrastRatio;
    window._barSafeTeamColor  = _barSafeTeamColor;
}

// Canonical public domain — printed on share cards and share text.
// Custom domain attached 2026-06-14: sportstrata.cc (Cloudflare Pages).
// og:url / canonical are set from location.href at runtime, so they follow
// whatever origin serves the page; this constant is the human-facing label.
const SITE_DOMAIN = 'sportstrata.cc';

// D-079 — VAPID public key for Web Push subscriptions (js/auth.js). Safe to ship
// client-side by design — VAPID public keys identify the sender, they don't
// authorize anything on their own; the private half never leaves
// worker/push-game-alerts.js's Cloudflare secret store. Must exactly match the
// key pair set via `wrangler secret put VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY`
// (see worker/wrangler-push.toml) — a mismatch fails PushManager.subscribe()
// silently on the client with no useful error.
const VAPID_PUBLIC_KEY = 'BNUV8cn_g-ssNXVYxfiCQTGYA5WXRu9vvcOyukWKrQCjutno7ovvMZqR6jVSJ7n1KxBPqC3SBnJ49mMt2VeTXbA';

// ============================================================
// Visit beacon (D-183) — pure helpers behind _trackPageView() in navigation.js.
// Adds three anonymous answers to the D-149 page_views log: is this a first-ever
// session (new visitor), which navigation in the tab is this (bounce/depth from
// counts alone), and where did the tab's first page come from (channel + path).
// No identifier ever leaves the browser: the "seen" bit and the per-tab counter
// live in first-party storage and only their derived values are sent.
// Run: node --test tests/visitBeacon.test.js
// ============================================================
const VisitBeacon = (() => {
    const SPORT_RE = /^(mlb|nfl|ncaaf|ncaab|wnba|nhl|nba)-/;
    let memSeq = 0;
    const STATIC_RE = /^static-page-(mlb|nfl|ncaaf|ncaab|wnba|nba)$/;

    // 'shared' (home-adjacent views like news/arcade/account) used to fall through
    // to 'nba', inflating NBA's share of every page_views breakdown.
    function sportOf(view) {
        if (view === 'home') return 'home';
        const s = STATIC_RE.exec(view) || SPORT_RE.exec(view);
        return s ? s[1] : 'shared';
    }

    // Fixed bucket list, mirrored by REF_BUCKETS in functions/api/track.js -- the
    // raw referrer and utm value are never sent.
    const HOST_BUCKETS = [
        [/(^|\.)google\./, 'google'],
        [/(^|\.)(bing\.com|duckduckgo\.com|search\.yahoo\.com|yandex\.|ecosia\.org|search\.brave\.com)$/, 'search'],
        [/(^|\.)reddit\.com$|^redd\.it$/, 'reddit'],
        [/(^|\.)(x\.com|twitter\.com)$|^t\.co$/, 'x'],
        [/(^|\.)(facebook\.com|instagram\.com|threads\.net)$|^fb\.me$/, 'meta'],
        [/(^|\.)(chatgpt\.com|perplexity\.ai|claude\.ai|gemini\.google\.com)$/, 'ai'],
    ];
    const UTM_BUCKETS = { google: 'google', reddit: 'reddit', x: 'x', twitter: 'x', facebook: 'meta', instagram: 'meta', threads: 'meta', bing: 'search' };

    function refBucket(referrer, ownHost, search) {
        const utm = /[?&]utm_source=([^&#]*)/i.exec(search || '');
        if (utm) {
            const v = decodeURIComponent(utm[1]).toLowerCase();
            return UTM_BUCKETS[v] || 'other';
        }
        if (!referrer) return 'direct';
        let host;
        try { host = new URL(referrer).hostname.toLowerCase(); } catch { return 'other'; }
        if (host === ownHost) return 'internal';
        // gemini.google.com must win over the generic google bucket.
        if (/(^|\.)gemini\.google\.com$/.test(host)) return 'ai';
        for (const [re, b] of HOST_BUCKETS) if (re.test(host)) return b;
        return 'other';
    }

    // Storage can throw (private mode, blocked site data); every read/write is
    // guarded and a failure degrades to "unknown" (null), never a wrong answer.
    function _get(store, k) { try { return store ? store.getItem(k) : null; } catch { return null; } }
    function _set(store, k, v) { try { if (store) store.setItem(k, v); return true; } catch { return false; } }

    // "New" = this tab's session began with no prior visit on this browser, so a
    // new visitor's 2nd/3rd page still counts as new rather than flipping to
    // returning after the first beacon. seq lives in sessionStorage so full page
    // loads between edge-rendered path URLs (/nfl/stories/x -> /nfl/player/y)
    // keep counting instead of each looking like a fresh entry.
    function payload(view, env) {
        const { local, session, referrer, host, pathname, search } = env;
        let isNew = null;
        const sessNew = _get(session, 'zs_sess_new');
        if (sessNew === '1' || sessNew === '0') {
            isNew = sessNew === '1' ? 1 : 0;
        } else if (local) {
            const seen = _get(local, 'zs_seen');
            if (seen !== null || _set(local, 'zs_seen', '1')) {
                isNew = seen === null ? 1 : 0;
                _set(session, 'zs_sess_new', String(isNew));
            }
        }
        const prev = parseInt(_get(session, 'zs_nav_seq'), 10);
        let seq = Number.isFinite(prev) && prev > 0 ? Math.min(prev + 1, 999) : 1;
        // Blocked sessionStorage: fall back to an in-memory count so every page in
        // the tab doesn't masquerade as an entry (it resets on a full page load).
        if (_set(session, 'zs_nav_seq', String(seq))) memSeq = seq;
        else seq = memSeq = Math.min(memSeq + 1, 999);
        const out = { sport: sportOf(view), view: String(view).slice(0, 64), seq, isNew };
        if (seq === 1) {
            out.ref = refBucket(referrer, host, search);
            out.path = String(pathname || '/').slice(0, 64);
        }
        return out;
    }

    return { sportOf, refBucket, payload };
})();

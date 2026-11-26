// ============================================================
// ApiCache — localStorage cache with per-entry TTL
//
// Keys are namespaced under "zs_cache_" — deliberately its OWN sub-namespace,
// not the bare "zs_" every other piece of app state also uses (zs_theme,
// zs_follows, zs_seen_welcome, zs_saved_stats, zs_recents, and more — see
// grep for the full list). invalidate('') does a prefix-scan wipe of
// everything under this class's namespace; when that namespace was just
// "zs_", invalidate('') silently deleted ALL of those too, including a
// user's followed teams (zs_follows) and saved custom stat formulas
// (zs_saved_stats) — found live 2026-08-10 when a repeat visitor kept
// seeing the first-visit welcome banner reappear, which was actually a
// symptom of quota-triggered eviction (ApiCache.set's own retry-on-quota
// path calls invalidate('')) wiping zs_seen_welcome as collateral damage.
// Never widen this namespace back to something another localStorage key
// could share.
// Stale entries are evicted lazily on read.
// localStorage write failures (quota exceeded, private mode)
// are caught and logged — the app continues without caching.
// ============================================================

class ApiCache {
    static #NS  = 'zs_cache_';

    // Default TTLs in milliseconds
    static TTL = {
        SHORT:  5  * 60 * 1000,   //  5 min  — live scores, game log
        MEDIUM: 30 * 60 * 1000,   // 30 min  — season averages, players
        LONG:   60 * 60 * 1000,   // 60 min  — teams (rarely change)
        DAILY:  12 * 60 * 60 * 1000, // 12 hr — Savant data updated once/day (percentile rankings, sprint speed)
        SEASON: 25 * 60 * 1000,   // 25 min  — composed full-season game logs (power rankings) — long enough
                                  // that re-opening the page doesn't re-fan-out a week-loop of fetches,
                                  // short enough that same-day new results show up same-day.
    };

    static #key(raw) {
        return this.#NS + raw;
    }

    // A cold home load wrote ~7 MB of raw ESPN/statsapi payloads (single day
    // scoreboards run 1.1-1.3 MB) into a ~5 MB store, so every first visit hit
    // the quota and wiped the whole cache (2026-11-25, measured). An entry
    // bigger than this stays in memory for the life of the page instead, as
    // its JSON string so each read is a fresh copy, as from localStorage.
    static #MEM = new Map();
    static #MAX_PERSIST_CHARS = 256 * 1024;

    static #memEntry(raw) {
        const k = this.#key(raw);
        const e = this.#MEM.get(k);
        if (e && Date.now() > e.exp) { this.#MEM.delete(k); return null; }
        return e || null;
    }

    /**
     * Read a cached value. Returns null on miss, stale, or error.
     * @param {string} raw  — cache key (usually a URL path+search string)
     * @returns {any|null}
     */
    static get(raw) {
        const mem = this.#memEntry(raw);
        if (mem) return JSON.parse(mem.json).data;
        try {
            const stored = localStorage.getItem(this.#key(raw));
            if (!stored) return null;

            const { data, exp } = JSON.parse(stored);

            if (Date.now() > exp) {
                localStorage.removeItem(this.#key(raw));
                Logger.debug(`Cache STALE  ${raw}`, undefined, 'CACHE');
                return null;
            }

            Logger.debug(`Cache HIT    ${raw}`, undefined, 'CACHE');
            return data;

        } catch {
            return null;
        }
    }

    /**
     * Return the write timestamp (ms since epoch) for a cache entry, or null on miss.
     * @param {string} raw
     * @returns {number|null}
     */
    static getTimestamp(raw) {
        const mem = this.#memEntry(raw);
        if (mem) return mem.ts;
        try {
            const stored = localStorage.getItem(this.#key(raw));
            if (!stored) return null;
            const { ts, exp } = JSON.parse(stored);
            if (Date.now() > exp) return null;
            return ts ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Write a value to the cache.
     * @param {string} raw    — cache key
     * @param {any}    data   — value to cache (must be JSON-serialisable)
     * @param {number} ttl    — lifetime in ms (default: TTL.MEDIUM)
     */
    static #cacheWarnFired = false;
    // Was a one-shot "only ever evict once per page session" flag — found live
    // 2026-08-16 (UX audit) that once the SECOND quota hit landed (routine on
    // any session that visits more than a handful of pages), eviction never
    // ran again for the rest of the session: every ApiCache.set() from then on
    // failed silently and every page reload went cold. Replaced with a cooldown
    // so eviction can fire again after some time has passed, instead of exactly
    // once ever. The cooldown (not "always evict") exists so a single payload
    // that's bigger than the whole quota can't thrash invalidate('') on every
    // write for the rest of the session.
    static #lastEvictAt = 0;
    static #EVICT_COOLDOWN_MS = 30 * 1000;

    static set(raw, data, ttl = this.TTL.MEDIUM) {
        const k = this.#key(raw);
        const entry = { data, exp: Date.now() + ttl, ts: Date.now() };
        let json;
        try { json = JSON.stringify(entry); } catch { return; }
        if (json.length > ApiCache.#MAX_PERSIST_CHARS) {
            this.#MEM.set(k, { json, exp: entry.exp, ts: entry.ts });
            try { localStorage.removeItem(k); } catch { /* storage off */ }
            return;
        }
        this.#MEM.delete(k);
        try {
            localStorage.setItem(k, json);
        } catch (e) {
            // Quota exhaustion is the common case (large stat payloads), not
            // disabled storage — evict our namespace and retry before
            // declaring caching unusable (D-038 V3: the old toast cried
            // "Storage Disabled" while storage worked fine).
            const now = Date.now();
            if (now - ApiCache.#lastEvictAt > ApiCache.#EVICT_COOLDOWN_MS) {
                ApiCache.#lastEvictAt = now;
                try {
                    this.invalidate('');
                    localStorage.setItem(k, json);
                    Logger.info('Cache quota hit — evicted zs_* entries and retried OK', undefined, 'CACHE');
                    return;
                } catch (_) { /* genuinely unavailable — fall through */ }
            }
            Logger.warn('Cache write failed (quota or disabled)', e.message, 'CACHE');
            if (!this.#cacheWarnFired) {
                this.#cacheWarnFired = true;
                // Defer until ErrorHandler is guaranteed to exist
                requestAnimationFrame(() => {
                    ErrorHandler?.toast(
                        'Browser storage is full or unavailable — stats will reload each visit.',
                        'warn',
                        { title: 'Caching off', duration: 6000 }
                    );
                });
            }
        }
    }

    /**
     * Remove all cache entries whose key starts with `prefix`.
     * Pass an empty string to wipe the entire ZohnStats cache.
     * @param {string} prefix
     */
    static invalidate(prefix = '') {
        const full = this.#NS + prefix;
        [...this.#MEM.keys()].filter(k => k.startsWith(full)).forEach(k => this.#MEM.delete(k));
        Object.keys(localStorage)
            .filter(k => k.startsWith(full))
            .forEach(k => localStorage.removeItem(k));
        Logger.info(`Cache invalidated (prefix="${prefix}")`, undefined, 'CACHE');
    }

    /** How many ZohnStats cache entries exist right now. */
    static get size() {
        return Object.keys(localStorage).filter(k => k.startsWith(this.#NS)).length + this.#MEM.size;
    }
}

window.ApiCache = ApiCache;

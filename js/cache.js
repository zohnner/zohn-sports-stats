// ============================================================
// ApiCache — localStorage cache with per-entry TTL
//
// Keys are namespaced under "zs_" to avoid collisions.
// Stale entries are evicted lazily on read.
// localStorage write failures (quota exceeded, private mode)
// are caught and logged — the app continues without caching.
// ============================================================

class ApiCache {
    static #NS  = 'zs_';

    // Default TTLs in milliseconds
    static TTL = {
        SHORT:  5  * 60 * 1000,   //  5 min  — live scores, game log
        MEDIUM: 30 * 60 * 1000,   // 30 min  — season averages, players
        LONG:   60 * 60 * 1000,   // 60 min  — teams (rarely change)
    };

    static #key(raw) {
        return this.#NS + raw;
    }

    /**
     * Read a cached value. Returns null on miss, stale, or error.
     * @param {string} raw  — cache key (usually a URL path+search string)
     * @returns {any|null}
     */
    static get(raw) {
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
     * Write a value to the cache.
     * @param {string} raw    — cache key
     * @param {any}    data   — value to cache (must be JSON-serialisable)
     * @param {number} ttl    — lifetime in ms (default: TTL.MEDIUM)
     */
    static set(raw, data, ttl = this.TTL.MEDIUM) {
        try {
            localStorage.setItem(
                this.#key(raw),
                JSON.stringify({ data, exp: Date.now() + ttl })
            );
        } catch (e) {
            Logger.warn('Cache write failed (quota or disabled)', e.message, 'CACHE');
        }
    }

    /**
     * Remove all cache entries whose key starts with `prefix`.
     * Pass an empty string to wipe the entire ZohnStats cache.
     * @param {string} prefix
     */
    static invalidate(prefix = '') {
        const full = this.#NS + prefix;
        Object.keys(localStorage)
            .filter(k => k.startsWith(full))
            .forEach(k => localStorage.removeItem(k));
        Logger.info(`Cache invalidated (prefix="${prefix}")`, undefined, 'CACHE');
    }

    /** How many ZohnStats cache entries exist right now. */
    static get size() {
        return Object.keys(localStorage).filter(k => k.startsWith(this.#NS)).length;
    }
}

window.ApiCache = ApiCache;

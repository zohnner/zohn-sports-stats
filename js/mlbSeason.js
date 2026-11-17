// ============================================================
// MLBSeason — which MLB season the site shows, and where in it we are
// (D-206). Read from the MLB Stats API's own calendar (/seasons/{year}),
// so the season ends when the World Series does: statsapi moves
// postSeasonEndDate to the date of the last World Series game (2024 ended
// in five on Oct 30 and reads 2024-10-30), not the scheduled Game 7.
//
// season: the season whose stats to show. The calendar year once its
//         regular season has started, the previous one before that (so
//         spring training shows last year's numbers, not empty boards).
// phase:  'offseason' | 'preseason' (spring training) | 'regular' | 'postseason'.
//
// Loads before js/mlb.js, which sets MLB_SEASON from current(). The last
// fetched dates live in localStorage so a returning visitor starts right;
// without them a calendar guess stands in until refresh() answers.
// functions/_mlbSeason.js runs the same resolve for the edge templates;
// tests/mlbSeason.test.js checks the two agree.
// ============================================================
const MLBSeason = (() => {
    const KEY = 'zs_mlb_season_dates';
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    function guess(year, today) {
        const m = Number(today.slice(5, 7));
        if (m <= 2) return { season: year - 1, phase: 'offseason', source: 'calendar' };
        if (m === 3) return { season: year - 1, phase: 'preseason', source: 'calendar' };
        if (m <= 9) return { season: year, phase: 'regular', source: 'calendar' };
        if (m === 10) return { season: year, phase: 'postseason', source: 'calendar' };
        return { season: year, phase: 'offseason', source: 'calendar' };
    }

    // dates: the statsapi season object for `year`; today: 'YYYY-MM-DD'.
    function resolve(dates, year, today) {
        const d = dates || {};
        if (Number(d.seasonId) !== year || !d.regularSeasonStartDate || !d.regularSeasonEndDate || !d.postSeasonEndDate) {
            return guess(year, today);
        }
        if (today < d.regularSeasonStartDate) {
            const spring = d.springStartDate || d.seasonStartDate;
            return { season: year - 1, phase: spring && today >= spring ? 'preseason' : 'offseason', source: 'api' };
        }
        if (today <= d.regularSeasonEndDate) return { season: year, phase: 'regular', source: 'api' };
        if (today <= d.postSeasonEndDate) return { season: year, phase: 'postseason', source: 'api' };
        return { season: year, phase: 'offseason', source: 'api' };
    }

    function _read() {
        try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; }
    }
    function _write(rec) {
        try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (_) {}
    }
    let stored = _read();

    function current(now = Date.now()) {
        const d = new Date(now);
        return resolve(stored && stored.dates, d.getFullYear(), ymd(d));
    }
    function phase(now) { return current(now).phase; }

    // Postseason re-checks hourly: before the series ends, postSeasonEndDate
    // may still be the scheduled last date rather than the real one.
    function _stale(now) {
        if (!stored || !stored.dates || Number(stored.dates.seasonId) !== new Date(now).getFullYear()) return true;
        const maxAge = current(now).phase === 'postseason' ? 3600e3 : 12 * 3600e3;
        return !(now - stored.fetchedAt < maxAge);
    }

    // fetchSeason(year) resolves to the statsapi /seasons/{year} payload.
    async function refresh(fetchSeason, now = Date.now()) {
        if (!_stale(now)) return current(now);
        const year = new Date(now).getFullYear();
        const json = await fetchSeason(year);
        const dates = ((json && json.seasons) || []).find(s => Number(s.seasonId) === year);
        if (dates) {
            stored = { fetchedAt: now, dates };
            _write(stored);
        }
        return current(now);
    }

    return { current, phase, refresh, resolve, ymd };
})();

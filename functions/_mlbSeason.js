// MLB season for the edge templates (D-206): the same rule as js/mlbSeason.js,
// read from statsapi's /seasons/{year} calendar so the season ends when the
// World Series does. tests/mlbSeason.test.js runs both resolves on one table
// of dates and fails if they disagree. Fails open to the calendar guess.

const ET_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

function guess(year, today) {
    const m = Number(today.slice(5, 7));
    if (m <= 2) return { season: year - 1, phase: 'offseason', source: 'calendar' };
    if (m === 3) return { season: year - 1, phase: 'preseason', source: 'calendar' };
    if (m <= 9) return { season: year, phase: 'regular', source: 'calendar' };
    if (m === 10) return { season: year, phase: 'postseason', source: 'calendar' };
    return { season: year, phase: 'offseason', source: 'calendar' };
}

export function resolveMlbSeason(dates, year, today) {
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

export async function mlbSeason(now = new Date()) {
    const today = ET_DATE.format(now);
    const year = Number(today.slice(0, 4));
    let dates = null;
    try {
        const res = await fetch(`https://statsapi.mlb.com/api/v1/seasons/${year}?sportId=1`, {
            headers: { 'User-Agent': 'SportStrata/1.0' },
            cf: { cacheTtl: 3600, cacheEverything: true },
        });
        if (res.ok) dates = ((await res.json()).seasons || []).find(s => Number(s.seasonId) === year) || null;
    } catch (_) {}
    return resolveMlbSeason(dates, year, today);
}

// ============================================================
// News feed (D-024) — ESPN league news via the same-origin /api/news proxy.
// Sport-aware (reads AppState.currentSport). Shows headline + blurb + image +
// attribution + link-out only (copyright-safe). Cards link out in a new tab.
//
// D-125: added NCAAF. NCAAF has no real injury-report or depth-chart data
// anywhere (live-checked: ESPN's /summary has no injuries key at all for CFB,
// ESPN's per-team /injuries and /depthchart endpoints are stubs for every
// sport not just college, ESPN's league-wide CFB injuries feed is dead — 3
// entries total, newest from 2022 — and CollegeFootballData.com's public API
// has no depth-chart/injury endpoints either, only a plain roster list). NFL's
// real Injury Report (nfl.js) works because Sleeper's player pool tracks it,
// and Sleeper is NFL-only. So instead of faking structured data, this feed
// does client-side keyword tagging/filtering over real ESPN headlines — an
// honest "here's real injury-relevant news" surface, not a fake report.
// ============================================================

let _newsCache = {};
// NCAAB + WNBA added during the sport-landing port (2026-09-07); NBA added
// D-161 follow-up (2026-09-14) -- functions/api/news.js's LEAGUES map
// already covers all three, same site.web.api.espn.com host ncaab.js/
// wnba.js/nba.js already proxy for scoreboard/standings/rankings. Real bug
// fixed by adding nba here: loadNews() below falls back to 'mlb' for any
// sport not in this list, so NBA's News tab was silently showing MLB
// headlines instead of real NBA news.
const NEWS_SPORTS = ['mlb', 'nfl', 'ncaaf', 'ncaab', 'wnba', 'nba'];
const NEWS_INJURY_RE = /\b(injur(?:y|ed|ies)|questionable|doubtful|day-to-day|out for the (?:season|year)|ruled out|will miss|placed on (?:ir|injured reserve)|sidelined|concussion|torn (?:acl|mcl|achilles)|surgery|fracture(?:d)?|sprain(?:ed)?)\b/i;

function _isNewsInjuryRelated(a) {
    return NEWS_INJURY_RE.test(`${a.headline || ''} ${a.description || ''}`);
}

// NFL landing "Breaking News" banner (Phase 2 competitor-feature pass): a
// headline counts as breaking if it's recent, same recency signal
// _newsTimeAgo() already surfaces per-card -- no ESPN priority/breaking field
// exists to read (checked; the payload carries only headline/description/
// images/byline/published/lastModified), so a 6h recency window is the
// honest proxy, not a guessed editorial signal.
const NEWS_BREAKING_WINDOW_MS = 6 * 3600 * 1000;
function _isNewsBreaking(a) {
    const iso = a && (a.published || a.lastModified);
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !isNaN(t) && (Date.now() - t) < NEWS_BREAKING_WINDOW_MS;
}

async function loadNews(sport) {
    sport = sport || (typeof AppState !== 'undefined' && AppState.currentSport) || 'nfl';
    if (!NEWS_SPORTS.includes(sport)) sport = 'mlb';
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('news', null);
    grid.className = '';
    grid.style.cssText = '';
    grid.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton-card" style="min-height:88px"></div>`).join('');

    try {
        let data = _newsCache[sport];
        if (!data) {
            const res = await fetch(`/api/news?sport=${encodeURIComponent(sport)}`);
            if (!res.ok) throw new Error(`news ${res.status}`);
            data = await res.json();
            _newsCache[sport] = data;
        }
        displayNews(data, sport);
    } catch (err) {
        if (window.ErrorHandler && ErrorHandler.handle) {
            ErrorHandler.handle(grid, err, () => loadNews(sport), { tag: 'NEWS', title: 'Failed to Load News' });
        } else {
            grid.innerHTML = `<div class="news-empty">Couldn't load news right now.</div>`;
        }
        if (window.Logger) Logger.warn('news load failed', err, 'NEWS');
    }
}

function _newsTimeAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 3600)  return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    const d = Math.round(s / 86400);
    return d < 30 ? d + 'd ago' : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function _newsCard(a) {
    const href = a && a.links && a.links.web && a.links.web.href;
    if (!href || !a.headline) return '';
    const img = (a.images && a.images[0] && a.images[0].url) || '';
    const byline = a.byline ? `${_escHtml(a.byline)} · ` : '';
    const when = _newsTimeAgo(a.published || a.lastModified);
    const injBadge = _isNewsInjuryRelated(a) ? `<span class="roster-il-badge">INJURY</span>` : '';
    return `<a class="news-card" href="${_escHtml(href)}" target="_blank" rel="noopener">
        ${img ? `<div class="news-card__thumb"><img src="${_escHtml(img)}" alt="" loading="lazy" data-hide-on-error></div>` : ''}
        <div class="news-card__body">
            <div class="news-card__headline">${_escHtml(a.headline)}${injBadge}</div>
            ${a.description ? `<div class="news-card__desc">${_escHtml(a.description)}</div>` : ''}
            <div class="news-card__meta">${byline}${when}</div>
        </div>
    </a>`;
}

let _newsInjuryOnly = false;

function _newsFilterBar(sport, injuryCount, total) {
    const chip = (active, label, onId) => `<button id="${onId}" style="padding:0.32rem 0.74rem;border-radius:var(--radius-full);
        border:1px solid ${active ? 'var(--accent)' : 'var(--border-default)'};
        background:${active ? 'var(--accent)' : 'transparent'};
        color:${active ? '#0b0b0d' : 'var(--text-secondary)'};
        font-weight:700;font-size:0.72rem;cursor:pointer">${label}</button>`;
    return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem;margin-bottom:0.85rem">
        ${chip(!_newsInjuryOnly, `All (${total})`, 'newsFilterAll')}
        ${chip(_newsInjuryOnly, `<span style="display:inline-flex;vertical-align:-2px;margin-right:0.2rem">${_iconSvg('stethoscope', 12)}</span>Injury-Related (${injuryCount})`, 'newsFilterInjury')}
    </div>`;
}

function displayNews(data, sport) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = '';
    grid.style.cssText = '';
    const articles = ((data && data.articles) || []).filter(a => a && a.headline && a.links && a.links.web);
    if (!articles.length) {
        // icon arg removed 2026-09-07 -- was already dead (renderEmptyState only accepts an SVG string)
        if (window.ErrorHandler && ErrorHandler.renderEmptyState) ErrorHandler.renderEmptyState(grid, 'No recent news right now.');
        else grid.innerHTML = `<div class="news-empty">No recent news right now.</div>`;
        return;
    }
    const label = (typeof SPORTS_META !== 'undefined' && SPORTS_META[sport] && SPORTS_META[sport].label) || String(sport || '').toUpperCase();
    const injuryCount = articles.filter(_isNewsInjuryRelated).length;
    const shown = _newsInjuryOnly ? articles.filter(_isNewsInjuryRelated) : articles;

    const list = shown.length
        ? `<div class="news-list">${shown.map(_newsCard).join('')}</div>`
        : `<div class="news-empty" style="padding:2rem 0;text-align:center;color:var(--text-muted)">No injury-related headlines right now.</div>`;

    grid.innerHTML = `<div class="news-page">
        <h2 class="news-page__title">${label} — Latest</h2>
        <div id="newsStories"></div>
        ${_newsFilterBar(sport, injuryCount, articles.length)}
        ${list}
        <p class="pct-caption">Wire headlines via ESPN · tap a story to read the full article${sport === 'ncaaf' ? '. No structured CFB injury report exists anywhere (ESPN, Sleeper, CollegeFootballData.com) — "Injury-Related" is a keyword match over real headlines, not an official report.' : ''}</p>
    </div>`;

    if (STORY_SPORTS.includes(sport)) {
        const storiesHost = document.getElementById('newsStories');
        fetchStoriesIndex(sport).then(stories => {
            if (!storiesHost || !storiesHost.isConnected || AppState.currentSport !== sport) return;
            storiesHost.innerHTML = storiesBlockHtml(stories.slice(0, 3), 'SportStrata Stories', sport);
        });
    }

    document.getElementById('newsFilterAll')?.addEventListener('click', () => { _newsInjuryOnly = false; displayNews(data, sport); });
    document.getElementById('newsFilterInjury')?.addEventListener('click', () => { _newsInjuryOnly = true; displayNews(data, sport); });
}

if (typeof window !== 'undefined') {
    window.loadNews = loadNews;
    window.displayNews = displayNews;
}

// ── SportStrata Stories (D-166, MLB added D-171) ─────────────
// Committed, human-reviewed stories listed in /content/<sport>/stories/index.json
// (built by tools/stories/build-index.cjs). One shared promise per sport per page
// load; every surface (home rail, landings, team pages, News) reads it.
// Must match STORY_SPORTS in tools/stories/story-core.cjs.
const STORY_SPORTS = ['nfl', 'mlb'];
const _storiesIndexPromises = {};
function fetchStoriesIndex(sport = 'nfl') {
    if (!_storiesIndexPromises[sport]) {
        _storiesIndexPromises[sport] = fetch(`/content/${sport}/stories/index.json`)
            .then(r => (r.ok ? r.json() : { stories: [] }))
            .then(d => (d && Array.isArray(d.stories) ? d.stories : []))
            .catch(err => { if (window.Logger) Logger.warn('stories index unavailable', err && err.message, 'NEWS'); return []; });
    }
    return _storiesIndexPromises[sport];
}

// Every sport's stories, newest first — the home rail's cross-sport feed.
function fetchAllStories() {
    return Promise.all(STORY_SPORTS.map(sp => fetchStoriesIndex(sp)))
        .then(lists => lists.flat().sort((a, b) => String(b.date).localeCompare(String(a.date))));
}

// sport set → "All stories" links to that sport's index. Omitted for a
// mixed-sport list (no cross-sport index page exists), which also tags each row.
function storiesBlockHtml(stories, heading, sport) {
    if (!stories || !stories.length) return '';
    const tag = s => (!sport && s.sport ? `<span class="story-row__sport">${_escHtml(String(s.sport).toUpperCase())}</span>` : '');
    const rows = stories.map(s => `<a class="story-row" href="${_escHtml(s.url)}">
            <span class="story-row__title">${tag(s)}${_escHtml(s.title)}</span>
            <span class="story-row__dek">${_escHtml(s.dek)}</span>
        </a>`).join('');
    const more = sport ? `<a class="stories-block__more" href="/${_escHtml(sport)}/stories">All stories →</a>` : '';
    return `<section class="stories-block">
        <div class="stories-block__hdr"><span class="eyebrow">${_escHtml(heading)}</span>${more}</div>
        ${rows}
    </section>`;
}

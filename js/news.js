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
const NEWS_SPORTS = ['mlb', 'nfl', 'ncaaf'];
const NEWS_INJURY_RE = /\b(injur(?:y|ed|ies)|questionable|doubtful|day-to-day|out for the (?:season|year)|ruled out|will miss|placed on (?:ir|injured reserve)|sidelined|concussion|torn (?:acl|mcl|achilles)|surgery|fracture(?:d)?|sprain(?:ed)?)\b/i;

function _isNewsInjuryRelated(a) {
    return NEWS_INJURY_RE.test(`${a.headline || ''} ${a.description || ''}`);
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
        ${chip(_newsInjuryOnly, `🩹 Injury-Related (${injuryCount})`, 'newsFilterInjury')}
    </div>`;
}

function displayNews(data, sport) {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = '';
    grid.style.cssText = '';
    const articles = ((data && data.articles) || []).filter(a => a && a.headline && a.links && a.links.web);
    if (!articles.length) {
        if (window.ErrorHandler && ErrorHandler.renderEmptyState) ErrorHandler.renderEmptyState(grid, 'No recent news right now.', '📰');
        else grid.innerHTML = `<div class="news-empty">No recent news right now.</div>`;
        return;
    }
    const label = sport === 'mlb' ? 'MLB' : sport === 'ncaaf' ? 'NCAAF' : 'NFL';
    const injuryCount = articles.filter(_isNewsInjuryRelated).length;
    const shown = _newsInjuryOnly ? articles.filter(_isNewsInjuryRelated) : articles;

    const list = shown.length
        ? `<div class="news-list">${shown.map(_newsCard).join('')}</div>`
        : `<div class="news-empty" style="padding:2rem 0;text-align:center;color:var(--text-muted)">No injury-related headlines right now.</div>`;

    grid.innerHTML = `<div class="news-page">
        <h2 class="news-page__title">${label} — Latest</h2>
        ${_newsFilterBar(sport, injuryCount, articles.length)}
        ${list}
        <p class="pct-caption">Headlines via ESPN · tap a story to read the full article${sport === 'ncaaf' ? '. No structured CFB injury report exists anywhere (ESPN, Sleeper, CollegeFootballData.com) — "Injury-Related" is a keyword match over real headlines, not an official report.' : ''}</p>
    </div>`;

    document.getElementById('newsFilterAll')?.addEventListener('click', () => { _newsInjuryOnly = false; displayNews(data, sport); });
    document.getElementById('newsFilterInjury')?.addEventListener('click', () => { _newsInjuryOnly = true; displayNews(data, sport); });
}

if (typeof window !== 'undefined') {
    window.loadNews = loadNews;
    window.displayNews = displayNews;
}

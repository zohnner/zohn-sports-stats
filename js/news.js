// ============================================================
// News feed (D-024) — ESPN league news via the same-origin /api/news proxy.
// Sport-aware (reads AppState.currentSport). Shows headline + blurb + image +
// attribution + link-out only (copyright-safe). Cards link out in a new tab.
// ============================================================

let _newsCache = {};

async function loadNews(sport) {
    sport = sport || (typeof AppState !== 'undefined' && AppState.currentSport) || 'nfl';
    if (sport !== 'mlb' && sport !== 'nfl') sport = 'mlb';
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
    return `<a class="news-card" href="${_escHtml(href)}" target="_blank" rel="noopener">
        ${img ? `<div class="news-card__thumb"><img src="${_escHtml(img)}" alt="" loading="lazy" data-hide-on-error></div>` : ''}
        <div class="news-card__body">
            <div class="news-card__headline">${_escHtml(a.headline)}</div>
            ${a.description ? `<div class="news-card__desc">${_escHtml(a.description)}</div>` : ''}
            <div class="news-card__meta">${byline}${when}</div>
        </div>
    </a>`;
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
    const label = sport === 'mlb' ? 'MLB' : 'NFL';
    grid.innerHTML = `<div class="news-page">
        <h2 class="news-page__title">${label} — Latest</h2>
        <div class="news-list">${articles.map(_newsCard).join('')}</div>
        <p class="pct-caption">Headlines via ESPN · tap a story to read the full article</p>
    </div>`;
}

if (typeof window !== 'undefined') {
    window.loadNews = loadNews;
    window.displayNews = displayNews;
}

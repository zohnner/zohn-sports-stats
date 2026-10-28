// Crawlable SportStrata Stories links for the edge templates (home, sport
// landings, team pages, story pages). Underscore-prefixed, so not a route.
// Reads the committed content/<sport>/stories/index.json through env.ASSETS;
// every function fails open to [] / '' so a missing index never breaks a page.
import core from '../tools/stories/story-core.cjs';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export const STORY_SPORT_IDS = Object.keys(core.STORY_SPORTS);

export async function readStories(env, url, sport) {
    if (!STORY_SPORT_IDS.includes(sport)) return [];
    try {
        const r = await env.ASSETS.fetch(new URL(`/content/${sport}/stories/index.json`, url));
        if (!r.ok) return [];
        const stories = ((await r.json()) || {}).stories;
        return Array.isArray(stories) ? stories.map(s => ({ ...s, sport })) : [];
    } catch (_) { return []; }
}

export async function readAllStories(env, url) {
    const lists = await Promise.all(STORY_SPORT_IDS.map(sp => readStories(env, url, sp)));
    return lists.flat().sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// A story's `teams` frontmatter lists every team it names, as abbreviations.
export function storiesForTeam(stories, abbr) {
    const code = String(abbr || '').toUpperCase();
    return code ? stories.filter(s => (s.teams || []).some(t => String(t).toUpperCase() === code)) : [];
}

// Same sport, stories sharing a team first, then newest; never the story itself.
export function siblingStories(stories, slug, limit = 3) {
    const self = stories.find(s => s.slug === slug);
    const mine = new Set((self && self.teams) || []);
    const shares = s => ((s.teams || []).some(t => mine.has(t)) ? 1 : 0);
    return stories.filter(s => s.slug !== slug)
        .map((s, i) => ({ s, i }))
        .sort((a, b) => shares(b.s) - shares(a.s) || a.i - b.i)
        .slice(0, limit).map(x => x.s);
}

// opts.sport: the "All stories" link target (opts.more:false drops it). Omit it
// for a mixed-sport list, which labels each row with its sport instead.
export function storyListHtml(stories, heading, opts = {}) {
    if (!stories || !stories.length) return '';
    const items = stories.map(s => {
        const tag = opts.sport ? '' : `${esc(core.STORY_SPORTS[s.sport]?.label || String(s.sport || '').toUpperCase())}: `;
        return `<li>${tag}<a href="${esc(s.url)}">${esc(s.title)}</a> <time datetime="${esc(s.date)}">${esc(s.date)}</time></li>`;
    }).join('');
    const more = opts.sport && opts.more !== false
        ? `<p><a href="/${esc(opts.sport)}/stories">All ${esc(core.STORY_SPORTS[opts.sport].label)} stories</a></p>`
        : '';
    return `<h2>${esc(heading)}</h2><ul class="ss-story-links">${items}</ul>${more}`;
}

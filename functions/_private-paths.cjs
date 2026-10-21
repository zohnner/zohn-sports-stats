// Repo paths Cloudflare Pages would otherwise serve as static files. The git
// build publishes the whole repo root (.cfignore is not honored there), so
// internal docs, tooling and Worker source were all publicly fetchable.
// functions/_middleware.js 404s these; _routes.json must route each through
// Functions or the static asset wins. tests/publicSurface.test.js fails CI
// when a tracked top-level entry is in none of the lists below.

const PRIVATE_FILES = [
    '.cfignore', '.gitignore', 'AGENTS.md', 'BRAND-KIT.md', 'CLAUDE.md',
    'DECISIONS.md', 'DESIGN.md', 'GOALS.md', 'ISSUES.md', 'LICENSE',
    'README.md', 'package.json', 'package-lock.json', 'schema.sql', 'wrangler.toml',
];

const PRIVATE_DIRS = [
    '.claude', '.github', 'Documentation', 'Themes', 'bot', 'docs',
    'migrations', 'misc_documentation', 'tests', 'tools', 'worker',
];

const PUBLIC_FILES = [
    '404.html', '_headers', '_routes.json', 'ask.html', 'draft-kit.html',
    'favicon.ico', 'index.html', 'manifest.json', 'mock-draft.html',
    'offline.html', 'pickem.html', 'playoff-odds.html', 'robots.txt',
    'sitemap.xml', 'sw.js', 'youtube-insights.html',
];

// functions/ is compiled by Pages, never served as files.
const PUBLIC_DIRS = ['assets', 'content', 'css', 'data', 'functions', 'js'];

function isPrivatePath(pathname) {
    let p;
    try { p = decodeURIComponent(pathname); } catch { return false; }
    p = p.replace(/^\/+/, '');
    if (PRIVATE_FILES.includes(p.replace(/\/+$/, ''))) return true;
    const top = p.split('/')[0];
    return PRIVATE_DIRS.includes(top) && p.length > top.length;
}

function routeRules() {
    return [...PRIVATE_FILES.map(f => '/' + f), ...PRIVATE_DIRS.map(d => `/${d}/*`)];
}

module.exports = { PRIVATE_FILES, PRIVATE_DIRS, PUBLIC_FILES, PUBLIC_DIRS, isPrivatePath, routeRules };

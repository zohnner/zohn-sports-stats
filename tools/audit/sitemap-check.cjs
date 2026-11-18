#!/usr/bin/env node
// Sitemap check: every published story, and every sport's /stories index,
// is in the live sitemap with a <lastmod>, and a story's <lastmod> is its
// publish date.
//
//   node tools/audit/sitemap-check.cjs https://sportstrata.cc
//
// Exit 0: nothing wrong. Exit 2: findings listed.
const fs = require('node:fs');
const path = require('node:path');

// sitemap.xml -> Map(path -> lastmod or '')
function readSitemap(xml) {
    const out = new Map();
    for (const m of String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
        const loc = /<loc>\s*https?:\/\/[^/]+([^<\s]*)\s*<\/loc>/.exec(m[1]);
        if (!loc) continue;
        const mod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(m[1]);
        out.set(loc[1] || '/', mod ? mod[1] : '');
    }
    return out;
}

function publishedStories(root) {
    const dir = path.join(root, 'content');
    const out = [];
    for (const sport of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
        const file = path.join(dir, sport, 'stories', 'index.json');
        if (!fs.existsSync(file)) continue;
        for (const s of JSON.parse(fs.readFileSync(file, 'utf8')).stories || []) out.push({ sport, slug: s.slug, date: s.date });
    }
    return out;
}

// stories: [{sport, slug, date}]. Returns { stories, indexes, findings }.
function check(sitemap, stories) {
    const findings = [];
    for (const s of stories) {
        const url = `/${s.sport}/stories/${s.slug}`;
        if (!sitemap.has(url)) findings.push({ kind: 'missing', url, detail: 'published story is not in the sitemap' });
        else if (!sitemap.get(url)) findings.push({ kind: 'no-lastmod', url, detail: 'story has no <lastmod>' });
        else if (sitemap.get(url) !== s.date) findings.push({ kind: 'wrong-lastmod', url, detail: `<lastmod> is ${sitemap.get(url)}, the story was published ${s.date}` });
    }
    const sports = [...new Set(stories.map(s => s.sport))];
    for (const sport of sports) {
        const url = `/${sport}/stories`;
        if (!sitemap.has(url)) findings.push({ kind: 'missing', url, detail: 'stories index is not in the sitemap' });
        else if (!sitemap.get(url)) findings.push({ kind: 'no-lastmod', url, detail: 'stories index has no <lastmod>' });
    }
    const withLastmod = [...sitemap.values()].filter(Boolean).length;
    return { urls: sitemap.size, withLastmod, stories: stories.length, indexes: sports.length, findings };
}

async function main(argv) {
    const base = (argv[0] || '').replace(/\/$/, '');
    if (!base) { console.error('usage: node tools/audit/sitemap-check.cjs <base-url>'); return 2; }
    const res = await fetch(`${base}/sitemap.xml`, { headers: { 'User-Agent': 'SportStrata-SitemapCheck/1.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) { console.error(`sitemap.xml answered ${res.status}`); return 2; }
    const r = check(readSitemap(await res.text()), publishedStories(path.join(__dirname, '..', '..')));
    console.log(`Sitemap: ${r.urls} URLs, ${r.withLastmod} with <lastmod>. Published: ${r.stories} stories, ${r.indexes} stories indexes.`);
    for (const f of r.findings) console.log(`  FAIL ${f.kind} ${f.url}: ${f.detail}`);
    console.log(`Story pages and indexes without a correct <lastmod>: ${r.findings.length}`);
    return r.findings.length ? 2 : 0;
}

if (require.main === module) {
    // exitCode, not process.exit: exiting while fetch is still closing its sockets
    // aborts Node on Windows (libuv UV_HANDLE_CLOSING assertion).
    main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { console.error(e.message); process.exitCode = 2; });
}

module.exports = { readSitemap, publishedStories, check };

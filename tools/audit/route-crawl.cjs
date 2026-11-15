#!/usr/bin/env node
// Route crawl: click what a reader clicks, and check where it lands.
//
//   node tools/audit/route-crawl.cjs https://sportstrata.cc [--json out.json]
//
// Browser half: on production, clicks game cards on the home Today tabs, the
// score ticker and each sport's scores list, and team links on each sport's
// teams list and standings. A game card must land on that game's view, a team
// link on that team's view. Then it plants a card that deliberately opens the
// wrong view and checks that the crawl itself reports it.
// HTTP half: every team path URL in sitemap.xml must answer 200 and hydrate a
// team view, and the NBA long-form abbreviations must redirect.
//
// Exit 0: no mis-routes and the plant was caught. Exit 2: anything else.
// Needs `playwright` (or `playwright-core` plus PW_CHANNEL=chrome).
const fs = require('node:fs');
const path = require('node:path');

const SPORTS = ['mlb', 'nfl', 'ncaaf', 'ncaab', 'nba', 'wnba'];
const SCORES_VIEW = s => (s === 'mlb' || s === 'nfl' ? `${s}-games` : `${s}-scores`);
const TEAM_PAGE_SPORTS = ['mlb', 'nfl', 'ncaaf', 'nba'];
const NBA_ALIASES = { sas: 'sa', gsw: 'gs', nyk: 'ny', nop: 'no', uta: 'utah', was: 'wsh' };
const PLANT_ID = 'PLANT000';

// Where a click ended up, as one string: the view, the hash and the path.
const where = l => `${l.view || ''} ${l.hash || ''} ${l.path || ''}`;

// One click -> null (landed right) or a finding.
function judge(c) {
    if (c.vanished) return null;
    const at = where(c.landed);
    const id = c.id ? String(c.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    let ok;
    if (c.kind === 'game') {
        ok = new RegExp(`(^|[ #/])${c.sport}-(game|live)-${id}`).test(at)
            || new RegExp(`/${c.sport}/game/${id}`).test(at);
    } else {
        ok = new RegExp(`(^|[ #/])${c.sport}-team-${id}`, 'i').test(at)
            || new RegExp(`/${c.sport}/team/${id}`, 'i').test(at);
    }
    if (ok) return null;
    return {
        kind: 'misroute', surface: c.surface, sport: c.sport, link: c.kind, id: c.id || null,
        detail: `expected the ${c.sport} ${c.kind} view${c.id ? ` for ${c.id}` : ''}, landed on ${at.trim() || 'nothing'}`,
    };
}

function summarize(clicks, cells) {
    const real = clicks.filter(c => !c.plant);
    const findings = real.map(judge).filter(Boolean);
    const plant = clicks.find(c => c.plant);
    const table = cells.map(cell => {
        const mine = real.filter(c => c.surface === cell.surface && c.sport === cell.sport && !c.vanished);
        return { ...cell, clicked: mine.length, misrouted: mine.map(judge).filter(Boolean).length };
    });
    return {
        clicks: real.filter(c => !c.vanished).length,
        misroutes: findings.length,
        findings,
        table,
        notExercised: table.filter(t => t.clicked === 0).map(t => `${t.surface} / ${t.sport}: ${t.found ? 'links vanished before the click' : 'nothing on screen to click'}`),
        plant: plant ? { caught: !!judge(plant), landed: where(plant.landed).trim() } : { caught: false, landed: 'plant did not run' },
    };
}

// Runs inside the page (serialized with toString); uses nothing from this file.
async function crawlInPage(opts) {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const grid = () => document.getElementById('playersGrid') || document.body;
    const settle = async () => {
        let last = '', stable = 0;
        for (let waited = 0; waited < opts.waitMs; waited += 400) {
            await sleep(400);
            const sig = `${AppState.currentView}|${location.hash}|${grid().innerText.length}|${!!grid().querySelector('[class*="skeleton"]')}`;
            stable = (sig === last && !sig.endsWith('true')) ? stable + 1 : 0;
            last = sig;
            if (stable >= 3) return;
        }
    };
    const landed = () => ({ view: AppState.currentView, hash: location.hash, path: location.pathname });
    const waitFor = async find => {
        for (let waited = 0; waited < opts.waitMs; waited += 300) {
            const el = find();
            if (el) return el;
            await sleep(300);
        }
        return null;
    };
    const clicks = [], cells = [];

    const homeTab = async tab => {
        navigateTo('home');
        await settle();
        if ((AppState._homeSportTab || 'all') !== tab) {
            const b = document.querySelector(`#homeSportTabs .standings-tab[data-sporttab="${tab}"]`);
            if (b) { b.click(); await settle(); }
        }
    };
    const sportView = view => async () => {
        const sport = view.split('-')[0];
        if (AppState.currentSport !== sport && typeof switchSport === 'function') switchSport(sport);
        navigateTo(view);
        await settle();
    };

    // surface: a name; setup: get the links on screen; list: () => [{sport, id, kind, find}]
    async function station(surface, sports, setup, list) {
        await setup();
        const found = list();
        for (const sport of sports) {
            const mine = found.filter(f => f.sport === sport);
            cells.push({ surface, sport, found: mine.length });
            for (const f of mine.slice(0, opts.perCell)) {
                await setup();
                const el = await waitFor(f.find);
                if (!el) { clicks.push({ surface, sport, kind: f.kind, id: f.id, vanished: true }); continue; }
                el.click();
                await settle();
                clicks.push({ surface, sport, kind: f.kind, id: f.id, landed: landed() });
            }
        }
    }

    const homeCards = () => [...document.querySelectorAll('#homeTodayGrid .home-game-card[data-game-key]')].map(el => {
        const key = el.dataset.gameKey, cut = key.indexOf('-');
        return { sport: key.slice(0, cut), id: key.slice(cut + 1), kind: 'game', find: () => document.querySelector(`#homeTodayGrid .home-game-card[data-game-key="${key}"]`) };
    });
    const tickerItems = () => {
        const seen = new Set(), out = [];
        document.querySelectorAll('#scoreTicker .ticker__item[data-sport]').forEach(el => {
            const sport = el.dataset.sport, id = el.dataset.gameId || el.dataset.gamePk;
            if (!id || seen.has(sport + id)) return;
            seen.add(sport + id);
            const attr = el.dataset.gamePk ? 'data-game-pk' : 'data-game-id';
            out.push({ sport, id, kind: 'game', find: () => document.querySelector(`#scoreTicker .ticker__item[data-sport="${sport}"][${attr}="${id}"]`) });
        });
        return out;
    };
    // List pages carry no shared id attribute, so links are found again by position.
    const byIndex = (sel, sport, kind, idOf) => () => [...grid().querySelectorAll(sel)].map((el, i) => ({
        sport, kind, id: idOf(el), find: () => grid().querySelectorAll(sel)[i] || null,
    }));
    const gameId = el => {
        const m = /-game-([^'"]+)'/.exec(el.getAttribute('onclick') || '');
        const key = el.dataset.gameKey || '';
        return (m && m[1]) || el.dataset.gameId || el.dataset.gamePk || (key.includes('-') ? key.slice(key.indexOf('-') + 1) : '');
    };
    const teamId = el => {
        const m = /-team-([^'"]+)'/.exec(el.getAttribute('onclick') || '') || /showMLBTeamDetail\((\d+)/.exec(el.getAttribute('onclick') || '');
        return (m && m[1]) || el.dataset.teamId || '';
    };
    const GAME_SEL = '.game-card, .home-game-card';
    const TEAM_SEL = '[onclick*="-team-"], [onclick*="showMLBTeamDetail"], .team-pick, .team-card, .mlb-team-card';

    await station('home All tab', opts.sports, () => homeTab('all'), homeCards);
    for (const s of opts.sports) await station(`home ${s.toUpperCase()} tab`, [s], () => homeTab(s), homeCards);
    await station('home ticker', opts.sports, () => homeTab('all'), tickerItems);
    for (const s of opts.sports) {
        await station('sport ticker', [s], sportView(`${s}-home`), tickerItems);
        await station('scores list', [s], sportView(opts.scoresView[s]), byIndex(GAME_SEL, s, 'game', gameId));
    }
    for (const s of opts.teamSports) {
        await station('teams list', [s], sportView(`${s}-teams`), byIndex(TEAM_SEL, s, 'team', teamId));
        await station('standings', [s], sportView(`${s}-standings`), byIndex(TEAM_SEL, s, 'team', teamId));
    }

    // The plant: a card that looks like an NCAAF game and opens the scores
    // list, the bug this crawl exists to catch. It must come back a mis-route.
    await homeTab('all');
    const host = document.getElementById('homeTodayGrid') || grid();
    const fake = document.createElement('div');
    fake.className = 'home-game-card';
    fake.dataset.gameKey = `ncaaf-${opts.plantId}`;
    fake.addEventListener('click', () => { if (AppState.currentSport !== 'ncaaf') switchSport('ncaaf'); navigateTo('ncaaf-scores'); });
    host.appendChild(fake);
    fake.click();
    await settle();
    clicks.push({ plant: true, surface: 'plant', sport: 'ncaaf', kind: 'game', id: opts.plantId, landed: landed() });
    fake.remove();
    return { clicks, cells };
}

// ── HTTP half ────────────────────────────────────────────────
const TEAM_URL = /<loc>(https?:\/\/[^<]+\/(mlb|nfl|ncaaf|nba)\/team\/([^<\/]+)[^<]*)<\/loc>/g;

function teamUrls(sitemapXml) {
    return [...sitemapXml.matchAll(TEAM_URL)].map(m => ({ url: m[1], sport: m[2], id: m[3] }));
}

// One fetched team page -> null or a finding.
function judgeTeamPage(t, res) {
    if (res.status !== 200) return { kind: 'bad-status', sport: t.sport, link: 'team', id: t.id, detail: `${t.url} answered ${res.status}` };
    const m = /__SS_ROUTE\s*=\s*['"]([^'"]+)['"]/.exec(res.body || '');
    if (!m || !new RegExp(`^${t.sport}-team-`).test(m[1])) {
        return { kind: 'misroute', sport: t.sport, link: 'team', id: t.id, detail: `${t.url} hydrates ${m ? m[1] : 'no route'}, expected ${t.sport}-team-…` };
    }
    return null;
}

function judgeAlias(base, long, short, res) {
    const want = new RegExp(`/nba/team/${short}(/|$)`);
    if (res.status >= 301 && res.status <= 308 && want.test(res.location || '')) return null;
    return { kind: 'bad-redirect', sport: 'nba', link: 'team', id: long, detail: `${base}/nba/team/${long} answered ${res.status}${res.location ? ` -> ${res.location}` : ''}, expected a redirect to /nba/team/${short}` };
}

async function get(url) {
    try {
        const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'SportStrata-RouteCrawl/1.0' }, signal: AbortSignal.timeout(20000) });
        return { status: r.status, location: r.headers.get('location') || '', body: r.status === 200 ? await r.text() : '' };
    } catch (e) {
        return { status: 0, location: '', body: '', error: String(e && e.message) };
    }
}

async function pool(items, n, fn) {
    const out = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: n }, async () => {
        while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
    }));
    return out;
}

// The 30 NBA teams from the edge template's own table, so they are checked
// whether or not the sitemap has caught up with them.
function nbaTeamUrls(base, src = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', '_nbaTeams.js'), 'utf8')) {
    return [...src.matchAll(/\['([A-Z]{2,4})', '[^']+'\]/g)].map(m => ({ url: `${base}/nba/team/${m[1].toLowerCase()}`, sport: 'nba', id: m[1].toLowerCase() }));
}

async function crawlHttp(base, fetcher = get, nba = nbaTeamUrls(base)) {
    const sm = await fetcher(`${base}/sitemap.xml`);
    const listed = teamUrls(sm.body || '');
    const notes = [];
    const listedNba = listed.filter(t => t.sport === 'nba').length;
    if (listedNba < nba.length) notes.push(`sitemap.xml lists ${listedNba} of ${nba.length} NBA team pages (checked all ${nba.length} directly)`);
    const teams = [...listed, ...nba.filter(t => !listed.some(l => l.sport === 'nba' && l.id === t.id))];
    const findings = (await pool(teams, 6, async t => judgeTeamPage(t, await fetcher(t.url)))).filter(Boolean);
    const aliases = Object.entries(NBA_ALIASES);
    findings.push(...(await pool(aliases, 6, async ([long, short]) => judgeAlias(base, long, short, await fetcher(`${base}/nba/team/${long}`)))).filter(Boolean));
    const bySport = {};
    for (const t of teams) bySport[t.sport] = (bySport[t.sport] || 0) + 1;
    if (!listed.length) findings.push({ kind: 'bad-status', sport: 'all', link: 'team', id: null, detail: `no team URLs found in ${base}/sitemap.xml (HTTP ${sm.status})` });
    return { teamPages: teams.length, bySport, aliases: aliases.length, findings, notes };
}

async function crawlBrowser(base, opts = {}) {
    let chromium;
    try { ({ chromium } = require('playwright')); } catch {
        try { ({ chromium } = require('playwright-core')); } catch {
            throw new Error('playwright is not installed here (npm i playwright, or playwright-core with PW_CHANNEL=chrome)');
        }
    }
    const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
    const browser = await chromium.launch({ proxy, channel: process.env.PW_CHANNEL || undefined });
    try {
        const page = await browser.newPage({ ignoreHTTPSErrors: !!proxy, viewport: { width: 1280, height: 900 } });
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForFunction('typeof navigateTo === "function" && typeof AppState === "object"');
        const args = {
            waitMs: opts.waitMs || 8000, perCell: opts.perCell || 2, sports: SPORTS, teamSports: TEAM_PAGE_SPORTS,
            scoresView: Object.fromEntries(SPORTS.map(s => [s, SCORES_VIEW(s)])), plantId: PLANT_ID,
        };
        const raw = await page.evaluate(`(${crawlInPage.toString()})(${JSON.stringify(args)})`);
        return summarize(raw.clicks, raw.cells);
    } finally {
        await browser.close();
    }
}

function print(report) {
    const b = report.browser, h = report.http;
    console.log(`Route crawl  ${report.base}  ${report.generatedAt}\n`);
    console.log('Clicks (surface / sport: clicked, mis-routed)');
    for (const t of b.table.filter(t => t.clicked)) console.log(`  ${t.misrouted ? 'FAIL' : 'ok  '} ${t.surface} / ${t.sport}: ${t.clicked} clicked, ${t.misrouted} mis-routed`);
    if (b.notExercised.length) {
        console.log('\nNot exercised (no finding either way)');
        for (const n of b.notExercised) console.log(`  -    ${n}`);
    }
    console.log(`\nTeam path URLs: ${h.teamPages} fetched (${Object.entries(h.bySport).map(([s, n]) => `${s} ${n}`).join(', ')}); NBA alias redirects: ${h.aliases}`);
    for (const n of h.notes) console.log(`  note ${n}`);
    const all = [...b.findings, ...h.findings];
    for (const f of all) console.log(`  FAIL ${f.kind} [${f.surface || 'path URL'} / ${f.sport}] ${f.detail}`);
    console.log(`\nPlanted mis-route: ${b.plant.caught ? 'caught' : 'NOT CAUGHT'} (landed on ${b.plant.landed})`);
    console.log(`\nClicks: ${b.clicks}   Mis-routes: ${all.length}   Control: ${b.plant.caught ? 'proven' : 'FAILED'}`);
}

async function main(argv) {
    const base = (argv[0] || '').replace(/\/$/, '');
    if (!base || base.startsWith('--')) { console.error('usage: node tools/audit/route-crawl.cjs <base-url> [--json <file>]'); return 2; }
    const jsonIdx = argv.indexOf('--json');
    const report = { base, generatedAt: new Date().toISOString(), browser: await crawlBrowser(base), http: await crawlHttp(base) };
    report.ok = report.browser.misroutes === 0 && report.http.findings.length === 0 && report.browser.plant.caught;
    print(report);
    if (jsonIdx >= 0 && argv[jsonIdx + 1]) fs.writeFileSync(argv[jsonIdx + 1], JSON.stringify(report, null, 2));
    return report.ok ? 0 : 2;
}

if (require.main === module) {
    main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e.message); process.exit(2); });
}

module.exports = { judge, summarize, teamUrls, nbaTeamUrls, judgeTeamPage, judgeAlias, crawlHttp, crawlInPage, NBA_ALIASES, PLANT_ID };

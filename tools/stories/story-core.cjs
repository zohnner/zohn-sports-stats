#!/usr/bin/env node
// ============================================================
// SportStrata Stories core (D-166) — zero deps, CommonJS.
// Shared by tools/stories/*.cjs, tests/stories.test.js and the
// Pages Functions via functions/_stories.js (the Functions bundler
// imports .cjs). Spec: docs/superpowers/specs/2026-09-29-nfl-stories-design.md
// D-171 added MLB: per-sport required fields, eyebrow and phrase allowlist.
// D-187 added NCAAF/NBA/NCAAB and the optional news hook (hook + hook_url).
// ============================================================
'use strict';

class StoryError extends Error {}

const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED = ['title', 'dek', 'date', 'season', 'teams', 'hero_stat'];
const BYLINE = 'SportStrata Data Desk';
const DISCLOSURE = "Written with AI assistance from SportStrata's own data; every number above is listed with its source in this story's data file.";
const SAFE_URL = /^(?:https:\/\/[^\s<>"'\\@]+|\/(?![\/\\])[^\s<>"'\\]*)$/;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function parseValue(raw) {
    const v = raw.trim();
    if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    if (/^-?\d+$/.test(v)) return Number(v);
    return v;
}

function parseStory(text) {
    const src = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
    if (!m) throw new StoryError('missing frontmatter (file must start with ---)');
    const meta = {};
    for (const line of m[1].split('\n')) {
        if (!line.trim()) continue;
        const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
        if (!kv) throw new StoryError(`bad frontmatter line: ${line}`);
        meta[kv[1]] = parseValue(kv[2]);
    }
    return { meta, body: m[2].trim() };
}

function validateMeta(meta, sport = 'nfl') {
    const cfg = STORY_SPORTS[sport];
    if (!cfg) return [`unknown sport ${sport}`];
    const problems = [];
    for (const k of [...REQUIRED, ...cfg.required]) if (meta[k] === undefined || meta[k] === '') problems.push(`missing ${k}`);
    if (meta.date !== undefined && !DATE_RE.test(String(meta.date))) problems.push('date must be YYYY-MM-DD');
    if (meta.season !== undefined && !Number.isInteger(meta.season)) problems.push('season must be an integer');
    if (meta.week !== undefined && !Number.isInteger(meta.week)) problems.push('week must be an integer');
    if (meta.round !== undefined && /\d/.test(String(meta.round))) problems.push('round must not contain digits');
    if (meta.teams !== undefined && !Array.isArray(meta.teams)) problems.push('teams must be a [list]');
    if (meta.players !== undefined && !Array.isArray(meta.players)) problems.push('players must be a [list]');
    if (typeof meta.title === 'string' && meta.title.length > 80) problems.push('title must be 80 characters or fewer (og card limit)');
    if ((meta.hook === undefined) !== (meta.hook_url === undefined)) problems.push('hook and hook_url go together');
    if (meta.hook_url !== undefined && !/^https:\/\/[^\s<>"'\\@]+$/.test(String(meta.hook_url))) problems.push('hook_url must be an https URL');
    if (meta.accent !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(meta.accent))) problems.push('accent must be #RRGGBB');
    return problems;
}

function renderBold(escaped) {
    return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderInline(text) {
    const links = [];
    const withSlots = String(text).replace(/\u0000/g, '').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
        const safe = SAFE_URL.test(url);
        links.push(safe ? `<a href="${esc(url)}">${renderBold(esc(label))}</a>` : renderBold(esc(label)));
        return `\u0000${links.length - 1}\u0000`;
    });
    return renderBold(esc(withSlots)).replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

// D-195: a chart is text in the story body, so checkStory reads its numbers and
// words like any other sentence. The site draws it; no image ever carries a number
// the checker can't see.
const CHART_HEAD = /^::chart (bars|compare) (\S.*)$/;
const CHART_VALUE = /^[+\-−–]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)%?$/;
const CHART_MIN_ROWS = 2;
const CHART_MAX_ROWS = 18;

function chartNumber(raw) {
    if (!CHART_VALUE.test(raw)) throw new StoryError(`chart value "${raw}" is not a number`);
    return Number(raw.replace(/[+,%]/g, '').replace(/[−–]/, '-'));
}

function parseChart(block) {
    const lines = block.split('\n').map(l => l.trim());
    const head = CHART_HEAD.exec(lines[0]);
    if (!head) throw new StoryError('chart needs a type (bars or compare) and a title');
    if (lines.length < 2 || lines[lines.length - 1] !== '::') throw new StoryError('chart needs a closing :: line');
    const type = head[1];
    const cells = lines.slice(1, -1).map(l => l.split('|').map(c => c.trim()));
    const legend = type === 'compare' ? cells.shift() : null;
    if (type === 'compare' && (!legend || legend.length !== 2 || legend.some(c => !c || CHART_VALUE.test(c)))) {
        throw new StoryError('compare chart needs a legend line first: A | B');
    }
    if (cells.length < CHART_MIN_ROWS || cells.length > CHART_MAX_ROWS) {
        throw new StoryError(`chart needs ${CHART_MIN_ROWS} to ${CHART_MAX_ROWS} rows`);
    }
    const valueCount = type === 'compare' ? 2 : 1;
    const rows = cells.map(([label, ...raws]) => {
        if (!label || raws.length !== valueCount) throw new StoryError(`chart row "${label}" needs ${valueCount} value(s)`);
        return { label: label.replace(/^\*/, ''), hi: label.startsWith('*'), raws, values: raws.map(chartNumber) };
    });
    if (rows.filter(r => r.hi).length > 1) throw new StoryError('chart can highlight only one row');
    return { type, title: head[2], legend, rows };
}

const chartPct = n => `${Number((n * 100).toFixed(1))}%`;

function chartRow(r, track, value, classes = '') {
    return `<div class="ss-chart__row${r.hi ? ' is-hi' : ''}${classes}"><span class="ss-chart__label">${esc(r.label)}</span>` +
        `<span class="ss-chart__track" aria-hidden="true">${track}</span><span class="ss-chart__val">${esc(value)}</span></div>`;
}

function renderChart(chart) {
    const all = chart.rows.flatMap(r => r.values);
    let rows;
    let legend = '';
    if (chart.type === 'bars') {
        const neg = -Math.min(0, ...all);
        const span = (neg + Math.max(0, ...all)) || 1;
        rows = chart.rows.map(r => {
            const v = r.values[0];
            const left = v < 0 ? (neg + v) / span : neg / span;
            return chartRow(r, `<i style="left:${chartPct(left)};width:${chartPct(Math.abs(v) / span)}"></i>`, r.raws[0], v < 0 ? ' is-neg' : '');
        });
    } else {
        const lo = Math.min(0, ...all);
        const span = (Math.max(0, ...all) - lo) || 1;
        const at = v => (v - lo) / span;
        legend = `<p class="ss-chart__legend"><span class="ss-chart__key--a">${esc(chart.legend[0])}</span><span class="ss-chart__key--b">${esc(chart.legend[1])}</span></p>`;
        rows = chart.rows.map(r => {
            const [a, b] = r.values.map(at);
            const track = `<b style="left:${chartPct(Math.min(a, b))};width:${chartPct(Math.abs(a - b))}"></b>` +
                `<i class="ss-chart__dot--a" style="left:${chartPct(a)}"></i><i class="ss-chart__dot--b" style="left:${chartPct(b)}"></i>`;
            return chartRow(r, track, `${r.raws[0]} vs ${r.raws[1]}`);
        });
    }
    return `<figure class="ss-chart ss-chart--${chart.type}"><figcaption>${esc(chart.title)}</figcaption>${legend}${rows.join('')}</figure>`;
}

function chartBlocks(body) {
    return String(body == null ? '' : body).replace(/\r\n/g, '\n').split(/\n{2,}/)
        .map(block => block.trim()).filter(block => block.startsWith('::chart'));
}

function chartProblems(body) {
    return chartBlocks(body).flatMap(block => {
        try { parseChart(block); return []; }
        catch (e) { return [{ where: 'chart', token: block.split('\n')[0], message: e.message }]; }
    });
}

// The share card draws the first bars chart without labels, so it only needs
// the values, the highlight and the chart title.
function firstBarChart(body) {
    for (const block of chartBlocks(body)) {
        let chart;
        try { chart = parseChart(block); } catch (_) { continue; }
        if (chart.type === 'bars') return { title: chart.title, values: chart.rows.map(r => r.values[0]), hi: chart.rows.findIndex(r => r.hi) };
    }
    return null;
}

// Share-card bar geometry in pixels, around a zero line shared by every column.
function barColumns(values, height, minBar = 3) {
    const pos = Math.max(0, ...values);
    const span = pos - Math.min(0, ...values);
    const zero = span ? pos / span * height : height;
    return values.map(v => {
        const h = Math.max(minBar, span ? Math.abs(v) / span * height : 0);
        return { top: Math.round(v < 0 ? zero : zero - h), height: Math.round(h) };
    });
}

function renderBody(md) {
    return String(md == null ? '' : md).replace(/\r\n/g, '\n').split(/\n{2,}/)
        .map(block => block.trim()).filter(Boolean)
        .map(block => {
            // A malformed chart is dropped: CI's chartProblems stops it before publish,
            // so this only guards a page against a chart that somehow got through.
            if (block.startsWith('::chart')) {
                try { return renderChart(parseChart(block)); } catch (_) { return ''; }
            }
            if (block.startsWith('## ')) return `<h2>${renderInline(block.slice(3).trim())}</h2>`;
            const lines = block.split('\n');
            if (lines.every(l => /^- /.test(l))) {
                return `<ul>${lines.map(l => `<li>${renderInline(l.slice(2).trim())}</li>`).join('')}</ul>`;
            }
            return `<p>${renderInline(lines.map(l => l.trim()).join(' '))}</p>`;
        }).join('');
}

function storyUrl(slug, sport = 'nfl') {
    return `/${sport}/stories/${slug}`;
}

function storyEyebrow(meta, sport = 'nfl') {
    return STORY_SPORTS[sport].eyebrow(meta);
}

function indexEntry(slug, meta, sport = 'nfl') {
    return {
        slug, title: meta.title, dek: meta.dek, date: String(meta.date),
        season: meta.season,
        ...(meta.hook !== undefined && { hook: meta.hook, hook_url: meta.hook_url }),
        ...(meta.week !== undefined && { week: meta.week }),
        ...(meta.round !== undefined && { round: meta.round }),
        teams: meta.teams || [], players: meta.players || [],
        hero_stat: meta.hero_stat, url: storyUrl(slug, sport), sport,
    };
}

function sportFromPath(p) {
    const parts = String(p).split(/[\\/]/);
    for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i + 1] === 'stories' && STORY_SPORTS[parts[i]]) return parts[i];
    }
    return null;
}

const COMMON_PHRASES = [
    /\b\d{4}-\d{2}-\d{2}\b/g,
];
const FOOTBALL_PHRASES = [
    /\b[1-4](?:st|nd|rd|th)[- ](?:down|quarter)\b/gi,
    /\b[1-4](?:st|nd|rd|th)-and-\d+\b/gi,
    /\b(?:19|20)\d{2}(?:-\d{2})? (?:season|regular season|postseason|draft)\b/gi,
    /\b(?:49ers|76ers)\b/gi,
    /\bQ[1-4]\b/g,
    /\b(?:two-point|two-minute|four-down)\b/gi,
    /\b(?:first|second)[- ]half\b/gi,
    /\b(?:first|second|third|fourth)[- ](?:quarter|down)\b/gi,
    /\b(?:first|second|third|fourth)-and-\d+\b/gi,
];
// Baseball structure that carries numbers but is never a stat: innings, series
// games, ball-strike counts, outs in the inning, base names, round + year.
const INNING_WORD = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth';
const BASEBALL_PHRASES = [
    /\b(?:[1-9]|1\d)(?:st|nd|rd|th)[- ]inning\b/gi,
    new RegExp(`\\b(?:${INNING_WORD})[- ]inning\\b`, 'gi'),
    /\bGame [1-7]\b/gi,
    /\b[0-3]-[0-2] (?:count|pitch|offering|fastball|slider|curveball|changeup|sinker|cutter|splitter)\b/gi,
    /\b(?:[0-2]|two)-out\b/gi,
    /\b(?:first|second|third) base(?:man|men)?\b/gi,
    /\b(?:19|20)\d{2} (?:season|regular season|postseason|World Series|ALCS|NLCS|ALDS|NLDS|AL Wild Card Series|NL Wild Card Series|Wild Card Series|draft)\b/gi,
];

// Basketball structure: quarters, halves, playoff games, shot types, season spans.
const BASKETBALL_PHRASES = [
    /\b[1-4](?:st|nd|rd|th)[- ]quarter\b/gi,
    /\b(?:first|second|third|fourth)[- ](?:quarter|half)\b/gi,
    /\bQ[1-4]\b/g,
    /\bGame [1-7]\b/gi,
    /\b3-point(?:er|ers)?\b/gi,
    /\b(?:19|20)\d{2}(?:-\d{2})? (?:season|regular season|postseason|draft|tournament|NCAA Tournament)\b/gi,
    /\b76ers\b/gi,
];
// NBA/NCAAB seasons are labeled by end year (js/nba.js NBA_SEASON): 2027 = 2026-27.
const seasonSpan = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;

const STORY_SPORTS = {
    nfl: { label: 'NFL', required: ['week'], weeks: true, phrases: FOOTBALL_PHRASES, eyebrow: m => `NFL Week ${m.week}` },
    mlb: { label: 'MLB', required: [], weeks: false, phrases: BASEBALL_PHRASES, eyebrow: m => `MLB · ${m.season} ${m.round || 'Season'}` },
    ncaaf: { label: 'NCAAF', required: ['week'], weeks: true, phrases: FOOTBALL_PHRASES, eyebrow: m => `NCAAF Week ${m.week}` },
    nba: { label: 'NBA', required: [], weeks: false, phrases: BASKETBALL_PHRASES, eyebrow: m => `NBA · ${seasonSpan(m.season)} ${m.round || 'Season'}` },
    ncaab: { label: 'NCAAB', required: [], weeks: false, phrases: BASKETBALL_PHRASES, eyebrow: m => `NCAAB · ${seasonSpan(m.season)} ${m.round || 'Season'}` },
};
const SPELLED_RE = /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|twice|thrice|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)\b/gi;
const WEEK_RE = /\bweeks? (\d+)(?:\s?[-–]\s?(\d+))?\b/gi;
const NUM_RE = /(?<![\w.])([+\-−–])?(#)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(%|st|nd|rd|th)?/g;

function scrubText(text, maxWeek, phrases) {
    let t = String(text).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1').replace(/https?:\/\/\S+/g, ' ');
    t = t.replace(WEEK_RE, (whole, a, b) =>
        [a, b].filter(Boolean).every(n => Number(n) >= 1 && Number(n) <= maxWeek) ? ' ' : whole);
    for (const re of [...COMMON_PHRASES, ...phrases]) t = t.replace(re, ' ');
    return t;
}

// PLAYBOOK "Not news": no injuries, transactions, reporting or quotes. A word
// list cannot judge a story, but it stops the obvious cases (the Simmons IR
// story passed the number checker). No override: a false hit gets rephrased.
const OFF_LIMITS = [
    /\binjur(?:y|ies|ed)\b/gi, /\binjured reserve\b/gi, /\bIR\b/g, /\bherniat\w*/gi, /\bMRI\b/g,
    /\bsurger(?:y|ies)\b/gi, /\bconcussion\w*/gi, /\btorn\b/gi, /\bsprain\w*/gi,
    /\btrad(?:ed|es)\b/gi, /\btrade (?:for|with|to)\b/gi, /\bsign(?:ed|ing|s)\b/gi,
    /\bcontract extension\b/gi, /\bfree agen\w*/gi,
    /\brumou?r\w*/gi, /\breportedly\b/gi, /\bsources? (?:said|say|told)\b/gi, /\btold reporters\b/gi,
    /\bpress conference\b/gi,
    /“[^”\n]*”|"[^"\n]{3,}"/g,
    // D-187: a story may take a news event as its hook (frontmatter `hook`, exempt
    // from this list), but the story itself never forecasts the event.
    /\bexpected to\b/gi, /\btimeline\b/gi, /\bday-to-day\b/gi, /\bweek-to-week\b/gi,
    /\bout (?:for|indefinitely)\b/gi, /\bsidelined\b/gi,
];

function topicProblems(where, text) {
    const t = String(text).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1').replace(/https?:\/\/\S+/g, ' ');
    const seen = new Set();
    for (const re of OFF_LIMITS) for (const m of t.match(re) || []) seen.add(m);
    return [...seen].map(token => ({ where, token, message: `off-limits topic "${token}" — Stories are data analysis only (PLAYBOOK: not news)` }));
}

function isValidFact(f) {
    return !!f && typeof f.key === 'string' && typeof f.value === 'number' && Number.isFinite(f.value)
        && typeof f.source === 'string' && f.source.trim() !== '';
}

function factProblems(factsDoc) {
    if (!factsDoc || !Array.isArray(factsDoc.facts)) throw new StoryError('facts file must be {"facts":[...]}');
    const problems = [];
    factsDoc.facts.forEach((f, i) => {
        if (!isValidFact(f)) problems.push({ where: 'facts', token: String((f && f.key) || `#${i}`), message: `fact ${i} needs key, numeric value and source` });
    });
    return problems;
}

function tokenOf(m) {
    const numStr = m[3].replace(/,/g, '');
    const sign = m[1] === '-' || m[1] === '−' || m[1] === '–' ? -1 : 1;
    return { raw: m[0], value: sign * Number(numStr), decimals: (numStr.split('.')[1] || '').length, percent: m[4] === '%' };
}

function matchesFact(tok, values) {
    const tol = 0.5 * Math.pow(10, -tok.decimals) + 1e-9;
    return values.some(f => Math.abs(f - tok.value) <= tol || (tok.percent && Math.abs(f * 100 - tok.value) <= tol));
}

function checkStory(story, factsDoc, socialText, sport = 'nfl') {
    const cfg = STORY_SPORTS[sport];
    if (!cfg) throw new StoryError(`unknown sport ${sport}`);
    const problems = [...factProblems(factsDoc), ...chartProblems(story.body)];
    const values = factsDoc.facts.filter(isValidFact).map(f => f.value);
    const maxWeek = cfg.weeks && Number.isInteger(story.meta.week) ? story.meta.week + 1 : 0;
    const fields = [['title', story.meta.title], ['dek', story.meta.dek], ['hero_stat', story.meta.hero_stat], ['body', story.body], ['social', socialText], ['hook', story.meta.hook]];
    for (const [where, text] of fields) {
        if (where !== 'hook') problems.push(...topicProblems(where, text == null ? '' : text));
        const clean = scrubText(text == null ? '' : text, maxWeek, cfg.phrases);
        for (const w of clean.match(SPELLED_RE) || []) {
            problems.push({ where, token: w, message: `spelled-out number "${w}" — use numerals` });
        }
        for (const m of clean.matchAll(NUM_RE)) {
            const tok = tokenOf(m);
            if (!matchesFact(tok, values)) problems.push({ where, token: tok.raw, message: `"${tok.raw}" is not in the facts file` });
        }
    }
    return problems;
}

module.exports = {
    StoryError, SLUG_RE, BYLINE, DISCLOSURE, STORY_SPORTS,
    parseStory, validateMeta, renderBody, storyUrl, storyEyebrow, indexEntry, sportFromPath, checkStory,
    firstBarChart, barColumns,
};

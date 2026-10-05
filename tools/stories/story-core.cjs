#!/usr/bin/env node
// ============================================================
// SportStrata Stories core (D-166) — zero deps, CommonJS.
// Shared by tools/stories/*.cjs, tests/stories.test.js and the
// Pages Functions via functions/_stories.js (the Functions bundler
// imports .cjs). Spec: docs/superpowers/specs/2026-09-29-nfl-stories-design.md
// D-171 added MLB: per-sport required fields, eyebrow and phrase allowlist.
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

function renderBody(md) {
    return String(md == null ? '' : md).replace(/\r\n/g, '\n').split(/\n{2,}/)
        .map(block => block.trim()).filter(Boolean)
        .map(block => {
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

const STORY_SPORTS = {
    nfl: { label: 'NFL', required: ['week'], weeks: true, phrases: FOOTBALL_PHRASES, eyebrow: m => `NFL Week ${m.week}` },
    mlb: { label: 'MLB', required: [], weeks: false, phrases: BASEBALL_PHRASES, eyebrow: m => `MLB · ${m.season} ${m.round || 'Season'}` },
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
    const problems = factProblems(factsDoc);
    const values = factsDoc.facts.filter(isValidFact).map(f => f.value);
    const maxWeek = cfg.weeks && Number.isInteger(story.meta.week) ? story.meta.week + 1 : 0;
    const fields = [['title', story.meta.title], ['dek', story.meta.dek], ['hero_stat', story.meta.hero_stat], ['body', story.body], ['social', socialText]];
    for (const [where, text] of fields) {
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
};

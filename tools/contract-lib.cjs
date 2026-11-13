#!/usr/bin/env node
// ============================================================
// SportStrata — upstream contract library (zero deps).
// Path engine + invariants + probe readers for tools/contract-check.cjs.
// Spec: docs/superpowers/specs/2026-09-28-contract-monitor-design.md
// ============================================================
'use strict';

class ContractError extends Error {}

const SEG = /^([A-Za-z_$][\w$]*)(?:\[(\d*)\])?$/;

function parsePath(path) {
    if (typeof path !== 'string' || path === '') throw new ContractError(`bad path syntax: ${String(path)}`);
    const tokens = [];
    for (const seg of path.split('.')) {
        const m = seg.match(SEG);
        if (!m) throw new ContractError(`bad path syntax: ${path}`);
        tokens.push({ key: m[1] });
        if (m[2] !== undefined) tokens.push(m[2] === '' ? { each: true } : { index: Number(m[2]) });
    }
    return tokens;
}

function collect(root, path) {
    const tokens = parsePath(path);
    const out = [];
    const walk = (node, i, loc) => {
        if (i === tokens.length || node === undefined || node === null) {
            out.push({ loc, value: i === tokens.length ? node : undefined });
            return;
        }
        const t = tokens[i];
        if (t.each) {
            if (!Array.isArray(node)) { out.push({ loc: `${loc} (not an array)`, value: undefined }); return; }
            node.forEach((el, n) => walk(el, i + 1, `${loc}[${n}]`));
        } else if ('index' in t) {
            walk(Array.isArray(node) ? node[t.index] : undefined, i + 1, `${loc}[${t.index}]`);
        } else {
            walk(node[t.key], i + 1, loc ? `${loc}.${t.key}` : t.key);
        }
    };
    walk(root, 0, '');
    return out;
}

function checkPath(root, path) {
    return collect(root, path)
        .filter(r => r.value === undefined || r.value === null)
        .map(r => r.loc || '(root)');
}

function getAt(root, path) {
    let node = root;
    for (const t of parsePath(path)) {
        if (t.each) throw new ContractError(`[] not allowed here: ${path}`);
        if (node === undefined || node === null) return undefined;
        node = 'index' in t ? node[t.index] : node[t.key];
    }
    return node;
}

function deepCollect(root, key, acc = []) {
    if (Array.isArray(root)) root.forEach(x => deepCollect(x, key, acc));
    else if (root && typeof root === 'object') {
        for (const [k, v] of Object.entries(root)) {
            if (k === key && Array.isArray(v)) acc.push(...v);
            else deepCollect(v, key, acc);
        }
    }
    return acc;
}

function assertNoEach(path) {
    if (parsePath(path).some(t => t.each)) throw new ContractError(`[] not allowed in count path: ${path}`);
}

function minCount(path, n, opts = {}) {
    assertNoEach(path);
    return {
        name: `minCount(${path}, ${n})`,
        severity: opts.severity || 'fail',
        kind: 'count',
        check(data, ctx) {
            const arr = getAt(data, path);
            if (!Array.isArray(arr)) return `${path} is not an array`;
            const floor = opts.fullSlateOnly && !ctx.fullSlate ? 1 : n;
            return arr.length >= floor ? null : `${path} has ${arr.length}, expected >= ${floor}`;
        },
    };
}

function exactCount(path, n, opts = {}) {
    assertNoEach(path);
    return {
        name: `exactCount(${path}, ${n})`,
        severity: opts.severity || 'fail',
        kind: 'count',
        check(data) {
            const arr = getAt(data, path);
            if (!Array.isArray(arr)) return `${path} is not an array`;
            return arr.length === n ? null : `${path} has ${arr.length}, expected exactly ${n}`;
        },
    };
}

function deepCount(key, n, opts = {}) {
    if (opts.each) parsePath(opts.each);
    return {
        name: `deepCount(${key}, ${opts.exact ? '=' : '>='}${n})`,
        severity: opts.severity || 'fail',
        kind: 'count',
        check(data) {
            const items = deepCollect(data, key);
            if (opts.exact ? items.length !== n : items.length < n) {
                return `found ${items.length} "${key}", expected ${opts.exact ? 'exactly' : '>='} ${n}`;
            }
            if (opts.each) {
                const bad = items.filter(it => checkPath(it, opts.each).length).length;
                if (bad) return `${bad} of ${items.length} "${key}" missing ${opts.each}`;
            }
            return null;
        },
    };
}

function numeric(path, opts = {}) {
    parsePath(path);
    return {
        name: `numeric(${path})`,
        severity: opts.severity || 'fail',
        check(data) {
            const bad = collect(data, path).filter(({ value }) =>
                value === undefined || value === null || value === '' || !Number.isFinite(Number(value)));
            return bad.length ? `${bad.length} non-numeric value(s), e.g. ${bad[0].loc}` : null;
        },
    };
}

function eachNonEmpty(path, opts = {}) {
    parsePath(path);
    return {
        name: `eachNonEmpty(${path})`,
        severity: opts.severity || 'fail',
        kind: 'count',
        check(data) {
            const bad = collect(data, path).filter(({ value }) => !Array.isArray(value) || value.length === 0);
            return bad.length ? `${bad.length} empty or missing, e.g. ${bad[0].loc}` : null;
        },
    };
}

function predicate(name, fn, opts = {}) {
    return { name, severity: opts.severity || 'fail', check: (data, ctx) => fn(data, ctx) };
}

// Minimal CSV reader (quoted fields, doubled quotes) for upstream files such
// as nflverse's games.csv. Returns { columns, rows }, each row an object.
function parseCsv(text) {
    const lines = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); cell = '';
            if (row.length > 1 || row[0] !== '') lines.push(row);
            row = [];
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); lines.push(row); }
    const columns = lines.shift() || [];
    return { columns, rows: lines.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? '']))) };
}

function csvColumns(names, opts = {}) {
    return {
        name: `csvColumns(${names.join(', ')})`,
        severity: opts.severity || 'fail',
        check(data) {
            if (!data || !Array.isArray(data.columns)) return 'not a CSV file';
            const missing = names.filter(n => !data.columns.includes(n));
            return missing.length ? `missing column(s): ${missing.join(', ')}` : null;
        },
    };
}

// Every list found at `path` (an array of {name} objects, or of strings)
// carries all of `names`.
function hasNames(path, names, opts = {}) {
    parsePath(path);
    return {
        name: `hasNames(${path}: ${names.join(', ')})`,
        severity: opts.severity || 'fail',
        check(data) {
            const lists = collect(data, path);
            if (!lists.length) return `${path} not found`;
            for (const { loc, value } of lists) {
                if (!Array.isArray(value)) return `${loc} is not an array`;
                const have = new Set(value.map(x => (x && typeof x === 'object' ? x.name : x)));
                const missing = names.filter(n => !have.has(n));
                if (missing.length) return `${loc} is missing ${missing.join(', ')}`;
            }
            return null;
        },
    };
}

// ESPN team schedule: every completed event has a numeric score for both teams.
function completedScores(opts = {}) {
    const num = c => {
        const v = c?.score?.value ?? c?.score;
        return v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
    };
    return {
        name: 'completed events carry numeric scores',
        severity: opts.severity || 'fail',
        check(data) {
            const done = (data?.events || []).filter(e => e?.competitions?.[0]?.status?.type?.completed);
            const bad = done.filter(e => !(e.competitions[0].competitors || []).every(num));
            return bad.length ? `${bad.length} completed event(s) without numeric scores, e.g. ${bad[0].id}` : null;
        },
    };
}

function readEspnScoreboard(json) {
    const events = Array.isArray(json?.events) ? json.events : [];
    const season = events[0]?.season;
    // Regular-season week count varies by year (2025: 16, 2026: 15) — read it from
    // the scoreboard's own calendar (value '2' = "Regular Season") rather than
    // hardcoding it, so week-range invariants stay correct across season boundaries.
    const calendar = json?.leagues?.[0]?.calendar;
    const regularSeasonEntry = Array.isArray(calendar) ? calendar.find(c => c?.value === '2') : undefined;
    const lastRegularWeek = Array.isArray(regularSeasonEntry?.entries) ? regularSeasonEntry.entries.length : undefined;
    return {
        finalIds: events.filter(e => e?.status?.type?.state === 'post').map(e => e.id),
        season: season?.year,
        regularSeason: season?.type === 2,
        week: json?.week?.number,
        lastRegularWeek,
    };
}

function readMlbSchedule(json) {
    const games = json?.dates?.[0]?.games || [];
    return {
        finalIds: games.filter(g => g?.status?.abstractGameState === 'Final').map(g => g.gamePk),
        season: games[0] ? Number(games[0].season) : undefined,
        regularSeason: games.length > 0 && games.every(g => g.gameType === 'R'),
        week: undefined,
        lastRegularWeek: undefined,
    };
}

module.exports = {
    ContractError, parsePath, collect, checkPath, getAt, deepCollect,
    minCount, exactCount, deepCount, numeric, eachNonEmpty, predicate,
    parseCsv, csvColumns, hasNames, completedScores,
    readEspnScoreboard, readMlbSchedule,
};

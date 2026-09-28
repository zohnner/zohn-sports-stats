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

module.exports = { ContractError, parsePath, collect, checkPath, getAt, deepCollect };

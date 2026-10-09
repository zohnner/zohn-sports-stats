'use strict';
// NFL home fields — profile schema + facts sourcing rules (spec 2026-10-05).

const NFL_TEAMS = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
    'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
    'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WSH'];
const SURFACES = ['natural', 'artificial', 'hybrid'];
const MOWS = ['stripes-5', 'stripes-10', 'checker', 'none'];
const MIDFIELDS = ['primary-logo', 'alt-logo', 'wordmark', 'none'];
// Lettering styles; js/fieldViewer.js EZ_FONTS maps each to a free lookalike font.
const EZ_FONT_STYLES = ['display', 'slab', 'block', 'squared', 'condensed', 'serif', 'italic'];
const EZ_OPTIONAL = ['font', 'outline', 'outline2'];
const CONFIDENCE = ['high', 'medium', 'low'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EZ_TEXT = /^[A-Z0-9 .'&-]{1,16}$/;
const PROFILE_FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z]{2,3})\.json$/;
const PAINT_FACTS = ['mow',
    'endzones.left.fill', 'endzones.left.text', 'endzones.left.textColor',
    'endzones.right.fill', 'endzones.right.text', 'endzones.right.textColor',
    'midfield', 'border'];
const REQUIRED_FACTS = ['name', 'surface', ...PAINT_FACTS];

function validateProfile(p) {
    const out = [];
    if (!p || typeof p !== 'object') return ['profile is not an object'];
    if (typeof p.venueId !== 'string' || !/^\d+$/.test(p.venueId)) out.push('venueId must be a numeric string (ESPN gameInfo.venue.id)');
    if (!NFL_TEAMS.includes(p.homeTeam)) out.push(`homeTeam "${p.homeTeam}" is not an ESPN NFL abbreviation`);
    if (typeof p.name !== 'string' || !p.name.trim()) out.push('name is required');
    if (!SURFACES.includes(p.surface)) out.push(`surface must be one of ${SURFACES.join('|')}`);
    if (!MOWS.includes(p.mow)) out.push(`mow must be one of ${MOWS.join('|')}`);
    for (const side of ['left', 'right']) {
        const ez = p.endzones && p.endzones[side];
        if (!ez) { out.push(`endzones.${side} is required`); continue; }
        if (!HEX.test(ez.fill || '')) out.push(`endzones.${side}.fill must be #RRGGBB`);
        if (!HEX.test(ez.textColor || '')) out.push(`endzones.${side}.textColor must be #RRGGBB`);
        if (!EZ_TEXT.test(ez.text || '')) out.push(`endzones.${side}.text must be 1-16 uppercase letters/digits/space/.'&-`);
        if (ez.font != null && !EZ_FONT_STYLES.includes(ez.font)) out.push(`endzones.${side}.font must be one of ${EZ_FONT_STYLES.join('|')}`);
        for (const k of ['outline', 'outline2']) if (ez[k] != null && !HEX.test(ez[k])) out.push(`endzones.${side}.${k} must be #RRGGBB`);
        if (ez.outline2 != null && ez.outline == null) out.push(`endzones.${side}.outline2 needs outline`);
    }
    if (!MIDFIELDS.includes(p.midfield)) out.push(`midfield must be one of ${MIDFIELDS.join('|')}`);
    if ((p.midfield === 'alt-logo' || p.midfield === 'wordmark') && !/^https:\/\/a\.espncdn\.com\//.test(p.midfieldImage || '')) {
        out.push('midfieldImage must be an https://a.espncdn.com/ URL when midfield is alt-logo or wordmark');
    }
    if (!HEX.test(p.border || '')) out.push('border must be #RRGGBB');
    if (!Array.isArray(p.signature)) out.push('signature must be an array');
    return out;
}

function nflSeasonStart(dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    return `${m >= 3 ? y : y - 1}-08-01`;
}

// Optional end zone attributes need the same photo-backed sourcing as
// required paint once a profile sets them.
function optionalPaintFacts(profile) {
    const keys = [];
    for (const side of ['left', 'right']) {
        const ez = profile && profile.endzones && profile.endzones[side];
        for (const k of EZ_OPTIONAL) if (ez && ez[k] != null) keys.push(`endzones.${side}.${k}`);
    }
    return keys;
}

function validateFacts(f, profile) {
    const out = [];
    const facts = (f && f.facts) || {};
    const extra = optionalPaintFacts(profile);
    for (const key of [...REQUIRED_FACTS, ...extra]) {
        const x = facts[key];
        if (!x) { out.push(`${key}: no source`); continue; }
        if (!/^https:\/\//.test(x.source || '')) out.push(`${key}: source must be an https URL`);
        if (!DATE.test(x.checked || '')) out.push(`${key}: checked must be YYYY-MM-DD`);
        if (!CONFIDENCE.includes(x.confidence)) out.push(`${key}: confidence must be ${CONFIDENCE.join('|')}`);
        if (PAINT_FACTS.includes(key) || extra.includes(key)) {
            if (!/^https:\/\//.test(x.photo || '')) out.push(`${key}: paint facts need an https photo`);
            if (!DATE.test(x.photoDate || '')) out.push(`${key}: photoDate must be YYYY-MM-DD`);
            else if (DATE.test(x.checked || '') && x.photoDate < nflSeasonStart(x.checked)) {
                out.push(`${key}: photo predates the ${nflSeasonStart(x.checked).slice(0, 4)} season`);
            }
        }
    }
    if (f && f.approved != null && !DATE.test((f.approved && f.approved.date) || '')) out.push('approved.date must be YYYY-MM-DD');
    return out;
}

function lowConfidenceCount(f) {
    return Object.values((f && f.facts) || {}).filter(x => x && x.confidence === 'low').length;
}

const fs = require('node:fs');
const path = require('node:path');

function readFieldIndex() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'content', 'nfl', 'fields', 'index.json'), 'utf8')); }
    catch (_) { return { version: 1, teams: {}, neutral: {} }; }
}

const homeAbbr = (comp) => ((comp && comp.competitors) || []).find(t => t.homeAway === 'home')?.team?.abbreviation;

function missingFieldProfiles(scoreboard, index) {
    const missing = [];
    for (const e of (scoreboard && scoreboard.events) || []) {
        const c = e.competitions && e.competitions[0];
        if (!c || c.neutralSite) continue;
        const key = `${c.venue && c.venue.id}--${homeAbbr(c)}`;
        if (!(index.teams || {})[key]) missing.push(key);
    }
    return missing;
}

// natural and hybrid are grass to ESPN; artificial is not.
function surfaceMismatch(summary, index) {
    const comp = summary && summary.header && summary.header.competitions && summary.header.competitions[0];
    const venue = summary && summary.gameInfo && summary.gameInfo.venue;
    if (!comp || comp.neutralSite || !venue || typeof venue.grass !== 'boolean') return null;
    const p = (index.teams || {})[`${venue.id}--${homeAbbr(comp)}`];
    if (!p) return null;
    return (p.surface !== 'artificial') === venue.grass ? null : `${p.name}: profile surface "${p.surface}" but ESPN grass=${venue.grass}`;
}

module.exports = { EZ_FONT_STYLES, NFL_TEAMS, SURFACES, MOWS, MIDFIELDS, REQUIRED_FACTS, PAINT_FACTS, PROFILE_FILE, validateProfile, validateFacts, lowConfidenceCount, nflSeasonStart, readFieldIndex, missingFieldProfiles, surfaceMismatch };

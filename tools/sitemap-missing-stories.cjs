#!/usr/bin/env node
// Lists published story URLs that sitemap.xml doesn't carry yet, one per line.
// sitemap-refresh.yml runs it on story-triggered events and skips the full
// (upstream-heavy) regeneration when it prints nothing.
'use strict';
const fs = require('fs');
const path = require('path');
const { STORY_SPORTS } = require('./stories/story-core.cjs');

const ROOT = path.join(__dirname, '..');

function missingStoryUrls(root = ROOT) {
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    const missing = [];
    for (const sport of Object.keys(STORY_SPORTS)) {
        let stories = [];
        try {
            stories = JSON.parse(fs.readFileSync(path.join(root, 'content', sport, 'stories', 'index.json'), 'utf8')).stories || [];
        } catch (_) { continue; }
        for (const s of stories) {
            if (!sitemap.includes(`<loc>https://sportstrata.cc${s.url}</loc>`)) missing.push(s.url);
        }
    }
    return missing;
}

if (require.main === module) {
    for (const u of missingStoryUrls()) console.log(u);
}

module.exports = { missingStoryUrls };

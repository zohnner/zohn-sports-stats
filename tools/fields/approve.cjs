#!/usr/bin/env node
// Owner approval stamp: node tools/fields/approve.cjs <slug>   (e.g. lambeau-field--gb, or neutral/401872965)
// Run only after comparing the rendered field to its photo in the review gallery.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('./field-core.cjs');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'content', 'nfl', 'fields');

function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function approve(dir, slug, today = localToday()) {
    const file = path.join(dir, `${slug}.facts.json`);
    if (!fs.existsSync(file)) { console.error(`✗ no ${file}`); return 2; }
    const facts = JSON.parse(fs.readFileSync(file, 'utf8'));
    const problems = core.validateFacts({ ...facts, approved: null });
    if (problems.length) { problems.forEach(p => console.error(`✗ ${slug}: ${p}`)); return 2; }
    facts.approved = { date: today };
    fs.writeFileSync(file, JSON.stringify(facts, null, 2) + '\n');
    console.log(`approved ${slug} (${today})`);
    return 0;
}

module.exports = { approve };
if (require.main === module) {
    const slug = process.argv[2];
    if (!slug) { console.error('usage: node tools/fields/approve.cjs <slug>'); process.exit(2); }
    process.exit(approve(DEFAULT_DIR, slug));
}

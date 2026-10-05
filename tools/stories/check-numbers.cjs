#!/usr/bin/env node
// ============================================================
// SportStrata Stories — number checker CLI (D-166).
//   node tools/stories/check-numbers.cjs content/<sport>/stories/<slug>.md
// The sport (nfl | mlb) comes from the path; outside content/ it defaults to nfl.
// Reads <slug>.facts.json and <slug>.social.md beside it.
// Exit 0: every number is in the facts file. Exit 2: problems listed.
// ============================================================
'use strict';
const fs = require('node:fs');
const core = require('./story-core.cjs');

function main(argv) {
    const file = argv[0];
    if (!file || !file.endsWith('.md') || file.endsWith('.social.md')) {
        console.error('usage: node tools/stories/check-numbers.cjs content/<sport>/stories/<slug>.md');
        return 2;
    }
    const base = file.slice(0, -3);
    const sport = core.sportFromPath(file) || 'nfl';
    try {
        const story = core.parseStory(fs.readFileSync(file, 'utf8'));
        const facts = JSON.parse(fs.readFileSync(`${base}.facts.json`, 'utf8'));
        const social = fs.existsSync(`${base}.social.md`) ? fs.readFileSync(`${base}.social.md`, 'utf8') : '';
        const problems = [
            ...core.validateMeta(story.meta, sport).map(message => ({ where: 'frontmatter', message })),
            ...core.checkStory(story, facts, social, sport),
        ];
        for (const p of problems) console.error(`✗ [${p.where}] ${p.message}`);
        if (problems.length) return 2;
        console.log('✓ every number is in the facts file');
        return 0;
    } catch (e) {
        console.error(`✗ ${e.message}`);
        return 2;
    }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };

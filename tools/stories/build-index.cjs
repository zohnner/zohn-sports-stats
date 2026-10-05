#!/usr/bin/env node
// ============================================================
// SportStrata Stories — index builder + CI gate (D-166).
//   node tools/stories/build-index.cjs            write content/<sport>/stories/index.json
//                                                 for every sport in STORY_SPORTS
//   node tools/stories/build-index.cjs --check    CI: fail if any story is invalid,
//                                                 has an unsourced number, or a
//                                                 committed index.json is stale
// Exit 0 / 2. Optional --dir <path> [--sport mlb] for tests (sport defaults to
// the one named in the path, else nfl).
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('./story-core.cjs');

const contentDir = sport => path.join(__dirname, '..', '..', 'content', sport, 'stories');
const STORY_FILE = /^(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

function loadStories(dir, sport = 'nfl') {
    const problems = [];
    const stories = [];
    const allFiles = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    for (const f of allFiles) {
        if (!f.endsWith('.md') || f === 'README.md' || f.endsWith('.social.md') || STORY_FILE.test(f)) continue;
        problems.push(`${f}: not a valid story filename (expected YYYY-MM-DD-lowercase-slug.md)`);
    }
    const files = allFiles.filter(f => STORY_FILE.test(f)).sort();
    for (const file of files) {
        const slug = STORY_FILE.exec(file)[1];
        const read = ext => {
            const p = path.join(dir, slug + ext);
            return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
        };
        try {
            const story = core.parseStory(read('.md'));
            const metaProblems = core.validateMeta(story.meta, sport);
            metaProblems.forEach(p => problems.push(`${slug}: ${p}`));
            if (!slug.startsWith(`${story.meta.date}-`)) problems.push(`${slug}: filename date must match frontmatter date ${story.meta.date}`);
            const factsText = read('.facts.json');
            const social = read('.social.md');
            if (factsText == null) { problems.push(`${slug}: missing ${slug}.facts.json`); continue; }
            if (social == null) problems.push(`${slug}: missing ${slug}.social.md`);
            for (const p of core.checkStory(story, JSON.parse(factsText), social || '', sport)) {
                problems.push(`${slug}: [${p.where}] ${p.message}`);
            }
            if (!metaProblems.length) stories.push(core.indexEntry(slug, story.meta, sport));
        } catch (e) {
            problems.push(`${slug}: ${e.message}`);
        }
    }
    stories.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
    return { stories, problems };
}

function main(argv) {
    const check = argv.includes('--check');
    const flag = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
    const dir = flag('--dir');
    const targets = dir
        ? [[dir, flag('--sport') || core.sportFromPath(path.resolve(dir)) || 'nfl']]
        : Object.keys(core.STORY_SPORTS).map(sport => [contentDir(sport), sport]);
    let code = 0;
    for (const [d, sport] of targets) code = Math.max(code, buildOne(d, sport, check));
    return code;
}

function buildOne(dir, sport, check) {
    const { stories, problems } = loadStories(dir, sport);
    for (const p of problems) console.error(`✗ [${sport}] ${p}`);
    if (problems.length) return 2;
    const json = `${JSON.stringify({ stories }, null, 2)}\n`;
    const indexPath = path.join(dir, 'index.json');
    if (check) {
        const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n') : null;
        if (current !== json) {
            console.error(`✗ [${sport}] index.json is stale — run: node tools/stories/build-index.cjs`);
            return 2;
        }
        console.log(`✓ [${sport}] ${stories.length} stories; every number sourced; index.json current`);
        return 0;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(indexPath, json);
    console.log(`✓ [${sport}] wrote index.json (${stories.length} stories)`);
    return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { loadStories, main };

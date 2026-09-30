#!/usr/bin/env node
// ============================================================
// SportStrata Stories — index builder + CI gate (D-166).
//   node tools/stories/build-index.cjs            write content/nfl/stories/index.json
//   node tools/stories/build-index.cjs --check    CI: fail if any story is invalid,
//                                                 has an unsourced number, or the
//                                                 committed index.json is stale
// Exit 0 / 2. Optional --dir <path> for tests.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('./story-core.cjs');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'content', 'nfl', 'stories');
const STORY_FILE = /^(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

function loadStories(dir) {
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
            const metaProblems = core.validateMeta(story.meta);
            metaProblems.forEach(p => problems.push(`${slug}: ${p}`));
            if (!slug.startsWith(`${story.meta.date}-`)) problems.push(`${slug}: filename date must match frontmatter date ${story.meta.date}`);
            const factsText = read('.facts.json');
            const social = read('.social.md');
            if (factsText == null) { problems.push(`${slug}: missing ${slug}.facts.json`); continue; }
            if (social == null) problems.push(`${slug}: missing ${slug}.social.md`);
            for (const p of core.checkStory(story, JSON.parse(factsText), social || '')) {
                problems.push(`${slug}: [${p.where}] ${p.message}`);
            }
            if (!metaProblems.length) stories.push(core.indexEntry(slug, story.meta));
        } catch (e) {
            problems.push(`${slug}: ${e.message}`);
        }
    }
    stories.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
    return { stories, problems };
}

function main(argv) {
    const check = argv.includes('--check');
    const dirIdx = argv.indexOf('--dir');
    const dir = dirIdx >= 0 ? argv[dirIdx + 1] : DEFAULT_DIR;
    const { stories, problems } = loadStories(dir);
    for (const p of problems) console.error(`✗ ${p}`);
    if (problems.length) return 2;
    const json = `${JSON.stringify({ stories }, null, 2)}\n`;
    const indexPath = path.join(dir, 'index.json');
    if (check) {
        const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n') : null;
        if (current !== json) {
            console.error('✗ index.json is stale — run: node tools/stories/build-index.cjs');
            return 2;
        }
        console.log(`✓ ${stories.length} stories; every number sourced; index.json current`);
        return 0;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(indexPath, json);
    console.log(`✓ wrote index.json (${stories.length} stories)`);
    return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { loadStories, main };

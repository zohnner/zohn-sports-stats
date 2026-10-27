#!/usr/bin/env node
// ============================================================
// Auto-publish gate for Muse's story PRs (D-187). Run by
// .github/workflows/story-automerge.yml after CI passes on a stories/* PR.
// CI already proved every story valid and every number sourced; this checks
// what CI can't: the PR touches nothing but story files, and every new story
// is fresh. Anything else stays open for the owner.
//
//   node tools/stories/automerge-check.cjs <files.json> <head-sha> [today]
//       files.json = GitHub's PR files list ([{filename, status, previous_filename}])
//       → exit 0 and prints targets=<slug ...> (new stories) to $GITHUB_OUTPUT
//       → exit 1 with the reasons on stderr
// ============================================================
'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const core = require('./story-core.cjs');

const FENCE_RE = /^content\/([a-z]+)\/stories\/[^/]+$/;
const STORY_RE = /^content\/([a-z]+)\/stories\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\.md$/;
const MAX_AGE_DAYS = 3;

function daysBetween(a, b) {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

// files: GitHub PR files; readStory(path) → file text at the PR head.
function mergeProblems(files, readStory, today) {
    const problems = [];
    const added = [];
    if (!files.length) problems.push('PR changes no files');
    for (const f of files) {
        for (const p of [f.filename, f.previous_filename].filter(Boolean)) {
            const m = FENCE_RE.exec(p);
            if (!m || !core.STORY_SPORTS[m[1]]) problems.push(`outside the story fence: ${p}`);
        }
        const s = STORY_RE.exec(f.filename);
        if (s && f.status === 'added' && core.STORY_SPORTS[s[1]]) added.push({ path: f.filename, slug: s[2] });
    }
    for (const { path, slug } of added) {
        let meta;
        try { meta = core.parseStory(readStory(path)).meta; } catch (e) { problems.push(`${slug}: ${e.message}`); continue; }
        const age = daysBetween(String(meta.date), today);
        if (!(age >= -1 && age <= MAX_AGE_DAYS)) problems.push(`${slug}: dated ${meta.date}, more than ${MAX_AGE_DAYS} days from ${today}`);
    }
    return { problems, slugs: added.map(a => a.slug) };
}

if (require.main === module) {
    const [filesPath, sha, today = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
    if (!filesPath || !/^[0-9a-f]{40}$/.test(sha || '')) {
        console.error('usage: automerge-check.cjs <files.json> <head-sha> [YYYY-MM-DD]');
        process.exit(2);
    }
    const files = JSON.parse(fs.readFileSync(filesPath, 'utf8'));
    const readStory = p => execFileSync('git', ['show', `${sha}:${p}`], { encoding: 'utf8' });
    const { problems, slugs } = mergeProblems(files, readStory, today);
    if (problems.length) {
        for (const p of problems) console.error(`✗ ${p}`);
        process.exit(1);
    }
    const line = `targets=${slugs.join(' ')}`;
    console.log(line);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line + '\n');
}

module.exports = { mergeProblems, daysBetween };

// ============================================================
// Weekly share queue (D-200): tools/stories/share-queue.sh run against a fake
// `gh` that records every call. One open queue per week; a new week closes
// the old one.
// Run: node --test tests/shareQueue.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'tools', 'stories', 'share-queue.sh');
const bashOk = spawnSync('bash', ['-c', 'date -u -d 2026-11-12 +%u'], { encoding: 'utf8' }).stdout.trim() === '4';

function run(today, openIssues) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-'));
    const log = path.join(dir, 'calls.log');
    const listed = openIssues.map(([n, t]) => `${n}\t${t}`).join('\n');
    fs.writeFileSync(path.join(dir, 'listed.txt'), listed);
    fs.writeFileSync(path.join(dir, 'gh'), [
        '#!/usr/bin/env bash',
        `echo "$*" >> "${log.replace(/\\/g, '/')}"`,
        'case "$1 $2" in',
        `  "issue list") cat "${path.join(dir, 'listed.txt').replace(/\\/g, '/')}" ;;`,
        '  "issue create") echo "https://github.com/o/r/issues/900" ;;',
        'esac',
    ].join('\n'), { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'share.md'), 'batch');
    const r = spawnSync('bash', [SCRIPT.replace(/\\/g, '/'), path.join(dir, 'share.md').replace(/\\/g, '/')], {
        encoding: 'utf8',
        env: { ...process.env, TODAY: today, PATH: `${dir}${path.delimiter}${process.env.PATH}` },
    });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
    return { r, calls };
}

const opts = { skip: bashOk ? false : 'needs bash with GNU date' };

test('first batch of a week opens that week\'s queue, titled by Monday', opts, () => {
    const { r, calls } = run('2026-11-12', []);
    assert.equal(r.status, 0, r.stderr);
    const create = calls.find(c => c.startsWith('issue create'));
    assert.match(create, /📣 Share queue — week of 2026-11-09/);
    assert.ok(calls.some(c => c.startsWith('issue comment 900')));
    assert.ok(!calls.some(c => c.startsWith('issue close')));
});

test('a later batch the same week only comments on the open queue', opts, () => {
    const { r, calls } = run('2026-11-15', [['41', '📣 Share queue — week of 2026-11-09']]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!calls.some(c => c.startsWith('issue create')));
    assert.ok(!calls.some(c => c.startsWith('issue close')));
    assert.ok(calls.some(c => c.startsWith('issue comment 41')));
});

test('a new week closes last week\'s queue and opens a new one', opts, () => {
    const { r, calls } = run('2026-11-16', [['41', '📣 Share queue — week of 2026-11-09']]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(calls.some(c => c.startsWith('issue close 41')));
    assert.match(calls.find(c => c.startsWith('issue create')), /week of 2026-11-16/);
    assert.ok(calls.some(c => c.startsWith('issue comment 900')));
});

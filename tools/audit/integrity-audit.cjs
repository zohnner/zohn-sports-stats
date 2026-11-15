#!/usr/bin/env node
// Integrity audit: the four claims of the integrity close-out (D-201), each
// backed by a command anyone can re-run. This file only runs those commands
// and reads their exit codes; it holds no checking logic of its own, so a
// green line here means the command under it passed.
//
//   node tools/audit/integrity-audit.cjs https://sportstrata.cc
//   node tools/audit/integrity-audit.cjs https://sportstrata.cc --no-browser   skip the click crawl
//   node tools/audit/integrity-audit.cjs https://sportstrata.cc --md report.md
//
// Needs: network, `gh` signed in (backlog), `playwright` (route crawl).
// Exit 0: every claim holds. Exit 2: at least one does not.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PLANT_TESTS = ['tests/contractCoverage.test.js', 'tests/routeCrawl.test.js', 'tests/nflStarts.test.js', 'tests/nbaGameLog.test.js', 'tests/sitemapCheck.test.js'];

// Open derived-stat issues nobody has answered.
const unowned = issues => issues.filter(i => !(i.comments || []).length);

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: opts.timeout || 600000, maxBuffer: 32 * 1024 * 1024, shell: process.platform === 'win32' && cmd !== process.execPath });
    return { code: r.status == null ? -1 : r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}
const node = (...args) => run(process.execPath, args);
const grab = (out, re) => (re.exec(out) || [])[0] || '';
const lines = (out, re) => out.split(/\r?\n/).filter(l => re.test(l)).map(l => l.trim());

function claims(base, opts) {
    const list = [];
    const add = (front, claim, command, ok, evidence, detail = []) => list.push({ front, claim, command, ok, evidence, detail });

    // 1. Story coverage and contracts.
    const cov = node('tools/contract-coverage.cjs');
    add('1 Story coverage', 'Every published story is under contract (Uncovered: 0)', 'node tools/contract-coverage.cjs',
        cov.code === 0, grab(cov.out, /Published: \d+\s+Under contract: \d+\s+Uncovered: \d+/), lines(cov.out, /FAIL|no contract for|Third-party/));
    const con = node('tools/contract-check.cjs', base);
    // A contract line is two spaces, a mark, then the contract id.
    const failed = lines(con.out, /^ {2}❌ [a-z]|^ {6}FAIL /);
    const count = re => (con.out.match(re) || []).length;
    add('1 Story coverage', 'Every contract passes or only warns', `node tools/contract-check.cjs ${base}`,
        con.code === 0 || con.code === 1, `${count(/^ {2}(✅|⚠️) {1,2}[a-z]/gm)} contracts pass or warn, ${count(/^ {2}❌ [a-z]/gm)} fail (exit ${con.code})`, failed);

    // 2. Routing.
    if (opts.browser) {
        const crawl = node('tools/audit/route-crawl.cjs', base);
        add('2 Routing', 'No game card or team link lands off its view; the planted mis-route is caught', `node tools/audit/route-crawl.cjs ${base}`,
            crawl.code === 0, grab(crawl.out, /Clicks: \d+\s+Mis-routes: \d+\s+Control: \w+/) || crawl.out.trim().split('\n').pop(), lines(crawl.out, /FAIL|^-\s|note /));
    } else {
        add('2 Routing', 'No game card or team link lands off its view', `node tools/audit/route-crawl.cjs ${base}`, null, 'not run (--no-browser)');
    }

    // 3. Derived-stat backlog.
    const gh = run('gh', ['issue', 'list', '--label', 'derived-stat', '--state', 'open', '--limit', '200', '--json', 'number,title,comments']);
    let open = null;
    try { open = JSON.parse(gh.out); } catch { open = null; }
    const orphans = open ? unowned(open) : [];
    add('3 Derived-stat backlog', 'No open derived-stat issue is unanswered', 'gh issue list --label derived-stat --state open --json number,title,comments',
        open ? orphans.length === 0 : null, open ? `${open.length} open, ${orphans.length} with no comment` : 'gh did not answer', orphans.map(i => `#${i.number} ${i.title}`));

    // 4. Sitemap.
    const sm = node('tools/audit/sitemap-check.cjs', base);
    add('4 Sitemap', 'Every story page and stories index carries a correct <lastmod>', `node tools/audit/sitemap-check.cjs ${base}`,
        sm.code === 0, grab(sm.out, /Sitemap: .*/), lines(sm.out, /FAIL/));

    // The controls themselves: every planted fault is caught.
    // The spec reporter, named: Node 22 switches to TAP when output is piped
    // (as it is here), and TAP has no "✔ planted fault" lines to count.
    const tests = node('--test', '--test-reporter=spec', ...PLANT_TESTS);
    const planted = (tests.out.match(/^✔ planted fault/gm) || []).length;
    add('Controls', 'Every planted fault is caught by its control', `node --test ${PLANT_TESTS.join(' ')}`,
        tests.code === 0 && planted > 0, `${planted} planted faults caught, ${grab(tests.out, /ℹ fail \d+/).replace('ℹ ', '')}`, lines(tests.out, /^✖/));
    return list;
}

const mark = ok => (ok === null ? 'not run' : ok ? 'holds' : 'FAILS');

function toMarkdown(base, list, when) {
    const out = [`# Integrity audit: ${base}`, '', `Run ${when}. Re-run: \`node tools/audit/integrity-audit.cjs ${base}\``, ''];
    out.push('| Front | Claim | Result | Evidence |', '|---|---|---|---|');
    for (const c of list) out.push(`| ${c.front} | ${c.claim} | **${mark(c.ok)}** | ${c.evidence.replace(/\|/g, '/')} |`);
    out.push('');
    for (const c of list) {
        out.push(`## ${c.front}: ${c.claim}`, '', `Result: **${mark(c.ok)}**. ${c.evidence}`, '', '```', c.command, '```');
        if (c.detail.length) out.push('', ...c.detail.slice(0, 40).map(d => `- ${d}`));
        out.push('');
    }
    return out.join('\n');
}

function main(argv) {
    const base = (argv[0] || '').replace(/\/$/, '');
    if (!base || base.startsWith('--')) { console.error('usage: node tools/audit/integrity-audit.cjs <base-url> [--no-browser] [--md <file>]'); return 2; }
    const list = claims(base, { browser: !argv.includes('--no-browser') });
    const when = new Date().toISOString();
    console.log(`Integrity audit  ${base}  ${when}\n`);
    for (const c of list) {
        console.log(`${mark(c.ok).padEnd(8)} ${c.front}: ${c.claim}`);
        console.log(`         ${c.evidence}`);
        console.log(`         $ ${c.command}`);
        for (const d of c.detail.slice(0, 12)) console.log(`           ${d}`);
    }
    const mdAt = argv.indexOf('--md');
    if (mdAt >= 0 && argv[mdAt + 1]) fs.writeFileSync(argv[mdAt + 1], toMarkdown(base, list, when));
    const bad = list.filter(c => c.ok === false).length, skipped = list.filter(c => c.ok === null).length;
    console.log(`\n${bad ? 'AUDIT FAILS' : skipped ? 'AUDIT INCOMPLETE' : 'AUDIT GREEN'}: ${list.length - bad - skipped} hold, ${bad} fail, ${skipped} not run`);
    return bad || skipped ? 2 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { unowned, claims, toMarkdown, PLANT_TESTS };

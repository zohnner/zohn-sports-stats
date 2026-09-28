#!/usr/bin/env node
// ============================================================
// SportStrata — contract-drift issue sync (zero deps; needs `gh`).
// One open issue per failing route, updated not duplicated, closed
// automatically when the route passes again.
//
//   node tools/contract-issues.cjs contract-report.json
// ============================================================
'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const LABEL = 'contract-drift';
const titleFor = id => `${LABEL}: ${id}`;

function failureBody(r, report, runUrl) {
    return [
        `**${report.generatedAt.slice(0, 10)}** — \`${r.id}\` failed against ${report.base}`,
        '',
        r.url ? `Route: \`${r.url}\`` : null,
        '',
        ...r.failures.map(f => `- ${f}`),
        runUrl ? `\nRun: ${runUrl}` : null,
    ].filter(line => line !== null).join('\n');
}

function planIssueActions(report, openIssues, runUrl) {
    const open = new Map(openIssues.map(i => [i.title, i.number]));
    const actions = [];
    for (const s of report.sports) {
        for (const r of s.results) {
            const title = titleFor(r.id);
            const number = open.get(title);
            if (r.status === 'fail') {
                const body = failureBody(r, report, runUrl);
                actions.push(number ? { type: 'comment', number, body } : { type: 'create', title, body });
            } else if ((r.status === 'pass' || r.status === 'warn') && number) {
                actions.push({ type: 'close', number, body: `Passing again as of ${report.generatedAt.slice(0, 10)}. Closing.` });
            }
        }
    }
    return actions;
}

function gh(args) {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function main(argv) {
    const file = argv[0];
    if (!file) {
        console.error('usage: node tools/contract-issues.cjs <report.json>');
        return 2;
    }
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    gh(['label', 'create', LABEL, '--color', 'B60205', '--description', 'Nightly upstream contract check failure', '--force']);
    const openIssues = JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number,title', '--limit', '100']));
    const runUrl = process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null;
    for (const a of planIssueActions(report, openIssues, runUrl)) {
        if (a.type === 'create') gh(['issue', 'create', '--title', a.title, '--label', LABEL, '--body', a.body]);
        else if (a.type === 'comment') gh(['issue', 'comment', String(a.number), '--body', a.body]);
        else gh(['issue', 'close', String(a.number), '--comment', a.body]);
        console.log(`${a.type} ${a.title || `#${a.number}`}`);
    }
    return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { planIssueActions };

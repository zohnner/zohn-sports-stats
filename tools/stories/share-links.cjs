// ============================================================
// One-tap manual sharing for SportStrata Stories (D-179, replaces D-178's
// auto-post). Run by .github/workflows/story-share.yml.
//
//   node tools/stories/share-links.cjs candidates <before-sha> <after-sha>
//   node tools/stories/share-links.cjs candidates --slug <slug>
//       → writes targets=<sport/slug ...> to $GITHUB_OUTPUT (and stdout)
//   node tools/stories/share-links.cjs comment <out-file> <sport/slug>...
//       → waits for each story to be live, then writes a Markdown comment with
//         a prefilled X compose link and copy-ready Reddit text
//
// No X API, no keys: the link opens X's own composer with the approved text.
// ============================================================
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const core = require('./story-core.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://sportstrata.cc';
const MAX_WEIGHT = 280;
const URL_WEIGHT = 23;
const LIVE_TRIES = 40;
const LIVE_INTERVAL_MS = 30000;

// ---------- pure helpers (covered by tests/shareLinks.test.js) ----------

const STORY_PATH_RE = /^content\/([a-z]+)\/stories\/([^/]+)\.md$/;

function addedStories(diffNames) {
    const out = [];
    for (const raw of String(diffNames || '').split(/\r?\n/)) {
        const m = STORY_PATH_RE.exec(raw.trim());
        if (!m || !core.STORY_SPORTS[m[1]] || !core.SLUG_RE.test(m[2])) continue;
        out.push({ sport: m[1], slug: m[2] });
    }
    return out;
}

function extractSection(socialMd, heading) {
    const lines = String(socialMd == null ? '' : socialMd).replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex(l => l.replace(/\s+$/, '') === `## ${heading}`);
    if (start === -1) return null;
    let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
    if (end === -1) end = lines.length;
    const text = lines.slice(start + 1, end).join('\n').trim();
    return text || null;
}

function parseReddit(section) {
    if (!section) return null;
    const m = /^\*\*Title:\*\*\s*(.+)$/m.exec(section);
    if (!m) return { title: null, body: section };
    return { title: m[1].trim(), body: section.slice(m.index + m[0].length).trim() };
}

// twitter-text v3 weighting: these code-point ranges weigh 1, everything else 2,
// an emoji sequence weighs 2 regardless of length, and every link weighs 23 —
// including bare domains, which X auto-links.
const LIGHT_RANGES = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
const URL_RE = /\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|cc|io|co|tv|ly|me|gg|app|dev|us|uk)\b(?:\/[^\s]*)?/gi;
const EMOJI_RE = /\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*/gu;

function charWeight(text) {
    let w = 0;
    const withoutEmoji = text.replace(EMOJI_RE, () => { w += 2; return ''; });
    for (const ch of withoutEmoji) {
        const cp = ch.codePointAt(0);
        w += LIGHT_RANGES.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
    }
    return w;
}

function weightedLength(text) {
    const src = String(text || '').normalize('NFC');
    let w = 0;
    let last = 0;
    for (const m of src.matchAll(URL_RE)) {
        const url = m[0].replace(/[.,!?:;)'"]+$/, '');
        w += charWeight(src.slice(last, m.index)) + URL_WEIGHT;
        last = m.index + url.length;
    }
    return w + charWeight(src.slice(last));
}

function liveUrl(sport, slug) {
    return SITE + core.storyUrl(slug, sport);
}

function xIntentUrl(text) {
    // Parentheses must be encoded too: a raw ")" ends the Markdown link early.
    return 'https://x.com/intent/post?text=' + encodeURIComponent(text).replace(/[()]/g, c => (c === '(' ? '%28' : '%29'));
}

function fence(text) {
    return '````\n' + text + '\n````';
}

function shareBlock({ sport, slug, title, social, live }) {
    const url = liveUrl(sport, slug);
    const out = [`### ${title || slug}`, ''];
    out.push(live ? `Live: ${url}` : `⚠️ **Not live yet** (${url} didn't render the story) — check it before posting.`, '');

    const x = extractSection(social, 'X');
    if (x) {
        const weight = weightedLength(x);
        const over = weight > MAX_WEIGHT ? ` ⚠️ **over by ${weight - MAX_WEIGHT}** — trim it in the composer` : '';
        out.push(`**X** (${weight}/${MAX_WEIGHT})${over}`, '', `👉 **[Post to X](${xIntentUrl(x)})**`, '');
        if (!x.includes(url)) out.push(`⚠️ This text doesn't contain the story's URL (${url}).`, '');
        out.push('<details><summary>Text</summary>', '', fence(x), '', '</details>', '');
    } else {
        out.push('**X:** no `## X` section in the .social.md.', '');
    }

    const reddit = parseReddit(extractSection(social, 'Reddit'));
    if (reddit) {
        out.push('**Reddit** — copy into a new text post:', '');
        if (reddit.title) out.push('Title', fence(reddit.title), '');
        out.push('Body', fence(reddit.body), '');
    }
    return out.join('\n');
}

// ---------- CLI ----------

function storyFiles(sport, slug) {
    const dir = path.join(ROOT, 'content', sport, 'stories');
    return { md: path.join(dir, `${slug}.md`), social: path.join(dir, `${slug}.social.md`) };
}

function writeOutput(targets) {
    const line = `targets=${targets.map(t => `${t.sport}/${t.slug}`).join(' ')}`;
    console.log(line);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line + '\n');
}

function candidates(args) {
    if (args[0] === '--slug') {
        // D-187: several slugs (space-separated) when an auto-merged PR dispatches this.
        const slugs = args.slice(1).join(' ').split(/\s+/).filter(Boolean);
        const targets = [];
        for (const slug of slugs) {
            const sport = Object.keys(core.STORY_SPORTS).find(s => fs.existsSync(storyFiles(s, slug).md));
            if (!core.SLUG_RE.test(slug) || !sport) {
                console.error(`No story file found for slug "${slug}"`);
                process.exit(1);
            }
            targets.push({ sport, slug });
        }
        return writeOutput(targets);
    }
    let [before, after] = args;
    // A branch-creating push reports an all-zero "before".
    if (!before || /^0+$/.test(before)) before = `${after}^`;
    const names = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', before, after, '--', 'content/'], { cwd: ROOT, encoding: 'utf8' });
    writeOutput(addedStories(names));
}

async function liveCheck(sport, slug, fetchImpl = fetch) {
    // The story template serves the plain shell (200) on render errors and
    // redirects bad input, so a bare 200 doesn't prove the story is live.
    try {
        const res = await fetchImpl(liveUrl(sport, slug), { redirect: 'manual' });
        return res.status === 200 && (await res.text()).includes(core.storyUrl(slug, sport));
    } catch (_) {
        return false;
    }
}

async function waitLive(sport, slug) {
    for (let i = 0; i < LIVE_TRIES; i++) {
        if (await liveCheck(sport, slug)) return true;
        await new Promise(r => setTimeout(r, LIVE_INTERVAL_MS));
    }
    return false;
}

async function comment(outFile, targets) {
    const blocks = [];
    for (const target of targets) {
        const [sport, slug] = target.split('/');
        const files = storyFiles(sport, slug);
        if (!fs.existsSync(files.md)) { console.log(`[${target}] skip: story file not on main`); continue; }
        if (!fs.existsSync(files.social)) { console.log(`[${target}] skip: no .social.md`); continue; }
        const { meta } = core.parseStory(fs.readFileSync(files.md, 'utf8'));
        const live = await waitLive(sport, slug);
        console.log(`[${target}] ${live ? 'live' : 'NOT live after waiting'}`);
        blocks.push(shareBlock({ sport, slug, title: meta.title, social: fs.readFileSync(files.social, 'utf8'), live }));
    }
    if (!blocks.length) return;
    const body = ['## 📣 Ready to share', '', 'Tap **Post to X**, check the text, and post.', '', blocks.join('\n---\n\n')].join('\n');
    fs.writeFileSync(outFile, body + '\n');
}

if (require.main === module) {
    const [cmd, ...args] = process.argv.slice(2);
    if (cmd === 'candidates') candidates(args);
    else if (cmd === 'comment') comment(args[0], args.slice(1).filter(Boolean)).catch(e => { console.error(e); process.exit(1); });
    else {
        console.error('usage: share-links.cjs candidates <before> <after> | candidates --slug <slug> | comment <out-file> <sport/slug>...');
        process.exit(2);
    }
}

module.exports = {
    addedStories, extractSection, parseReddit, weightedLength, liveUrl, xIntentUrl, shareBlock, liveCheck,
};

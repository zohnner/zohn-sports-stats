// ============================================================
// X auto-post for SportStrata Stories (D-178). Run by .github/workflows/x-post.yml.
//
//   node tools/stories/post-x.cjs candidates <before-sha> <after-sha>
//   node tools/stories/post-x.cjs candidates --slug <slug>
//       → writes targets=<sport/slug ...> to $GITHUB_OUTPUT (and stdout)
//   node tools/stories/post-x.cjs post <sport/slug>...
//       → gates each story, posts its .social.md "## X" text verbatim,
//         appends {sport, slug, tweetId, postedAt} to content/x-posted.json
//
// No dependencies: OAuth 1.0a (HMAC-SHA1) via node:crypto, fetch from Node 20.
// ============================================================
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const core = require('./story-core.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER = path.join(ROOT, 'content', 'x-posted.json');
const SITE = 'https://sportstrata.cc';
const TWEET_ENDPOINT = 'https://api.x.com/2/tweets';
const MAX_WEIGHT = 280;
const URL_WEIGHT = 23;
const CRED_KEYS = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'];

// ---------- pure helpers (covered by tests/postX.test.js) ----------

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

function extractXText(socialMd) {
    const lines = String(socialMd == null ? '' : socialMd).replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex(l => /^##\s+X\s*$/.test(l));
    if (start === -1) return null;
    let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
    if (end === -1) end = lines.length;
    const text = lines.slice(start + 1, end).join('\n').trim();
    return text || null;
}

function isHeld(storyMd) {
    const { meta } = core.parseStory(storyMd);
    return String(meta.x == null ? '' : meta.x).trim().toLowerCase() === 'hold';
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

function isPosted(ledger, sport, slug) {
    return (ledger || []).some(e => e.sport === sport && e.slug === slug);
}

function appendLedger(ledger, entry) {
    if (isPosted(ledger, entry.sport, entry.slug)) return ledger;
    return [...(ledger || []), entry];
}

function liveUrl(sport, slug) {
    return SITE + core.storyUrl(slug, sport);
}

// ---------- OAuth 1.0a ----------

function pct(s) {
    return encodeURIComponent(String(s)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// JSON bodies are not part of the signature base (only oauth_* and query/form params).
function signatureBase(method, url, params) {
    const paramStr = Object.keys(params).map(k => [pct(k), pct(params[k])])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`).join('&');
    return [method.toUpperCase(), pct(url), pct(paramStr)].join('&');
}

function oauthSignature(method, url, params, consumerSecret, tokenSecret) {
    const base = signatureBase(method, url, params);
    return crypto.createHmac('sha1', `${pct(consumerSecret)}&${pct(tokenSecret)}`).update(base).digest('base64');
}

function oauthHeader(method, url, creds, { nonce, timestamp } = {}) {
    const oauth = {
        oauth_consumer_key: creds.X_API_KEY,
        oauth_nonce: nonce || crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: String(timestamp || Math.floor(Date.now() / 1000)),
        oauth_token: creds.X_ACCESS_TOKEN,
        oauth_version: '1.0',
    };
    oauth.oauth_signature = oauthSignature(method, url, oauth, creds.X_API_SECRET, creds.X_ACCESS_TOKEN_SECRET);
    return 'OAuth ' + Object.keys(oauth).sort().map(k => `${pct(k)}="${pct(oauth[k])}"`).join(', ');
}

async function postTweet(text, creds, { fetchImpl = fetch, nonce, timestamp } = {}) {
    const res = await fetchImpl(TWEET_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: oauthHeader('POST', TWEET_ENDPOINT, creds, { nonce, timestamp }),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
    });
    const bodyText = await res.text();
    let json = null;
    try { json = JSON.parse(bodyText); } catch (_) { /* reported below */ }
    if (res.status !== 201 || !json?.data?.id) {
        throw new Error(`X API ${res.status}: ${bodyText.slice(0, 500)}`);
    }
    return json.data.id;
}

// ---------- CLI ----------

function storyFiles(sport, slug) {
    const dir = path.join(ROOT, 'content', sport, 'stories');
    return { md: path.join(dir, `${slug}.md`), social: path.join(dir, `${slug}.social.md`) };
}

function readLedger() {
    return fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : [];
}

function writeOutput(targets) {
    const line = `targets=${targets.map(t => `${t.sport}/${t.slug}`).join(' ')}`;
    console.log(line);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line + '\n');
}

function candidates(args) {
    if (args[0] === '--slug') {
        const slug = args[1] || '';
        const sport = Object.keys(core.STORY_SPORTS).find(s => fs.existsSync(storyFiles(s, slug).md));
        if (!core.SLUG_RE.test(slug) || !sport) {
            console.error(`No story file found for slug "${slug}"`);
            process.exit(1);
        }
        return writeOutput([{ sport, slug }]);
    }
    let [before, after] = args;
    // A branch-creating push reports an all-zero "before".
    if (!before || /^0+$/.test(before)) before = `${after}^`;
    const names = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', before, after, '--', 'content/'], { cwd: ROOT, encoding: 'utf8' });
    writeOutput(addedStories(names));
}

async function liveCheck(sport, slug, fetchImpl = fetch) {
    const url = liveUrl(sport, slug);
    // The story template falls back to the plain shell (200) on render errors
    // and redirects bad sports, so a bare 200 doesn't prove the story is live.
    const res = await fetchImpl(url, { redirect: 'manual' });
    if (res.status !== 200) return `live URL returned ${res.status}`;
    const html = await res.text();
    if (!html.includes(core.storyUrl(slug, sport))) return 'live URL is 200 but did not render the story';
    return null;
}

async function post(targets) {
    const missing = CRED_KEYS.filter(k => !process.env[k]);
    if (missing.length) {
        console.log(`X credentials not configured (missing ${missing.join(', ')}); skipping.`);
        return 0;
    }
    const creds = Object.fromEntries(CRED_KEYS.map(k => [k, process.env[k]]));
    let failed = 0;
    for (const target of targets) {
        const [sport, slug] = target.split('/');
        const tag = `[${sport}/${slug}]`;
        try {
            const files = storyFiles(sport, slug);
            if (!core.STORY_SPORTS[sport] || !core.SLUG_RE.test(slug || '')) { console.log(`${tag} skip: not a story target`); continue; }
            if (!fs.existsSync(files.md)) { console.log(`${tag} skip: story file no longer on main (reverted)`); continue; }
            if (isHeld(fs.readFileSync(files.md, 'utf8'))) { console.log(`${tag} skip: frontmatter has x: hold`); continue; }
            if (isPosted(readLedger(), sport, slug)) { console.log(`${tag} skip: already in content/x-posted.json`); continue; }
            if (!fs.existsSync(files.social)) throw new Error('no .social.md file');
            const text = extractXText(fs.readFileSync(files.social, 'utf8'));
            if (!text) throw new Error('.social.md has no "## X" section');
            if (!text.includes(liveUrl(sport, slug))) throw new Error(`"## X" text does not contain the story URL ${liveUrl(sport, slug)}`);
            const weight = weightedLength(text);
            if (weight > MAX_WEIGHT) throw new Error(`"## X" text is ${weight} weighted characters (limit ${MAX_WEIGHT}); not trimming`);
            const liveProblem = await liveCheck(sport, slug);
            if (liveProblem) { console.log(`${tag} skip: ${liveProblem}`); continue; }

            const tweetId = await postTweet(text, creds);
            // Written per story, immediately, so a later failure can't lose the duplicate guard.
            const ledger = appendLedger(readLedger(), { sport, slug, tweetId, postedAt: new Date().toISOString() });
            fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
            console.log(`${tag} posted: https://x.com/i/web/status/${tweetId}`);
        } catch (e) {
            failed++;
            console.error(`::error::${tag} ${e.message}`);
        }
    }
    return failed ? 1 : 0;
}

if (require.main === module) {
    const [cmd, ...args] = process.argv.slice(2);
    if (cmd === 'candidates') candidates(args);
    else if (cmd === 'post') post(args.filter(Boolean)).then(code => process.exit(code));
    else {
        console.error('usage: post-x.cjs candidates <before> <after> | candidates --slug <slug> | post <sport/slug>...');
        process.exit(2);
    }
}

module.exports = {
    addedStories, extractXText, isHeld, weightedLength, isPosted, appendLedger, liveUrl,
    signatureBase, oauthSignature, oauthHeader, postTweet, liveCheck,
};

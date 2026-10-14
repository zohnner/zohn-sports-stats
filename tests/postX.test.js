// ============================================================
// X auto-post (tools/stories/post-x.cjs, D-178). No network: the X API is a
// fake fetch replaying tests/fixtures/x-post-*.json (response shapes from the
// X API v2 docs, not captured from a live post).
// Run: node --test tests/postX.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const px = require('../tools/stories/post-x.cjs');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const JAX_SOCIAL = path.join(__dirname, '..', 'content', 'nfl', 'stories', '2026-09-30-jaguars-fewest-points-allowed.social.md');
const JAX_URL = 'https://sportstrata.cc/nfl/stories/2026-09-30-jaguars-fewest-points-allowed';

test('addedStories keeps only story .md files for known sports', () => {
    const diff = [
        'content/nfl/stories/2026-10-14-bills-run-game.md',
        'content/nfl/stories/2026-10-14-bills-run-game.social.md',
        'content/nfl/stories/2026-10-14-bills-run-game.facts.json',
        'content/mlb/stories/2026-10-15-dodgers-bullpen.md',
        'content/nhl/stories/2026-10-15-oilers.md',
        'content/nfl/stories/index.json',
        'content/nfl/stories/README.md',
        'js/app.js',
        '',
    ].join('\n');
    assert.deepEqual(px.addedStories(diff), [
        { sport: 'nfl', slug: '2026-10-14-bills-run-game' },
        { sport: 'mlb', slug: '2026-10-15-dodgers-bullpen' },
    ]);
    assert.deepEqual(px.addedStories(''), []);
});

test('extractXText returns the ## X section verbatim, stopping at the next heading', () => {
    const text = px.extractXText(fs.readFileSync(JAX_SOCIAL, 'utf8'));
    assert.ok(text.startsWith('Jaguars through Week 3: 36 points allowed'));
    assert.ok(text.endsWith(JAX_URL));
    assert.ok(text.includes('\n\nTheir 3 opponents'), 'internal blank lines preserved');
    assert.ok(!text.includes('## Reddit') && !text.includes('Full breakdown'));

    const crlf = '## X\r\n\r\nline one\r\n\r\nline two\r\n## Bluesky\r\nother\r\n';
    assert.equal(px.extractXText(crlf), 'line one\n\nline two');
    assert.equal(px.extractXText('## Reddit\n\nno x here'), null);
    assert.equal(px.extractXText('## X\n\n   \n'), null);
    assert.equal(px.extractXText('## Xtra\n\nnot it'), null);
});

test('isHeld detects x: hold in frontmatter only', () => {
    const story = x => `---\ntitle: T\ndek: D\ndate: 2026-10-14\nseason: 2026\nteams: [BUF]\nhero_stat: 1 thing\n${x}---\n\nBody says x: hold but that is prose.\n`;
    assert.equal(px.isHeld(story('x: hold\n')), true);
    assert.equal(px.isHeld(story('x: HOLD \n')), true);
    assert.equal(px.isHeld(story('')), false);
    assert.equal(px.isHeld(story('x: post\n')), false);
});

test('weightedLength counts every URL as 23 and weights wide characters as 2', () => {
    assert.equal(px.weightedLength('hello'), 5);
    assert.equal(px.weightedLength(`see ${JAX_URL}`), 4 + 23);
    assert.equal(px.weightedLength('go to sportstrata.cc now'), 'go to '.length + 23 + ' now'.length);
    assert.equal(px.weightedLength(`${JAX_URL}.`), 24, 'trailing period is not part of the link');
    assert.equal(px.weightedLength('日本'), 4);
    assert.equal(px.weightedLength('🏈'), 2);
    assert.equal(px.weightedLength('👨‍👩‍👧'), 2, 'ZWJ emoji sequence counts once');
    assert.equal(px.weightedLength('é'), 1, 'decomposed é normalizes to one character');
    assert.equal(px.weightedLength('a'.repeat(256) + ' ' + JAX_URL), 280);
    assert.equal(px.weightedLength('a'.repeat(257) + ' ' + JAX_URL), 281);
    assert.ok(px.weightedLength(px.extractXText(fs.readFileSync(JAX_SOCIAL, 'utf8'))) <= 280);
});

test('ledger dedupe is keyed on sport + slug', () => {
    const entry = { sport: 'nfl', slug: '2026-09-30-jaguars-fewest-points-allowed', tweetId: '1', postedAt: '2026-10-01T00:00:00.000Z' };
    const ledger = px.appendLedger([], entry);
    assert.equal(px.isPosted(ledger, 'nfl', entry.slug), true);
    assert.equal(px.isPosted(ledger, 'mlb', entry.slug), false);
    assert.equal(px.isPosted([], 'nfl', entry.slug), false);
    assert.equal(px.appendLedger(ledger, { ...entry, tweetId: '2' }), ledger, 'second post of a slug is a no-op');
    assert.equal(px.appendLedger(ledger, { ...entry, sport: 'mlb' }).length, 2);
});

test('liveUrl follows the story route pattern', () => {
    assert.equal(px.liveUrl('nfl', '2026-09-30-jaguars-fewest-points-allowed'), JAX_URL);
    assert.equal(px.liveUrl('mlb', '2026-10-04-white-sox-unbeaten-october'), 'https://sportstrata.cc/mlb/stories/2026-10-04-white-sox-unbeaten-october');
});

test('OAuth signing reproduces the published reference base string and its HMAC', () => {
    // Inputs and base string from Twitter's "Creating a signature" worked example;
    // the expected signature was computed independently with
    // `openssl dgst -sha1 -hmac <key> -binary | base64` over that base string.
    const url = 'https://api.twitter.com/1.1/statuses/update.json';
    const params = {
        status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
        include_entities: 'true',
        oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHBog',
        oauth_nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1318622958',
        oauth_token: '370773112-GmHxMAgYeMbNcXR3lyokVgm8ri4i4xnSL6NvJwdV',
        oauth_version: '1.0',
    };
    assert.equal(px.signatureBase('POST', url, params),
        'POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26oauth_token%3D370773112-GmHxMAgYeMbNcXR3lyokVgm8ri4i4xnSL6NvJwdV%26oauth_version%3D1.0%26status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521');
    assert.equal(px.oauthSignature('POST', url, params, 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw', 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE'),
        'oODYOwV5J6kXSbemIRC0D+PDFPM=');
});

const CREDS = { X_API_KEY: 'ck', X_API_SECRET: 'cs', X_ACCESS_TOKEN: 'at', X_ACCESS_TOKEN_SECRET: 'ats' };

function fakeFetch(status, body, calls) {
    return async (url, init) => {
        calls.push({ url, init });
        return { status, text: async () => body };
    };
}

test('postTweet sends a signed JSON body and returns the id from a 201', async () => {
    const calls = [];
    const id = await px.postTweet('hello\n\nworld', CREDS, { fetchImpl: fakeFetch(201, fixture('x-post-201.json'), calls), nonce: 'n0nce', timestamp: 1760000000 });
    assert.equal(id, '1845880548472328192');
    assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.equal(url, 'https://api.x.com/2/tweets');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { text: 'hello\n\nworld' });
    const auth = init.headers.Authorization;
    assert.match(auth, /^OAuth /);
    for (const k of ['oauth_consumer_key="ck"', 'oauth_token="at"', 'oauth_nonce="n0nce"', 'oauth_timestamp="1760000000"', 'oauth_signature_method="HMAC-SHA1"', 'oauth_version="1.0"']) {
        assert.ok(auth.includes(k), k);
    }
    const expected = px.oauthSignature('POST', 'https://api.x.com/2/tweets', {
        oauth_consumer_key: 'ck', oauth_nonce: 'n0nce', oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1760000000', oauth_token: 'at', oauth_version: '1.0',
    }, 'cs', 'ats');
    assert.ok(auth.includes(`oauth_signature="${encodeURIComponent(expected)}"`));
});

test('postTweet throws loudly on a 403 (read-only token)', async () => {
    await assert.rejects(
        px.postTweet('hi', CREDS, { fetchImpl: fakeFetch(403, fixture('x-post-403.json'), []) }),
        /X API 403: .*not permitted/,
    );
});

test('liveCheck requires a real 200 that rendered the story', async () => {
    const slug = '2026-09-30-jaguars-fewest-points-allowed';
    const page = res => async (_url, init) => {
        assert.equal(init.redirect, 'manual');
        return res;
    };
    assert.equal(await px.liveCheck('nfl', slug, page({ status: 200, text: async () => `<link rel="canonical" href="${JAX_URL}">` })), null);
    assert.match(await px.liveCheck('nfl', slug, page({ status: 404, text: async () => '' })), /404/);
    assert.match(await px.liveCheck('nfl', slug, page({ status: 302, text: async () => '' })), /302/);
    assert.match(await px.liveCheck('nfl', slug, page({ status: 200, text: async () => '<html>shell</html>' })), /did not render/);
});

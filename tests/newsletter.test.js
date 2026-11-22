// ============================================================
// Weekly email list (D-214): functions/api/newsletter.js. In-memory store
// in place of D1; Turnstile and Resend are stubbed.
// Run: node --test tests/newsletter.test.js
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'newsletter-'));
const mirrored = new Map();
function mirror(abs) {
    if (mirrored.has(abs)) return mirrored.get(abs);
    const out = path.join(TMP, path.relative(ROOT, abs)).replace(/\.js$/, '.mjs');
    mirrored.set(abs, out);
    const src = fs.readFileSync(abs, 'utf8').replace(/(from\s+)(['"])(\.[^'"]+)\2/g, (m, from, q, spec) => {
        const target = path.resolve(path.dirname(abs), spec);
        return `${from}${q}${pathToFileURL(target.endsWith('.js') ? mirror(target) : target).href}${q}`;
    });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, src);
    return out;
}
const load = () => import(pathToFileURL(mirror(path.join(ROOT, 'functions/api/newsletter.js'))).href);

function memStore() {
    const rows = [];
    let id = 0;
    return {
        rows,
        byEmail: async e => rows.find(r => r.email === e) || null,
        byTokenHash: async h => rows.find(r => r.token_hash === h) || null,
        insertPending: async (email, token_hash, source, now) => { rows.push({ id: ++id, email, status: 'pending', token_hash, source, created_at: now, last_sent_at: now }); },
        resetPending: async (rid, token_hash, source, now) => Object.assign(rows.find(r => r.id === rid), { status: 'pending', token_hash, source, last_sent_at: now, unsubscribed_at: null }),
        confirm: async (rid, now) => Object.assign(rows.find(r => r.id === rid), { status: 'confirmed', confirmed_at: now }),
        unsubscribe: async (rid, now) => Object.assign(rows.find(r => r.id === rid), { status: 'unsubscribed', unsubscribed_at: now }),
    };
}

function harness({ turnstile = true, resendOk = true } = {}) {
    const sent = [];
    return {
        sent,
        deps: (store, now = 1_000_000) => ({
            store, now, env: { RESEND_API_KEY: 'k' },
            verify: async t => turnstile && t === 'tok',
            fetchImpl: async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: resendOk ? 200 : 500 }); },
        }),
    };
}
const tokenFrom = mail => /[?&]t=([A-Za-z0-9_-]{32})/.exec(mail.text)[1];

test('normalizeEmail trims and lowercases, and rejects junk', async () => {
    const { normalizeEmail } = await load();
    assert.equal(normalizeEmail('  Fan@Example.COM '), 'fan@example.com');
    for (const bad of ['', 'no-at', 'a@b', 'a b@c.com', 'x@y.c', '<x>@y.com', 42, null, 'a@' + 'b'.repeat(260) + '.com']) {
        assert.equal(normalizeEmail(bad), null, String(bad));
    }
});

test('tokens are 32 url-safe characters and only their hash is stored', async () => {
    const { newToken, hashToken, subscribe } = await load();
    assert.match(newToken(), /^[A-Za-z0-9_-]{32}$/);
    const store = memStore(); const h = harness();
    await subscribe({ email: 'fan@example.com', source: 'home', turnstileToken: 'tok' }, h.deps(store));
    const token = tokenFrom(h.sent[0]);
    assert.notEqual(store.rows[0].token_hash, token);
    assert.equal(store.rows[0].token_hash, await hashToken(token));
});

test('signup stores a pending row and sends one confirmation; nothing is confirmed yet', async () => {
    const { subscribe } = await load();
    const store = memStore(); const h = harness();
    const res = await subscribe({ email: 'Fan@Example.com', source: 'story', turnstileToken: 'tok' }, h.deps(store));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, message: 'Check your inbox for a confirmation link.' });
    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0].status, 'pending');
    assert.equal(store.rows[0].source, 'story');
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].to, 'fan@example.com');
    assert.match(h.sent[0].text, /https:\/\/sportstrata\.cc\/api\/newsletter\?action=confirm&t=/);
});

test('an unknown source is stored as null, never as free text', async () => {
    const { subscribe } = await load();
    const store = memStore(); const h = harness();
    await subscribe({ email: 'a@example.com', source: '<script>', turnstileToken: 'tok' }, h.deps(store));
    assert.equal(store.rows[0].source, null);
});

test('bad email or failed bot check: 400, nothing stored, nothing sent', async () => {
    const { subscribe } = await load();
    const store = memStore(); const h = harness();
    assert.equal((await subscribe({ email: 'nope', turnstileToken: 'tok' }, h.deps(store))).status, 400);
    assert.equal((await subscribe({ email: 'a@example.com', turnstileToken: 'wrong' }, h.deps(store))).status, 400);
    assert.equal((await subscribe(null, h.deps(store))).status, 400);
    assert.equal(store.rows.length, 0);
    assert.equal(h.sent.length, 0);
});

test('same reply for a confirmed address, and no email: the form does not reveal who is subscribed', async () => {
    const { subscribe } = await load();
    const store = memStore(); const h = harness();
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store));
    store.rows[0].status = 'confirmed';
    const again = await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store, 9_999_999));
    assert.deepEqual(await again.json(), { ok: true, message: 'Check your inbox for a confirmation link.' });
    assert.equal(h.sent.length, 1);
});

test('a pending address is re-sent only after the cooldown, with a fresh token', async () => {
    const { subscribe, RESEND_COOLDOWN_MS } = await load();
    const store = memStore(); const h = harness();
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store, 1_000_000));
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store, 1_000_000 + 60_000));
    assert.equal(h.sent.length, 1);
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store, 1_000_000 + RESEND_COOLDOWN_MS + 1));
    assert.equal(h.sent.length, 2);
    assert.notEqual(tokenFrom(h.sent[0]), tokenFrom(h.sent[1]));
    assert.equal(store.rows.length, 1);
});

test('Resend failing returns 502 with a reason, not a fake success', async () => {
    const { subscribe } = await load();
    const res = await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, harness({ resendOk: false }).deps(memStore()));
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /couldn't send the confirmation email/);
});

test('confirm: GET shows a button and changes nothing; POST confirms', async () => {
    const { subscribe, tokenAction } = await load();
    const store = memStore(); const h = harness();
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store));
    const t = tokenFrom(h.sent[0]);
    const get = await tokenAction('confirm', t, 'GET', h.deps(store));
    const html = await get.text();
    assert.match(html, /<form method="post" action="\/api\/newsletter\?action=confirm&amp;t=/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.equal(store.rows[0].status, 'pending');
    const post = await tokenAction('confirm', t, 'POST', h.deps(store));
    assert.match(await post.text(), /You&#39;re subscribed/);
    assert.equal(store.rows[0].status, 'confirmed');
});

test('unsubscribe: POST (one-click) unsubscribes, and a later confirm click cannot resubscribe', async () => {
    const { subscribe, tokenAction } = await load();
    const store = memStore(); const h = harness();
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store));
    const t = tokenFrom(h.sent[0]);
    await tokenAction('confirm', t, 'POST', h.deps(store));
    await tokenAction('unsubscribe', t, 'POST', h.deps(store));
    assert.equal(store.rows[0].status, 'unsubscribed');
    const res = await tokenAction('confirm', t, 'POST', h.deps(store));
    assert.equal(res.status, 410);
    assert.equal(store.rows[0].status, 'unsubscribed');
});

test('signing up again after unsubscribing starts a fresh double opt-in', async () => {
    const { subscribe, tokenAction } = await load();
    const store = memStore(); const h = harness();
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store));
    await tokenAction('unsubscribe', tokenFrom(h.sent[0]), 'POST', h.deps(store));
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store, 2_000_000));
    assert.equal(store.rows[0].status, 'pending');
    assert.equal(h.sent.length, 2);
});

test('unknown, malformed or replaced tokens get a "no longer valid" page and change nothing', async () => {
    const { tokenAction, subscribe, RESEND_COOLDOWN_MS } = await load();
    const store = memStore(); const h = harness();
    assert.equal((await tokenAction('confirm', 'x'.repeat(32), 'POST', h.deps(store))).status, 404);
    assert.equal((await tokenAction('confirm', '../etc', 'POST', h.deps(store))).status, 404);
    assert.equal((await tokenAction('delete', 'x'.repeat(32), 'POST', h.deps(store))).status, 404);
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store));
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store, 1_000_000 + RESEND_COOLDOWN_MS + 1));
    assert.equal((await tokenAction('confirm', tokenFrom(h.sent[0]), 'POST', h.deps(store))).status, 404);
    assert.equal(store.rows[0].status, 'pending');
});

test('onRequest fails closed (503) until USER_DB and RESEND_API_KEY exist', async () => {
    const { onRequest } = await load();
    const res = await onRequest({ request: new Request('https://sportstrata.cc/api/newsletter', { method: 'POST', body: '{}' }), env: {} });
    assert.equal(res.status, 503);
});

test('planted fault: a GET that confirmed on load would be caught', async () => {
    const { subscribe, tokenAction } = await load();
    const store = memStore(); const h = harness();
    await subscribe({ email: 'a@example.com', turnstileToken: 'tok' }, h.deps(store));
    await tokenAction('confirm', tokenFrom(h.sent[0]), 'GET', h.deps(store));
    assert.notEqual(store.rows[0].status, 'confirmed', 'a mail scanner opening the link must not confirm the address');
});

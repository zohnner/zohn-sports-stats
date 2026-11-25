// D-214 — Weekly email list: signup with double opt-in, confirm, unsubscribe.
// migrations/0010_newsletter.sql holds the table; Resend sends (same key as sign-in).
//
//   POST /api/newsletter                      {email, source, turnstileToken} -> confirmation email
//   GET  /api/newsletter?action=confirm&t=…   page with a Confirm button (no state change)
//   POST /api/newsletter?action=confirm&t=…   confirms
//   GET  /api/newsletter?action=unsubscribe&t=…  page with an Unsubscribe button
//   POST /api/newsletter?action=unsubscribe&t=…  unsubscribes (also RFC 8058 one-click)
//
// Links never act on GET: mail scanners open every link in a message, which
// would confirm or unsubscribe people who never clicked. Every signup gets the
// same reply whatever the address's state, so the form can't be used to learn
// who is on the list.
import { verifyTurnstile } from './auth/_turnstile.js';

export const SOURCES = new Set(['home', 'story', 'hub', 'about']);
export const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
const SITE = 'https://sportstrata.cc';
const EMAIL_RE = /^[^\s@<>()[\]",;:\\]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const SIGNUP_REPLY = { ok: true, message: 'Check your inbox for a confirmation link.' };

export function normalizeEmail(s) {
    if (typeof s !== 'string') return null;
    const e = s.trim().toLowerCase();
    return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function newToken() {
    const b = crypto.getRandomValues(new Uint8Array(24));
    return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
}

export async function hashToken(t) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function d1Store(db) {
    const q = (sql, ...a) => db.prepare(sql).bind(...a);
    return {
        byEmail: e => q('SELECT * FROM newsletter_subscribers WHERE email = ?', e).first(),
        byTokenHash: h => q('SELECT * FROM newsletter_subscribers WHERE token_hash = ?', h).first(),
        insertPending: (e, h, source, now) => q(
            "INSERT INTO newsletter_subscribers (email, status, token_hash, source, created_at, last_sent_at) VALUES (?, 'pending', ?, ?, ?, ?)",
            e, h, source, now, now).run(),
        resetPending: (id, h, source, now) => q(
            "UPDATE newsletter_subscribers SET status = 'pending', token_hash = ?, source = ?, last_sent_at = ?, unsubscribed_at = NULL WHERE id = ?",
            h, source, now, id).run(),
        confirm: (id, now) => q("UPDATE newsletter_subscribers SET status = 'confirmed', confirmed_at = ? WHERE id = ?", now, id).run(),
        unsubscribe: (id, now) => q("UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE id = ?", now, id).run(),
    };
}

export function actionUrl(action, token) {
    return `${SITE}/api/newsletter?action=${action}&t=${encodeURIComponent(token)}`;
}

async function sendConfirmation(env, fetchImpl, email, token) {
    const link = actionUrl('confirm', token);
    const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: env.NEWSLETTER_FROM || 'SportStrata <weekly@sportstrata.cc>',
            to: email,
            subject: 'Confirm your SportStrata weekly email',
            text: `Confirm you want SportStrata's weekly email, the week's data stories with every number sourced:\n${link}\n\nIf you didn't ask for this, ignore this email and nothing will be sent.`,
            html: `<p>Confirm you want SportStrata's weekly email, the week's data stories with every number sourced:</p><p><a href="${link}">Confirm my subscription</a></p><p style="color:#888;font-size:13px">If you didn't ask for this, ignore this email and nothing will be sent.</p>`,
        }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function subscribe(body, deps) {
    const { store, env, fetchImpl, now, verify } = deps;
    const email = normalizeEmail(body && body.email);
    if (!email) return json({ ok: false, error: "That email address doesn't look right. Check it and try again." }, 400);
    if (!(await verify(body.turnstileToken))) return json({ ok: false, error: "The bot check didn't pass. Reload the page and try again." }, 400);
    const source = SOURCES.has(body.source) ? body.source : null;

    const row = await store.byEmail(email);
    if (row && row.status === 'confirmed') return json(SIGNUP_REPLY);
    if (row && row.status === 'pending' && now - (row.last_sent_at || 0) < RESEND_COOLDOWN_MS) return json(SIGNUP_REPLY);

    const token = newToken();
    const h = await hashToken(token);
    if (row) await store.resetPending(row.id, h, source, now);
    else await store.insertPending(email, h, source, now);
    try {
        await sendConfirmation(env, fetchImpl, email, token);
    } catch (_) {
        return json({ ok: false, error: "We couldn't send the confirmation email. Try again in a few minutes." }, 502);
    }
    return json(SIGNUP_REPLY);
}

function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function page(title, bodyHtml, status = 200) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
        `<title>${esc(title)} | SportStrata</title><link rel="stylesheet" href="/css/variables.css">` +
        `<style>body{margin:0;background:var(--bg-base);color:var(--text-primary);font-family:var(--font-sans);font-size:var(--text-base)}` +
        `main{max-width:32rem;margin:var(--space-12) auto;padding:0 var(--space-4)}h1{font-size:var(--text-xl)}p{color:var(--text-secondary)}` +
        `a{color:var(--accent)}button{font:inherit;padding:var(--space-2) var(--space-4);border:0;border-radius:var(--radius);` +
        `background:var(--accent);color:var(--text-on-accent);cursor:pointer}</style></head>` +
        `<body><main><h1>${esc(title)}</h1>${bodyHtml}<p><a href="/">Back to SportStrata</a></p></main></body></html>`;
    return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

const COPY = {
    confirm: { title: 'Confirm your subscription', button: 'Confirm', done: "You're subscribed",
        doneText: 'The weekly email arrives once a week. Every issue has a one-click unsubscribe link.' },
    unsubscribe: { title: 'Unsubscribe from the weekly email', button: 'Unsubscribe', done: "You're unsubscribed",
        doneText: "You won't get the weekly email again. You can sign up again any time from the site." },
};

export async function tokenAction(action, token, method, deps) {
    const copy = COPY[action];
    if (!copy) return page('Not found', '<p>That link is not one of ours.</p>', 404);
    const row = TOKEN_RE.test(token || '') ? await deps.store.byTokenHash(await hashToken(token)) : null;
    if (!row) return page('Link no longer valid', '<p>This link has expired or was replaced by a newer one. Sign up again from any SportStrata page.</p>', 404);

    if (method !== 'POST') {
        if (action === 'confirm' && row.status === 'confirmed') return page(copy.done, `<p>${copy.doneText}</p>`);
        if (action === 'unsubscribe' && row.status === 'unsubscribed') return page(copy.done, `<p>${copy.doneText}</p>`);
        const self = `/api/newsletter?action=${action}&t=${encodeURIComponent(token)}`;
        return page(copy.title, `<form method="post" action="${esc(self)}"><button type="submit">${copy.button}</button></form>`);
    }
    if (action === 'confirm') {
        if (row.status === 'unsubscribed') return page('Link no longer valid', '<p>This address unsubscribed. Sign up again from any SportStrata page.</p>', 410);
        if (row.status === 'pending') await deps.store.confirm(row.id, deps.now);
    } else if (row.status !== 'unsubscribed') {
        await deps.store.unsubscribe(row.id, deps.now);
    }
    return page(copy.done, `<p>${copy.doneText}</p>`);
}

function deps(context) {
    const { env, request } = context;
    return {
        env, now: Date.now(), fetchImpl: fetch,
        store: d1Store(env.USER_DB),
        verify: token => verifyTurnstile(env, token, request),
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    if (!env.USER_DB || !env.RESEND_API_KEY) return json({ ok: false, error: 'The email list is not set up yet.' }, 503);
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    try {
        if (action) return await tokenAction(action, url.searchParams.get('t'), request.method, deps(context));
        if (request.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);
        return await subscribe(await request.json().catch(() => null), deps(context));
    } catch (_) {
        return json({ ok: false, error: 'The email list is unavailable right now. Try again later.' }, 500);
    }
}

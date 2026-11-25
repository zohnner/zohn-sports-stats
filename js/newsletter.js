// D-214 — Weekly email signup form. Fills every [data-newsletter-source] host
// (home, story pages) and posts to /api/newsletter. Subscribing never needs an
// account; the address is the only thing sent, and only on submit.
// Turnstile (same site key as sign-in, AUTH_TURNSTILE_SITE_KEY in js/auth.js)
// renders when the field is first focused, so idle readers load no widget.

function newsletterFormHtml(source) {
    const id = `nlEmail-${String(source).replace(/[^a-z]/g, '')}`;
    return `<section class="newsletter" aria-labelledby="${id}-h">` +
        `<p class="eyebrow">Weekly email</p>` +
        `<h2 class="newsletter-title" id="${id}-h">The week's numbers, in one email</h2>` +
        `<p class="newsletter-dek">Once a week: that week's SportStrata Stories, every number sourced. No account needed. Unsubscribe in one click.</p>` +
        `<form class="newsletter-form" data-source="${_escHtml(source)}" novalidate>` +
        `<input id="${id}" class="auth-email-input newsletter-input" type="email" name="email" autocomplete="email" required ` +
        `placeholder="you@example.com" aria-label="Email address">` +
        `<button class="btn-primary newsletter-submit" type="submit">Subscribe</button>` +
        `<div class="newsletter-check"></div>` +
        `<p class="newsletter-status" role="status" aria-live="polite"></p>` +
        `</form></section>`;
}

function mountNewsletterForms(root = document) {
    root.querySelectorAll('[data-newsletter-source]:not([data-nl-ready])').forEach(host => {
        host.dataset.nlReady = '1';
        host.innerHTML = newsletterFormHtml(host.dataset.newsletterSource);
    });
}

function _nlRenderCheck(form) {
    if (form.dataset.nlWidget || typeof AUTH_TURNSTILE_SITE_KEY === 'undefined' || !window.turnstile) return;
    form.dataset.nlWidget = window.turnstile.render(form.querySelector('.newsletter-check'), {
        sitekey: AUTH_TURNSTILE_SITE_KEY,
        appearance: 'interaction-only',
        callback: t => { form.dataset.nlToken = t; },
        'expired-callback': () => { delete form.dataset.nlToken; },
    });
}

function _nlStatus(form, text, isError) {
    const el = form.querySelector('.newsletter-status');
    el.textContent = text;
    el.classList.toggle('newsletter-status--error', !!isError);
}

async function _nlSubmit(form) {
    const input = form.querySelector('input[name="email"]');
    const btn = form.querySelector('button[type="submit"]');
    const email = input.value.trim();
    if (!email || !input.checkValidity()) return _nlStatus(form, 'Enter an email address, like you@example.com.', true);
    if (!form.dataset.nlToken) {
        _nlRenderCheck(form);
        return _nlStatus(form, 'One moment: the bot check is still running. Press Subscribe again in a second.', true);
    }
    btn.disabled = true;
    _nlStatus(form, 'Sending…', false);
    try {
        const res = await fetch('/api/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, source: form.dataset.source, turnstileToken: form.dataset.nlToken }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
            form.reset();
            _nlStatus(form, data.message || 'Check your inbox for a confirmation link.', false);
        } else {
            _nlStatus(form, data.error || `Signup failed (HTTP ${res.status}). Try again in a few minutes.`, true);
        }
    } catch (e) {
        _nlStatus(form, "Couldn't reach SportStrata. Check your connection and try again.", true);
        Logger.warn('newsletter signup failed', e, 'APP');
    } finally {
        btn.disabled = false;
        delete form.dataset.nlToken;
        if (window.turnstile && form.dataset.nlWidget) window.turnstile.reset(form.dataset.nlWidget);
    }
}

document.addEventListener('focusin', e => {
    const form = e.target.closest && e.target.closest('.newsletter-form');
    if (form) _nlRenderCheck(form);
});
document.addEventListener('submit', e => {
    const form = e.target.closest && e.target.closest('.newsletter-form');
    if (!form) return;
    e.preventDefault();
    _nlSubmit(form);
});
document.addEventListener('DOMContentLoaded', () => mountNewsletterForms());

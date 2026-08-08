// D-031 Phase 1 — accounts, sign-in, follows, preference sync. Auth is optional and
// additive per Vera's spec: every page works signed-out exactly as before; signing in
// only adds follows + synced prefs. No wall, no forced account.
//
// Calls better-auth's REST endpoints directly via fetch() rather than its client SDK —
// the SDK expects ESM/bundler usage (createAuthClient), and this codebase shares global
// scope through classic <script> tags with no build step. Endpoint paths below are
// verified against the installed better-auth 1.6.25 + @better-auth/passkey source
// (grepped for createAuthEndpoint(...) calls), not guessed from docs.
// Public site key (not a secret — safe to commit, pairs with the TURNSTILE_SECRET_KEY
// server secret). Filled in 2026-08-04 per docs/auth-setup-runbook.md step 6.
const AUTH_TURNSTILE_SITE_KEY = '0x4AAAAAAEFqnc_4a6Cujlsq';

const AuthState = {
    status: 'loading', // 'loading' | 'signed-out' | 'signed-in'
    user: null,
    // Set of "sport:entityType:entityId" keys. Local-first (see "Follows" section below) --
    // reassigned from localStorage synchronously right after this object is defined, so it's
    // never actually null by the time any card renders. Declared here just for shape/documentation.
    follows: null,
};

let _authTurnstileToken = '';
let _authTurnstileWidgetId = null;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function initAuth() {
    try {
        const res = await fetch('/api/auth/get-session', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data && data.user) {
                AuthState.status = 'signed-in';
                AuthState.user = data.user;
            } else {
                AuthState.status = 'signed-out';
            }
        } else {
            AuthState.status = 'signed-out';
        }
    } catch (e) {
        Logger.warn('Auth session check failed — treating as signed-out', e, 'AUTH');
        AuthState.status = 'signed-out';
    }
    _renderAuthControl();
    _wireAuthControlEvents();
    if (AuthState.status === 'signed-in') {
        _syncPreferencesOnSignIn();
        _syncFollowsOnSignIn();
    }
}

// ---------------------------------------------------------------------------
// Account control (header pill / avatar)
// ---------------------------------------------------------------------------

function _renderAuthControl() {
    const btn = document.getElementById('authControl');
    if (!btn) return;
    btn.hidden = false;

    if (AuthState.status === 'signed-in') {
        const initial = _escHtml((AuthState.user.name || AuthState.user.email || '?').trim().charAt(0).toUpperCase());
        btn.className = 'auth-control auth-control--signed-in';
        btn.innerHTML = `<span class="auth-avatar" aria-hidden="true">${initial}</span>`;
        btn.setAttribute('aria-label', `Account menu — signed in as ${_escHtml(AuthState.user.name || AuthState.user.email)}`);
    } else {
        btn.className = 'auth-control auth-control--signed-out';
        btn.innerHTML = `Sign in`;
        btn.setAttribute('aria-label', 'Sign in');
    }
}

function _wireAuthControlEvents() {
    const btn = document.getElementById('authControl');
    if (!btn || btn._wired) return;
    btn._wired = true;

    btn.addEventListener('click', () => {
        if (AuthState.status === 'signed-in') {
            _toggleAuthMenu();
        } else {
            openAuthSheet();
        }
    });

    document.getElementById('authMenuAccount')?.addEventListener('click', () => {
        _closeAuthMenu();
        navigateTo('account');
    });
    document.getElementById('authMenuSignOut')?.addEventListener('click', async () => {
        _closeAuthMenu();
        await signOut();
    });

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('authMenu');
        if (!menu || menu.hidden) return;
        if (!menu.contains(e.target) && e.target !== btn) _closeAuthMenu();
    });

    // Signed-out follow-star taps open the sheet then auto-apply the follow on return
    // (Vera's spec: "never lose the user's intent"). Delegated once here rather than
    // per-card, since follow stars render across many card templates.
    //
    // Capture phase, not bubble — stars render INSIDE whole-card click-to-navigate
    // elements (team/player cards bind their own click listener directly on the card
    // for "click anywhere to open detail"). A bubble-phase document listener would fire
    // after the card's own listener already ran, so stopPropagation() here would be too
    // late. Capture fires top-down before the card ever sees the event.
    document.addEventListener('click', (e) => {
        const star = e.target.closest?.('.auth-follow-star');
        if (!star) return;
        e.stopPropagation();
        e.preventDefault();
        _handleFollowStarClick(star);
    }, true);
}

function _toggleAuthMenu() {
    const menu = document.getElementById('authMenu');
    const btn = document.getElementById('authControl');
    if (!menu || !btn) return;
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    btn.setAttribute('aria-expanded', String(willOpen));
}

function _closeAuthMenu() {
    const menu = document.getElementById('authMenu');
    const btn = document.getElementById('authControl');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

// ---------------------------------------------------------------------------
// Sign-in sheet — modal on desktop, bottom-sheet on mobile (CSS only, same DOM)
// ---------------------------------------------------------------------------

let _authSheetReturnFocus = null;
let _authSheetPendingIntent = null; // { type: 'follow', sport, entityType, entityId } — replayed after sign-in

function openAuthSheet(intent) {
    _authSheetPendingIntent = intent || null;
    const sheet = document.getElementById('authSheet');
    if (!sheet) return;
    _authSheetReturnFocus = document.activeElement;
    sheet.hidden = false;
    document.body.classList.add('auth-sheet-open');
    _renderAuthSheetChoices();
    _wireAuthSheetChrome();
    const firstBtn = sheet.querySelector('.auth-method-btn');
    if (firstBtn) firstBtn.focus();
}

function closeAuthSheet() {
    const sheet = document.getElementById('authSheet');
    if (!sheet) return;
    sheet.hidden = true;
    document.body.classList.remove('auth-sheet-open');
    if (_authSheetReturnFocus && typeof _authSheetReturnFocus.focus === 'function') {
        _authSheetReturnFocus.focus();
    }
    _authSheetReturnFocus = null;
}

function _wireAuthSheetChrome() {
    const sheet = document.getElementById('authSheet');
    if (!sheet || sheet._chromeWired) return;
    sheet._chromeWired = true;

    document.getElementById('authSheetClose')?.addEventListener('click', closeAuthSheet);
    document.getElementById('authSheetBackdrop')?.addEventListener('click', closeAuthSheet);

    document.addEventListener('keydown', (e) => {
        if (sheet.hidden) return;
        if (e.key === 'Escape') { closeAuthSheet(); return; }
        if (e.key === 'Tab') _trapFocus(e, sheet);
    });
}

function _trapFocus(e, container) {
    const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

// D-061: one honest line of context in the sheet's initial choices state --
// not a nag banner, not shown in any other sheet state (signing-in/sent/error).
// Reuses .auth-sheet-note (css/auth.css) as-is, no new class. Dynamic when the
// visitor already has local follows (concrete, not hypothetical); generic
// honest fallback otherwise. AuthState.follows is populated synchronously at
// script load (_loadLocalFollows()), so this is safe to read here with no fetch.
function _authBenefitCopy() {
    const n = (AuthState.follows && AuthState.follows.size) || 0;
    if (n > 0) {
        return `Sign in to sync your ${n} follow${n === 1 ? '' : 's'} across devices — everything already works signed out.`;
    }
    return `An account only adds cross-device sync for your follows — everything here works fully signed out.`;
}

function _renderAuthSheetChoices() {
    const body = document.getElementById('authSheetBody');
    const title = document.getElementById('authSheetTitle');
    if (!body) return;
    if (title) title.textContent = 'Sign in';

    body.innerHTML = `
        <p class="auth-sheet-note">${_escHtml(_authBenefitCopy())}</p>
        <button class="auth-method-btn" id="authBtnPasskey">
            <span class="auth-method-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
            </span>
            Use a passkey
        </button>
        <button class="auth-method-btn" id="authBtnGoogle">
            <span class="auth-method-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </span>
            Continue with Google
        </button>
        <div class="auth-magic-link-row">
            <input type="email" class="auth-email-input" id="authEmailInput" placeholder="you@example.com" autocomplete="email" aria-label="Email address">
            <button class="auth-method-btn auth-method-btn--secondary" id="authBtnMagicLink">Email me a link</button>
        </div>
        <div id="authTurnstileContainer"></div>
        <p class="auth-sheet-note" id="authSheetError" hidden></p>
    `;

    document.getElementById('authBtnPasskey')?.addEventListener('click', () => signInWithPasskey());
    document.getElementById('authBtnGoogle')?.addEventListener('click', () => signInWithGoogle());
    document.getElementById('authBtnMagicLink')?.addEventListener('click', () => {
        const email = document.getElementById('authEmailInput')?.value?.trim();
        if (email) signInWithMagicLink(email);
    });

    _renderTurnstileWidget();
}

// Invisible/managed-mode Turnstile — one solve per sheet open, reused across whichever
// method the user picks (Cipher's spec gates sign-in/social, sign-in/magic-link, and the
// passkey option-generation endpoints; a single token satisfies all three since they're
// all part of the same user action). Silently no-ops if AUTH_TURNSTILE_SITE_KEY hasn't
// been filled in yet or the script hasn't loaded — the server-side gate will reject the
// resulting empty token with a clear error rather than the client failing silently.
function _renderTurnstileWidget() {
    const container = document.getElementById('authTurnstileContainer');
    if (!container || !AUTH_TURNSTILE_SITE_KEY || typeof window.turnstile === 'undefined') return;
    _authTurnstileToken = '';
    _authTurnstileWidgetId = window.turnstile.render(container, {
        sitekey: AUTH_TURNSTILE_SITE_KEY,
        appearance: 'interaction-only', // only visible if Cloudflare needs an explicit challenge
        callback: (token) => { _authTurnstileToken = token; },
        'expired-callback': () => { _authTurnstileToken = ''; },
    });
}

function _showAuthSheetState(state, detail) {
    const body = document.getElementById('authSheetBody');
    const title = document.getElementById('authSheetTitle');
    if (!body) return;

    if (state === 'signing-in') {
        if (title) title.textContent = 'Signing in…';
        body.innerHTML = `<div class="auth-sheet-loading" role="status">Signing in…</div>`;
    } else if (state === 'magic-link-sent') {
        if (title) title.textContent = 'Check your email';
        body.innerHTML = `<div class="auth-sheet-note auth-sheet-note--info">We sent a sign-in link to <strong>${_escHtml(detail || '')}</strong>. It expires shortly and works once.</div>`;
    } else if (state === 'error') {
        _renderAuthSheetChoices();
        const err = document.getElementById('authSheetError');
        if (err) {
            err.hidden = false;
            err.textContent = detail || 'Something went wrong — try again.';
        }
    }
}

// ---------------------------------------------------------------------------
// Sign-in methods
// ---------------------------------------------------------------------------

async function signInWithGoogle() {
    _showAuthSheetState('signing-in');
    const callbackURL = window.location.origin + window.location.pathname + window.location.search + window.location.hash;
    try {
        // POST, not a direct GET navigation — /sign-in/social returns { url, redirect }
        // for the client to navigate to (verified against better-auth's actual route
        // handler); it doesn't redirect on its own.
        const res = await fetch('/api/auth/sign-in/social', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ provider: 'google', callbackURL, turnstileToken: _authTurnstileToken }),
        });
        if (!res.ok) throw new Error('social_signin_failed');
        const data = await res.json();
        if (data?.url) {
            window.location.href = data.url;
        } else {
            throw new Error('no_redirect_url');
        }
    } catch (e) {
        Logger.warn('Google sign-in failed', e, 'AUTH');
        _showAuthSheetState('error', 'Could not start Google sign-in — try again.');
    }
}

async function signInWithMagicLink(email) {
    _showAuthSheetState('signing-in');
    try {
        const res = await fetch('/api/auth/sign-in/magic-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                email,
                callbackURL: window.location.origin + window.location.pathname,
                turnstileToken: _authTurnstileToken,
            }),
        });
        if (!res.ok) throw new Error('request_failed');
        _showAuthSheetState('magic-link-sent', email);
    } catch (e) {
        Logger.warn('Magic-link request failed', e, 'AUTH');
        _showAuthSheetState('error', 'Could not send the link — check the email and try again.');
    }
}

// Passkey AUTHENTICATION (returning user, existing credential). Registration (adding a
// new passkey) requires an existing session by design — WebAuthn credentials bind to an
// identity that must already exist — so it lives in the account page, not here.
//
// Base64url<->ArrayBuffer conversion and the credential JSON shape follow the widely-used
// @simplewebauthn conventions most passkey libraries (better-auth's plugin included)
// build on. Disclosed: this ceremony cannot be exercised in this environment (WebAuthn
// requires a real browser + real authenticator + a real user gesture) — confirm on the
// owner's first live pass per docs/auth-feasibility-spike.md's acceptance checklist.
async function signInWithPasskey() {
    if (!window.PublicKeyCredential) {
        _showAuthSheetState('error', 'Passkeys aren’t supported in this browser — try Google or email instead.');
        return;
    }
    _showAuthSheetState('signing-in');
    try {
        const optQs = _authTurnstileToken ? `?turnstileToken=${encodeURIComponent(_authTurnstileToken)}` : '';
        const optRes = await fetch(`/api/auth/passkey/generate-authenticate-options${optQs}`, { credentials: 'same-origin' });
        if (!optRes.ok) throw new Error('options_failed');
        const options = await optRes.json();

        const publicKey = {
            ...options,
            challenge: _b64urlToBuffer(options.challenge),
            allowCredentials: (options.allowCredentials || []).map((c) => ({ ...c, id: _b64urlToBuffer(c.id) })),
        };

        const credential = await navigator.credentials.get({ publicKey });
        const payload = _credentialToJSON(credential);

        const verifyRes = await fetch('/api/auth/passkey/verify-authentication', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ response: payload }),
        });
        if (!verifyRes.ok) throw new Error('verify_failed');

        await _onSignedIn();
    } catch (e) {
        Logger.warn('Passkey sign-in failed', e, 'AUTH');
        _showAuthSheetState('error', 'No passkey found for this site, or the request was cancelled.');
    }
}

async function _onSignedIn() {
    closeAuthSheet();
    await initAuth();
    if (_authSheetPendingIntent) {
        const intent = _authSheetPendingIntent;
        _authSheetPendingIntent = null;
        if (intent.type === 'follow') await toggleFollow(intent.sport, intent.entityType, intent.entityId, /* forceOn */ true);
        // D-064: replays a just-completed Mock Draft's save once sign-in finishes.
        // _md (fantasy.js) is untouched by opening/closing the sheet -- it's a modal
        // overlay, not a navigation -- so the draft that triggered this is still there.
        else if (intent.type === 'save_draft' && typeof _mdSaveDraft === 'function') await _mdSaveDraft();
        // Generic: re-render a view that showed a signed-out gate (e.g. My Drafts),
        // now that sign-in has completed. Deliberately re-renders rather than just
        // toggling a class, since the gated view's populated state needs a fetch.
        else if (intent.type === 'reload_view' && typeof renderCurrentView === 'function') renderCurrentView(intent.view || AppState.currentView);
    }
}

async function signOut() {
    try {
        await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin' });
    } catch (e) {
        Logger.warn('Sign-out request failed', e, 'AUTH');
    }
    AuthState.status = 'signed-out';
    AuthState.user = null;
    _renderAuthControl();
    if (AppState.currentView === 'account') navigateTo('home');
}

// ---------------------------------------------------------------------------
// WebAuthn JSON <-> binary helpers (standard base64url convention)
// ---------------------------------------------------------------------------

function _b64urlToBuffer(b64url) {
    const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
    const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf.buffer;
}

function _bufferToB64url(buf) {
    const bytes = new Uint8Array(buf);
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _credentialToJSON(credential) {
    const response = credential.response;
    const base = {
        id: credential.id,
        rawId: _bufferToB64url(credential.rawId),
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
    };
    if (response.attestationObject) {
        // Registration response
        base.response = {
            clientDataJSON: _bufferToB64url(response.clientDataJSON),
            attestationObject: _bufferToB64url(response.attestationObject),
            transports: response.getTransports ? response.getTransports() : undefined,
        };
    } else {
        // Authentication response
        base.response = {
            clientDataJSON: _bufferToB64url(response.clientDataJSON),
            authenticatorData: _bufferToB64url(response.authenticatorData),
            signature: _bufferToB64url(response.signature),
            userHandle: response.userHandle ? _bufferToB64url(response.userHandle) : undefined,
        };
    }
    return base;
}

// ---------------------------------------------------------------------------
// Follows — star control, reusable across card templates.
//
// Local-first: following works fully signed-out (localStorage), matching the
// "free, no-login" brand promise -- an account only adds cross-device sync.
// This is also the single unified mechanism replacing three older, separate
// favorite stores (MLB team `zs_fav_teams`, MLB player `zs_mlb_favs`, NBA
// player `zs_favs`), merged 2026-08-05 per explicit direction: one star
// going forward, not three different hearts/stars meaning almost the same
// thing. `_migrateLegacyFavorites()` folds each of those in once.
// ---------------------------------------------------------------------------

const _FOLLOWS_KEY = 'zs_follows';
const _FOLLOWS_MIGRATED_KEY = 'zs_follows_migrated_v1';

function _followKey(sport, entityType, entityId) {
    return `${sport}:${entityType}:${entityId}`;
}

function _loadLocalFollows() {
    try { return new Set(JSON.parse(localStorage.getItem(_FOLLOWS_KEY) || '[]')); }
    catch (_) { return new Set(); }
}

function _persistLocalFollows() {
    try { localStorage.setItem(_FOLLOWS_KEY, JSON.stringify([...AuthState.follows])); } catch (_) {}
}

// Guarded by its own flag so it only ever runs once per browser -- otherwise a
// follow removed after migration would silently reappear on the next page load.
// Doesn't delete the old keys; they're just dead weight once nothing reads them.
function _migrateLegacyFavorites() {
    if (localStorage.getItem(_FOLLOWS_MIGRATED_KEY)) return;
    try {
        (JSON.parse(localStorage.getItem('zs_fav_teams') || '[]'))
            .forEach(abbr => AuthState.follows.add(_followKey('mlb', 'team', abbr)));
        (JSON.parse(localStorage.getItem('zs_mlb_favs') || '[]'))
            .forEach(id => AuthState.follows.add(_followKey('mlb', 'player', id)));
        (JSON.parse(localStorage.getItem('zs_favs') || '[]'))
            .forEach(id => AuthState.follows.add(_followKey('nba', 'player', id)));
        _persistLocalFollows();
    } catch (e) {
        Logger.warn('Legacy favorites migration failed', e, 'AUTH');
    } finally {
        try { localStorage.setItem(_FOLLOWS_MIGRATED_KEY, '1'); } catch (_) {}
    }
}

// Populated synchronously here (script load), not inside initAuth's async session
// check -- anonymous users get a working, correct star before any network round
// trip, because following has never required an account and still doesn't.
AuthState.follows = _loadLocalFollows();
_migrateLegacyFavorites();

function _isFollowed(sport, entityType, entityId) {
    return AuthState.follows.has(_followKey(sport, entityType, entityId));
}

// On sign-in: pull the server's list, then push up anything local-only (starred
// before signing in, or on a browser that's never synced) so nothing typed while
// anonymous gets silently dropped. AuthState.follows becomes the union and stays
// mirrored to localStorage from here on, so signing out later doesn't blank stars.
async function _syncFollowsOnSignIn() {
    try {
        const res = await fetch('/api/follows', { credentials: 'same-origin' });
        if (!res.ok) return;
        const { follows } = await res.json();
        const serverSet = new Set(
            (follows || []).map((f) => _followKey(f.sport, f.entity_type, f.entity_id))
        );

        const localOnly = [...AuthState.follows].filter((k) => !serverSet.has(k));
        await Promise.all(localOnly.map((key) => {
            // Keys are "sport:entityType:entityId" and no current entityId (MLB/NBA
            // abbrs, numeric player ids, ESPN athlete ids) contains a colon, so a
            // plain 3-way split is safe -- see _followKey.
            const [sport, entityType, entityId] = key.split(':');
            return fetch('/api/follows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ sport, entity_type: entityType, entity_id: entityId }),
            }).catch((e) => Logger.warn('Follow merge-up failed for ' + key, e, 'AUTH'));
        }));

        AuthState.follows = new Set([...serverSet, ...localOnly]);
        _persistLocalFollows();
        _refreshFollowStarStates();
    } catch (e) {
        Logger.warn('Follows sync failed', e, 'AUTH');
    }
}

// Re-derives every follow star already on the page from AuthState.follows — needed
// because cards can render (and their stars along with them) before the follows list
// finishes loading, especially on first paint while initAuth's fetches are still in
// flight. Cheap: just a DOM class/attribute toggle, no re-render.
function _refreshFollowStarStates() {
    document.querySelectorAll('.auth-follow-star').forEach((s) => {
        const active = _isFollowed(s.dataset.followSport, s.dataset.followType, s.dataset.followId);
        s.classList.toggle('auth-follow-star--active', active);
        s.setAttribute('aria-pressed', String(active));
        s.setAttribute('aria-label', active ? 'Unfollow' : 'Follow');
        s.setAttribute('title', active ? 'Unfollow' : 'Follow');
        const svgPath = s.querySelector('path');
        if (svgPath) svgPath.setAttribute('fill', active ? 'currentColor' : 'none');
    });
}

// Call from any card/detail renderer: renderFollowStar('mlb', 'team', 'NYY')
// `opts.active` is optional — omit it and the star derives its own state from
// AuthState.follows (the common case); pass it explicitly only if a caller already
// knows the answer more cheaply than a Set lookup (none do today, but the override
// stays available rather than baking in a single source of truth).
function renderFollowStar(sport, entityType, entityId, opts) {
    const filled = opts && 'active' in opts ? !!opts.active : _isFollowed(sport, entityType, entityId);
    const cardCorner = !!(opts && opts.cardCorner);
    let cls = 'auth-follow-star';
    if (cardCorner) cls += ' auth-follow-star--card-corner';
    if (opts && opts.extraClass) cls += ' ' + opts.extraClass;
    if (filled) cls += ' auth-follow-star--active';
    const label = filled ? 'Unfollow' : 'Follow';
    return `<button class="${cls}" data-follow-sport="${_escHtml(sport)}" data-follow-type="${_escHtml(entityType)}" data-follow-id="${_escHtml(String(entityId))}" aria-label="${label}" aria-pressed="${!!filled}" title="${label}">
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l2.02 4.09 4.51.66-3.27 3.19.77 4.49L8 11.77l-4.03 2.16.77-4.49L1.47 6.25l4.51-.66L8 1.5z" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
    </button>`;
}

async function _handleFollowStarClick(starEl) {
    const sport = starEl.dataset.followSport;
    const entityType = starEl.dataset.followType;
    const entityId = starEl.dataset.followId;
    const wasActive = starEl.classList.contains('auth-follow-star--active');
    await toggleFollow(sport, entityType, entityId, !wasActive);
}

// Local state is the durable source of truth -- works with no account, no network
// round trip required to follow something, same as every other no-login capability
// on the site. Signed in: also best-effort synced to the account so it's there on
// other devices; a sync failure does NOT revert the local star -- the click already
// did what the user asked, and silently undoing it would be worse than a missed sync.
async function toggleFollow(sport, entityType, entityId, forceOn) {
    const selector = `.auth-follow-star[data-follow-sport="${sport}"][data-follow-type="${entityType}"][data-follow-id="${entityId}"]`;
    const stars = document.querySelectorAll(selector);
    const turningOn = forceOn;
    const key = _followKey(sport, entityType, entityId);

    if (turningOn) AuthState.follows.add(key); else AuthState.follows.delete(key);
    _persistLocalFollows();
    stars.forEach((s) => {
        s.classList.toggle('auth-follow-star--active', turningOn);
        s.setAttribute('aria-pressed', String(turningOn));
        s.setAttribute('aria-label', turningOn ? 'Unfollow' : 'Follow');
        s.setAttribute('title', turningOn ? 'Unfollow' : 'Follow');
        const svgPath = s.querySelector('path');
        if (svgPath) svgPath.setAttribute('fill', turningOn ? 'currentColor' : 'none');
    });

    // Lets any surface whose layout depends on follow state (not just the star's own
    // visual) react without auth.js needing to know those surfaces exist -- e.g. the
    // home page pins followed teams' games to the front of the grid/ticker, which is
    // a re-sort, not a repaint, so a DOM class toggle alone isn't enough there.
    window.dispatchEvent(new CustomEvent('ss:follow-changed', {
        detail: { sport, entityType, entityId, following: turningOn },
    }));

    if (AuthState.status === 'signed-in') {
        try {
            const res = await fetch('/api/follows', {
                method: turningOn ? 'POST' : 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ sport, entity_type: entityType, entity_id: entityId }),
            });
            if (!res.ok) throw new Error('follow_request_failed');
        } catch (e) {
            Logger.warn('Follow server sync failed (kept local)', e, 'AUTH');
        }
    }
}

// ---------------------------------------------------------------------------
// Preferences sync — "server wins on load, client writes win going forward" (Vera spec)
// ---------------------------------------------------------------------------

async function _syncPreferencesOnSignIn() {
    try {
        const res = await fetch('/api/prefs', { credentials: 'same-origin' });
        if (!res.ok) return;
        const { preferences } = await res.json();
        if (preferences && typeof preferences === 'object') {
            if (preferences.theme) {
                try { localStorage.setItem('zs_theme', preferences.theme); } catch (_) {}
                document.documentElement.setAttribute('data-theme', preferences.theme);
            }
            // defaultSport / scoring format are read by their own modules where relevant;
            // stored here so this stays the single sync point rather than scattering
            // server-preference reads across files.
            window.__SS_SERVER_PREFS = preferences;
        }
    } catch (e) {
        Logger.warn('Preference sync failed', e, 'AUTH');
    }
}

async function pushPreference(key, value) {
    if (AuthState.status !== 'signed-in') return;
    try {
        const current = window.__SS_SERVER_PREFS || {};
        const next = { ...current, [key]: value };
        window.__SS_SERVER_PREFS = next;
        await fetch('/api/prefs', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(next),
        });
    } catch (e) {
        Logger.warn('Preference push failed', e, 'AUTH');
    }
}

// ---------------------------------------------------------------------------
// Account management view
// ---------------------------------------------------------------------------

async function renderAccountView() {
    const main = document.getElementById('main');
    if (!main) return;

    if (AuthState.status !== 'signed-in') {
        main.innerHTML = `<div class="auth-account-signedout"><p>Sign in to manage your account.</p></div>`;
        openAuthSheet();
        return;
    }

    main.innerHTML = `<div class="auth-account-loading" role="status">Loading account…</div>`;

    let data;
    try {
        const res = await fetch('/api/me', { credentials: 'same-origin' });
        data = await res.json();
    } catch (e) {
        main.innerHTML = `<div class="auth-account-error">Couldn't load account details.</div>`;
        return;
    }

    const methodLabels = { google: 'Google', passkey: 'Passkey', email: 'Email link' };
    const methods = (data.linkedMethods || [])
        .map((m) => `<li>${_escHtml(methodLabels[m.providerId] || m.providerId)}</li>`)
        .join('');

    main.innerHTML = `
        <div class="auth-account-page">
            <h1 class="auth-account-title">Account</h1>
            <section class="auth-account-section">
                <p class="auth-account-label">Email</p>
                <p>${_escHtml(data.user.email)}</p>
            </section>
            <section class="auth-account-section">
                <p class="auth-account-label">Sign-in methods</p>
                <ul class="auth-account-methods">${methods || '<li>None</li>'}</ul>
                <button class="auth-method-btn" id="authAddPasskeyBtn">Add a passkey</button>
            </section>
            <section class="auth-account-section">
                <p class="auth-account-label">Your data</p>
                <a class="auth-method-btn" href="/api/me/export" download>Export my data</a>
            </section>
            <section class="auth-account-section auth-account-section--danger">
                <p class="auth-account-label">Delete account</p>
                <p class="auth-sheet-note">This permanently deletes your account, follows, and preferences. This can't be undone.</p>
                <input type="email" class="auth-email-input" id="authDeleteConfirmInput" placeholder="Type your email to confirm">
                <button class="auth-method-btn auth-method-btn--danger" id="authDeleteBtn">Delete account</button>
            </section>
        </div>
    `;

    document.getElementById('authAddPasskeyBtn')?.addEventListener('click', registerPasskey);
    document.getElementById('authDeleteBtn')?.addEventListener('click', () => _confirmAndDeleteAccount(data.user.email));
}

// Passkey REGISTRATION — requires an existing session (WebAuthn credentials bind to an
// identity that must already exist), so this only runs from the account page, never the
// sign-in sheet. Same disclosed WebAuthn-ceremony caveat as signInWithPasskey().
async function registerPasskey() {
    if (!window.PublicKeyCredential) return;
    try {
        const optRes = await fetch('/api/auth/passkey/generate-register-options', { credentials: 'same-origin' });
        if (!optRes.ok) throw new Error('options_failed');
        const options = await optRes.json();

        const publicKey = {
            ...options,
            challenge: _b64urlToBuffer(options.challenge),
            user: { ...options.user, id: _b64urlToBuffer(options.user.id) },
            excludeCredentials: (options.excludeCredentials || []).map((c) => ({ ...c, id: _b64urlToBuffer(c.id) })),
        };

        const credential = await navigator.credentials.create({ publicKey });
        const payload = _credentialToJSON(credential);

        const verifyRes = await fetch('/api/auth/passkey/verify-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ response: payload }),
        });
        if (!verifyRes.ok) throw new Error('verify_failed');
        renderAccountView();
    } catch (e) {
        Logger.warn('Passkey registration failed', e, 'AUTH');
    }
}

// ---------------------------------------------------------------------------
// Self-init — independent of app.js's own bootstrap sequence so load order
// relative to app.js doesn't matter, only that config.js/errorHandler.js/api.js/
// navigation.js have already run (script tag order in index.html guarantees this).
// ---------------------------------------------------------------------------

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}

async function _confirmAndDeleteAccount(email) {
    const input = document.getElementById('authDeleteConfirmInput');
    const typed = input?.value?.trim();
    if (!typed || typed.toLowerCase() !== email.toLowerCase()) {
        input?.focus();
        return;
    }
    // Vera's spec calls for two confirmations for an irreversible action — the typed
    // email match is the first; this is the second.
    if (!window.confirm('Delete your SportStrata account? This cannot be undone.')) return;

    try {
        const res = await fetch('/api/me', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ confirmEmail: typed }),
        });
        if (!res.ok && res.status !== 204) throw new Error('delete_failed');
        AuthState.status = 'signed-out';
        AuthState.user = null;
        _renderAuthControl();
        navigateTo('home');
    } catch (e) {
        Logger.warn('Account deletion failed', e, 'AUTH');
    }
}

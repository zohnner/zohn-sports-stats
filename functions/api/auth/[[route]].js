// D-031 Phase 1 — better-auth catch-all mount. Everything under /api/auth/* (sign-in,
// sign-up, sign-out, social callback, passkey ceremony, magic-link request+verify,
// session) is handled by the library; every other route on the site is untouched.
//
// See docs/auth-*.md for the six reviewed gates this implements against, and
// DECISIONS.md D-031's 2026-08-04 update for the amendments made after installing and
// reading better-auth's actual source (session tokens not hashed at rest — accepted;
// canonical user/session/account/verification/passkey schema — adopted over hand-mapping
// Relay's original naming).
import { buildAuth } from './_instance.js';

export async function onRequest(context) {
	const auth = buildAuth(context.env);
	return auth.handler(context.request);
}

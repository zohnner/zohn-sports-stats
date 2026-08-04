// D-031 Phase 1 — Cloudflare Turnstile server-side verification.
// User-solved bot check per Cipher's spec ("never bot-bypassed by us") — the site never
// decides pass/fail itself, it only relays the token to Cloudflare's siteverify endpoint.

export async function verifyTurnstile(env, token, request) {
	if (!env.TURNSTILE_SECRET_KEY) {
		throw new Error('TURNSTILE_SECRET_KEY missing — see docs/auth-setup-runbook.md step 6.');
	}
	if (!token) return false;

	const body = new FormData();
	body.append('secret', env.TURNSTILE_SECRET_KEY);
	body.append('response', token);
	const ip = request?.headers?.get?.('CF-Connecting-IP');
	if (ip) body.append('remoteip', ip);

	const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
		method: 'POST',
		body,
	});
	if (!res.ok) return false;

	const data = await res.json().catch(() => null);
	return !!data?.success;
}

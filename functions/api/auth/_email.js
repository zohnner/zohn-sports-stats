// D-031 Phase 1 — transactional email for magic-link sign-in.
// Single sendEmail() choke point (per DECISIONS.md D-031's 2026-06-22 update) so a future
// move to Cloudflare's own Email Service at GA is a one-file change, not an auth rewrite.
// Resend's HTTP API needs no SDK — a plain fetch() keeps this dependency-free, consistent
// with how every other external call in this codebase already works.

export async function sendMagicLinkEmail(env, email, url) {
	if (!env.RESEND_API_KEY) {
		throw new Error('RESEND_API_KEY missing — see docs/auth-setup-runbook.md step 5.');
	}

	const from = env.AUTH_EMAIL_FROM || 'SportStrata <login@sportstrata.cc>';

	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from,
			to: email,
			subject: 'Your SportStrata sign-in link',
			// Plain-text + minimal HTML, no marketing chrome — matches Kael's spec
			// ("brand-minimal, no marketing copy") extended to transactional email.
			text: `Sign in to SportStrata: ${url}\n\nThis link expires shortly and can only be used once. If you didn't request it, you can ignore this email.`,
			html: `<p>Sign in to SportStrata:</p><p><a href="${url}">${url}</a></p><p style="color:#888;font-size:13px">This link expires shortly and can only be used once. If you didn't request it, you can ignore this email.</p>`,
		}),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		// Never log the magic-link URL itself (it's a bearer credential) — Cipher's spec:
		// "never log tokens, cookies, or secrets."
		throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 200)}`);
	}
}

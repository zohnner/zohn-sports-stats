// D-069 — shared paid-tier entitlement check.
// Underscore-prefixed => not a routable endpoint (same convention as _middleware.js and
// auth/_instance.js) -- imported by any Function that needs to know "is this user paid."
//
// Stubbed on purpose: no Stripe integration exists yet (pricing hasn't been decided --
// see DECISIONS.md D-069). subscriptions has zero rows for anyone right now, so this
// always returns false today. That is not a bug to fix later -- it's the correct,
// honest free-tier default until real billing writes real rows. When Stripe is wired
// up, the webhook handler upserts subscriptions and this function's query starts
// returning real results with NO call-site changes required anywhere else in the
// codebase -- every gated endpoint already calls this same function, not a hardcoded
// flag, specifically so that flip is a one-file change.
export async function isEntitled(env, userId) {
	if (!userId || !env.USER_DB) return false;
	const row = await env.USER_DB
		.prepare("SELECT status, current_period_end FROM subscriptions WHERE user_id = ? AND status = 'active'")
		.bind(userId)
		.first();
	if (!row) return false;
	if (row.current_period_end && row.current_period_end < Date.now()) return false;
	return true;
}

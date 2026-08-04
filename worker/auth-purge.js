// D-031 Phase 1 — daily purge cron. Runs on a Cron Trigger (see wrangler-auth-purge.toml),
// not as a Cloudflare Pages Function — Pages doesn't expose a scheduled() handler the way
// a standalone Worker does, so this follows the same sibling-Worker pattern already used
// by worker/bdl-proxy.js and worker/broadcast-blurb.js rather than inventing a new one.
//
// Scope per Relay's data-schema review-status note (docs/auth-data-schema.md, 2026-08-02):
// expired sessions AND audit_log rows older than 90 days, in the SAME daily cron — the
// original spec only purged sessions; the 90-day audit_log retention promise in Folio's
// legal checklist had no mechanism behind it until that review pass, and this is that
// mechanism.
const AUDIT_LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(purge(env));
	},

	// Manual trigger for local testing (`wrangler dev` then hit this Worker's URL) —
	// scheduled() can't be invoked directly from a browser during development.
	async fetch(request, env) {
		if (new URL(request.url).pathname !== '/__run') {
			return new Response('not found', { status: 404 });
		}
		const result = await purge(env);
		return Response.json(result);
	},
};

async function purge(env) {
	const nowIso = new Date().toISOString();
	const auditCutoffMs = Date.now() - AUDIT_LOG_RETENTION_MS;

	const [sessionResult, auditResult] = await Promise.all([
		env.USER_DB.prepare('DELETE FROM session WHERE expiresAt < ?').bind(nowIso).run(),
		env.USER_DB.prepare('DELETE FROM audit_log WHERE created_at < ?').bind(auditCutoffMs).run(),
	]);

	return {
		ranAt: nowIso,
		sessionsDeleted: sessionResult.meta?.changes ?? null,
		auditLogRowsDeleted: auditResult.meta?.changes ?? null,
	};
}

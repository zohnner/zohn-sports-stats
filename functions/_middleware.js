import paths from './_private-paths.cjs';

export async function onRequest({ request, next, env }) {
    if (!paths.isPrivatePath(new URL(request.url).pathname)) return next();
    let body = 'Not found';
    let type = 'text/plain; charset=utf-8';
    try {
        const page = await env.ASSETS.fetch(new URL('/404', request.url));
        if (page.ok) { body = await page.text(); type = 'text/html; charset=utf-8'; }
    } catch { /* plain-text 404 is fine */ }
    return new Response(body, {
        status: 404,
        headers: { 'Content-Type': type, 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' },
    });
}

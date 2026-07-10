// ============================================================
// Shared cross-sport detail frame (D-044 P1)
// One source of truth for the player/team detail header + section
// chrome so MLB / NFL / NCAAF stay in visual parity. Sports differ
// only in the config passed in (stats, chips, meta, charts) — the
// frame itself never forks. Uses the existing .player-detail-* /
// .player-hero / .stats-card classes (main.css + components.css).
//
// Escaping contract: the builder escapes plain VALUES it is given
// (name, initials, back label, chip text, action label/title).
// Fields documented as "raw HTML" (meta lines, teamRow, slots,
// section body/hdrExtra, action.html, chip.html, avatar headshot)
// are injected as-is — the caller is responsible for escaping those.
// ============================================================

// cfg = {
//   back:    { view, label } | null,
//   actions: [ { html } | { label, onclick, title } ],
//   avatar:  { headshotHtml, initials, accent, className },
//   name:    'Full Name',
//   chips:   [ { html } | { text, style } ],
//   teamRow: '<raw html>' | null,
//   meta:    [ '<raw html>' ],
//   slots:   [ '<raw html>' ],   // e.g. '<div id="mlb-bio-strip"></div>'
// }
function detailHeader(cfg) {
    cfg = cfg || {};
    const esc = (typeof _escHtml === 'function') ? _escHtml : (s => String(s == null ? '' : s));

    const backBtn = cfg.back
        ? `<button onclick="navigateTo('${cfg.back.view}')" class="back-button">← ${esc(cfg.back.label)}</button>`
        : '<span></span>';

    const actions = (cfg.actions || []).map(a =>
        a.html != null ? a.html
            : `<button class="share-btn"${a.onclick ? ` onclick="${a.onclick}"` : ''}${a.title ? ` title="${esc(a.title)}"` : ''}>${esc(a.label)}</button>`
    ).join('');

    const av = cfg.avatar || {};
    const avatar = `<div class="player-detail-avatar${av.className ? ' ' + av.className : ''}"${av.accent ? ` style="--pc:${av.accent}"` : ''}>` +
        `${av.headshotHtml || ''}<span class="avatar-text">${esc(av.initials || '')}</span></div>`;

    const chips = (cfg.chips || []).map(c =>
        c.html != null ? c.html
            : `<span class="player-hero-pos"${c.style ? ` style="${c.style}"` : ''}>${esc(c.text)}</span>`
    ).join('');

    const teamRow = cfg.teamRow ? `<div class="player-hero-teamrow">${cfg.teamRow}</div>` : '';
    const meta    = (cfg.meta || []).map(m => `<p class="player-detail-meta">${m}</p>`).join('');
    const slots   = (cfg.slots || []).join('');

    return `<div class="player-detail-header">
        <div class="detail-header-bar">
            ${backBtn}
            <div class="player-hero-actions">${actions}</div>
        </div>
        <div class="player-hero">
            ${avatar}
            <div class="player-hero-info">
                <div class="player-hero-top">
                    <h1 class="player-detail-name">${esc(cfg.name || '')}</h1>
                    ${chips}
                </div>
                ${teamRow}
                ${meta}
                ${slots}
            </div>
        </div>
    </div>`;
}

// s = { title, body(raw html), id?, className?, hdrExtra(raw html)? }
function detailSection(s) {
    s = s || {};
    const esc = (typeof _escHtml === 'function') ? _escHtml : (x => String(x == null ? '' : x));
    const hdr = s.hdrExtra
        ? `<div class="detail-section-hdr"><h2 class="detail-section-title">${esc(s.title)}</h2>${s.hdrExtra}</div>`
        : `<h2 class="detail-section-title">${esc(s.title)}</h2>`;
    return `<div class="stats-card${s.className ? ' ' + s.className : ''}"${s.id ? ` id="${s.id}"` : ''}>${hdr}${s.body || ''}</div>`;
}

if (typeof window !== 'undefined') {
    window.detailHeader = detailHeader;
    window.detailSection = detailSection;
}

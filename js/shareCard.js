// ============================================================
// SportStrata — Shareable Stat Cards (P3-027, R5 Phase 1)
// "Share this stat" on leaderboard rows → branded 1200×630 PNG.
// Reuses _scLoadHtml2Canvas() from scorecard.js (loads earlier in chain).
// Card colors are fixed hex by design — an export artifact must look
// identical regardless of the viewer's active theme (Kael, P3-027).
// ============================================================

const _SHC_BG      = '#0b1526';
const _SHC_SURFACE = '#0e1c33';
const _SHC_BORDER  = '#2a3850';
const _SHC_TEXT    = '#f0f4fa';
const _SHC_MUTED   = '#7fa5c8';
const _SHC_SUBTLE  = '#556d8f';
const _SHC_ACCENT  = '#ff8100';
const _SHC_ACCENT2 = '#ffd200';
const _SHC_GOLD    = '#facc15';

function _shcPreloadImage(url) {
    return new Promise(resolve => {
        if (!url) return resolve(false);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

function _shcBuildCard(d, withPhoto) {
    const colors   = getMLBTeamColors(d.teamAbbr);
    const initials = _escHtml((d.playerName || '').split(' ').map(w => w[0] || '').slice(0, 2).join(''));
    const name     = _escHtml(d.playerName || '');
    const teamLine = _escHtml(d.teamAbbr + (d.position ? ' · ' + d.position : ''));
    const badgeBg  = (d.rank && d.rank <= 3) ? _SHC_GOLD : _SHC_ACCENT;
    const updated  = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const avatar = withPhoto && d.headshotUrl
        ? `<img src="${d.headshotUrl}" crossorigin="anonymous" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : `<span style="font-size:42px;font-weight:600;color:${_SHC_ACCENT2}">${initials}</span>`;

    const card = document.createElement('div');
    card.className = 'shc-card';
    card.innerHTML = `
        <div class="shc-wash" style="background:${colors.primary}"></div>
        <div class="shc-body">
            <div class="shc-left">
                <div class="shc-avatar" style="border-color:${_SHC_ACCENT};background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">${avatar}</div>
                <div class="shc-id">
                    <div class="shc-name" style="color:${_SHC_TEXT}">${name}</div>
                    <div class="shc-team" style="color:${_SHC_MUTED}">${teamLine}</div>
                </div>
            </div>
            <div class="shc-right">
                ${d.rank ? `<span class="shc-rank" style="background:${badgeBg};color:${_SHC_BG}">#${d.rank} IN MLB</span>` : ''}
                <div class="shc-value" style="color:${_SHC_TEXT}">${_escHtml(String(d.statValue))}</div>
                <div class="shc-label" style="color:${_SHC_ACCENT2}">${_escHtml(d.statLabel)}</div>
                <div class="shc-meta" style="color:${_SHC_SUBTLE}">${MLB_SEASON} season · updated ${updated}</div>
            </div>
        </div>
        <div class="shc-footer" style="background:${_SHC_SURFACE};border-color:${_SHC_BORDER}">
            <span class="shc-wordmark" style="color:${_SHC_TEXT}">SPORT<span style="color:${_SHC_ACCENT}">STRATA</span></span>
            <span class="shc-domain" style="color:${_SHC_MUTED}">${typeof SITE_DOMAIN !== 'undefined' ? SITE_DOMAIN : location.hostname}</span>
        </div>`;
    return card;
}

async function _shcRenderBlob(d) {
    await _scLoadHtml2Canvas();
    const withPhoto = await _shcPreloadImage(d.headshotUrl);

    const stage = document.createElement('div');
    stage.className = 'shc-stage';
    stage.appendChild(_shcBuildCard(d, withPhoto));
    document.body.appendChild(stage);

    try {
        const canvas = await window.html2canvas(stage.firstElementChild, {
            useCORS: true,
            scale: 2,
            backgroundColor: _SHC_BG,
            logging: false,
        });
        return await new Promise((resolve, reject) =>
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png'));
    } finally {
        stage.remove();
    }
}

function _shcToast(msg) {
    document.querySelector('.shc-toast')?.remove();
    const t = document.createElement('div');
    t.className = 'shc-toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
}

function _shcFileName(d) {
    const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${slug(d.playerName)}-${slug(d.statLabel)}-sportstrata.png`;
}

async function shareStatCard(d) {
    const btn = d.btn;
    if (btn?.dataset.busy) return;
    const restore = btn ? btn.innerHTML : '';
    if (btn) { btn.dataset.busy = '1'; btn.disabled = true; btn.innerHTML = '<span class="shc-spin" aria-hidden="true"></span>'; }

    try {
        const blob = await Logger.time('shareStatCard', () => _shcRenderBlob(d), 'MLB');
        const file = new File([blob], _shcFileName(d), { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: `${d.playerName} — ${d.statLabel}`,
                    text:  `${d.playerName}: ${d.statValue} ${d.statLabel}${d.rank ? ` (#${d.rank} in MLB)` : ''} — via ${typeof SITE_DOMAIN !== 'undefined' ? SITE_DOMAIN : location.hostname}`,
                });
            } catch (err) {
                if (err?.name !== 'AbortError') throw err;
            }
        } else {
            const url  = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = _shcFileName(d);
            link.href = url;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            _shcToast('Card saved');
        }
        if (btn) btn.innerHTML = '<span class="shc-done" aria-hidden="true">✓</span>';
    } catch (err) {
        Logger.warn('Stat card generation failed', err, 'MLB');
        _shcToast('Couldn’t generate card — try again');
        if (btn) btn.innerHTML = restore;
    } finally {
        if (btn) {
            btn.disabled = false;
            delete btn.dataset.busy;
            setTimeout(() => { if (btn.querySelector('.shc-done')) btn.innerHTML = restore; }, 1600);
        }
    }
}

if (typeof window !== 'undefined') {
    window.shareStatCard = shareStatCard;
}

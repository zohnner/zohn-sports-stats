// ============================================================
// NFL live field viewer — drawn in real pixels (1 SVG unit = 1 CSS px).
// The D-148 renderer drew in a fixed 1000x400 viewBox stretched with
// preserveAspectRatio="none"; the trapezoid constants below are that
// shape expressed as fractions of the box, so every point lands exactly
// where it did, but logos and painted text are no longer stretched.
// ============================================================
const FieldViewer = (() => {
    const BOTTOM_Y = 378 / 400, TOP_Y = 150 / 400;
    const BOTTOM_HALF_W = 486 / 1000, TOP_HALF_W = 284 / 1000;
    const FIELD_WIDTH_YDS = 160 / 3;
    const MIDFIELD_YARDS = 12;
    // Glyph cells are laid out at font-size GLYPH_REF, then scaled; ADV/CAP
    // are the display font's approximate caps advance and cap height there.
    const GLYPH_REF = 100, GLYPH_ADV = 55, GLYPH_CAP = 70;
    const EZ_TEXT_Y0 = 0.1, EZ_TEXT_Y1 = 0.9, EZ_LETTER_YDS = 6;
    const GLIDE_MIN_MS = 220, GLIDE_MAX_MS = 640, GLIDE_REF_PX = 400;

    function geometry(w, h) {
        const cx = w / 2;
        const halfW = (yF) => (BOTTOM_HALF_W + (TOP_HALF_W - BOTTOM_HALF_W) * yF) * w;
        const yAt = (yF) => (BOTTOM_Y + (TOP_Y - BOTTOM_Y) * yF) * h;
        const proj = (xF, yF) => {
            const hw = halfW(yF);
            return { x: cx - hw + ((xF + 10) / 120) * hw * 2, y: yAt(yF) };
        };
        return {
            w, h, cx,
            unit: Math.sqrt((w / 1000) * (h / 400)),
            bottomY: yAt(0), topY: yAt(1),
            proj,
            scaleAt: (yF) => halfW(yF) / halfW(0),
            lengthPxPerYard: (yF) => (halfW(yF) * 2) / 120,
            depthPxPerYard: ((BOTTOM_Y - TOP_Y) * h) / FIELD_WIDTH_YDS,
        };
    }

    // Any yard line is the reference line at x = cx, slid by tx and slanted by
    // skewX -- so a CSS transition on transform glides it exactly, end to end.
    function lineTransform(g, xF) {
        const b = g.proj(xF, 0), t = g.proj(xF, 1);
        const k = (t.x - b.x) / (t.y - b.y);
        return { tx: b.x - g.cx - k * b.y, skewDeg: Math.atan(k) * 180 / Math.PI, bottomX: b.x };
    }
    const lineCss = (t) => `translate(${t.tx.toFixed(2)}px,0px) skewX(${t.skewDeg.toFixed(4)}deg)`;

    function glideMs(px) {
        const t = Math.min(1, Math.abs(px) / GLIDE_REF_PX);
        return Math.round(GLIDE_MIN_MS + (GLIDE_MAX_MS - GLIDE_MIN_MS) * t);
    }

    // Lettering runs sideline to sideline with letter tops toward the end
    // line: the left end zone reads near->far, the right far->near. Each glyph
    // gets an affine matrix, not rotate+scale: its width follows the slanted
    // reading line while its height stays along the field length (horizontal
    // on screen) -- paint lying on the turf, which never leans out of the
    // end zone however steep the slant gets on wide fields.
    function layoutEndzoneText(g, text, side) {
        const chars = Array.from(String(text || '').toUpperCase());
        if (!chars.length) return [];
        const xF = side === 'left' ? -5 : 105;
        const dir = side === 'left' ? 1 : -1;
        const step = (EZ_TEXT_Y1 - EZ_TEXT_Y0) / chars.length;
        const out = [];
        chars.forEach((ch, i) => {
            if (ch === ' ') return;
            const yF = side === 'left' ? EZ_TEXT_Y0 + (i + 0.5) * step : EZ_TEXT_Y1 - (i + 0.5) * step;
            const c = g.proj(xF, yF);
            const a = g.proj(xF, yF - (step / 2) * dir), b = g.proj(xF, yF + (step / 2) * dir);
            const cellPx = Math.hypot(b.x - a.x, b.y - a.y);
            const wS = (cellPx * 0.82) / GLYPH_ADV;
            const hS = (EZ_LETTER_YDS * g.lengthPxPerYard(yF)) / GLYPH_CAP;
            const ux = (b.x - a.x) / cellPx, uy = (b.y - a.y) / cellPx;
            out.push({
                ch, x: c.x, y: c.y,
                angle: Math.atan2(uy, ux) * 180 / Math.PI,
                m: [ux * wS, uy * wS, dir * hS, 0],
            });
        });
        return out;
    }

    // Square of MIDFIELD_YARDS along the field length, squashed vertically by
    // the projection's depth/length ratio -- paint on the ground, not a sticker.
    function midfieldPlacement(g) {
        const c = g.proj(50, 0.5);
        return { x: c.x, y: c.y, size: MIDFIELD_YARDS * g.lengthPxPerYard(0.5), squash: g.depthPxPerYard / g.lengthPxPerYard(0.5) };
    }

    function resolveField({ index, venueId, homeAbbr, eventId, neutralSite }) {
        if (neutralSite) {
            const p = index && index.neutral && index.neutral[String(eventId)];
            return p ? { source: 'neutral-researched', profile: p } : { source: 'neutral-generated', profile: null };
        }
        const p = index && index.teams && index.teams[`${venueId}--${homeAbbr}`];
        return p ? { source: 'team', profile: p } : { source: 'generated', profile: null };
    }

    // Built only from facts true of any team's field (its colors, names, logo),
    // so it never claims stadium-specific paint.
    function generatedProfile({ homeLocation, homeName, homeColor, neutral }) {
        const ez = (text) => ({ fill: homeColor || '#3a3f47', text: String(text || '').toUpperCase(), textColor: '#ffffff' });
        return {
            generated: true,
            surface: 'natural',
            mow: neutral ? 'none' : 'stripes-5',
            endzones: { left: ez(homeLocation), right: ez(homeName) },
            midfield: neutral ? 'none' : 'primary-logo',
            border: '#2a2f37',
            signature: [],
        };
    }

    const TURF = {
        natural:    { base: '#1a5c2c', light: '#1f6f37', dark: '#184f26' },
        hybrid:     { base: '#1a5c2c', light: '#1f6f37', dark: '#184f26' },
        artificial: { base: '#1b6331', light: '#22723b', dark: '#1d6634' },
    };
    const f1 = (n) => n.toFixed(1);
    const pts = (list) => list.map(p => `${f1(p.x)},${f1(p.y)}`).join(' ');
    const quad = (g, x0, x1, y0, y1) => pts([g.proj(x0, y0), g.proj(x1, y0), g.proj(x1, y1), g.proj(x0, y1)]);
    const line = (a, b, stroke, w) => `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${stroke}" stroke-width="${w.toFixed(2)}"/>`;

    function mowBands(mow) {
        if (mow === 'none') return [];
        const step = mow === 'stripes-10' ? 10 : 5, rows = mow === 'checker' ? 4 : 1;
        const bands = [];
        for (let x0 = 0, i = 0; x0 < 100; x0 += step, i++) {
            for (let r = 0; r < rows; r++) bands.push({ x0, x1: x0 + step, y0: r / rows, y1: (r + 1) / rows, dark: (i + r) % 2 === 0 });
        }
        return bands;
    }

    function endzoneSvg(g, ez, side, clipId, hatchId) {
        const [x0, x1] = side === 'left' ? [-10, 0] : [100, 110];
        const glyphs = layoutEndzoneText(g, ez.text, side).map(t =>
            `<text class="fv-ez-glyph" font-size="${GLYPH_REF}" text-anchor="middle" dominant-baseline="central" transform="matrix(${t.m.map(v => v.toFixed(4)).join(',')},${f1(t.x)},${f1(t.y)})">${_escHtml(t.ch)}</text>`).join('');
        return `<polygon points="${quad(g, x0, x1, 0, 1)}" fill="${_escHtml(ez.fill)}"/>`
            + `<rect width="${g.w}" height="${g.h}" fill="url(#${hatchId})" clip-path="url(#${clipId})"/>`
            + `<g class="fv-ez-text" fill="${_escHtml(ez.textColor)}">${glyphs}</g>`;
    }

    function midfieldSvg(g, profile, opts) {
        const href = profile.midfield === 'primary-logo' ? opts.homeLogo
            : (profile.midfield === 'alt-logo' || profile.midfield === 'wordmark') ? profile.midfieldImage : '';
        if (!href) return '';
        const m = midfieldPlacement(g);
        return `<g transform="translate(${f1(m.x)},${f1(m.y)}) scale(1,${m.squash.toFixed(4)})"><image class="fv-midfield" href="${_escHtml(href)}" x="${f1(-m.size / 2)}" y="${f1(-m.size / 2)}" width="${f1(m.size)}" height="${f1(m.size)}" preserveAspectRatio="xMidYMid meet"/></g>`;
    }

    function linesSvg(g) {
        const u = g.unit;
        let s = '';
        [0, 1].forEach(yF => { s += line(g.proj(-10, yF), g.proj(110, yF), 'rgba(255,255,255,0.85)', 3 * u); });
        for (let x = 0; x <= 100; x += 10) {
            const goal = x === 0 || x === 100;
            s += line(g.proj(x, 0), g.proj(x, 1), `rgba(255,255,255,${goal ? 0.85 : 0.45})`, (goal ? 3 : 1.6) * u);
        }
        // Real hash marks sit 70'9" apart on a 160'-wide field: 27.9% in from each sideline.
        for (let x = 5; x < 100; x += 10) {
            [0.28, 0.72].forEach(yF => {
                const c = g.proj(x, yF), k = g.scaleAt(yF) * u;
                s += line({ x: c.x - 5 * k, y: c.y }, { x: c.x + 5 * k, y: c.y }, 'rgba(255,255,255,0.4)', 2 * k);
            });
        }
        return s;
    }

    // The 50 is equidistant from both goals, so it gets no direction chevron.
    function numbersSvg(g) {
        const ty = g.h / 400;
        let s = '';
        for (let x = 10; x <= 90; x += 10) {
            const num = x <= 50 ? x : 100 - x;
            const dir = x === 50 ? 0 : (x < 50 ? -1 : 1);
            [{ yF: 0.1, size: 34 }, { yF: 0.9, size: 18 }].forEach(({ yF, size }) => {
                const p = g.proj(x, yF), fs = size * ty;
                s += `<text class="fv-yardnum" x="${f1(p.x)}" y="${f1(p.y)}" font-size="${f1(fs)}" text-anchor="middle" dominant-baseline="middle">${num}</text>`;
                if (!dir) return;
                const cx = p.x + dir * 0.75 * fs, cw = 0.18 * fs, ch = 0.24 * fs;
                s += `<polygon points="${f1(cx + dir * cw)},${f1(p.y)} ${f1(cx - dir * cw)},${f1(p.y - ch)} ${f1(cx - dir * cw)},${f1(p.y + ch)}" fill="rgba(255,255,255,0.55)"/>`;
            });
        }
        return s;
    }

    function pylonsSvg(g) {
        const u = g.unit;
        return [0, -10, 100, 110].map(xF => [0, 1].map(yF => {
            const b = g.proj(xF, yF), k = g.scaleAt(yF) * u, h = 14 * k, w = 5 * k;
            return `<polygon points="${f1(b.x - w)},${f1(b.y)} ${f1(b.x + w)},${f1(b.y)} ${f1(b.x)},${f1(b.y - h)}" fill="var(--accent)" stroke="rgba(0,0,0,0.35)" stroke-width="${(0.6 * u).toFixed(2)}"/>`;
        }).join('')).join('');
    }

    // The crossbar follows the back line's projected slope (it is parallel to
    // the end line in real life); uprights and the post rise straight up.
    function goalpostSvg(g, xF) {
        const p0 = g.proj(xF, 0), p1 = g.proj(xF, 1);
        const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
        const ux = (p1.x - p0.x) / len, uy = (p1.y - p0.y) / len;
        const base = g.proj(xF, 0.5), k = g.scaleAt(0.5), ty = g.h / 400, u = g.unit;
        const postH = 105 * k * ty, crossW = 62 * k * u, uprightH = 70 * k * ty;
        const cC = { x: base.x, y: base.y - postH };
        const cL = { x: cC.x - ux * crossW / 2, y: cC.y - uy * crossW / 2 };
        const cR = { x: cC.x + ux * crossW / 2, y: cC.y + uy * crossW / 2 };
        const seg = (a, b) => `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}"/>`;
        return `<g stroke="#ffd21f" stroke-width="${(4 * k * u).toFixed(2)}" fill="none" stroke-linecap="round">`
            + seg(base, cC) + seg(cL, cR) + seg(cL, { x: cL.x, y: cL.y - uprightH }) + seg(cR, { x: cR.x, y: cR.y - uprightH }) + '</g>';
    }

    function ballSvg(sheenId) {
        return `<g class="fv-dyn" data-fv="ball">`
            + `<ellipse data-fv="ball-fill" cx="0" cy="0" rx="17" ry="10.5" stroke="var(--bg-card)" stroke-width="2"/>`
            + `<ellipse cx="0" cy="0" rx="17" ry="10.5" fill="url(#${sheenId})"/>`
            + `<path d="M-11,0 Q0,-8 11,0" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.9"/>`
            + `<path d="M-11,0 Q0,8 11,0" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.9"/>`
            + `<line x1="-3.5" y1="0" x2="3.5" y2="0" stroke="#fff" stroke-width="1.1" stroke-opacity="0.9"/>`
            + [-1.5, 0, 1.5].map(x => `<line x1="${x}" y1="-2" x2="${x}" y2="2" stroke="#fff" stroke-width="0.8" stroke-opacity="0.9"/>`).join('')
            + `</g>`;
    }

    function buildStaticSvg(g, profile, opts) {
        const id = (s) => `${opts.idp}${s}`;
        const u = g.unit;
        const turf = TURF[profile.surface] || TURF.natural;
        const refLine = (key, stroke, w) => `<g class="fv-dyn" data-fv="${key}"><line${key === 'fd' ? ' data-fv="fd-line"' : ''} x1="${f1(g.cx)}" y1="${f1(g.bottomY)}" x2="${f1(g.cx)}" y2="${f1(g.topY)}" stroke="${stroke}" stroke-width="${(w * u).toFixed(2)}"/></g>`;
        const badge = opts.awayLogo ? (() => {
            const p = g.proj(-5, 1), size = Math.max(16, 22 * u);
            return `<image class="fv-away-badge" href="${_escHtml(opts.awayLogo)}" x="${f1(p.x - size / 2)}" y="${f1(p.y - size - 4 * u)}" width="${f1(size)}" height="${f1(size)}" preserveAspectRatio="xMidYMid meet"/>`;
        })() : '';
        return `<defs>`
            + `<pattern id="${id('hatch')}" width="${f1(14 * u)}" height="${f1(14 * u)}" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="${f1(7 * u)}" height="${f1(14 * u)}" fill="rgba(255,255,255,0.09)"/></pattern>`
            + `<clipPath id="${id('ezL')}"><polygon points="${quad(g, -10, 0, 0, 1)}"/></clipPath>`
            + `<clipPath id="${id('ezR')}"><polygon points="${quad(g, 100, 110, 0, 1)}"/></clipPath>`
            + `<clipPath id="${id('rz')}"><polygon data-fv="rz-clip" points=""/></clipPath>`
            + `<linearGradient id="${id('sheen')}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fff" stop-opacity="0.4"/><stop offset="45%" stop-color="#fff" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.28"/></linearGradient>`
            + `<marker id="${id('arrow')}" markerUnits="userSpaceOnUse" markerWidth="${f1(14 * u)}" markerHeight="${f1(14 * u)}" refX="${f1(10.5 * u)}" refY="${f1(7 * u)}" orient="auto"><path d="M0,0 L${f1(14 * u)},${f1(7 * u)} L0,${f1(14 * u)} Z" class="fv-arrow-head"/></marker>`
            + `</defs>`
            + `<polygon points="${quad(g, -11, 111, -0.05, 1.05)}" fill="${_escHtml(profile.border)}"/>`
            + `<polygon points="${quad(g, -10, 110, 0, 1)}" fill="${turf.base}"/>`
            + mowBands(profile.mow).map(b => `<polygon data-fv-band points="${quad(g, b.x0, b.x1, b.y0, b.y1)}" fill="${b.dark ? turf.dark : turf.light}"/>`).join('')
            + endzoneSvg(g, profile.endzones.left, 'left', id('ezL'), id('hatch'))
            + endzoneSvg(g, profile.endzones.right, 'right', id('ezR'), id('hatch'))
            + midfieldSvg(g, profile, opts)
            + `<g data-fv="rz"></g>`
            + linesSvg(g) + numbersSvg(g)
            + refLine('fd', 'var(--color-first-down)', 3.5)
            + refLine('scrim', 'var(--color-scrimmage)', 3)
            + `<g data-fv="arrow"></g>`
            + pylonsSvg(g) + goalpostSvg(g, -10) + goalpostSvg(g, 110)
            + ballSvg(id('sheen'))
            + badge;
    }

    // yardLine is anchored to the HOME goal (0 = home goal, 100 = away goal);
    // display space mirrors it so the away goal sits on the left, matching the
    // score header's away-left/home-right order.
    function dynamicState(g, sit, homeTeamId) {
        const possHome = String(sit.possession) === String(homeTeamId);
        const disp = (v) => 100 - v;
        const fd = possHome ? Math.min(100, sit.yardLine + (sit.distance || 0)) : Math.max(0, sit.yardLine - (sit.distance || 0));
        const ball = g.proj(disp(sit.yardLine), 0.5);
        const rz = sit.isRedZone ? (possHome ? [disp(100), disp(80)] : [disp(20), disp(0)]) : null;
        return {
            possHome,
            scrim: lineTransform(g, disp(sit.yardLine)),
            firstDown: lineTransform(g, disp(fd)),
            ball: { x: ball.x, y: ball.y, scale: g.scaleAt(0.5) * g.unit },
            redZone: rz ? [g.proj(rz[0], 0), g.proj(rz[1], 0), g.proj(rz[1], 1), g.proj(rz[0], 1)] : null,
            isDown4: sit.down === 4,
        };
    }

    function arrowSvg(g, sit, isNew, markerId) {
        const lp = sit.lastPlay;
        if (!lp || !lp.type || typeof lp.start?.yardLine !== 'number' || typeof lp.end?.yardLine !== 'number') return '';
        const label = (lp.type.text || '').toLowerCase();
        if (/timeout|two-minute|end of|coin toss|kneel|spike|penalty/.test(label)) return '';
        const cls = 'fv-arrow' + (isNew ? ' fv-arrow--entering' : '');
        const p1 = g.proj(100 - lp.start.yardLine, 0.5), p2 = g.proj(100 - lp.end.yardLine, 0.5);
        const u = g.unit, ty = g.h / 400;
        if (/incomplet/.test(label)) {
            const r = 4.2 * u;
            return `<g class="${cls}" transform="translate(${f1(p1.x)},${f1(p1.y)})"><circle r="${f1(9 * u)}" class="fv-arrow-badge-ring"/><path d="M${f1(-r)},${f1(-r)} L${f1(r)},${f1(r)} M${f1(-r)},${f1(r)} L${f1(r)},${f1(-r)}" class="fv-arrow-badge-x"/></g>`;
        }
        let kind = 'run', apex = 0;
        if (/sack/.test(label)) kind = 'sack';
        else if (/interception|fumble/.test(label)) kind = 'turnover';
        else if (/punt|kickoff/.test(label)) { kind = 'kick'; apex = 70; }
        else if (/field goal|extra point/.test(label)) { kind = 'kick'; apex = 40; }
        else if (/pass/.test(label)) { kind = 'pass'; apex = 26; }
        const d = apex === 0
            ? `M${f1(p1.x)},${f1(p1.y)} L${f1(p2.x)},${f1(p2.y)}`
            : `M${f1(p1.x)},${f1(p1.y)} Q${f1((p1.x + p2.x) / 2)},${f1(p1.y - apex * ty)} ${f1(p2.x)},${f1(p2.y)}`;
        return `<g class="${cls} fv-arrow--${kind}"><path d="${d}" class="fv-arrow-path" marker-end="url(#${markerId})"/></g>`;
    }

    return { GLYPH_REF, MIDFIELD_YARDS, geometry, lineTransform, lineCss, glideMs, layoutEndzoneText, midfieldPlacement, resolveField, generatedProfile, buildStaticSvg, dynamicState, arrowSvg };
})();
window.FieldViewer = FieldViewer;

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

    return { GLYPH_REF, MIDFIELD_YARDS, geometry, lineTransform, lineCss, glideMs, layoutEndzoneText, midfieldPlacement };
})();
window.FieldViewer = FieldViewer;

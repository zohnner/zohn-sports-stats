// ============================================================
// _buildPillControl — the season / min-GP / position pill row MLB Leaderboards
// (js/mlb.js displayMLBLeaderboards) builds its filters from. The rest of this
// file was the pre-D-161 NBA Leaderboards page, unreachable since D-161 and
// removed in D-212 part 3.
// ============================================================
function _buildPillControl(labelText, options, current, onSelect) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;padding:0.05rem 0 0.2rem;';

    const lbl = document.createElement('span');
    lbl.textContent = labelText;
    lbl.style.cssText = 'font-size:var(--text-xs);font-weight:700;color:var(--text-subtle);letter-spacing:0.4px;margin-right:0.1rem;white-space:nowrap;flex-shrink:0;';
    wrap.appendChild(lbl);

    options.forEach(opt => {
        const val   = (typeof opt === 'object') ? opt.value : opt;
        const text  = (typeof opt === 'object') ? opt.label : (val === 0 ? 'All' : `${val} GP`);
        const active = val === current || String(val) === String(current);
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            padding:0.2rem 0.55rem;border-radius:var(--radius);cursor:pointer;font-weight:600;
            font-size:var(--text-xs);font-family:inherit;transition:all 0.18s;
            border:1px solid ${active ? 'var(--color-chip-border)' : 'var(--border-default)'};
            background:${active ? 'var(--color-chip-bg)' : 'transparent'};
            color:${active ? 'var(--color-chip)' : 'var(--text-subtle)'};
        `;
        btn.addEventListener('click', () => onSelect(val));
        wrap.appendChild(btn);
    });

    return wrap;
}

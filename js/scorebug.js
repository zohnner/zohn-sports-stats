// js/scorebug.js — D-047 S2. One scorebug anatomy for every sport (the cohesion centerpiece).
//
// Sport-agnostic model (normalize once per sport, render everywhere):
//   { sport, key, id, status:'upcoming'|'live'|'final', pillCls, pillLabel,
//     hasScore, away:{abbr,name,score,logo,color,winner}, home:{...},
//     liveHtml, matchHtml, ariaExtra }
// Builders own brand invariants (D-047): state language (pill class + LIVE pulse),
// numeric voice (scores in the mono .*-score classes), team-color edge, logo slot.
// Sport-specific live payloads (MLB inning/outs/bases; football down-and-distance)
// bake into `liveHtml`/`matchHtml` by that sport's normalizer, so the builders stay
// identical across sports. Consumers migrate to these one at a time (S2).

(function (global) {
    'use strict';
    const esc = s => (typeof _escHtml === 'function') ? _escHtml(s) : String(s == null ? '' : s);
    const lastName = n => n ? String(n).split(' ').slice(-1)[0] : 'TBD';

    // ── MLB live-state fragments (brand invariant: identical vocabulary everywhere) ──
    function mlbInningTag(ls) {
        if (!ls || !ls.currentInning) return null;
        const n = ls.currentInning, s = ls.inningState || '';
        if (/middle/i.test(s)) return `MID ${n}`;
        if (/end/i.test(s)) return `END ${n}`;
        return `${ls.isTopInning ? '▲' : '▼'}${n}`;
    }
    function baseDiamond(b) {
        const d = (cx, cy, on) =>
            `<polygon class="hgc-base${on ? ' hgc-base--on' : ''}" points="${cx},${cy - 4.2} ${cx + 4.2},${cy} ${cx},${cy + 4.2} ${cx - 4.2},${cy}"/>`;
        return `<svg class="hgc-diamond" width="30" height="20" viewBox="0 0 30 20" aria-hidden="true">`
            + d(15, 6, b.second) + d(8, 12, b.third) + d(22, 12, b.first) + `</svg>`;
    }
    function outsDots(o) {
        return `<span class="hgc-outs" aria-hidden="true">${[0, 1, 2].map(i => `<span class="hgc-out-dot${i < o ? ' hgc-out-dot--on' : ''}"></span>`).join('')}</span>`;
    }

    // ── Normalizer: MLB schedule game → model ──
    function normalizeMLBGame(g) {
        const t = g.teams || {};
        const teamColor = ab => (typeof getMLBTeamColors === 'function' ? getMLBTeamColors(ab).primary : '#7c8df0');
        const teamName = ab => (typeof getMLBTeamColors === 'function' ? (getMLBTeamColors(ab).name || ab) : ab);
        const logoById = id => (typeof getMLBTeamLogoById === 'function' && id) ? getMLBTeamLogoById(id) : '';
        const side = k => {
            const tm = t[k]?.team || {};
            const abbr = tm.abbreviation || '?';
            return { abbr, name: teamName(abbr), score: t[k]?.score, logo: logoById(tm.id), color: teamColor(abbr) };
        };
        const away = side('away'), home = side('home');
        const status = g.status?.detailedState || '', abstract = g.status?.abstractGameState || '';
        const isFinal = abstract === 'Final' || /final|game over|completed/i.test(status);
        const isLive = !isFinal && (abstract === 'Live' || /in progress/i.test(status));
        const st = isLive ? 'live' : isFinal ? 'final' : 'upcoming';
        home.winner = isFinal && (home.score ?? 0) > (away.score ?? 0);
        away.winner = isFinal && (away.score ?? 0) > (home.score ?? 0);
        const hasScore = isFinal || isLive || (home.score ?? 0) > 0 || (away.score ?? 0) > 0;

        const ls = g.linescore || null;
        const inningTag = isLive ? mlbInningTag(ls) : null;
        let pillLabel;
        if (isFinal) pillLabel = 'Final';
        else if (isLive) pillLabel = inningTag || 'Live';
        else if (g.gameDate) {
            const d = new Date(g.gameDate), etH = (d.getUTCHours() - 4 + 24) % 24;
            pillLabel = `${etH % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${etH >= 12 ? 'PM' : 'AM'} ET`;
        } else pillLabel = 'Scheduled';

        const inState = ls?.inningState || '';
        const activeHalf = isLive && /top|bottom/i.test(inState);
        const off = ls?.offense || {};
        const outs = Number.isFinite(ls?.outs) ? ls.outs : 0;
        const balls = Number.isFinite(ls?.balls) ? ls.balls : null;
        const strikes = Number.isFinite(ls?.strikes) ? ls.strikes : null;
        const countHtml = (balls != null && strikes != null) ? `<span class="hgc-count">${balls}-${strikes}</span>` : '';
        const liveHtml = activeHalf
            ? `<div class="hgc-live">${baseDiamond({ first: !!off.first, second: !!off.second, third: !!off.third })}${outsDots(outs)}${countHtml}</div>`
            : '';

        const awayPP = t.away?.probablePitcher?.fullName, homePP = t.home?.probablePitcher?.fullName;
        const pitcherNm = ls?.defense?.pitcher?.fullName, batterNm = ls?.offense?.batter?.fullName;
        const matchHtml = (activeHalf && (pitcherNm || batterNm))
            ? `<div class="hgc-pitchers hgc-pitchers--live">P ${esc(lastName(pitcherNm))} · AB ${esc(lastName(batterNm))}</div>`
            : (!isFinal && !isLive && (awayPP || homePP)
                ? `<div class="hgc-pitchers">${esc(lastName(awayPP))} vs ${esc(lastName(homePP))}</div>` : '');

        return {
            sport: 'mlb', key: `mlb-${g.gamePk}`, id: g.gamePk,
            status: st, pillCls: isFinal ? 'final' : isLive ? 'live' : 'sched', pillLabel,
            hasScore, away, home, liveHtml, matchHtml,
            ariaExtra: activeHalf ? `, ${inningTag || 'live'}, ${outs} out${outs === 1 ? '' : 's'}` : '',
        };
    }

    // ── Normalizer: football (NFL / NCAAF share the same scoreboard shape) → model ──
    // g: { id, isFinal, isLive, clock?, homeTeam:{abbr,name,score,logo,winner,rank?}, awayTeam:{...} }
    function _normalizeFootball(g, sport) {
        const mk = t => ({
            abbr: (t && t.abbr) || '?', name: (t && (t.name || t.abbr)) || '?',
            score: t ? t.score : 0, logo: (t && t.logo) || '', color: '', winner: !!(t && t.winner),
        });
        const isLive = !!g.isLive, isFinal = !g.isLive && !!g.isFinal;
        return {
            sport, key: `${sport}-${g.id}`, id: g.id,
            status: isLive ? 'live' : isFinal ? 'final' : 'upcoming',
            pillCls: isFinal ? 'final' : isLive ? 'live' : 'sched',
            pillLabel: isLive ? (g.clock || 'LIVE') : isFinal ? 'Final' : 'Scheduled',
            hasScore: true,
            home: mk(g.homeTeam), away: mk(g.awayTeam),
            liveHtml: '', matchHtml: '', ariaExtra: '',
        };
    }
    function normalizeNFLGame(g) { return _normalizeFootball(g, 'nfl'); }
    function normalizeNCAAFGame(g) { return _normalizeFootball(g, 'ncaaf'); }

    // ── Builder: grid/landing score card (reproduces the .home-game-card anatomy) ──
    function renderScoreCard(m, opts) {
        opts = opts || {};
        const star = typeof opts.favStar === 'function' ? opts.favStar : () => '';
        const fmt = n => m.hasScore ? (n ?? 0) : '–';
        const row = (s) => `
                <div class="hgc-row">
                    ${s.logo ? `<img class="hgc-team-logo" src="${s.logo}" alt="${esc(s.abbr)}" data-hide-on-error>` : `<span class="hgc-logo-ph"></span>`}
                    <span class="hgc-abbr${s.winner ? ' hgc-abbr--win' : ''}" title="${esc(s.name)}">${esc(s.abbr)}</span>
                    <span class="hgc-score${s.winner ? ' hgc-score--win' : ''}">${fmt(s.score)}</span>
                    ${star(s.abbr)}
                </div>`;
        return `
            <div class="home-game-card${m.status === 'live' ? ' home-game-card--live' : ''}" data-game-key="${m.key}" data-game-status="${m.pillCls}" role="button" tabindex="0"
                 aria-label="${esc(m.away.name)} ${fmt(m.away.score)} at ${esc(m.home.name)} ${fmt(m.home.score)}, ${esc(m.pillLabel)}${esc(m.ariaExtra)}"
                 style="--hgc-team-color:${m.home.color}">
                ${row(m.away)}
                ${row(m.home)}
                ${m.liveHtml}
                ${m.matchHtml}
                <div class="hgc-card-footer">
                    <span class="hgc-pill hgc-pill--${m.pillCls}">${esc(m.pillLabel)}</span>
                </div>
            </div>`;
    }

    // ── Builder: ticker item (reproduces the .ticker__item anatomy) ──
    function renderTickerItem(m) {
        const itemCls = m.status === 'live' ? ' ticker__item--live' : m.status === 'final' ? ' ticker__item--final' : '';
        const pillLbl = m.status === 'final' ? 'F' : m.status === 'live' ? m.pillLabel : 'SCH';
        const scoreCls = w => w && m.status === 'final' ? ' ticker-score--win' : '';
        // MLB click wiring reads data-game-pk; the others read data-game-id (setupTickerClicks).
        const idName = m.sport === 'mlb' ? 'data-game-pk' : 'data-game-id';
        const idAttr = (m.id != null && m.id !== '') ? `${idName}="${esc(m.id)}" ` : '';
        return `
            <div class="ticker__item${itemCls}" ${idAttr}data-sport="${m.sport}" style="cursor:pointer">
                ${m.home.logo ? `<img class="ticker-logo" src="${m.home.logo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="ticker-team">${esc(m.home.abbr)}</span>
                <span class="ticker-score${scoreCls(m.home.winner)}">${m.home.score ?? 0}</span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score${scoreCls(m.away.winner)}">${m.away.score ?? 0}</span>
                <span class="ticker-team">${esc(m.away.abbr)}</span>
                ${m.away.logo ? `<img class="ticker-logo" src="${m.away.logo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="ticker-status-pill ticker-status-pill--${m.pillCls}">${esc(pillLbl)}</span>
            </div>`;
    }

    global.Scorebug = { normalizeMLBGame, normalizeNFLGame, normalizeNCAAFGame, renderScoreCard, renderTickerItem };
})(typeof window !== 'undefined' ? window : globalThis);

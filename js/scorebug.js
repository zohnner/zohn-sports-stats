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
// Basketball (NBA/NCAAB/WNBA) added 2026-09-14, D-161 follow-up -- no live
// spatial payload exists for any of the three (unlike MLB/football), so
// their normalizer leaves liveHtml/matchHtml empty rather than inventing one.

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

    // Start time in Eastern, the convention US broadcasts use. The zone comes
    // from Intl, not a fixed UTC-4: that offset put every November-March start
    // an hour late ("8:00 PM ET" for a 7:00 PM EST tip). A game on another
    // Eastern day carries its weekday. short drops " ET" for the ticker.
    const ET = 'America/New_York';
    function startLabel(dateStr, now, short) {
        const d = new Date(dateStr || NaN);
        if (isNaN(d)) return short ? 'TBD' : 'Scheduled';
        const day = x => x.toLocaleDateString('en-US', { timeZone: ET });
        const time = d.toLocaleTimeString('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' });
        const wd = day(d) === day(new Date(now == null ? Date.now() : now))
            ? '' : d.toLocaleDateString('en-US', { timeZone: ET, weekday: 'short' }) + ' ';
        return wd + time + (short ? '' : ' ET');
    }
    // statsapi files a postponed or canceled game under abstractGameState
    // "Final" (checked 2026-11-17: all 13 from April-May 2026), and NBA's
    // isFinal is ESPN state "post", which a postponement also has. It was
    // never played, so it is not a final.
    const NOT_PLAYED = /postpon|cancel/i;
    // A game that will not start at its listed time says so instead of a time.
    function offScheduleLabel(text) {
        const t = String(text || '');
        if (/postpon/i.test(t)) return 'Postponed';
        if (/cancel/i.test(t)) return 'Canceled';
        if (/suspend/i.test(t)) return 'Suspended';
        if (/delay/i.test(t)) return 'Delayed';
        if (/\bTBD\b|\bTBA\b/i.test(t)) return 'TBD';
        return '';
    }
    function upcomingLabels(dateStr, statusText, tbd) {
        const off = offScheduleLabel(statusText) || (tbd ? 'TBD' : '');
        return off ? { pillLabel: off, startShort: off } : { pillLabel: startLabel(dateStr), startShort: startLabel(dateStr, null, true) };
    }

    // ── Normalizer: MLB schedule game → model ──
    function normalizeMLBGame(g) {
        const t = g.teams || {};
        const teamColor = ab => (typeof getMLBTeamColors === 'function' ? getMLBTeamColors(ab).primary : '#7c8df0');
        const teamName = ab => (typeof getMLBTeamColors === 'function' ? (getMLBTeamColors(ab).name || ab) : ab);
        const logoById = id => (typeof getMLBTeamLogoUrl === 'function' && id) ? getMLBTeamLogoUrl(id) : '';
        const darkSafe = ab => !!(typeof getMLBTeamColors === 'function' && getMLBTeamColors(ab).darkSafe);
        const side = k => {
            const tm = t[k]?.team || {};
            const abbr = tm.abbreviation || '?';
            return { abbr, name: teamName(abbr), score: t[k]?.score, logo: logoById(tm.id), color: teamColor(abbr), darkSafe: darkSafe(abbr) };
        };
        const away = side('away'), home = side('home');
        const status = g.status?.detailedState || '', abstract = g.status?.abstractGameState || '';
        const notPlayed = NOT_PLAYED.test(status);
        const isFinal = !notPlayed && (abstract === 'Final' || /final|game over|completed/i.test(status));
        const isLive = !isFinal && (abstract === 'Live' || /in progress/i.test(status));
        const st = isLive ? 'live' : isFinal ? 'final' : 'upcoming';
        home.winner = isFinal && (home.score ?? 0) > (away.score ?? 0);
        away.winner = isFinal && (away.score ?? 0) > (home.score ?? 0);
        const hasScore = isFinal || isLive;

        const ls = g.linescore || null;
        const inningTag = isLive ? mlbInningTag(ls) : null;
        let pillLabel, startShort = '';
        if (isFinal) pillLabel = 'Final';
        else if (isLive) pillLabel = inningTag || 'Live';
        else ({ pillLabel, startShort } = upcomingLabels(g.gameDate, status, g.status?.startTimeTBD));

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
            status: st, pillCls: isFinal ? 'final' : isLive ? 'live' : 'sched', pillLabel, startShort,
            hasScore, away, home, liveHtml, matchHtml,
            ariaExtra: activeHalf ? `, ${inningTag || 'live'}, ${outs} out${outs === 1 ? '' : 's'}` : '',
        };
    }

    // ESPN's displayClock sits at "0:00" through halftime and every quarter
    // break (live-observed 2026-10-04: seven games at once read "0:00" in the
    // ticker while the Scores cards correctly said "Halftime"). A stopped
    // clock defers to the status text; anything unrecognized says LIVE rather
    // than a 0:00 that reads like the game clock ran out mid-quarter.
    function _footballLivePill(g) {
        if (g.clock && g.clock !== '0:00') return g.clock;
        const st = String(g.statusText || '').trim();
        if (/^half/i.test(st)) return 'HALF';
        const end = st.match(/^end of (\w+)/i);
        if (end) return `END ${end[1].toUpperCase()}`;
        return 'LIVE';
    }

    // ── Normalizer: football (NFL / NCAAF share the same scoreboard shape) → model ──
    // g: { id, date, isFinal, isLive, clock?, statusText?, broadcast?, homeTeam:{abbr,name,score,logo,winner,rank?}, awayTeam:{...} }
    function _normalizeFootball(g, sport) {
        const mk = t => ({
            abbr: (t && t.abbr) || '?', name: (t && (t.name || t.abbr)) || '?',
            score: t ? t.score : 0, logo: (t && t.logo) || '', color: '', winner: !!(t && t.winner),
            rank: (t && t.rank) || null,
        });
        const isLive = !!g.isLive, isFinal = !g.isLive && !!g.isFinal && !NOT_PLAYED.test(g.statusText || '');
        // D-043 3a (Kael): broadcast network is a football-specific need next to
        // kickoff time — MLB's card doesn't carry the equivalent. Muted caption,
        // same slot MLB uses for probable-pitcher text (matchHtml), not a new one.
        const matchHtml = g.broadcast ? `<div class="hgc-pitchers">${esc(g.broadcast)}</div>` : '';
        const up = (isLive || isFinal) ? { startShort: '' } : upcomingLabels(g.date, g.statusText);
        return {
            sport, key: `${sport}-${g.id}`, id: g.id,
            status: isLive ? 'live' : isFinal ? 'final' : 'upcoming',
            pillCls: isFinal ? 'final' : isLive ? 'live' : 'sched',
            pillLabel: isLive ? _footballLivePill(g) : isFinal ? 'Final' : up.pillLabel,
            startShort: up.startShort,
            hasScore: isLive || isFinal,
            home: mk(g.homeTeam), away: mk(g.awayTeam),
            liveHtml: '', matchHtml, ariaExtra: '',
        };
    }
    function normalizeNFLGame(g) { return _normalizeFootball(g, 'nfl'); }
    function normalizeNCAAFGame(g) { return _normalizeFootball(g, 'ncaaf'); }

    // ── Normalizer: basketball (NBA / NCAAB / WNBA share the same scoreboard
    // shape — confirmed live 2026-09-14 by comparing fetchNBAScoreboard/
    // fetchNCAABScoreboard/fetchWNBAScoreboard's own mapping code directly,
    // not assumed from the football precedent) → model.
    // g: { id, date, isFinal, isLive, statusText, homeTeam:{abbr,name,score,logo,winner,rank?}, awayTeam:{...} }
    // Built to close a real, pre-existing gap: the home page's own merged
    // ticker (_updateHomeTicker, js/app.js) only ever normalized MLB/NFL/
    // NCAAF games because no basketball normalizer existed here — NCAAB and
    // WNBA games have never appeared in the home ticker banner, and NBA
    // inherited the same gap when it shipped. This one normalizer, wired
    // into _updateHomeTicker + setupTickerClicks, closes it for all three at
    // once rather than three separate near-duplicate fixes.
    function _normalizeBasketball(g, sport) {
        const mk = t => ({
            abbr: (t && t.abbr) || '?', name: (t && (t.name || t.abbr)) || '?',
            score: t ? t.score : 0, logo: (t && t.logo) || '', color: '', winner: !!(t && t.winner),
            rank: (t && t.rank) || null,
        });
        const isLive = !!g.isLive, isFinal = !g.isLive && !!g.isFinal && !NOT_PLAYED.test(g.statusText || '');
        const up = (isLive || isFinal) ? { startShort: '' } : upcomingLabels(g.date, g.statusText);
        return {
            sport, key: `${sport}-${g.id}`, id: g.id,
            status: isLive ? 'live' : isFinal ? 'final' : 'upcoming',
            pillCls: isFinal ? 'final' : isLive ? 'live' : 'sched',
            // Live, g.statusText is ESPN's own clock/period text ("12:04 - 2nd").
            pillLabel: isLive ? (g.statusText || 'LIVE') : isFinal ? 'Final' : up.pillLabel,
            startShort: up.startShort,
            hasScore: isLive || isFinal,
            home: mk(g.homeTeam), away: mk(g.awayTeam),
            liveHtml: '', matchHtml: '', ariaExtra: '',
        };
    }
    function normalizeNBAGame(g) { return _normalizeBasketball(g, 'nba'); }
    function normalizeNCAABGame(g) { return _normalizeBasketball(g, 'ncaab'); }
    function normalizeWNBAGame(g) { return _normalizeBasketball(g, 'wnba'); }

    // League glyph (D-043 3a, Vera) — a muted inline mark, not a colored badge
    // (border=identity/badge=state discipline stays); lets a mixed "All" tab
    // scan by sport at a glance. Shown on every card, not just the mixed tab —
    // one rendering path, no tab-aware branching in the builder itself.
    // Returns an _ICON key (js/config.js), not a raw emoji character, since
    // the 2026-09-07 emoji-removal pass -- both call sites below already
    // guard with `glyph ? ... : ''`, so returning '' for an unmapped sport
    // is unchanged behavior.
    function _leagueGlyph(sport) {
        if (sport === 'mlb') return 'baseball';
        if (sport === 'nfl' || sport === 'ncaaf') return 'football';
        if (sport === 'nba' || sport === 'ncaab' || sport === 'wnba') return 'basketball';
        return '';
    }

    // ── Builder: grid/landing score card (reproduces the .home-game-card anatomy) ──
    function renderScoreCard(m, opts) {
        opts = opts || {};
        const star = typeof opts.favStar === 'function' ? opts.favStar : () => '';
        const fmt = n => m.hasScore ? (n ?? 0) : '';
        const ariaScore = n => m.hasScore ? ` ${n ?? 0}` : '';
        const ariaRank = s => s.rank ? `No. ${s.rank} ` : '';
        const glyph = _leagueGlyph(m.sport);
        // opts.go: a view to open on click, for grids that have no click wiring of their own.
        const go = opts.go ? esc(opts.go) : '';
        const goAttrs = go ? ` onclick="navigateTo('${go}')" onkeydown="if(event.key==='Enter')navigateTo('${go}')"` : '';
        const row = (s) => `
                <div class="hgc-row">
                    ${s.logo ? `<img class="hgc-team-logo${s.darkSafe ? ' hgc-team-logo--chip' : ''}" src="${esc(s.logo)}" alt="${esc(s.abbr)}" data-hide-on-error>` : `<span class="hgc-logo-ph"></span>`}
                    <span class="hgc-abbr${s.winner ? ' hgc-abbr--win' : ''}" title="${esc(s.name)}">${s.rank ? `<span class="hgc-rank">${esc(s.rank)}</span>` : ''}${esc(s.abbr)}</span>
                    <span class="hgc-score${s.winner ? ' hgc-score--win' : ''}">${fmt(s.score)}</span>
                    ${star(s.abbr)}
                </div>`;
        // Opt-in weather slot (off by default -- every existing call site, Scores
        // page/cross-sport home/Dashboard included, is unaffected unless it
        // explicitly asks for this). NFL/NCAAF-only: those are the two sports
        // with a _fetch{NFL,NCAAF}StadiumWeather table to populate it; the caller
        // is expected to invoke that sport's _inject*GameWeather() against the
        // rendered grid afterward, same wiring the landing pages already use.
        const weatherHtml = (opts.showWeather && (m.sport === 'nfl' || m.sport === 'ncaaf') && m.home.abbr)
            ? `<span class="game-weather" data-${m.sport}-weather-team="${esc(m.home.abbr)}"></span>` : '';
        return `
            <div class="home-game-card${m.status === 'live' ? ' home-game-card--live' : ''}" data-game-key="${esc(m.key)}" data-game-status="${m.pillCls}" role="button" tabindex="0"${goAttrs}
                 aria-label="${ariaRank(m.away)}${esc(m.away.name)}${ariaScore(m.away.score)} at ${ariaRank(m.home)}${esc(m.home.name)}${ariaScore(m.home.score)}, ${esc(m.pillLabel)}${esc(m.ariaExtra)}"
                 style="--hgc-team-color:${esc(m.home.color)}">
                ${row(m.away)}
                ${row(m.home)}
                ${m.liveHtml}
                ${m.matchHtml}
                <div class="hgc-card-footer">
                    ${glyph ? `<span class="hgc-glyph" aria-hidden="true">${_iconSvg(glyph)}</span>` : ''}
                    <span class="hgc-pill hgc-pill--${m.pillCls}">${esc(m.pillLabel)}</span>
                    ${opts.badge || ''}
                    ${weatherHtml}
                </div>
            </div>`;
    }

    // ── Builder: ticker item (reproduces the .ticker__item anatomy) ──
    // League glyph (Home cross-sport ticker, ISSUES.md "Home — Cross-sport score
    // ticker"): renderScoreCard already had this via _leagueGlyph for the same
    // scan-by-league reason; the ticker needs it at least as much since items
    // carry less context. Shipped on every item, not just a mixed view — one
    // rendering path, no view-aware branching in the builder itself.
    //
    // Broadcast score-bug anatomy (owner feedback, 2026-08-29): AWAY team+score,
    // then the status/clock in the middle, then HOME team+score — not two teams
    // stacked next to each other with the state pill tacked on at the end. Team
    // abbreviation and score now share one font (`.ticker-team`/`.ticker-score`
    // both font-mono, see ticker.css) instead of sans-for-name/mono-for-score,
    // which is what made the strip read as two mismatched typefaces glued together.
    function renderTickerItem(m) {
        const itemCls = m.status === 'live' ? ' ticker__item--live' : m.status === 'final' ? ' ticker__item--final' : '';
        const pillLbl = m.status === 'final' ? 'F' : m.status === 'live' ? m.pillLabel : (m.startShort || 'SCH');
        const scoreCls = w => w && m.status === 'final' ? ' ticker-score--win' : '';
        const glyph = _leagueGlyph(m.sport);
        // MLB click wiring reads data-game-pk; the others read data-game-id (setupTickerClicks).
        const idName = m.sport === 'mlb' ? 'data-game-pk' : 'data-game-id';
        const idAttr = (m.id != null && m.id !== '') ? `${idName}="${esc(m.id)}" ` : '';
        const side = (s, align) => `
                <span class="ticker-side ticker-side--${align}">
                    ${s.logo ? `<img class="ticker-logo${s.darkSafe ? ' ticker-logo--chip' : ''}" src="${s.logo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                    <span class="ticker-team">${esc(s.abbr)}</span>
                    ${m.hasScore ? `<span class="ticker-score${scoreCls(s.winner)}">${s.score ?? 0}</span>` : ''}
                </span>`;
        return `
            <div class="ticker__item${itemCls}" ${idAttr}data-sport="${m.sport}" style="cursor:pointer">
                ${glyph ? `<span class="ticker-glyph" aria-hidden="true">${_iconSvg(glyph)}</span>` : ''}
                ${side(m.away, 'away')}
                <span class="ticker-status-pill ticker-status-pill--${m.pillCls}">${esc(pillLbl)}</span>
                ${side(m.home, 'home')}
            </div>`;
    }

    // tickerScroll moves the track by -50% of its own width, so the track holds
    // two identical halves, and each half must be at least as wide as the
    // screen or the loop shows empty space before it wraps. A poll that
    // brings back the same items leaves the DOM alone, so the scroll and any
    // hover pause carry on undisturbed; the first-child check catches another
    // writer (skeleton, idle message) having replaced the items since.
    // sports: which scoreboards the items came from, for the ticker's freshness receipt.
    function fillTicker(ticker, itemsHtml, sports) {
        if (!ticker || !itemsHtml) return;
        if (sports && typeof global._markTickerFresh === 'function') global._markTickerFresh(sports);
        ticker.classList.remove('ticker--idle');
        if (ticker._ssItems === itemsHtml && ticker._ssFirst && ticker._ssFirst.parentNode === ticker) return;
        ticker.innerHTML = itemsHtml;
        const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const oneW = ticker.scrollWidth;
        if (!reduce && oneW > 0) {
            const half = itemsHtml.repeat(Math.max(1, Math.ceil((global.innerWidth || 0) / oneW)));
            ticker.innerHTML = half + half;
            ticker.style.animationDuration = Math.max(15, Math.round(ticker.scrollWidth / 2 / 60)) + 's';
        }
        ticker._ssItems = itemsHtml;
        ticker._ssFirst = ticker.firstElementChild;
    }

    global.Scorebug = {
        normalizeMLBGame, normalizeNFLGame, normalizeNCAAFGame,
        normalizeNBAGame, normalizeNCAABGame, normalizeWNBAGame,
        renderScoreCard, renderTickerItem, fillTicker, startLabel,
    };
})(typeof window !== 'undefined' ? window : globalThis);

// ============================================================
// TeamPage — one team-page shell for every sport (team pages spec, 2026-11-24).
// A sport registers its contract with TeamPage.register(...) and hands build()
// a normalized input; nothing in this file may name a sport, a league, a stat
// or a route. Pure helpers (standings, ranks, form, stakes, edge, timeline)
// are DOM-free so tests/teamPage.test.js can run them. Rendering uses the
// shared helpers from js/config.js (_escHtml, _iconSvg, freshnessHtml) and
// renderFollowStar from js/auth.js, all resolved at call time.
// ============================================================
const TeamPage = (() => {
    const REG = {};

    function register(cfg) {
        REG[cfg.sport] = { formWindow: 5, standingsScope: 'group', leaders: [], stateStats: [], rosterGroups: [], edges: [], ...cfg };
        return REG[cfg.sport];
    }
    const config = sport => REG[sport] || null;
    const ident = x => x;

    // ── Pure: standings ─────────────────────────────────────
    // games: [{ home, away, homeScore, awayScore, date }], finals only.
    // teams: [{ abbr, group, conf }]. One row per team.
    function standings(games, teams) {
        const rows = {};
        teams.forEach(t => { rows[t.abbr] = { abbr: t.abbr, group: t.group || '', conf: t.conf || '', w: 0, l: 0, t: 0, pf: 0, pa: 0, gp: 0, seq: [] }; });
        games.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(g => {
            const h = rows[g.home], a = rows[g.away];
            if (!h || !a || g.homeScore == null || g.awayScore == null) return;
            const hs = Number(g.homeScore), as = Number(g.awayScore);
            const add = (r, f, ag) => {
                const res = f > ag ? 'W' : f < ag ? 'L' : 'T';
                r.gp++; r.pf += f; r.pa += ag; r[res.toLowerCase()]++; r.seq.push(res);
            };
            add(h, hs, as); add(a, as, hs);
        });
        Object.values(rows).forEach(r => {
            r.pct = r.gp ? (r.w + r.t / 2) / r.gp : 0;
            r.diff = r.pf - r.pa;
            r.streak = streak(r.seq);
        });
        return rows;
    }

    function streak(seq) {
        if (!seq.length) return '';
        const last = seq[seq.length - 1];
        let n = 0;
        for (let i = seq.length - 1; i >= 0 && seq[i] === last; i--) n++;
        return `${last}${n}`;
    }

    const byRecord = (a, b) => b.pct - a.pct || b.diff - a.diff || b.w - a.w || a.abbr.localeCompare(b.abbr);
    const gamesBack = (lead, r) => ((lead.w - r.w) + (r.l - lead.l)) / 2;

    // Rows sharing `key` (group or conf) with `value`, ordered by record, with
    // rank and games back. Teams with identical records share a rank.
    function table(rows, key, value) {
        const list = Object.values(rows).filter(r => r[key] === value).sort(byRecord);
        let shown = 0;
        return list.map((r, i) => {
            const prev = list[i - 1];
            if (!(prev && prev.w === r.w && prev.l === r.l && prev.t === r.t)) shown = i + 1;
            return { ...r, rank: shown, gb: gamesBack(list[0], r) };
        });
    }

    // ── Pure: league ranks ──────────────────────────────────
    // values: { [abbr]: number }. Competition ranking (ties share), 1 = best.
    function rank(values, better = 'high') {
        const entries = Object.entries(values || {}).filter(([, v]) => Number.isFinite(v));
        const n = entries.length;
        const out = {};
        entries.forEach(([k, v]) => {
            const r = entries.filter(([, o]) => (better === 'low' ? o < v : o > v)).length + 1;
            const tied = entries.filter(([, o]) => o === v).length > 1;
            out[k] = { value: v, rank: r, tied, of: n, pctile: n > 1 ? Math.round((n - r) / (n - 1) * 100) : 100 };
        });
        return out;
    }

    // players: [{ id, name, team, value }]. The team's top player, ranked
    // among every player in the list.
    function leader(players, team) {
        const ok = players.filter(p => Number.isFinite(p.value));
        const mine = ok.filter(p => p.team === team).sort((a, b) => b.value - a.value)[0];
        if (!mine) return null;
        return { ...mine, rank: ok.filter(p => p.value > mine.value).length + 1, of: ok.length };
    }

    // ── Pure: schedule ──────────────────────────────────────
    // schedule: [{ id, date, isHome, oppAbbr, oppLogo, completed, live, myScore, oppScore, venue }]
    const result = g => (g.myScore == null || g.oppScore == null) ? null
        : Number(g.myScore) > Number(g.oppScore) ? 'W' : Number(g.myScore) < Number(g.oppScore) ? 'L' : 'T';
    const byDate = (a, b) => new Date(a.date) - new Date(b.date);

    function form(schedule, n) {
        return schedule.filter(g => g.completed && result(g)).sort(byDate).slice(-n).map(result);
    }

    function nextGame(schedule) {
        return schedule.filter(g => !g.completed).sort(byDate)[0] || null;
    }

    function timeline(schedule, pinnedId) {
        return schedule.filter(g => g.id !== pinnedId).sort(byDate).map(g => {
            const res = g.completed ? result(g) : null;
            return { ...g, result: res, margin: res ? Number(g.myScore) - Number(g.oppScore) : null };
        });
    }

    // ── Pure: next-game stakes ──────────────────────────────
    // Rules only, from standings + schedule; up to two clauses.
    // ctx: { me, opp, rows, schedule, next, groupLabel, confLabel, cut }
    function stakes(ctx) {
        const { me, opp, rows, schedule, next } = ctx;
        const a = rows[me], b = rows[opp];
        if (!a || !b) return [];
        const out = [];
        const gl = ctx.groupLabel || ident;
        if (a.group && a.group === b.group) {
            const t = table(rows, 'group', a.group);
            const ra = t.find(r => r.abbr === me), rb = t.find(r => r.abbr === opp);
            const gap = Math.abs(ra.gb - rb.gb);
            if (a.gp && (ra.rank === 1 || rb.rank === 1) && gap <= 1) {
                if (gap === 0) out.push(`Tied atop the ${gl(a.group)}`);
                else {
                    const [up, down] = ra.gb < rb.gb ? [me, opp] : [opp, me];
                    out.push(`${gl(a.group)} lead on the line: ${up} leads ${down} by ${fmtGames(gap)}`);
                }
            } else out.push(`${gl(a.group)} game`);
        } else if (a.conf && b.conf && a.conf !== b.conf) out.push('Cross-conference game');

        const prior = schedule.filter(g => g.completed && g.oppAbbr === opp && g.id !== next.id && result(g)).sort(byDate).pop();
        if (prior) {
            const r = result(prior), score = `${prior.myScore}-${prior.oppScore}`, when = shortDate(prior.date);
            out.push(r === 'L' ? `Revenge game: lost ${score} on ${when}` : `Rematch: ${r === 'W' ? 'won' : 'tied'} ${score} on ${when}`);
        }

        if (ctx.cut && a.conf && a.conf === b.conf && a.gp) {
            const line = Object.values(rows).filter(r => r.conf === a.conf).sort(byRecord)[ctx.cut - 1];
            const near = r => line && Math.abs(gamesBack(line, r)) <= 1;
            if (near(a) && near(b)) out.push(`Both within a game of the ${(ctx.confLabel || ident)(a.conf)}'s ${ordinal(ctx.cut)}-best record`);
        }
        return out.slice(0, 2);
    }

    // ── Pure: matchup edge ──────────────────────────────────
    // ranks: { [statKey]: rank() output }; edges: [{ off, def, offLabel, defLabel }].
    // The widest gap between one side's unit and the other side's opposing unit.
    function edge(ranks, edges, me, opp) {
        let best = null;
        edges.forEach(e => {
            const ro = ranks[e.off], rd = ranks[e.def];
            if (!ro || !rd) return;
            [[me, opp], [opp, me]].forEach(([atk, dfn]) => {
                const o = ro[atk], d = rd[dfn];
                if (!o || !d) return;
                const gap = d.rank - o.rank;
                if (!best || gap > best.gap) best = { gap, atk, dfn, offRank: o.rank, defRank: d.rank, offLabel: e.offLabel, defLabel: e.defLabel };
            });
        });
        return best && best.gap > 0 ? best : null;
    }

    // Metrics a sport can take from the shell's own standings pass instead of
    // supplying them: stateStats entries name one as `source`.
    const FROM_ROWS = {
        'pf/g': r => r.pf / r.gp,
        'pa/g': r => r.pa / r.gp,
        diff: r => r.diff,
        pct: r => r.pct,
    };

    // ── Pure: model ─────────────────────────────────────────
    // input: { team:{abbr,name,logo,color}, teams:[{abbr,name,logo,group,conf}],
    //   games:[finals], schedule:[team games], metrics:{[stat]:{[abbr]:n}},
    //   players:{[leaderKey]:[{id,name,team,value,headshot}]},
    //   groups:[{label, side, players}], fetchedAt, seasonLabel }
    function build(sport, input) {
        const cfg = config(sport);
        const me = input.team.abbr;
        const teams = input.teams || [], schedule = input.schedule || [];
        const rows = standings(input.games || [], teams);
        const row = rows[me] || null;
        const scope = cfg.standingsScope === 'conf' ? 'conf' : 'group';
        const tbl = row && row[scope] ? table(rows, scope, row[scope]) : [];
        const metrics = { ...(input.metrics || {}) };
        cfg.stateStats.filter(s => s.source && FROM_ROWS[s.source]).forEach(s => {
            metrics[s.key] = {};
            Object.values(rows).filter(r => r.gp).forEach(r => { metrics[s.key][r.abbr] = FROM_ROWS[s.source](r); });
        });
        const ranks = {};
        cfg.stateStats.forEach(s => { if (metrics[s.key]) ranks[s.key] = rank(metrics[s.key], s.better); });
        const next = nextGame(schedule);
        const opp = next ? next.oppAbbr : null;
        const leaders = cfg.leaders.map(l => {
            const hit = leader((input.players && input.players[l.key]) || [], me);
            return hit ? { ...l, player: hit } : null;
        }).filter(Boolean);
        return {
            sport, team: input.team, row, table: tbl, scope,
            myRank: tbl.find(r => r.abbr === me) || null,
            form: form(schedule, cfg.formWindow),
            ranks, leaders, groups: input.groups || [],
            next: next ? {
                ...next,
                oppTeam: teams.find(t => t.abbr === opp) || { abbr: opp, name: opp },
                oppRow: rows[opp] || null,
                stakes: row ? stakes({ me, opp, rows, schedule, next, groupLabel: cfg.groupLabel, confLabel: cfg.confLabel, cut: cfg.conferenceCut }) : [],
                edge: edge(ranks, cfg.edges, me, opp),
            } : null,
            timeline: timeline(schedule, next ? next.id : null),
            fetchedAt: input.fetchedAt || 0,
            gamesCounted: (input.games || []).length,
            seasonLabel: input.seasonLabel || '',
        };
    }

    // ── Formatting ──────────────────────────────────────────
    function fmtGames(g) { return g === 1 ? '1 game' : `${g % 1 ? g.toFixed(1) : g} games`; }
    function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
    function shortDate(d) { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) { return ''; } }
    function shortTime(d) {
        try { const x = new Date(d); return `${x.toLocaleDateString('en-US', { weekday: 'short' })} ${x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; } catch (_) { return ''; }
    }
    function record(r) { return r ? `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` : ''; }
    function fmtStat(v, s) {
        if (!Number.isFinite(v)) return '—';
        const t = v.toFixed(s.d || 0);
        return s.signed && v > 0 ? `+${t}` : t;
    }
    const rankText = r => `${r.tied ? 'T-' : ''}#${r.rank}`;
    const scopeName = (cfg, m) => !m.row ? '' : m.scope === 'conf' ? (cfg.confLabel || ident)(m.row.conf) : (cfg.groupLabel || ident)(m.row.group);

    // ── Render ──────────────────────────────────────────────
    const esc = s => _escHtml(String(s == null ? '' : s));
    const logoChip = (src, alt, cls) => `<span class="tp-logo ${cls}">${src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" data-hide-on-error>` : ''}</span>`;
    const initials = s => String(s || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');

    function headerHtml(cfg, m) {
        const t = m.team, r = m.row;
        const total = m.groups.reduce((n, g) => n + g.players.length, 0);
        const side = key => m.groups.filter(g => g.side === key).reduce((n, g) => n + g.players.length, 0);
        const counts = total ? [['Players', total], ...cfg.rosterGroups.map(g => [g.label, side(g.key)])] : [];
        const name = scopeName(cfg, m);
        const played = r && r.gp;
        const tiedMe = m.myRank && m.table.filter(x => x.rank === m.myRank.rank).length > 1;
        const chip = played && m.myRank ? `<span class="tp-chip">${tiedMe ? 'T-' : ''}${esc(ordinal(m.myRank.rank))} in ${esc(name)}</span>`
            : name ? `<span class="tp-chip tp-chip--plain">${esc(name)}</span>` : '';
        const dots = m.form.length
            ? `<span class="tp-form" role="img" aria-label="Last ${m.form.length}: ${esc(m.form.join(' '))}">${m.form.map(x => `<span class="tp-dot tp-dot--${x.toLowerCase()}" title="${x}"></span>`).join('')}</span>` : '';
        return `
        <div class="player-detail-header tp-header">
            <button class="back-button" onclick="navigateTo('${esc(cfg.backView)}')">← ${esc(cfg.backLabel || 'Back')}</button>
            <div class="player-hero">
                ${logoChip(t.logo, t.name, 'tp-logo--hero')}
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${esc(t.name)}</h1>
                        <span class="player-hero-pos">${esc(t.abbr)}</span>
                        ${typeof renderFollowStar === 'function' ? renderFollowStar(m.sport, 'team', t.abbr) : ''}
                    </div>
                    <div class="tp-meta">
                        ${played ? `<span class="tp-record">${esc(record(r))}</span>` : (m.seasonLabel ? `<span class="tp-muted">${esc(m.seasonLabel)}</span>` : '')}
                        ${chip}${dots}
                        ${played && r.streak ? `<span class="tp-muted">Streak ${esc(r.streak)}</span>` : ''}
                    </div>
                    ${counts.length ? `<div class="player-bio-grid tp-counts">${counts.map(([l, v]) => `<div class="player-bio-item"><span class="bio-label">${esc(l)}</span><span class="bio-value">${esc(v)}</span></div>`).join('')}</div>` : ''}
                </div>
            </div>
        </div>`;
    }

    function heroHtml(cfg, m) {
        const n = m.next;
        if (!n) return '';
        const o = n.oppTeam;
        let when = '';
        try {
            const d = new Date(n.date);
            when = `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;
        } catch (_) {}
        const e = n.edge;
        return `
        <section class="stats-card tp-hero" style="grid-column:1/-1" role="button" tabindex="0" onclick="navigateTo('${esc(cfg.gameRoute(n.id))}')" onkeydown="if(event.key==='Enter')this.click()">
            <div class="tp-hero__top">
                ${n.live ? '<span class="tp-live">Live</span>' : '<span class="eyebrow">Next game</span>'}
                <span class="tp-muted">${esc(when)}${n.venue ? ` · ${esc(n.venue)}` : ''}</span>
            </div>
            <div class="tp-hero__match">
                <span class="tp-muted">${n.isHome ? 'vs' : '@'}</span>
                ${logoChip(n.oppLogo || o.logo, o.name || o.abbr, 'tp-logo--md')}
                <div class="tp-hero__opp">
                    <span class="tp-hero__name">${esc(o.name || o.abbr)}</span>
                    ${n.oppRow && n.oppRow.gp ? `<span class="tp-muted">${esc(record(n.oppRow))}${n.oppRow.streak ? ` · Streak ${esc(n.oppRow.streak)}` : ''}</span>` : ''}
                </div>
            </div>
            ${n.stakes.length ? `<p class="tp-stakes">${n.stakes.map(esc).join(' · ')}</p>` : ''}
            ${e ? `<p class="tp-edge"><span class="eyebrow">Matchup edge</span> ${esc(`${e.atk} #${e.offRank} ${e.offLabel} vs ${e.dfn} #${e.defRank} ${e.defLabel}`)}</p>` : ''}
        </section>`;
    }

    function stateHtml(cfg, m) {
        const cells = cfg.stateStats.map(s => {
            const r = m.ranks[s.key] && m.ranks[s.key][m.team.abbr];
            if (!r) return '';
            return `<div class="tp-metric">
                <span class="bio-label">${esc(s.label)}</span>
                <span class="tp-metric__row"><span class="tp-metric__val">${esc(fmtStat(r.value, s))}</span><span class="tp-metric__rank">${esc(rankText(r))} <span class="tp-muted">of ${r.of}</span></span></span>
                <span class="tp-bar" aria-hidden="true"><span style="width:${r.pctile}%"></span></span>
            </div>`;
        }).join('');
        if (!cells) return '';
        const ts = m.fetchedAt && typeof freshnessHtml === 'function' ? ` · ${freshnessHtml(m.fetchedAt)}` : '';
        return `<section class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">State of the Team</h2>
            <div class="tp-metrics">${cells}</div>
            <p class="pct-caption tp-receipt">${esc(cfg.stateReceipt || 'League ranks')}. Bar = percentile in the league${ts}</p>
        </section>`;
    }

    function leadersHtml(cfg, m) {
        if (!m.leaders.length) return '';
        const cards = m.leaders.map(l => {
            const p = l.player;
            return `<div class="tp-leader">
                <span class="tp-leader__av">${p.headshot ? `<img src="${esc(p.headshot)}" alt="" loading="lazy" data-hide-on-error>` : ''}<span>${esc(initials(p.name))}</span></span>
                <span class="tp-leader__body">
                    <span class="bio-label">${esc(l.label)}</span>
                    <span class="tp-leader__name">${esc(p.name)}</span>
                    <span class="tp-leader__stat"><span class="tp-metric__val">${esc(fmtStat(p.value, l))}</span> <span class="tp-muted">${esc(l.unit || '')}</span> <span class="tp-metric__rank">#${p.rank}</span></span>
                </span>
            </div>`;
        }).join('');
        return `<section class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">Leaders</h2>
            <div class="tp-leaders">${cards}</div>
            ${cfg.leadersReceipt ? `<p class="pct-caption tp-receipt">${esc(cfg.leadersReceipt)}</p>` : ''}
        </section>`;
    }

    function timelineHtml(cfg, m) {
        if (!m.timeline.length) return '';
        const rows = m.timeline.map(g => {
            const res = g.result;
            const right = res
                ? `<span class="tp-tl__score">${esc(`${g.myScore}-${g.oppScore}`)}</span><span class="tp-tl__diff">${g.margin > 0 ? '+' : ''}${g.margin}</span>`
                : g.live ? '<span class="tp-live">Live</span>'
                : `<span class="tp-muted">${esc(shortTime(g.date))}</span>`;
            return `<div class="roster-row roster-row--clickable tp-tl${res ? ` tp-tl--${res.toLowerCase()}` : ''}" role="button" tabindex="0" onclick="navigateTo('${esc(cfg.gameRoute(g.id))}')" onkeydown="if(event.key==='Enter')this.click()">
                <span class="tp-tl__res">${res || ''}</span>
                <span class="tp-tl__date">${esc(shortDate(g.date))}</span>
                <span class="tp-muted tp-tl__ha">${g.isHome ? 'vs' : '@'}</span>
                ${logoChip(g.oppLogo, g.oppAbbr, 'tp-logo--sm')}
                <span class="tp-tl__opp">${esc(g.oppAbbr)}</span>
                <span class="tp-tl__right">${right}</span>
            </div>`;
        }).join('');
        return `<section class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">Schedule</h2>
            <div class="roster-list">${rows}</div>
        </section>`;
    }

    function standingsHtml(cfg, m) {
        if (!m.table.length || !m.row || !m.row.gp) return '';
        const cut = cfg.standingsCut;
        const tied = r => m.table.filter(x => x.rank === r.rank).length > 1;
        // A cut line between two teams with the same record would claim an order the record doesn't give.
        const cutAt = cut && m.table[cut.after] && m.table[cut.after].rank !== m.table[cut.after - 1].rank ? cut.after : -1;
        const rows = m.table.map((r, i) => `
            ${i === cutAt ? `<tr class="tp-cut"><td colspan="5"><span>${esc(cut.label)}</span></td></tr>` : ''}
            <tr class="${r.abbr === m.team.abbr ? 'tp-me' : ''}" onclick="navigateTo('${esc(cfg.teamRoute(r.abbr))}')">
                <td>${tied(r) ? 'T-' : ''}${r.rank}</td><td class="tp-st__team">${esc(r.abbr)}</td><td>${esc(record(r))}</td>
                <td>${r.gb === 0 ? '—' : esc(r.gb % 1 ? r.gb.toFixed(1) : r.gb)}</td><td>${esc(r.streak || '—')}</td>
            </tr>`).join('');
        return `<section class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">${esc(scopeName(cfg, m))}</h2>
            <table class="tp-standings"><thead><tr><th>#</th><th>Team</th><th>W-L</th><th>GB</th><th>STRK</th></tr></thead><tbody>${rows}</tbody></table>
            <p class="pct-caption tp-receipt">Ordered by win %, then point differential, from ${m.gamesCounted} final games. Official tiebreakers are not applied.</p>
        </section>`;
    }

    function rosterHtml(cfg, m) {
        const body = m.groups.map(grp => {
            if (!grp.players.length) return '';
            const rows = grp.players.map(p =>
                `<div class="roster-row" role="button" tabindex="0" style="cursor:pointer" onclick="navigateTo('${esc(cfg.playerRoute(p.id))}')" onkeydown="if(event.key==='Enter')this.click()">
                    <div class="roster-avatar tp-avatar">
                        ${p.headshot ? `<img src="${esc(p.headshot)}" alt="" loading="lazy" data-hide-on-error>` : ''}
                        <span>${esc(initials(p.name))}</span>
                    </div>
                    <div class="roster-info">
                        <span class="roster-name">${esc(p.name)}${p.starter ? ` <span class="tp-starter" title="Projected starter">${_iconSvg('star', 12)}</span>` : ''}${p.injury ? ` <span class="roster-il-badge${cfg.injuryClass ? cfg.injuryClass(p.injury) : ''}">${esc(p.injury)}</span>` : ''}</span>
                        <span class="roster-meta">${esc(p.pos)}${p.number ? ' · #' + esc(p.number) : ''}</span>
                    </div>
                </div>`).join('');
            return `<h3 class="detail-section-title tp-group">${esc(grp.label)} <span class="team-section__count">${grp.players.length}</span></h3><div class="roster-list">${rows}</div>`;
        }).join('');
        if (!body) return cfg.rosterEmpty ? `<section class="stats-card" style="grid-column:1/-1"><h2 class="detail-section-title">Roster</h2><p class="team-empty">${esc(cfg.rosterEmpty)}</p></section>` : '';
        return `<section class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">${esc(cfg.rosterTitle || 'Roster')}</h2>
            ${cfg.rosterCaption ? `<p class="pct-caption tp-caption">${esc(cfg.rosterCaption)}</p>` : ''}
            ${body}
        </section>`;
    }

    // slots: { afterState, end }: extra sections a sport supplies.
    function html(m, slots = {}) {
        const cfg = config(m.sport);
        return `<div class="tp" style="--team:${esc(m.team.color || 'var(--accent)')}">`
            + headerHtml(cfg, m) + heroHtml(cfg, m) + stateHtml(cfg, m) + (slots.afterState || '')
            + leadersHtml(cfg, m) + timelineHtml(cfg, m) + standingsHtml(cfg, m) + rosterHtml(cfg, m)
            + (slots.end || '') + '</div>';
    }

    return { register, config, standings, table, rank, leader, form, nextGame, timeline, stakes, edge, build, html, record, ordinal };
})();

function registerTeamSport(cfg) { return TeamPage.register(cfg); }

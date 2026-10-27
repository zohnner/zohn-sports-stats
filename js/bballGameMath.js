// ============================================================
// Basketball game math (D-185) — pure, DOM-free helpers behind the NBA
// Game Center in js/bballGameCenter.js: scoring runs, leads, droughts,
// win-probability swings, Four Factors, estimated possessions/pace,
// shot-zone classification, clutch and last-five-minute splits.
// Every number these return is rendered with a receipt. Kept out of the
// renderer so it can be unit-tested: tests/bballGameMath.test.js.
//
// Shot coordinates (ESPN NBA /summary plays[].coordinate), verified
// 2026-10-26 against two real games (401909861 final, 401909868 live):
//   - x runs 0..50 across the court, y runs toward half court, both in
//     feet, integers, normalized to the shooting team's attacking half.
//   - Hoop origin fitted by least squares against the 201 shots whose
//     play text states a distance ("26-foot three point jumper"): (25, 0.75),
//     RMSE 0.5 ft, which is the rounding floor of integer coordinates.
//     Every 3PA sat >= 22.0 ft from that point, every 2PA <= 20.0 ft.
//   - Free throws carry sentinel coordinates (~-2.1e8). Non-shot plays
//     (fouls) carry real-looking coordinates too, so shots are selected by
//     shootingPlay, never by "has a coordinate".
// WNBA and NCAAB were fitted the same way (2026-10-27): 290 WNBA shots
// over 3 games and 523 NCAAB shots over 6, both hoop (25, 0.25), RMSE
// 0.44 / 0.39 ft, zero shots off their stated distance by > 1.6 ft. Their
// origin differs from NBA's, so geometry is per court (COURTS below).
// ============================================================

const BballMath = (() => {
    // Per-court geometry, feet. hoopY is ESPN's fitted hoop y; the hoop sits
    // 5.25 ft off the baseline on all three courts. arc is the 3PT radius,
    // corner the straight corner distance, cornerDy where the corner segment
    // meets the arc (past the hoop). laneHalf was measured: zones built on
    // it reproduce ESPN's pointsInPaint exactly for NBA and WNBA (16-ft lane,
    // 8 team-games) and best for NCAAB at 12 ft (mean 0.8 pts off over 12
    // team-games, vs 1.5 at 16 ft). arc matches each sport's shortest 3PA
    // in the data (22.0-22.1 ft for WNBA/NCAAB). corner and foulOut for
    // WNBA/NCAAB are the published rules, not measured here.
    const COURTS = {
        nba:   { hoopY: 0.75, arc: 23.75, corner: 22,    cornerDy: 9, laneHalf: 8, foulOut: 6, laneFt: 16 },
        wnba:  { hoopY: 0.25, arc: 22.15, corner: 21.65, cornerDy: 5, laneHalf: 8, foulOut: 6, laneFt: 16 },
        ncaab: { hoopY: 0.25, arc: 22.15, corner: 21.65, cornerDy: 5, laneHalf: 6, foulOut: 5, laneFt: 12 },
    };
    const HOOP_FROM_BASELINE = 5.25;
    const HOOP = { x: 25, y: COURTS.nba.hoopY };
    const BASELINE_Y = HOOP.y - HOOP_FROM_BASELINE;
    const courtOf = (court) => court || COURTS.nba;

    function parseClock(s) {
        if (s == null) return 0;
        const str = String(s);
        if (str.includes(':')) {
            const [m, sec] = str.split(':');
            return (parseInt(m, 10) || 0) * 60 + (parseFloat(sec) || 0);
        }
        const n = parseFloat(str);
        return isFinite(n) ? n : 0;
    }

    function fmtSec(sec) {
        const s = Math.max(0, Math.round(sec));
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    function gameFormat(data) {
        const f = (data && data.format) || {};
        const reg = f.regulation || {}, ot = f.overtime || {};
        return {
            periods: reg.periods || 4,
            periodSec: reg.clock || 720,
            otSec: ot.clock || 300,
            slug: reg.slug || 'quarter',
        };
    }

    function periodLabel(n, fmt) {
        if (n <= fmt.periods) return (fmt.slug === 'half' ? 'H' : 'Q') + n;
        const k = n - fmt.periods;
        return k === 1 ? 'OT' : k + 'OT';
    }

    function periodLen(period, fmt) { return period <= fmt.periods ? fmt.periodSec : fmt.otSec; }

    function periodStart(period, fmt) {
        if (period <= fmt.periods) return (period - 1) * fmt.periodSec;
        return fmt.periods * fmt.periodSec + (period - fmt.periods - 1) * fmt.otSec;
    }

    // Seconds of game clock elapsed since tip at (period, clock remaining).
    function elapsedAt(period, clock, fmt) {
        const p = period || 1;
        return periodStart(p, fmt) + Math.max(0, periodLen(p, fmt) - parseClock(clock));
    }

    // Inverse of elapsedAt: game seconds -> { period, clock remaining }.
    // A boundary instant (t exactly at a period's end) reports 0:00 of the
    // period that just ended rather than 12:00 of the next one.
    function clockAt(t, fmt) {
        let period = 1;
        while (t > periodStart(period, fmt) + periodLen(period, fmt)) period++;
        return { period, clock: fmtSec(periodStart(period, fmt) + periodLen(period, fmt) - t) };
    }

    const playPeriod = (p) => (p.period && p.period.number) || 1;
    const playClock = (p) => (p.clock && p.clock.displayValue) || '0:00';
    const playT = (p, fmt) => elapsedAt(playPeriod(p), playClock(p), fmt);
    const hasScore = (p) => typeof p.homeScore === 'number' && typeof p.awayScore === 'number';
    // NBA types read "Free Throw - 1 of 2"; NCAAB uses "MadeFreeThrow" for
    // every attempt, misses included, and gives them a real-looking (25, 0)
    // coordinate instead of NBA's sentinel. pointsAttempted 1 catches both.
    const isFreeThrow = (p) => p.pointsAttempted === 1 || /free ?throw/i.test((p.type && p.type.text) || '');
    // End-of-period heaves are shootingPlay but the official box score does
    // not count them as attempts (verified: 401909861's two home heaves were
    // exactly the 97-vs-95 FGA gap). Excluding them keeps every split here
    // reconcilable with the box.
    const isHeave = (p) => /heave/i.test((p.type && p.type.text) || '');
    const isFGA = (p) => !!p.shootingPlay && !isFreeThrow(p) && !isHeave(p);
    const isThree = (p) => p.pointsAttempted === 3 || (p.pointsAttempted == null && /three point/i.test(p.text || ''));
    const teamIdOf = (p) => (p.team && p.team.id != null ? String(p.team.id) : null);

    // -- Shots ---------------------------------------------------------

    function validCoord(c, court) {
        const base = courtOf(court).hoopY - HOOP_FROM_BASELINE;
        return !!c && isFinite(c.x) && isFinite(c.y) && c.x >= 0 && c.x <= 50 && c.y >= base - 1 && c.y <= 94;
    }

    function shotGeom(c, court) {
        const dx = c.x - HOOP.x, dy = c.y - courtOf(court).hoopY;
        return { dx, dy, dist: Math.hypot(dx, dy) };
    }

    // Zone definitions (feet from the hoop center; court values in COURTS):
    //   rim     2PA within 4 ft (the restricted-area radius)
    //   paint   other 2PA inside the lane (laneHalf each side), up to the FT
    //           line (19 ft from the baseline = 13.75 ft past the hoop)
    //   mid     every other 2PA
    //   corner3 3PA within 1 ft of the corner distance or wider, below the
    //           point where the straight corner segment meets the arc
    //   atb3    every other 3PA (heaves are excluded upstream, see isHeave)
    // 2 vs 3 comes from ESPN's pointsAttempted, not from geometry.
    const ZONES = ['rim', 'paint', 'mid', 'corner3', 'atb3'];
    const ZONE_LABEL = { rim: 'At rim', paint: 'Paint (non-RA)', mid: 'Midrange', corner3: 'Corner 3', atb3: 'Above-break 3' };

    function shotZone(three, c, court) {
        const k = courtOf(court);
        const { dx, dy, dist } = shotGeom(c, k);
        if (three) return (Math.abs(dx) >= k.corner - 1 && dy <= k.cornerDy) ? 'corner3' : 'atb3';
        if (dist <= 4) return 'rim';
        if (Math.abs(dx) <= k.laneHalf && dy <= 13.75) return 'paint';
        return 'mid';
    }

    function validShots(plays, court) {
        const out = [];
        (plays || []).forEach(p => {
            if (!isFGA(p) || !validCoord(p.coordinate, court)) return;
            const c = p.coordinate;
            const three = isThree(p);
            const shooter = p.participants && p.participants[0] && p.participants[0].athlete;
            out.push({
                id: p.id, teamId: teamIdOf(p), shooterId: shooter ? String(shooter.id) : null,
                made: !!p.scoringPlay, three, zone: shotZone(three, c, court),
                x: c.x, y: c.y, dist: shotGeom(c, court).dist,
                period: playPeriod(p), clock: playClock(p), text: p.text || '',
            });
        });
        return out;
    }

    // Court position in feet from the baseline/left sideline, for drawing.
    function toCourt(shot, court) { return { cx: shot.x, cy: shot.y - (courtOf(court).hoopY - HOOP_FROM_BASELINE) }; }

    function zoneSplits(shots) {
        const z = {};
        ZONES.forEach(k => { z[k] = { fgm: 0, fga: 0 }; });
        (shots || []).forEach(s => { z[s.zone].fga++; if (s.made) z[s.zone].fgm++; });
        return z;
    }

    // -- Score timeline --------------------------------------------------

    // A score can go DOWN when officials revoke a basket (NCAAB 401856530:
    // Duke 42 -> 40 at a TV timeout, then re-scored later). The revoked
    // points come off that side's most recent events, so the basket isn't
    // counted twice.
    function _revoke(ev, side, pts) {
        for (let i = ev.length - 1; i >= 0 && pts > 0; i--) {
            if (ev[i].side !== side) continue;
            const take = Math.min(ev[i].pts, pts);
            ev[i].pts -= take; pts -= take;
            if (ev[i].pts === 0) ev.splice(i, 1);
        }
    }

    // One event per side whose score moved, read from score deltas rather
    // than play.team so a mis-tagged play can't credit the wrong side.
    function scoringEvents(plays, fmt) {
        const ev = [];
        let h = 0, a = 0;
        (plays || []).forEach(p => {
            if (!hasScore(p)) return;
            const t = playT(p, fmt);
            if (p.homeScore > h) ev.push({ side: 'home', pts: p.homeScore - h, t, play: p, home: p.homeScore, away: p.awayScore });
            else if (p.homeScore < h) _revoke(ev, 'home', h - p.homeScore);
            if (p.awayScore > a) ev.push({ side: 'away', pts: p.awayScore - a, t, play: p, home: p.homeScore, away: p.awayScore });
            else if (p.awayScore < a) _revoke(ev, 'away', a - p.awayScore);
            h = p.homeScore; a = p.awayScore;
        });
        return ev;
    }

    // Unanswered runs: points by one side with zero by the other.
    function runs(events) {
        const best = { home: null, away: null };
        let cur = null;
        (events || []).forEach(e => {
            if (!cur || cur.side !== e.side) cur = { side: e.side, pts: 0, start: e, end: e };
            cur.pts += e.pts; cur.end = e;
            const b = best[e.side];
            if (!b || cur.pts > b.pts) best[e.side] = { ...cur };
        });
        return { current: cur ? { ...cur } : null, biggest: best };
    }

    function leads(plays) {
        const out = { home: null, away: null };
        (plays || []).forEach(p => {
            if (!hasScore(p)) return;
            const m = p.homeScore - p.awayScore;
            if (m > 0 && (!out.home || m > out.home.lead)) out.home = { lead: m, play: p };
            if (m < 0 && (!out.away || -m > out.away.lead)) out.away = { lead: -m, play: p };
        });
        return out;
    }

    // Longest stretch of game clock a side went without scoring any points.
    // endT closes the trailing gap (current game time live, game end final);
    // an ongoing drought is flagged so it can be labeled "and counting".
    function droughts(events, endT) {
        const out = {};
        ['home', 'away'].forEach(side => {
            const ts = events.filter(e => e.side === side).map(e => e.t);
            let prev = 0, best = null;
            const consider = (from, to, open) => {
                if (to - from > 0 && (!best || to - from > best.sec)) best = { sec: to - from, from, to, open };
            };
            ts.forEach(t => { consider(prev, t, false); prev = t; });
            if (endT != null) consider(prev, endT, true);
            out[side] = best;
        });
        return out;
    }

    // -- Win probability -------------------------------------------------

    // Joined on winprobability[].playId -> plays[].id. Swing is measured
    // against the previous WP entry in play order, signed toward home.
    function wpTimeline(plays, wp, fmt) {
        const byId = new Map();
        (wp || []).forEach(w => { if (w && w.playId != null && typeof w.homeWinPercentage === 'number') byId.set(String(w.playId), w.homeWinPercentage); });
        const out = [];
        (plays || []).forEach(p => {
            const v = byId.get(String(p.id));
            if (v == null) return;
            out.push({ t: playT(p, fmt), home: v, play: p });
        });
        return out;
    }

    function wpSwings(timeline, n = 5) {
        const sw = [];
        for (let i = 1; i < timeline.length; i++) {
            const before = timeline[i - 1].home, after = timeline[i].home;
            if (!timeline[i].play.text) continue;
            sw.push({ play: timeline[i].play, before, after, delta: after - before, t: timeline[i].t });
        }
        return sw.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, n);
    }

    function marginSeries(plays, fmt) {
        return (plays || []).filter(hasScore).map(p => ({ t: playT(p, fmt), margin: p.homeScore - p.awayScore, play: p }));
    }

    // -- Team box math ---------------------------------------------------

    function _madeAtt(v) {
        const m = /^(\d+)-(\d+)$/.exec(String(v || ''));
        return m ? [+m[1], +m[2]] : [0, 0];
    }

    // boxscore.teams[].statistics -> plain counting totals.
    function teamTotals(teamEntry) {
        const s = {};
        ((teamEntry && teamEntry.statistics) || []).forEach(x => { s[x.name] = x.displayValue; });
        const [fgm, fga] = _madeAtt(s['fieldGoalsMade-fieldGoalsAttempted']);
        const [tpm, tpa] = _madeAtt(s['threePointFieldGoalsMade-threePointFieldGoalsAttempted']);
        const [ftm, fta] = _madeAtt(s['freeThrowsMade-freeThrowsAttempted']);
        const num = (k) => { const n = parseFloat(s[k]); return isFinite(n) ? n : 0; };
        const tov = s.totalTurnovers != null ? num('totalTurnovers') : num('turnovers');
        return { fgm, fga, tpm, tpa, ftm, fta, orb: num('offensiveRebounds'), drb: num('defensiveRebounds'), tov };
    }

    const _ratio = (n, d) => (d > 0 ? n / d : null);

    // Dean Oliver's Four Factors. FT rate is FTM/FGA (Oliver's definition).
    function fourFactors(t, opp) {
        return {
            efg: _ratio(t.fgm + 0.5 * t.tpm, t.fga),
            tov: _ratio(t.tov, t.fga + 0.44 * t.fta + t.tov),
            orb: _ratio(t.orb, t.orb + opp.drb),
            ftr: _ratio(t.ftm, t.fga),
        };
    }

    function possessions(t) { return t.fga + 0.44 * t.fta - t.orb + t.tov; }

    // Possessions averaged across both teams' estimates. Pace is scaled to
    // the sport's regulation length (48 min NBA) from game clock elapsed,
    // so a live game in the 2nd quarter and a double-OT final both report
    // a per-48 figure.
    function efficiency(home, away, homePts, awayPts, elapsedSec, fmt) {
        const poss = (possessions(home) + possessions(away)) / 2;
        const min = elapsedSec / 60;
        if (!(poss > 0) || min < 1) return null;
        const regMin = fmt.periods * fmt.periodSec / 60;
        return {
            poss, minutes: min, regMin,
            pace: poss * regMin / min,
            homeOrtg: 100 * homePts / poss,
            awayOrtg: 100 * awayPts / poss,
        };
    }

    // -- Situational splits ----------------------------------------------

    function _emptySplit() { return { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 }; }

    // Splits over the plays where keep(p, ctx) holds. ctx carries the margin
    // BEFORE the play (home minus away) and its elapsed time. Points come
    // from score deltas; attempts from shooting plays tagged with a team id.
    function splitWhere(plays, ids, fmt, keep) {
        const out = { home: _emptySplit(), away: _emptySplit(), plays: 0 };
        let h = 0, a = 0;
        (plays || []).forEach(p => {
            const ctx = { margin: h - a, t: playT(p, fmt), period: playPeriod(p), remaining: parseClock(playClock(p)) };
            if (keep(p, ctx)) {
                out.plays++;
                if (hasScore(p)) {
                    // Signed deltas, so a revoked basket comes back off.
                    out.home.pts += p.homeScore - h;
                    out.away.pts += p.awayScore - a;
                }
                const tid = teamIdOf(p);
                const side = tid === ids.home ? 'home' : tid === ids.away ? 'away' : null;
                if (side && p.shootingPlay && !isHeave(p)) {
                    const s = out[side];
                    if (isFreeThrow(p)) { s.fta++; if (p.scoringPlay) s.ftm++; }
                    else {
                        s.fga++; if (p.scoringPlay) s.fgm++;
                        if (isThree(p)) { s.tpa++; if (p.scoringPlay) s.tpm++; }
                    }
                }
            }
            if (hasScore(p)) { h = p.homeScore; a = p.awayScore; }
        });
        return out;
    }

    // NBA's clutch definition: 4th quarter or OT, 5:00 or less left in the
    // period, score within 5 points.
    function clutch(plays, ids, fmt) {
        return splitWhere(plays, ids, fmt, (p, c) => c.period >= fmt.periods && c.remaining <= 300 && Math.abs(c.margin) <= 5);
    }

    function lastFive(plays, ids, fmt, endT) {
        return splitWhere(plays, ids, fmt, (p, c) => c.t >= endT - 300);
    }

    // -- Live foul/timeout trust ------------------------------------------

    // ESPN's competitor fouls/timeouts are unreliable between periods (all
    // seen live on 401909869, which went to OT): breaks pair the ended
    // period's foul count with the next period's foulsToGive/bonusState;
    // the first instant of a period can read "over the limit" at 0 PF; and
    // the timeout block can read 0 remaining with 0 used, which is
    // impossible. handoff = a break status, or a clock still showing the
    // full period length. Returns what the strip may show for one team.
    function teamSituation(team, other, handoff) {
        const f = team.fouls || {};
        const hasFouls = f.teamFoulsCurrent != null;
        const bothZeroBetween = handoff && team.timeoutsRemaining === 0 && other.timeoutsRemaining === 0;
        const blank = team.timeoutsRemaining === 0 &&
            (team.timeoutsUsed === 0 || (team.timeoutsUsed == null && bothZeroBetween));
        const overLimit = hasFouls && !handoff && f.teamFoulsCurrent > 0 && !!f.bonusState && f.bonusState !== 'NONE';
        return {
            fouls: hasFouls ? f.teamFoulsCurrent : null,
            gameFouls: hasFouls && f.teamFouls != null ? f.teamFouls : null,
            overLimit,
            toGive: hasFouls && !handoff && !overLimit && f.foulsToGive > 0 ? f.foulsToGive : null,
            timeouts: team.timeoutsRemaining != null && !blank ? team.timeoutsRemaining : null,
        };
    }

    return {
        teamSituation,
        HOOP, BASELINE_Y, HOOP_FROM_BASELINE, COURTS, ZONES, ZONE_LABEL,
        parseClock, fmtSec, gameFormat, periodLabel, periodLen, periodStart, elapsedAt, clockAt,
        isFreeThrow, isFGA, validCoord, shotGeom, shotZone, validShots, toCourt, zoneSplits,
        scoringEvents, runs, leads, droughts,
        wpTimeline, wpSwings, marginSeries,
        teamTotals, fourFactors, possessions, efficiency,
        splitWhere, clutch, lastFive,
    };
})();

if (typeof window !== 'undefined') window.BballMath = BballMath;

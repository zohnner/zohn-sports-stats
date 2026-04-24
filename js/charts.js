// ============================================================
// StatsCharts — Chart.js wrapper for ZohnStats
//
// All chart instances are tracked internally so they can be
// destroyed before the canvas is re-used. Always call
// StatsCharts.destroy(id) or StatsCharts.destroyAll() before
// navigating away from a view that contains charts.
//
// Degrades gracefully: every public method checks for
// window.Chart and returns null if Chart.js isn't loaded.
// ============================================================

class StatsCharts {
    // Active Chart instances keyed by canvas element id
    static #instances = new Map();

    // ── Normalisation bounds for radar chart ──────────────────
    // Adjust if player stat ranges change (e.g., different sport)
    static #RADAR_MAXES = {
        pts: 40,
        reb: 20,
        ast: 15,
        stl:  4,
        blk:  5,
    };
    static #RADAR_KEYS   = ['pts', 'reb', 'ast', 'stl', 'blk'];
    static #RADAR_LABELS = ['Points', 'Rebounds', 'Assists', 'Steals', 'Blocks'];

    // ── Shared Chart.js defaults pulled from CSS variables ────
    static #getTheme() {
        const s = getComputedStyle(document.documentElement);
        const get = v => s.getPropertyValue(v).trim();
        return {
            grid:         get('--chart-grid')        || 'rgba(255,255,255,0.06)',
            tick:         get('--chart-tick')         || '#64748b',
            tooltipBg:    get('--chart-tooltip-bg')   || 'rgba(8,15,30,0.95)',
            tooltipBorder:get('--chart-tooltip-border')|| 'rgba(255,255,255,0.1)',
            font:         get('--font-sans')           || 'Inter, sans-serif',
        };
    }

    // ── Internal: create & register a chart ───────────────────
    static #create(id, config) {
        if (!window.Chart) {
            Logger.warn(`Chart.js not loaded — skipping chart "${id}"`, undefined, 'CHARTS');
            return null;
        }

        this.destroy(id);

        const canvas = document.getElementById(id);
        if (!canvas) {
            Logger.warn(`Canvas #${id} not found in DOM`, undefined, 'CHARTS');
            return null;
        }

        try {
            const chart = new Chart(canvas, config);
            this.#instances.set(id, chart);
            Logger.debug(`Chart created: ${id}`, undefined, 'CHARTS');
            return chart;
        } catch (e) {
            Logger.error(`Chart creation failed: ${id}`, e, 'CHARTS');
            return null;
        }
    }

    // ── Public: lifecycle ─────────────────────────────────────

    static destroy(id) {
        if (this.#instances.has(id)) {
            this.#instances.get(id).destroy();
            this.#instances.delete(id);
        }
    }

    static destroyAll() {
        this.#instances.forEach(c => c.destroy());
        this.#instances.clear();
        Logger.debug('All charts destroyed', undefined, 'CHARTS');
    }

    // ── Public: chart types ───────────────────────────────────

    /**
     * Radar chart — stat profile for one or two players.
     *
     * @param {string} canvasId
     * @param {Array<{ label: string, data: object, color: string }>} datasets
     *   data must include: pts, reb, ast, stl, blk (season-average floats)
     * @returns {Chart|null}
     */
    static radar(canvasId, datasets) {
        const t = this.#getTheme();

        return this.#create(canvasId, {
            type: 'radar',
            data: {
                labels: this.#RADAR_LABELS,
                datasets: datasets.map(ds => {
                    const normalized = this.#RADAR_KEYS.map(k => {
                        const v = ds.data?.[k] ?? 0;
                        return Math.min(100, (v / this.#RADAR_MAXES[k]) * 100);
                    });

                    // Build a semi-transparent fill from the border colour
                    const fill = ds.color.startsWith('#')
                        ? ds.color + '26'   // hex + 15% alpha
                        : ds.color.replace(/[\d.]+\)$/, '0.15)');

                    return {
                        label: ds.label,
                        data: normalized,
                        borderColor: ds.color,
                        backgroundColor: fill,
                        pointBackgroundColor: ds.color,
                        pointBorderColor: 'transparent',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        borderWidth: 2,
                    };
                }),
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        ticks: { display: false, stepSize: 25 },
                        grid:        { color: 'rgba(255,255,255,0.08)' },
                        angleLines:  { color: 'rgba(255,255,255,0.06)' },
                        pointLabels: {
                            color: t.tick,
                            font: { family: t.font, size: 11, weight: '600' },
                        },
                    },
                },
                plugins: {
                    legend: {
                        display: datasets.length > 1,
                        position: 'bottom',
                        labels: {
                            color: t.tick,
                            usePointStyle: true,
                            pointStyleWidth: 8,
                            padding: 16,
                            font: { family: t.font, size: 11 },
                        },
                    },
                    tooltip: {
                        backgroundColor: t.tooltipBg,
                        borderColor: t.tooltipBorder,
                        borderWidth: 1,
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        padding: 10,
                        callbacks: {
                            label: ctx => {
                                const key = this.#RADAR_KEYS[ctx.dataIndex];
                                const raw = datasets[ctx.datasetIndex]?.data?.[key] ?? 0;
                                return ` ${ctx.dataset.label}: ${raw.toFixed(1)}`;
                            },
                        },
                    },
                },
            },
        });
    }

    /**
     * Horizontal bar chart — shooting splits (FG%, 3P%, FT%).
     *
     * @param {string} canvasId
     * @param {{ fg_pct, fg3_pct, ft_pct }} stats
     * @returns {Chart|null}
     */
    static shootingBars(canvasId, stats) {
        const t = this.#getTheme();
        const fg  = stats?.fg_pct  ? +(stats.fg_pct  * 100).toFixed(1) : 0;
        const fg3 = stats?.fg3_pct ? +(stats.fg3_pct * 100).toFixed(1) : 0;
        const ft  = stats?.ft_pct  ? +(stats.ft_pct  * 100).toFixed(1) : 0;

        return this.#create(canvasId, {
            type: 'bar',
            data: {
                labels: ['FG %', '3PT %', 'FT %'],
                datasets: [{
                    data: [fg, fg3, ft],
                    backgroundColor: [
                        'rgba(244,114,182,0.55)',
                        'rgba(167,139,250,0.55)',
                        'rgba(251,146, 60,0.55)',
                    ],
                    borderColor: ['#f472b6', '#a78bfa', '#fb923c'],
                    borderWidth: 1.5,
                    borderRadius: 6,
                    borderSkipped: false,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        min: 0,
                        max: 100,
                        ticks: {
                            color: t.tick,
                            font: { family: t.font, size: 11 },
                            callback: v => v + '%',
                        },
                        grid: { color: t.grid },
                    },
                    y: {
                        ticks: {
                            color: '#94a3b8',
                            font: { family: t.font, size: 12, weight: '700' },
                        },
                        grid: { display: false },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: t.tooltipBg,
                        borderColor: t.tooltipBorder,
                        borderWidth: 1,
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        padding: 10,
                        callbacks: { label: ctx => ` ${ctx.parsed.x.toFixed(1)}%` },
                    },
                },
            },
        });
    }

    /**
     * MLB Radar chart — stat profile for a hitter or pitcher.
     *
     * Hitter axes  : AVG · HR · RBI · OBP · SLG · SB
     * Pitcher axes : ERA · K/9 · BB/9 · WHIP · IP
     * Lower-is-better pitcher axes (ERA, BB/9, WHIP) are inverted so a
     * full spider = elite in every dimension.
     *
     * @param {string} canvasId
     * @param {Array<{ label: string, data: object, color: string }>} datasets
     *   Hitting data keys : avg, homeRuns, rbi, obp, slg, stolenBases (raw floats/ints)
     *   Pitching data keys: era, k9, bb9, whip, ip  (raw floats)
     * @param {'hitting'|'pitching'} group
     * @returns {Chart|null}
     */
    static mlbRadar(canvasId, datasets, group, position = '') {
        const t = this.#getTheme();

        const isHitting = group === 'hitting';

        const HITTING_LABELS = ['AVG', 'HR', 'RBI', 'OBP', 'SLG', 'SB'];
        const HITTING_KEYS   = ['avg', 'homeRuns', 'rbi', 'obp', 'slg', 'stolenBases'];
        // Default (league-wide) hitting maxes
        const HITTING_MAXES  = { avg: 0.350, homeRuns: 50, rbi: 130, obp: 0.430, slg: 0.600, stolenBases: 50 };
        // Position-aware hitting maxes (MLB-008) — elite ceiling for each position
        const POS_HITTING_MAXES = {
            C:   { avg: 0.330, homeRuns: 30, rbi:  90, obp: 0.410, slg: 0.510, stolenBases: 10 },
            '1B':{ avg: 0.340, homeRuns: 55, rbi: 130, obp: 0.420, slg: 0.620, stolenBases: 15 },
            '2B':{ avg: 0.350, homeRuns: 25, rbi:  90, obp: 0.430, slg: 0.480, stolenBases: 35 },
            '3B':{ avg: 0.330, homeRuns: 50, rbi: 120, obp: 0.410, slg: 0.590, stolenBases: 20 },
            SS:  { avg: 0.350, homeRuns: 30, rbi: 100, obp: 0.430, slg: 0.510, stolenBases: 40 },
            LF:  { avg: 0.330, homeRuns: 45, rbi: 120, obp: 0.410, slg: 0.570, stolenBases: 30 },
            CF:  { avg: 0.340, homeRuns: 30, rbi: 100, obp: 0.420, slg: 0.520, stolenBases: 50 },
            RF:  { avg: 0.330, homeRuns: 45, rbi: 120, obp: 0.410, slg: 0.580, stolenBases: 25 },
            DH:  { avg: 0.320, homeRuns: 55, rbi: 130, obp: 0.410, slg: 0.600, stolenBases: 10 },
            OF:  { avg: 0.340, homeRuns: 40, rbi: 115, obp: 0.415, slg: 0.560, stolenBases: 40 },
        };
        const activeHittingMaxes = (POS_HITTING_MAXES[position] || HITTING_MAXES);
        const HITTING_INVERT = {};

        const PITCHING_LABELS = ['ERA', 'K/9', 'BB/9', 'WHIP', 'IP'];
        const PITCHING_KEYS   = ['era', 'k9', 'bb9', 'whip', 'ip'];
        const PITCHING_MAXES  = { era: 6.0, k9: 14, bb9: 5.0, whip: 2.0, ip: 220 };
        // Inverted = lower raw value → higher score on chart (lower-is-better axes)
        const PITCHING_INVERT = { era: true, k9: false, bb9: true, whip: true, ip: false };

        const labels = isHitting ? HITTING_LABELS : PITCHING_LABELS;
        const keys   = isHitting ? HITTING_KEYS   : PITCHING_KEYS;
        const maxes  = isHitting ? activeHittingMaxes : PITCHING_MAXES;
        const invert = isHitting ? HITTING_INVERT : PITCHING_INVERT;

        // Decimal places for tooltip raw values per key
        const decimals = { avg: 3, obp: 3, slg: 3, era: 2, whip: 2, k9: 1, bb9: 1 };

        return this.#create(canvasId, {
            type: 'radar',
            data: {
                labels,
                datasets: datasets.map(ds => {
                    const normalized = keys.map(k => {
                        const v   = +(ds.data?.[k] ?? 0);
                        const pct = Math.min(1, v / maxes[k]);
                        return Math.max(0, invert[k] ? (1 - pct) * 100 : pct * 100);
                    });

                    const fill = ds.color.startsWith('#')
                        ? ds.color + '26'
                        : ds.color.replace(/[\d.]+\)$/, '0.15)');

                    return {
                        label: ds.label,
                        data: normalized,
                        borderColor: ds.color,
                        backgroundColor: fill,
                        pointBackgroundColor: ds.color,
                        pointBorderColor: 'transparent',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        borderWidth: 2,
                    };
                }),
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        ticks: { display: false, stepSize: 25 },
                        grid:        { color: 'rgba(255,255,255,0.08)' },
                        angleLines:  { color: 'rgba(255,255,255,0.06)' },
                        pointLabels: {
                            color: t.tick,
                            font: { family: t.font, size: 11, weight: '600' },
                        },
                    },
                },
                plugins: {
                    legend: {
                        display: datasets.length > 1,
                        position: 'bottom',
                        labels: {
                            color: t.tick,
                            usePointStyle: true,
                            pointStyleWidth: 8,
                            padding: 16,
                            font: { family: t.font, size: 11 },
                        },
                    },
                    tooltip: {
                        backgroundColor: t.tooltipBg,
                        borderColor: t.tooltipBorder,
                        borderWidth: 1,
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        padding: 10,
                        callbacks: {
                            label: ctx => {
                                const key = keys[ctx.dataIndex];
                                const raw = +(datasets[ctx.datasetIndex]?.data?.[key] ?? 0);
                                const dp  = decimals[key] ?? 0;
                                const val = raw.toFixed(dp);
                                return ` ${ctx.dataset.label}: ${val}`;
                            },
                        },
                    },
                },
            },
        });
    }

    /**
     * MLB game-log trend line.
     *
     * Hitter  metrics: AVG (rolling), HR, RBI per game (last 20 ABs)
     * Pitcher metrics: IP, K, ER per outing (last 8 outings)
     *
     * @param {string} canvasId
     * @param {Array}  logs   — array of game-log stat objects from MLB Stats API
     *   Hitting  entry: { date, avg, homeRuns, rbi, hits, atBats }
     *   Pitching entry: { date, inningsPitched, strikeOuts, earnedRuns }
     * @param {'hitting'|'pitching'} group
     * @param {string} color  — primary player/team color
     * @returns {Chart|null}
     */
    static mlbGameTrend(canvasId, logs, group, color = '#6366f1') {
        if (!logs || logs.length === 0) return null;
        const t = this.#getTheme();

        // Sort ascending (oldest → newest)
        const sorted = [...logs]
            .filter(g => g.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (sorted.length === 0) return null;

        const labels = sorted.map(g => {
            const d = new Date(g.date + 'T12:00:00');
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const accent2 = '#34d399';
        const accent3 = '#f87171';

        let datasets;
        if (group === 'hitting') {
            // Rolling AVG — displayed as ×1000 (e.g., .315 → "315")
            datasets = [
                {
                    label: 'AVG',
                    data:  sorted.map(g => g.avg != null ? +(parseFloat(g.avg) * 1000).toFixed(0) : null),
                    borderColor: color,
                    backgroundColor: 'transparent',
                    yAxisID: 'yAvg',
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color,
                    borderWidth: 2,
                    spanGaps: true,
                },
                {
                    label: 'HR',
                    data:  sorted.map(g => g.homeRuns ?? 0),
                    borderColor: '#fbbf24',
                    backgroundColor: 'transparent',
                    yAxisID: 'yCount',
                    tension: 0,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#fbbf24',
                    borderWidth: 1.5,
                    borderDash: [4, 3],
                },
                {
                    label: 'RBI',
                    data:  sorted.map(g => g.rbi ?? 0),
                    borderColor: accent2,
                    backgroundColor: 'transparent',
                    yAxisID: 'yCount',
                    tension: 0.2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: accent2,
                    borderWidth: 1.5,
                },
            ];

            return this.#create(canvasId, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        x: {
                            ticks: { color: t.tick, font: { family: t.font, size: 10 }, maxTicksLimit: 10 },
                            grid:  { color: 'rgba(255,255,255,0.04)' },
                        },
                        yAvg: {
                            type: 'linear',
                            position: 'left',
                            min: 0,
                            ticks: {
                                color: color,
                                font: { family: t.font, size: 10 },
                                callback: v => '.' + String(v).padStart(3, '0'),
                                maxTicksLimit: 5,
                            },
                            grid: { color: t.grid },
                        },
                        yCount: {
                            type: 'linear',
                            position: 'right',
                            min: 0,
                            ticks: {
                                color: t.tick,
                                font: { family: t.font, size: 10 },
                                stepSize: 1,
                                maxTicksLimit: 5,
                            },
                            grid: { display: false },
                        },
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'end',
                            labels: {
                                color: '#94a3b8',
                                usePointStyle: true,
                                pointStyleWidth: 8,
                                padding: 12,
                                font: { family: t.font, size: 11 },
                            },
                        },
                        tooltip: {
                            backgroundColor: t.tooltipBg,
                            borderColor: t.tooltipBorder,
                            borderWidth: 1,
                            titleColor: '#f1f5f9',
                            bodyColor: '#94a3b8',
                            padding: 10,
                            callbacks: {
                                label: ctx => {
                                    if (ctx.dataset.yAxisID === 'yAvg') {
                                        const v = ctx.parsed.y;
                                        return ` AVG: .${String(v).padStart(3, '0')}`;
                                    }
                                    return ` ${ctx.dataset.label}: ${ctx.parsed.y}`;
                                },
                            },
                        },
                    },
                },
            });
        } else {
            // Pitcher: IP (bar-ish), K, ER per outing
            datasets = [
                {
                    label: 'IP',
                    data:  sorted.map(g => parseFloat(g.inningsPitched) || 0),
                    borderColor: color,
                    backgroundColor: color + '18',
                    yAxisID: 'yIP',
                    tension: 0.2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color,
                    borderWidth: 2,
                    fill: true,
                },
                {
                    label: 'K',
                    data:  sorted.map(g => g.strikeOuts ?? 0),
                    borderColor: '#818cf8',
                    backgroundColor: 'transparent',
                    yAxisID: 'yCount',
                    tension: 0.2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#818cf8',
                    borderWidth: 1.5,
                },
                {
                    label: 'ER',
                    data:  sorted.map(g => g.earnedRuns ?? 0),
                    borderColor: accent3,
                    backgroundColor: 'transparent',
                    yAxisID: 'yCount',
                    tension: 0.2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: accent3,
                    borderWidth: 1.5,
                    borderDash: [4, 3],
                },
            ];

            return this.#create(canvasId, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        x: {
                            ticks: { color: t.tick, font: { family: t.font, size: 10 }, maxTicksLimit: 10 },
                            grid:  { color: 'rgba(255,255,255,0.04)' },
                        },
                        yIP: {
                            type: 'linear',
                            position: 'left',
                            min: 0,
                            ticks: {
                                color: color,
                                font: { family: t.font, size: 10 },
                                callback: v => v + ' IP',
                                maxTicksLimit: 6,
                            },
                            grid: { color: t.grid },
                        },
                        yCount: {
                            type: 'linear',
                            position: 'right',
                            min: 0,
                            ticks: {
                                color: t.tick,
                                font: { family: t.font, size: 10 },
                                stepSize: 1,
                                maxTicksLimit: 6,
                            },
                            grid: { display: false },
                        },
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'end',
                            labels: {
                                color: '#94a3b8',
                                usePointStyle: true,
                                pointStyleWidth: 8,
                                padding: 12,
                                font: { family: t.font, size: 11 },
                            },
                        },
                        tooltip: {
                            backgroundColor: t.tooltipBg,
                            borderColor: t.tooltipBorder,
                            borderWidth: 1,
                            titleColor: '#f1f5f9',
                            bodyColor: '#94a3b8',
                            padding: 10,
                        },
                    },
                },
            });
        }
    }

    /**
     * Line chart — PTS/REB/AST trend over the last N games.
     *
     * @param {string} canvasId
     * @param {Array}  games  — from fetchPlayerGamesAPI (BDL /stats entries)
     * @returns {Chart|null}
     */
    static gameTrend(canvasId, games) {
        if (!games || games.length === 0) return null;

        const t = this.#getTheme();

        // Sort ascending (oldest → newest) for a left-to-right trend
        const sorted = [...games]
            .filter(g => g.game?.date)
            .sort((a, b) => new Date(a.game.date) - new Date(b.game.date));

        if (sorted.length === 0) return null;

        const labels = sorted.map(g => {
            const d = new Date(g.game.date);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const mkDataset = (label, key, color) => ({
            label,
            data: sorted.map(g => g[key] ?? 0),
            borderColor: color,
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: color,
            borderWidth: 2,
            fill: false,
        });

        return this.#create(canvasId, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    mkDataset('PTS', 'pts', '#fbbf24'),
                    mkDataset('REB', 'reb', '#34d399'),
                    mkDataset('AST', 'ast', '#60a5fa'),
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        ticks: { color: t.tick, font: { family: t.font, size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.04)' },
                    },
                    y: {
                        min: 0,
                        ticks: { color: t.tick, font: { family: t.font, size: 11 }, stepSize: 5 },
                        grid: { color: t.grid },
                    },
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: '#94a3b8',
                            usePointStyle: true,
                            pointStyleWidth: 8,
                            padding: 12,
                            font: { family: t.font, size: 11 },
                        },
                    },
                    tooltip: {
                        backgroundColor: t.tooltipBg,
                        borderColor: t.tooltipBorder,
                        borderWidth: 1,
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        padding: 12,
                    },
                },
            },
        });
    }
    /**
     * Career trend line — one stat across multiple seasons.
     *
     * @param {string} canvasId
     * @param {Array<{season: number, stats: object}>} rows  oldest→newest
     * @param {string} statKey  e.g. 'pts', 'reb', 'fg_pct'
     * @param {string} [color]
     * @returns {Chart|null}
     */
    static careerTrend(canvasId, rows, statKey, color = '#818cf8') {
        if (!rows || rows.length < 2) return null;
        const t = this.#getTheme();

        const isPct = statKey.endsWith('_pct');
        const seasonLabel = yr => `${yr}–${String(yr + 1).slice(-2)}`;

        const labels = rows.map(r => seasonLabel(r.season));
        const values = rows.map(r => {
            const v = parseFloat(r.stats?.[statKey]);
            if (isNaN(v)) return null;
            return isPct ? +(v * 100).toFixed(1) : +v.toFixed(1);
        });

        const statLabels = {
            // NBA
            pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK',
            fg_pct: 'FG%', fg3_pct: '3P%', ft_pct: 'FT%', min: 'MIN',
            // MLB hitting
            avg: 'AVG', obp: 'OBP', slg: 'SLG', ops: 'OPS',
            homeRuns: 'HR', rbi: 'RBI', stolenBases: 'SB',
            hits: 'H', runs: 'R', atBats: 'AB',
            // MLB pitching
            era: 'ERA', whip: 'WHIP', wins: 'W', losses: 'L',
            strikeOuts: 'K', inningsPitched: 'IP', saves: 'SV',
        };
        const label = statLabels[statKey] || statKey.toUpperCase();

        return this.#create(canvasId, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    borderColor: color,
                    backgroundColor: color + '18',
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: color,
                    borderWidth: 2.5,
                    fill: true,
                    spanGaps: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        ticks: { color: t.tick, font: { family: t.font, size: 11, weight: '600' } },
                        grid: { color: 'rgba(255,255,255,0.04)' },
                    },
                    y: {
                        min: 0,
                        ticks: {
                            color: t.tick,
                            font: { family: t.font, size: 11 },
                            callback: v => isPct ? v + '%' : v,
                            maxTicksLimit: 6,
                        },
                        grid: { color: t.grid },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: t.tooltipBg,
                        borderColor: t.tooltipBorder,
                        borderWidth: 1,
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        padding: 10,
                        callbacks: {
                            label: ctx => {
                                const v = ctx.parsed.y;
                                return ` ${label}: ${v != null ? (isPct ? v.toFixed(1) + '%' : v.toFixed(1)) : '—'}`;
                            },
                        },
                    },
                },
            },
        });
    }

    // ── Share Card (ANN-002) ─────────────────────────────────────
    // Draws a 720×400 stat card on a canvas element.
    // stats: [{label, value, color}] — up to 6 shown (2 rows × 3 cols)
    static drawShareCard(canvas, { name, position, teamName, teamAbbr, primaryColor, secondaryColor, season, stats }) {
        const W = 720, H = 400;
        canvas.width  = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        const pc  = primaryColor || '#6366f1';

        // Background gradient
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0f172a');
        bg.addColorStop(1, '#1a2744');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Subtle diagonal team-color wash
        ctx.save();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = pc;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(W * 0.6, 0); ctx.lineTo(W * 0.3, H); ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Left accent bar
        ctx.fillStyle = pc;
        ctx.fillRect(0, 0, 7, H);

        // Team abbreviation watermark
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 180px system-ui,-apple-system,sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(teamAbbr || '', W - 10, H / 2);
        ctx.restore();

        // Avatar circle
        const initials = name.split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
        ctx.beginPath();
        ctx.arc(80, H / 2, 50, 0, Math.PI * 2);
        ctx.fillStyle = pc + '28';
        ctx.fill();
        ctx.strokeStyle = pc;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = pc;
        ctx.font = 'bold 26px system-ui,-apple-system,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, 80, H / 2);

        // Player name
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 30px system-ui,-apple-system,sans-serif';
        ctx.fillText(name, 148, 108);

        // Position · team · season
        ctx.fillStyle = '#94a3b8';
        ctx.font = '15px system-ui,-apple-system,sans-serif';
        const meta = [position, teamName || teamAbbr, season ? `${season} Season` : ''].filter(Boolean).join(' · ');
        ctx.fillText(meta, 148, 136);

        // Divider
        ctx.fillStyle = '#1e3a5f';
        ctx.fillRect(22, 160, W - 44, 1);

        // Stats grid (2 rows × 3 cols)
        const colXs  = [180, 360, 540];
        const rowYs  = [225, 310];
        const show   = (stats || []).slice(0, 6);
        show.forEach(({ label, value, color }, i) => {
            const x   = colXs[i % 3];
            const y   = rowYs[Math.floor(i / 3)];
            const clr = color || '#f1f5f9';

            ctx.fillStyle = clr;
            ctx.font = 'bold 28px system-ui,-apple-system,sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(String(value ?? '—'), x, y);

            ctx.fillStyle = '#64748b';
            ctx.font = '11px system-ui,-apple-system,sans-serif';
            ctx.fillText(label.toUpperCase(), x, y + 20);
        });

        // Footer
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#475569';
        ctx.font = '12px system-ui,-apple-system,sans-serif';
        ctx.fillText('SportsStrata', 28, H - 18);

        ctx.textAlign = 'right';
        ctx.fillText('Serious stats for serious fans', W - 24, H - 18);
    }

    static downloadShareCard(player, stats, group, colors) {
        const canvas = document.createElement('canvas');

        const lead = v => v != null ? parseFloat(v).toFixed(3).replace(/^0\./, '.') : '—';
        const f1   = v => v != null ? parseFloat(v).toFixed(1) : '—';
        const f2   = v => v != null ? parseFloat(v).toFixed(2) : '—';
        const pct  = v => v != null ? (parseFloat(v) * 100).toFixed(1) + '%' : '—';

        const statDefs = group === 'pitching' ? [
            { label: 'ERA',  value: f2(stats.era),              color: '#f87171' },
            { label: 'WHIP', value: f2(stats.whip),             color: '#fb923c' },
            { label: 'K',    value: stats.strikeOuts ?? '—',    color: '#a78bfa' },
            { label: 'W',    value: stats.wins ?? '—',          color: '#34d399' },
            { label: 'IP',   value: stats.inningsPitched ?? '—',color: '#60a5fa' },
            { label: 'K/9',  value: f1(stats.strikeoutsPer9Inn),color: '#94a3b8' },
        ] : group === 'hitting' ? [
            { label: 'AVG',  value: lead(stats.avg),             color: '#fbbf24' },
            { label: 'OBP',  value: lead(stats.obp),             color: '#34d399' },
            { label: 'SLG',  value: lead(stats.slg),             color: '#60a5fa' },
            { label: 'HR',   value: stats.homeRuns ?? '—',       color: '#f87171' },
            { label: 'RBI',  value: stats.rbi ?? '—',            color: '#fb923c' },
            { label: 'OPS',  value: lead(stats.ops),             color: '#a78bfa' },
        ] : [
            { label: 'PTS',  value: f1(stats.pts),     color: '#fbbf24' },
            { label: 'REB',  value: f1(stats.reb),     color: '#34d399' },
            { label: 'AST',  value: f1(stats.ast),     color: '#60a5fa' },
            { label: 'FG%',  value: pct(stats.fg_pct), color: '#f472b6' },
            { label: '3P%',  value: pct(stats.fg3_pct),color: '#818cf8' },
            { label: 'STL',  value: f1(stats.stl),     color: '#a78bfa' },
        ];

        StatsCharts.drawShareCard(canvas, {
            name:         player.fullName || `${player.first_name || ''} ${player.last_name || ''}`.trim(),
            position:     player.position || '',
            teamName:     player.teamName || player.team?.full_name || '',
            teamAbbr:     player.teamAbbr || player.team?.abbreviation || '',
            primaryColor: colors?.primary,
            season:       typeof MLB_SEASON !== 'undefined' ? MLB_SEASON : new Date().getFullYear(),
            stats:        statDefs,
        });

        const link     = document.createElement('a');
        const safeName = (player.fullName || player.last_name || 'player').replace(/[^a-z0-9]/gi, '-').toLowerCase();
        link.download  = `sportsstr-${safeName}.png`;
        link.href      = canvas.toDataURL('image/png');
        link.click();
    }
}

window.StatsCharts = StatsCharts;

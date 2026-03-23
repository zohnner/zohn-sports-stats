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
}

window.StatsCharts = StatsCharts;

// ============================================================
// Tonight's Stakes — home record-watch strip.
// Renders data/tonights-stakes.json into the home view directly
// under Today's Games. Self-hiding by design: nothing is inserted
// unless the file holds items dated today (America/Chicago), so an
// empty or stale file leaves the homepage untouched.
// ============================================================
(function () {
    'use strict';

    var DATA_URL = '/data/tonights-stakes.json';
    var SECTION_ID = 'tonightsStakes';
    var _data = null;
    var _loading = false;

    function esc(s) {
        if (typeof _escHtml === 'function') return _escHtml(s == null ? '' : String(s));
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function todayStr() {
        // Freshness is judged on the America/Chicago date, not the
        // viewer's clock: a viewer east of Central would otherwise roll
        // to tomorrow at their midnight and lose the strip while
        // tonight's Central-time game is still being played.
        try {
            var parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Chicago',
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).formatToParts(new Date());
            var p = {};
            for (var i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
            return p.year + '-' + p.month + '-' + p.day;
        } catch (e) {
            var d = new Date();
            var m = String(d.getMonth() + 1).padStart(2, '0');
            var day = String(d.getDate()).padStart(2, '0');
            return d.getFullYear() + '-' + m + '-' + day;
        }
    }

    function cardHtml(it) {
        var color = /^#[0-9a-fA-F]{3,8}$/.test(it.teamColor || '') ? it.teamColor : '';
        var game = esc(it.matchupShort || '') + (it.start ? ' · ' + esc(it.start) : '');
        return '<article class="ts-card"' + (color ? ' style="--team-color:' + color + '"' : '') + '>'
            + '<div class="ts-card-top">'
            + (it.sport ? '<span class="hgc-pill hgc-pill--sched">' + esc(it.sport) + '</span>' : '<span></span>')
            + '<span class="ts-game">' + game + '</span>'
            + '</div>'
            + '<div class="ts-entity">' + esc(it.entity || '') + '</div>'
            + (it.stake ? '<p class="ts-stake">' + esc(it.stake) + '</p>' : '')
            + (it.detail ? '<p class="ts-detail">' + esc(it.detail) + '</p>' : '')
            + '<div class="ts-need">'
            + '<span class="ts-need-value">' + esc(it.needValue || '') + '</span>'
            + '<span class="ts-need-label">' + esc(it.needLabel || '') + '</span>'
            + '</div>'
            + (it.source ? '<div class="ts-source">Source: ' + esc(it.source) + '</div>' : '')
            + '</article>';
    }

    function sectionHtml(data) {
        return '<section class="home-zone ts-strip" id="' + SECTION_ID + '" aria-label="Tonight\'s stakes">'
            + '<div class="home-section-hdr">'
            + '<span class="home-section-title">Tonight\'s Stakes</span>'
            + (data.label ? '<span class="home-section-date">' + esc(data.label) + '</span>' : '')
            + '</div>'
            + '<div class="ts-grid">' + data.items.map(cardHtml).join('') + '</div>'
            + '</section>';
    }

    function tryRender() {
        if (!_data || document.getElementById(SECTION_ID)) return;
        var anchor = document.getElementById('homeTodayGames');
        if (!anchor || !anchor.parentNode) return;
        anchor.insertAdjacentHTML('afterend', sectionHtml(_data));
    }

    function load() {
        if (_data || _loading) return;
        _loading = true;
        fetch(DATA_URL)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                _loading = false;
                if (!data || !Array.isArray(data.items) || !data.items.length) return;
                if (data.date && data.date !== todayStr()) return;
                _data = data;
                tryRender();
            })
            .catch(function () { _loading = false; });
    }

    function boot() {
        load();
        // loadHome() rebuilds #playersGrid on every home visit — re-insert
        // after each rebuild. tryRender() is idempotent and a no-op on
        // non-home views (no #homeTodayGames anchor there).
        var grid = document.getElementById('playersGrid');
        if (grid && typeof MutationObserver === 'function') {
            new MutationObserver(function () { load(); tryRender(); })
                .observe(grid, { childList: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

// ============================================================
// Logger — structured console logging with levels & history
// ============================================================
class Logger {
    static #history = [];
    static #max = 200;
    static #styles = {
        DEBUG: 'color:#475569;font-style:italic',
        INFO:  'color:#60a5fa',
        WARN:  'color:#fbbf24;font-weight:600',
        ERROR: 'color:#f87171;font-weight:700'
    };

    static #write(level, ctx, msg, data) {
        const ts = new Date();
        this.#history.push({ level, ctx, msg, data, ts });
        if (this.#history.length > this.#max) this.#history.shift();

        const hms = ts.toLocaleTimeString('en-US', { hour12: false });
        const ms  = String(ts.getMilliseconds()).padStart(3, '0');
        const tag = ctx ? ` [${ctx}]` : '';
        const prefix = `%c${hms}.${ms} ${level}${tag}`;
        const style  = this.#styles[level];

        const fn = level === 'ERROR' ? console.error
                 : level === 'WARN'  ? console.warn
                 : console.log;

        data !== undefined ? fn(prefix, style, msg, data) : fn(prefix, style, msg);
    }

    static debug(msg, data, ctx) { this.#write('DEBUG', ctx, msg, data); }
    static info (msg, data, ctx) { this.#write('INFO',  ctx, msg, data); }
    static warn (msg, data, ctx) { this.#write('WARN',  ctx, msg, data); }
    static error(msg, data, ctx) { this.#write('ERROR', ctx, msg, data); }

    /**
     * Wrap an async function with automatic timing.
     * Logs how long it took and re-throws on failure.
     */
    static async time(label, fn, ctx = 'PERF') {
        const t0 = performance.now();
        try {
            const result = await fn();
            const ms = (performance.now() - t0).toFixed(0);
            this.#write('INFO', ctx, `${label}  ✓  ${ms}ms`);
            return result;
        } catch (err) {
            const ms = (performance.now() - t0).toFixed(0);
            this.#write('ERROR', ctx, `${label}  ✗  ${ms}ms — ${err.message}`);
            throw err;
        }
    }

    /** Return a copy of recent log history, optionally filtered by level. */
    static getLogs(level) {
        return level ? this.#history.filter(e => e.level === level) : [...this.#history];
    }
}

// ============================================================
// ErrorHandler — toast notifications & in-page error states
// ============================================================
class ErrorHandler {
    static #toastContainer = null;

    static #getContainer() {
        if (!this.#toastContainer) {
            this.#toastContainer = document.createElement('div');
            this.#toastContainer.className = 'toast-container';
            document.body.appendChild(this.#toastContainer);
        }
        return this.#toastContainer;
    }

    /**
     * Show a dismissible toast notification.
     * @param {string} message
     * @param {'error'|'warn'|'success'|'info'} type
     * @param {{ title?: string, duration?: number }} opts
     * @returns {Function} dismiss function
     */
    static toast(message, type = 'error', { title, duration = 5000 } = {}) {
        const icons    = { error: '⚠️', warn: '🔔', success: '✅', info: 'ℹ️' };
        const defaults = { error: 'Error', warn: 'Warning', success: 'Success', info: 'Info' };

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <div class="toast-body">
                <div class="toast-title">${title ?? defaults[type]}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="Dismiss">×</button>
        `;

        const dismiss = () => {
            el.classList.add('toast-out');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        };

        el.querySelector('.toast-close').addEventListener('click', dismiss);
        this.#getContainer().appendChild(el);
        if (duration > 0) setTimeout(dismiss, duration);

        Logger.warn(`Toast [${type}]: ${message}`, undefined, 'UI');
        return dismiss;
    }

    /**
     * Render an error state inside a grid container.
     * @param {HTMLElement} container
     * @param {Error|string} error
     * @param {Function|null} retryFn   called when user clicks "Try Again"
     */
    static renderErrorState(container, error, retryFn = null) {
        const message = error instanceof Error ? error.message : String(error);

        container.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon">⚠️</div>
                <h3 class="error-state-title">Something went wrong</h3>
                <p class="error-state-message">${message}</p>
                ${retryFn ? '<button class="retry-btn">↺ Try Again</button>' : ''}
            </div>
        `;

        if (retryFn) {
            container.querySelector('.retry-btn').addEventListener('click', retryFn);
        }
    }

    /**
     * Render an empty state inside a grid container.
     * @param {HTMLElement} container
     * @param {string} title
     * @param {string} icon
     */
    static renderEmptyState(container, title = 'No results found', icon = '🏀') {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${icon}</div>
                <p class="empty-state-title">${title}</p>
            </div>
        `;
    }

    // Backwards compatibility with old API
    static log(error, ctx = '')         { Logger.error(String(error), error, ctx || 'LEGACY'); }
    static showUserError(msg, title)    { this.toast(msg, 'error', { title }); }
}

window.Logger = Logger;
window.ErrorHandler = ErrorHandler;

// ============================================================
// Global unhandled-rejection safety net
// Catches any Promise that rejects without a .catch() handler
// and fires a warn toast so the user knows something went wrong.
// ============================================================
window.addEventListener('unhandledrejection', event => {
    // AbortError is expected when fetches are intentionally cancelled — ignore it.
    if (event.reason?.name === 'AbortError') return;
    const msg = event.reason?.message || String(event.reason) || 'An unexpected error occurred';
    Logger.error('Unhandled rejection', event.reason, 'GLOBAL');
    ErrorHandler.toast(msg, 'warn', { title: 'Something failed', duration: 4000 });
});

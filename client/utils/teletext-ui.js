/**
 * Shared Ceefax UI utilities.
 * Extracted common patterns from index.js, fpl.js, fixtureslist.js, league.js.
 */

/**
 * Start the teletext clock in the top-right area.
 * Looks for an element with id="clock" or class="teletext-clock".
 */
const startClock = () => {
  const clockEl = document.getElementById('clock') || document.querySelector('.teletext-clock');
  if (!clockEl) return;

  const update = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  };

  update();
  setInterval(update, 1000);
};

/**
 * Show an error message in the Ceefax style.
 * Inserts into element with id="error-display" or the provided container.
 *
 * @param {string} message
 * @param {HTMLElement} [container]
 */
const showError = (message, container) => {
  const el = container || document.getElementById('error-display') || document.querySelector('.content');
  if (!el) {
    console.error('showError: no container found', message);
    return;
  }
  const div = document.createElement('div');
  div.className = 'error-message';
  div.style.cssText = 'color: #ff0000; background: #000080; padding: 4px 8px; margin: 4px 0;';
  div.textContent = `ERROR: ${message}`;
  el.prepend(div);
};

/**
 * Show a "loading..." placeholder.
 *
 * @param {HTMLElement} container
 * @param {string} [text]
 */
const showLoading = (container, text = 'Loading...') => {
  if (!container) return;
  container.innerHTML = `<div class="loading" style="color:#00ffff">${text}</div>`;
};

/**
 * Show a stale data warning banner.
 * Called when API returns _isStale: true.
 *
 * @param {number} ageMinutes
 * @param {HTMLElement} [container]
 */
const showStaleWarning = (ageMinutes, container) => {
  const el = container || document.querySelector('.content');
  if (!el) return;
  const div = document.createElement('div');
  div.style.cssText = 'color:#ffff00; background:#000000; padding:2px 8px; font-size:0.9em;';
  div.textContent = `Data may be ${ageMinutes}m old (using cached version)`;
  el.prepend(div);
};

// Auto-start clock when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startClock);
} else {
  startClock();
}

window.TeletextUI = { startClock, showError, showLoading, showStaleWarning };

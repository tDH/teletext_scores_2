// Tamboozle Leaderboard — P502
// Standalone leaderboard page with Scotland / England toggle.

document.addEventListener('DOMContentLoaded', async function () {

    // ── Clock ──────────────────────────────────────────────────────────
    const timeDisplay = document.getElementById('ceefax-time');
    const pad = n => String(n).padStart(2, '0');
    function updateClock() {
        if (!timeDisplay) return;
        const now = new Date();
        timeDisplay.textContent =
            `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
    updateClock();
    setInterval(updateClock, 1000);

    const container = document.getElementById('leaderboard-container');
    let lbCache = { scotland: null, england: null };
    let activeLeague = 'scotland';

    // ── Fetch both leaderboards in parallel ────────────────────────────
    try {
        const [scotRes, engRes] = await Promise.allSettled([
            fetch('/api/quiz/leaderboard?league=scotland').then(r => r.json()),
            fetch('/api/quiz/leaderboard?league=england').then(r => r.json()),
        ]);

        lbCache.scotland = scotRes.status === 'fulfilled' ? (scotRes.value.leaderboard || []) : [];
        lbCache.england  = engRes.status  === 'fulfilled' ? (engRes.value.leaderboard  || []) : [];
    } catch (err) {
        container.innerHTML = '<div class="ceefax-error">ERROR LOADING LEADERBOARD</div>';
        return;
    }

    // ── Tab switching ──────────────────────────────────────────────────
    const tabs = document.querySelectorAll('.tamboozle-lb-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeLeague = tab.dataset.league;
            render(activeLeague);
        });
    });

    // ── Render ─────────────────────────────────────────────────────────
    function render(league) {
        const rows = lbCache[league] || [];

        // Update footer timestamp
        const now = new Date();
        const updateEl = document.querySelector('.ceefax-update');
        if (updateEl) updateEl.textContent = `UPDATED: ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        if (!rows.length) {
            container.innerHTML = '<div class="ceefax-info">NO SCORES YET</div>';
            return;
        }

        container.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'ceefax-quiz-lb-row ceefax-quiz-lb-header';
        header.innerHTML = `
            <span class="ceefax-quiz-lb-rank">#</span>
            <span class="ceefax-quiz-lb-name">INIT</span>
            <span class="ceefax-quiz-lb-meta">LEAGUE / DEC</span>
            <span class="ceefax-quiz-lb-score">PTS</span>
            <span class="ceefax-quiz-lb-time">TIME</span>
        `;
        container.appendChild(header);

        rows.forEach((row, idx) => {
            const el = document.createElement('div');
            el.className = 'ceefax-quiz-lb-row';
            const timeSec = (row.total_time_ms / 1000).toFixed(1);
            const meta    = `${row.league.substring(0, 3).toUpperCase()} / ${row.decade}`;

            el.innerHTML = `
                <span class="ceefax-quiz-lb-rank">${idx + 1}</span>
                <span class="ceefax-quiz-lb-name">${row.player_name.toUpperCase()}</span>
                <span class="ceefax-quiz-lb-meta">${meta}</span>
                <span class="ceefax-quiz-lb-score">${row.correct_answers}/5</span>
                <span class="ceefax-quiz-lb-time">${timeSec}s</span>
            `;
            container.appendChild(el);
        });
    }

    // Show Scotland by default
    render(activeLeague);
});

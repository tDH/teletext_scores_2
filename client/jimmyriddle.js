// Jimmyriddle — P503
// LLM-generated mystery football player. Guess from stats before the timer runs out.

const TIMER_SECONDS = 180; // 3 minutes

document.addEventListener('DOMContentLoaded', function () {

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

    // ── State ──────────────────────────────────────────────────────────
    let state = {};

    function resetState() {
        state = {
            player:          null,
            timerRemaining:  TIMER_SECONDS,
            timerInterval:   null,
            revealed:        false,
        };
    }
    resetState();

    // ── Screen switching ───────────────────────────────────────────────
    const screens = {
        loading: document.getElementById('loading-screen'),
        riddle:  document.getElementById('riddle-screen'),
    };
    function showScreen(name) {
        if (document.activeElement) document.activeElement.blur();
        Object.values(screens).forEach(s => { s.style.display = 'none'; });
        if (screens[name]) screens[name].style.display = 'block';
    }

    // ── Reveal button ──────────────────────────────────────────────────
    document.getElementById('jr-reveal-btn').addEventListener('click', function () {
        if (!state.revealed) {
            reveal();
        } else {
            loadPlayer();
        }
    });

    // ── Load player ────────────────────────────────────────────────────
    async function loadPlayer() {
        resetState();
        showScreen('loading');

        // Reset the WHO AM I box and button for a fresh round
        const whoBox  = document.getElementById('jr-who-box');
        const revBtn  = document.getElementById('jr-reveal-btn');
        whoBox.textContent = 'WHO AM I?';
        whoBox.classList.remove('jimmyriddle-revealed');
        revBtn.textContent = 'REVEAL \u25b6';

        try {
            const res = await fetch('/api/jimmyriddle/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            state.player = data.player;
        } catch (err) {
            // Show error on loading screen rather than crashing
            screens.loading.querySelector('.ceefax-loading').textContent =
                `ERROR: ${err.message}`;
            return;
        }

        // Populate stat fields
        const p = state.player;
        document.getElementById('jr-nationality').textContent = p.nationality;
        document.getElementById('jr-teams').textContent       = p.teams.join(' \u00b7 ');
        document.getElementById('jr-trophies').textContent    = p.trophies.join(' \u00b7 ');
        document.getElementById('jr-goals').textContent       = p.goals;
        document.getElementById('jr-era').textContent         = p.era;
        document.getElementById('jr-moment').textContent      = p.famousMoment;

        // Reset timer bar
        state.timerRemaining = TIMER_SECONDS;
        updateTimerDisplay();

        showScreen('riddle');
        startTimer();
    }

    // ── Timer ──────────────────────────────────────────────────────────
    function startTimer() {
        clearInterval(state.timerInterval);
        state.timerInterval = setInterval(() => {
            state.timerRemaining--;
            updateTimerDisplay();
            if (state.timerRemaining <= 0) {
                clearInterval(state.timerInterval);
                reveal();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const remaining = state.timerRemaining;
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        document.getElementById('jr-timer-display').textContent =
            `${mins}:${pad(secs)}`;

        const pct  = (remaining / TIMER_SECONDS) * 100;
        const fill = document.getElementById('jr-timer-fill');
        fill.style.width = `${pct}%`;

        if (remaining > 120)      fill.style.backgroundColor = 'var(--ceefax-green)';
        else if (remaining > 60)  fill.style.backgroundColor = 'var(--ceefax-yellow)';
        else                      fill.style.backgroundColor = 'var(--ceefax-red)';
    }

    // ── Reveal ─────────────────────────────────────────────────────────
    function reveal() {
        clearInterval(state.timerInterval);
        state.revealed = true;

        const whoBox = document.getElementById('jr-who-box');
        whoBox.textContent = state.player.playerName.toUpperCase();
        whoBox.classList.add('jimmyriddle-revealed');

        document.getElementById('jr-reveal-btn').textContent = 'PLAY AGAIN \u25b6';
    }

    // ── Kick off ───────────────────────────────────────────────────────
    loadPlayer();
});

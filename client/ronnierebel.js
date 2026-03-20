// RonnieRebel — P504
// LLM-generated Irish rebel music & history quiz. Single global leaderboard.

const QUESTIONS_COUNT = 5;
const QUESTION_TIME_LIMIT = 30; // seconds

// Colour for each answer position: A=red, B=green, C=yellow, D=cyan
const ANSWER_COLOURS = ['red', 'green', 'yellow', 'cyan'];

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
    let lbCache = null; // single flat cache (no league split)

    function resetState() {
        state = {
            initials: '',
            questions: [],
            currentQuestion: 0,
            correctAnswers: 0,
            totalTimeMs: 0,
            questionStartTime: null,
            timerInterval: null,
            timerRemaining: QUESTION_TIME_LIMIT,
        };
        lbCache = null;
    }
    resetState();

    // ── Screen switching ───────────────────────────────────────────────
    const screens = {
        setup:   document.getElementById('rr-setup-screen'),
        loading: document.getElementById('rr-loading-screen'),
        quiz:    document.getElementById('rr-quiz-screen'),
        results: document.getElementById('rr-results-screen'),
    };
    function showScreen(name) {
        if (document.activeElement) document.activeElement.blur();
        Object.values(screens).forEach(s => { s.style.display = 'none'; });
        if (screens[name]) screens[name].style.display = 'block';
    }

    // ── Setup ──────────────────────────────────────────────────────────
    document.getElementById('rr-start-btn').addEventListener('click', startQuiz);
    document.getElementById('rr-again-btn').addEventListener('click', playAgain);

    // Auto-uppercase initials as typed
    document.getElementById('rr-name').addEventListener('input', function () {
        this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    async function startQuiz() {
        const rawName = document.getElementById('rr-name').value.trim().toUpperCase();
        const errEl   = document.getElementById('rr-setup-error');

        if (!rawName) {
            errEl.textContent = 'PLEASE ENTER YOUR INITIALS';
            errEl.style.display = 'block';
            document.getElementById('rr-name').focus();
            return;
        }
        errEl.style.display = 'none';

        resetState();
        state.initials = rawName.substring(0, 3);

        showScreen('loading');

        try {
            const res = await fetch('/api/ronnierebel/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            state.questions = data.questions;
        } catch (err) {
            showScreen('setup');
            const errEl2 = document.getElementById('rr-setup-error');
            errEl2.textContent = `ERROR: ${err.message}`;
            errEl2.style.display = 'block';
            return;
        }

        state.currentQuestion = 0;
        showQuestion(0);
    }

    function playAgain() {
        resetState();
        document.getElementById('rr-name').value = '';
        document.getElementById('rr-setup-error').style.display = 'none';
        showScreen('setup');
    }

    // ── Question display ───────────────────────────────────────────────
    function showQuestion(index) {
        showScreen('quiz');
        const q = state.questions[index];

        state.timerRemaining    = QUESTION_TIME_LIMIT;
        state.questionStartTime = Date.now();

        document.getElementById('rr-question-counter').textContent =
            `Q${index + 1} OF ${QUESTIONS_COUNT}`;
        document.getElementById('rr-question-text').textContent = q.question;

        // Render option buttons with coloured squares
        const optionsEl = document.getElementById('rr-options');
        optionsEl.innerHTML = '';
        q.options.forEach((opt, i) => {
            const colour = ANSWER_COLOURS[i]; // red | green | yellow | cyan
            const btn = document.createElement('button');
            btn.className = 'ceefax-quiz-option';

            const sq = document.createElement('span');
            sq.className = `tamboozle-colour-sq tamboozle-colour-sq--${colour}`;

            const txt = document.createElement('span');
            txt.textContent = opt;

            btn.appendChild(sq);
            btn.appendChild(txt);
            btn.addEventListener('click', () => handleAnswer(i));
            optionsEl.appendChild(btn);
        });

        // Blur after new buttons are in the DOM so no button inherits focus
        if (document.activeElement) document.activeElement.blur();

        // Countdown timer
        clearInterval(state.timerInterval);
        updateTimerDisplay();
        state.timerInterval = setInterval(() => {
            state.timerRemaining--;
            updateTimerDisplay();
            if (state.timerRemaining <= 0) {
                clearInterval(state.timerInterval);
                handleAnswer(null, true);
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const pct  = (state.timerRemaining / QUESTION_TIME_LIMIT) * 100;
        const fill = document.getElementById('rr-timer-fill');
        fill.style.width = `${pct}%`;
        if (state.timerRemaining > 15)      fill.style.backgroundColor = 'var(--ceefax-green)';
        else if (state.timerRemaining > 7)  fill.style.backgroundColor = 'var(--ceefax-yellow)';
        else                                fill.style.backgroundColor = 'var(--ceefax-red)';
        document.getElementById('rr-timer-display').textContent = `${state.timerRemaining}s`;
    }

    // ── Answer handling ────────────────────────────────────────────────
    function handleAnswer(selectedIndex, isTimeout = false) {
        clearInterval(state.timerInterval);

        const elapsed = isTimeout
            ? QUESTION_TIME_LIMIT * 1000
            : (Date.now() - state.questionStartTime);
        state.totalTimeMs += elapsed;

        const q         = state.questions[state.currentQuestion];
        const isCorrect = !isTimeout && selectedIndex === q.correctIndex;
        if (isCorrect) state.correctAnswers++;

        const buttons = document.querySelectorAll('.ceefax-quiz-option');
        buttons.forEach((btn, i) => {
            btn.disabled = true;
            if (i === q.correctIndex) btn.classList.add('correct');
            else if (i === selectedIndex) btn.classList.add('wrong');
        });

        setTimeout(() => {
            state.currentQuestion++;
            if (state.currentQuestion < QUESTIONS_COUNT) {
                showQuestion(state.currentQuestion);
            } else {
                showResults();
            }
        }, 1500);
    }

    // ── Results ────────────────────────────────────────────────────────
    async function showResults() {
        const totalSec = (state.totalTimeMs / 1000).toFixed(1);

        document.getElementById('rr-results-score').textContent =
            `SCORE: ${state.correctAnswers}/${QUESTIONS_COUNT}`;
        document.getElementById('rr-results-time').textContent =
            `TIME: ${totalSec}s`;

        showScreen('results');

        // Save result (non-blocking — don't await before showing screen)
        try {
            await fetch('/api/ronnierebel/result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerName:     state.initials,
                    correctAnswers: state.correctAnswers,
                    totalTimeMs:    state.totalTimeMs,
                }),
            });
        } catch (err) {
            console.warn('[ronnierebel] Could not save result:', err.message);
        }

        // Fetch leaderboard
        try {
            const res = await fetch('/api/ronnierebel/leaderboard');
            const data = await res.json();
            lbCache = data.leaderboard || [];
        } catch (err) {
            console.warn('[ronnierebel] Could not fetch leaderboard:', err.message);
            lbCache = [];
        }

        renderLeaderboard(lbCache, document.getElementById('rr-leaderboard-container'));
    }

    function renderLeaderboard(rows, container) {
        if (!rows || !rows.length) {
            container.innerHTML = '<div class="ceefax-info">NO SCORES YET</div>';
            return;
        }

        container.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'ceefax-quiz-lb-row ceefax-quiz-lb-header';
        header.innerHTML = `
            <span class="ceefax-quiz-lb-rank">#</span>
            <span class="ceefax-quiz-lb-name">INIT</span>
            <span class="ceefax-quiz-lb-score">PTS</span>
            <span class="ceefax-quiz-lb-time">TIME</span>
        `;
        container.appendChild(header);

        rows.forEach((row, idx) => {
            const el = document.createElement('div');
            el.className = 'ceefax-quiz-lb-row';

            // Highlight current player's just-saved result
            if (
                row.player_name.toUpperCase() === state.initials.toUpperCase() &&
                row.correct_answers === state.correctAnswers &&
                Math.abs(row.total_time_ms - state.totalTimeMs) < 2000
            ) {
                el.classList.add('ceefax-quiz-lb-mine');
            }

            const timeSec = (row.total_time_ms / 1000).toFixed(1);

            el.innerHTML = `
                <span class="ceefax-quiz-lb-rank">${idx + 1}</span>
                <span class="ceefax-quiz-lb-name">${row.player_name.toUpperCase()}</span>
                <span class="ceefax-quiz-lb-score">${row.correct_answers}/5</span>
                <span class="ceefax-quiz-lb-time">${timeSec}s</span>
            `;
            container.appendChild(el);
        });
    }
});

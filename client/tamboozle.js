// Tamboozle — P501
// LLM-generated football trivia quiz. Hard difficulty only.
// Timed per question; aggregated total time saved to leaderboard.

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
    // Cached leaderboard data keyed by league, populated after quiz
    let lbCache = { scotland: null, england: null };

    function resetState() {
        state = {
            initials: '',
            league: '',
            decade: '',
            questions: [],
            currentQuestion: 0,
            correctAnswers: 0,
            totalTimeMs: 0,
            questionStartTime: null,
            timerInterval: null,
            timerRemaining: QUESTION_TIME_LIMIT,
        };
        lbCache = { scotland: null, england: null };
    }
    resetState();

    // ── Screen switching ───────────────────────────────────────────────
    const screens = {
        setup:   document.getElementById('setup-screen'),
        loading: document.getElementById('loading-screen'),
        quiz:    document.getElementById('quiz-screen'),
        results: document.getElementById('results-screen'),
    };
    function showScreen(name) {
        if (document.activeElement) document.activeElement.blur();
        Object.values(screens).forEach(s => { s.style.display = 'none'; });
        if (screens[name]) screens[name].style.display = 'block';
    }

    // ── Setup ──────────────────────────────────────────────────────────
    document.getElementById('quiz-start-btn').addEventListener('click', startQuiz);
    document.getElementById('quiz-again-btn').addEventListener('click', playAgain);

    // Auto-uppercase initials as typed
    document.getElementById('quiz-name').addEventListener('input', function () {
        this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    async function startQuiz() {
        const rawName = document.getElementById('quiz-name').value.trim().toUpperCase();
        const league  = document.getElementById('quiz-league').value;
        const decade  = document.getElementById('quiz-decade').value;
        const errEl   = document.getElementById('setup-error');

        if (!rawName) {
            errEl.textContent = 'PLEASE ENTER YOUR INITIALS';
            errEl.style.display = 'block';
            document.getElementById('quiz-name').focus();
            return;
        }
        errEl.style.display = 'none';

        resetState();
        state.initials = rawName.substring(0, 3);
        state.league   = league;
        state.decade   = decade;

        showScreen('loading');

        try {
            const res = await fetch('/api/quiz/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ league, decade }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            state.questions = data.questions;
        } catch (err) {
            showScreen('setup');
            const errEl2 = document.getElementById('setup-error');
            errEl2.textContent = `ERROR: ${err.message}`;
            errEl2.style.display = 'block';
            return;
        }

        state.currentQuestion = 0;
        showQuestion(0);
    }

    function playAgain() {
        resetState();
        document.getElementById('quiz-name').value = '';
        document.getElementById('setup-error').style.display = 'none';
        showScreen('setup');
    }

    // ── Question display ───────────────────────────────────────────────
    function showQuestion(index) {
        showScreen('quiz');
        const q = state.questions[index];

        state.timerRemaining    = QUESTION_TIME_LIMIT;
        state.questionStartTime = Date.now();

        document.getElementById('quiz-question-counter').textContent =
            `Q${index + 1} OF ${QUESTIONS_COUNT}`;
        document.getElementById('quiz-question-text').textContent = q.question;

        // Render option buttons with coloured squares
        const optionsEl = document.getElementById('quiz-options');
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
        const fill = document.getElementById('quiz-timer-fill');
        fill.style.width = `${pct}%`;
        if (state.timerRemaining > 15)      fill.style.backgroundColor = 'var(--ceefax-green)';
        else if (state.timerRemaining > 7)  fill.style.backgroundColor = 'var(--ceefax-yellow)';
        else                                fill.style.backgroundColor = 'var(--ceefax-red)';
        document.getElementById('quiz-timer-display').textContent = `${state.timerRemaining}s`;
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

        document.getElementById('results-score').textContent =
            `SCORE: ${state.correctAnswers}/${QUESTIONS_COUNT}`;
        document.getElementById('results-time').textContent =
            `TIME: ${totalSec}s`;
        document.getElementById('results-params').textContent =
            `${state.league.toUpperCase()} | ${state.decade}`;

        showScreen('results');

        // Save result
        try {
            await fetch('/api/quiz/result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerName:     state.initials,
                    league:         state.league,
                    decade:         state.decade,
                    correctAnswers: state.correctAnswers,
                    totalTimeMs:    state.totalTimeMs,
                }),
            });
        } catch (err) {
            console.warn('[tamboozle] Could not save result:', err.message);
        }

        // Wire up leaderboard tabs
        const tabs = document.querySelectorAll('.tamboozle-lb-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                showLeaderboard(tab.dataset.league);
            });
        });

        // Fetch both leaderboards in parallel then show current league
        const [scotRes, engRes] = await Promise.allSettled([
            fetch('/api/quiz/leaderboard?league=scotland').then(r => r.json()),
            fetch('/api/quiz/leaderboard?league=england').then(r => r.json()),
        ]);

        lbCache.scotland = scotRes.status === 'fulfilled' ? (scotRes.value.leaderboard || []) : [];
        lbCache.england  = engRes.status  === 'fulfilled' ? (engRes.value.leaderboard  || []) : [];

        // Show the league the player just played
        const activeTab = document.querySelector(`.tamboozle-lb-tab[data-league="${state.league}"]`);
        if (activeTab) {
            document.querySelectorAll('.tamboozle-lb-tab').forEach(t => t.classList.remove('active'));
            activeTab.classList.add('active');
        }
        showLeaderboard(state.league);
    }

    function showLeaderboard(league) {
        const container = document.getElementById('leaderboard-container');
        const rows = lbCache[league] || [];
        renderLeaderboard(rows, container, league);
    }

    function renderLeaderboard(rows, container, league) {
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

            // Highlight current player's just-saved result
            if (
                row.player_name.toUpperCase() === state.initials.toUpperCase() &&
                row.correct_answers === state.correctAnswers &&
                row.league === league &&
                Math.abs(row.total_time_ms - state.totalTimeMs) < 2000
            ) {
                el.classList.add('ceefax-quiz-lb-mine');
            }

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
});

// League page — shows today's fixtures for a football league
// API key has been moved to the server (server/services/fixtures-service.js)
// All fixture data now comes from /api/fixtures (server-side proxy)

document.addEventListener('DOMContentLoaded', function() {
    let refreshTimer = null;
    let currentlyLive = false; // updated after each fetch

    const urlParams = new URLSearchParams(window.location.search);
    const leagueId = urlParams.get('id');
    const leagueName = urlParams.get('name');

    if (leagueName) {
        document.getElementById('league-title').textContent = leagueName.toUpperCase();
    }

    const timeDisplay = document.getElementById('ceefax-time');

    function updateTime() {
        if (!timeDisplay) return;
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        timeDisplay.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    updateTime();
    setInterval(updateTime, 1000);

    async function fetchLeagueScores() {
        if (!leagueId) {
            document.querySelector('.ceefax-scores').innerHTML =
                '<div class="ceefax-error">LEAGUE ID NOT PROVIDED</div>';
            return;
        }

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentYear = now.getFullYear();
        // Football seasons start in August (month 7) — Jan–Jul still belong to
        // the season that started in the previous calendar year.
        const seasonYear = now.getMonth() >= 7 ? currentYear : currentYear - 1;
        const season = seasonYear.toString();

        try {
            // Server-side proxy — no API key in client JS
            const params = new URLSearchParams({ league: leagueId, date: todayStr, season });
            const response = await fetch(`/api/fixtures?${params}`);

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();

            if (data._isStale) {
                const staleEl = document.querySelector('.ceefax-scores');
                const warning = document.createElement('div');
                warning.style.cssText = 'color:#ffff00; font-size:0.9em;';
                warning.textContent = `Using cached data (${data._staleAgeMinutes}m old)`;
                staleEl.prepend(warning);
            }

            if (data.response && data.response.length > 0) {
                // Track whether any fixture is currently live for adaptive polling
                currentlyLive = data.response.some(f => isLive(f.fixture.status.short));
                displayFixtures(data.response);
                fetchGoalScorers(data.response);
            } else {
                document.querySelector('.ceefax-scores').innerHTML =
                    '<div class="ceefax-info">NO MATCHES TODAY</div>';
            }

            const pad = (n) => String(n).padStart(2, '0');
            document.querySelector('.ceefax-update').textContent =
                `LAST UPDATED: ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        } catch (error) {
            console.error('Error fetching football scores:', error);
            document.querySelector('.ceefax-scores').innerHTML =
                `<div class="ceefax-error">ERROR: ${error.message}</div>`;
        }
    }

    function displayFixtures(fixtures) {
        const scoresContainer = document.querySelector('.ceefax-scores');
        scoresContainer.innerHTML = '';

        if (fixtures.length === 0) {
            scoresContainer.innerHTML = '<div class="ceefax-info">NO MATCHES FOUND</div>';
            return;
        }

        fixtures.sort((a, b) => {
            if (isLive(a.fixture.status.short) && !isLive(b.fixture.status.short)) return -1;
            if (!isLive(a.fixture.status.short) && isLive(b.fixture.status.short)) return 1;
            return new Date(a.fixture.date) - new Date(b.fixture.date);
        });

        fixtures.forEach(fixture => {
            const homeTeam = fixture.teams.home.name.toUpperCase();
            const awayTeam = fixture.teams.away.name.toUpperCase();

            const matchContainer = document.createElement('div');
            matchContainer.className = 'ceefax-match-container';
            matchContainer.id = `fixture-${fixture.fixture.id}`;

            const status = fixture.fixture.status.short;
            let scoreDisplay = '';

            if (isUpcoming(status)) {
                const kickoff = new Date(fixture.fixture.date);
                const pad = (n) => String(n).padStart(2, '0');
                scoreDisplay = `${pad(kickoff.getHours())}:${pad(kickoff.getMinutes())}`;
            } else {
                const h = fixture.goals.home !== null ? fixture.goals.home : '-';
                const a = fixture.goals.away !== null ? fixture.goals.away : '-';
                scoreDisplay = `${h}-${a}`;
                // Append penalty shootout score if present (stored in score.penalty, not goals)
                const pen = fixture.score && fixture.score.penalty;
                if (pen && pen.home !== null && pen.away !== null) {
                    scoreDisplay += ` (${pen.home}-${pen.away}p)`;
                }
            }

            const matchElement = document.createElement('div');
            matchElement.className = 'ceefax-match';

            const teamsDiv = document.createElement('div');
            teamsDiv.className = 'ceefax-match-teams';

            const homeTeamSpan = document.createElement('span');
            homeTeamSpan.className = 'ceefax-team home';
            homeTeamSpan.textContent = homeTeam;

            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'ceefax-score';
            scoreSpan.textContent = scoreDisplay;
            scoreSpan.style.cursor = 'pointer';
            scoreSpan.addEventListener('click', () => {
                window.location.href = `events.html?id=${fixture.fixture.id}`;
            });

            const awayTeamSpan = document.createElement('span');
            awayTeamSpan.className = 'ceefax-team away';
            awayTeamSpan.textContent = awayTeam;

            teamsDiv.appendChild(homeTeamSpan);
            teamsDiv.appendChild(scoreSpan);
            teamsDiv.appendChild(awayTeamSpan);

            const statusSpan = document.createElement('span');
            statusSpan.className = 'ceefax-status';
            statusSpan.textContent = getDisplayStatus(status);

            matchElement.appendChild(teamsDiv);
            matchElement.appendChild(statusSpan);
            matchContainer.appendChild(matchElement);

            if (fixture.goals && (fixture.goals.home > 0 || fixture.goals.away > 0)) {
                const scorersContainer = document.createElement('div');
                scorersContainer.className = 'ceefax-scorers-container';
                scorersContainer.innerHTML = `
                    <div class="ceefax-team-scorers home">
                        ${fixture.goals.home > 0 ? '<div class="ceefax-scorer">LOADING...</div>' : ''}
                    </div>
                    <div class="ceefax-score-spacer"></div>
                    <div class="ceefax-team-scorers away">
                        ${fixture.goals.away > 0 ? '<div class="ceefax-scorer">LOADING...</div>' : ''}
                    </div>
                `;
                matchContainer.appendChild(scorersContainer);
            }

            scoresContainer.appendChild(matchContainer);
        });
    }

    async function fetchGoalScorers(fixtures) {
        const fixturesWithGoals = fixtures.filter(f =>
            f.goals && (f.goals.home > 0 || f.goals.away > 0)
        );

        for (const fixture of fixturesWithGoals) {
            try {
                // Server-side proxy — no API key
                const params = new URLSearchParams({ id: fixture.fixture.id });
                const response = await fetch(`/api/fixtures?${params}`);
                if (!response.ok) continue;

                const data = await response.json();
                if (data.response && data.response.length > 0) {
                    updateFixtureWithEvents(data.response[0]);
                }
            } catch (err) {
                console.error(`Error fetching events for fixture ${fixture.fixture.id}:`, err);
            }
        }
    }

    function updateFixtureWithEvents(fixture) {
        const fixtureContainer = document.getElementById(`fixture-${fixture.fixture.id}`);
        if (!fixtureContainer) return;

        const scorersContainer = fixtureContainer.querySelector('.ceefax-scorers-container');
        if (!scorersContainer || !fixture.events) return;

        const goalEvents = fixture.events.filter(e => e.type === 'Goal');
        if (goalEvents.length === 0) return;

        const homeScorers = [];
        const awayScorers = [];

        goalEvents.forEach(event => {
            if (!event.team || !event.team.id || !event.player || !event.player.name) return;

            const lastName = event.player.name.split(' ').pop().toUpperCase();
            const minute = event.time ? event.time.elapsed : '?';
            const extra = (event.time && event.time.extra) ? `+${event.time.extra}` : '';
            const goalType = event.detail || 'Normal Goal';

            const info = {
                name: lastName,
                time: `${minute}'${extra}`,
                isOwnGoal: goalType === 'Own Goal',
                isPenalty: goalType === 'Penalty',
                assist: event.assist && event.assist.name
                    ? event.assist.name.split(' ').pop().toUpperCase()
                    : null
            };

            const isHome = event.team.id === fixture.teams.home.id;
            if (isHome) {
                goalType === 'Own Goal' ? awayScorers.push(info) : homeScorers.push(info);
            } else {
                goalType === 'Own Goal' ? homeScorers.push(info) : awayScorers.push(info);
            }
        });

        const formatScorer = (s) => {
            let t = `${s.name} ${s.time}`;
            if (s.isPenalty) t += ' (P)';
            if (s.isOwnGoal) t += ' (OG)';
            if (s.assist) t += ` [${s.assist}]`;
            return `<div class="ceefax-scorer">${t}</div>`;
        };

        scorersContainer.innerHTML = `
            <div class="ceefax-team-scorers home">
                ${homeScorers.map(formatScorer).join('') || (fixture.goals.home > 0 ? '<div class="ceefax-scorer">SCORER ON A GHOSTER</div>' : '')}
            </div>
            <div class="ceefax-score-spacer"></div>
            <div class="ceefax-team-scorers away">
                ${awayScorers.map(formatScorer).join('') || (fixture.goals.away > 0 ? '<div class="ceefax-scorer">SCORER ON A GHOSTER</div>' : '')}
            </div>
        `;
    }

    function isLive(status) {
        return ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'INT'].includes(status);
    }

    function isUpcoming(status) {
        return status === 'NS' || status === 'TBD';
    }

    function getDisplayStatus(status) {
        const map = {
            'NS': 'KO', 'TBD': 'TBD', '1H': 'LIVE', '2H': 'LIVE',
            'HT': 'HT', 'ET': 'ET', 'P': 'PEN', 'FT': 'FT',
            'AET': 'AET', 'PEN': 'PEN', 'BT': 'BREAK', 'INT': 'INT'
        };
        return map[status] || status;
    }

    async function fetchAndSchedule() {
        await fetchLeagueScores();
        // Poll every 60s when live matches are present, every 5min otherwise
        const interval = currentlyLive ? 60 * 1000 : 5 * 60 * 1000;
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(fetchAndSchedule, interval);
    }

    fetchAndSchedule();
});

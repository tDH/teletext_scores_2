// FPL Draft fixtures page (P306)
// Uses getConfig() instead of hardcoded LEAGUE_ID

const API_BASE_URL = '/api';
const MAX_GAMEWEEKS = 38;

const fixturesContainer = document.getElementById('fixtures-container');
const leagueTitleElement = document.getElementById('league-title');
const timeDisplay = document.getElementById('ceefax-time');
const lastUpdatedElement = document.querySelector('.ceefax-update');
const prevGameweekButton = document.getElementById('prev-gameweek-button');
const nextGameweekButton = document.getElementById('next-gameweek-button');
const currentGameweekDisplay = document.getElementById('current-gameweek');

const isFixturesPage = window.location.pathname.includes('fixtureslist.html');

let currentGameweek = 1;
let leagueData = null;

function updateTime() {
    if (!timeDisplay) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    timeDisplay.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function fetchLeagueData() {
    if (!fixturesContainer) return;

    try {
        fixturesContainer.innerHTML = '<div class="ceefax-loading">LOADING FIXTURES...</div>';

        const { leagueId } = await getConfig();
        if (!leagueId) {
            fixturesContainer.innerHTML = '<div class="ceefax-error">CONFIG NOT AVAILABLE</div>';
            return;
        }

        const response = await fetch(`${API_BASE_URL}/league/${leagueId}/db`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        leagueData = await response.json();

        if (leagueTitleElement && isFixturesPage) {
            leagueTitleElement.textContent = (leagueData.league && leagueData.league.name) || 'FPL DRAFT LEAGUE';
        }

        if (currentGameweek === 1) {
            currentGameweek = calculateCurrentGameweek(leagueData.matches);
        }

        displayFixtures(currentGameweek);

        if (lastUpdatedElement) {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            lastUpdatedElement.textContent = `UPDATED: ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        }
    } catch (error) {
        console.error('Error fetching league data:', error);
        if (fixturesContainer) {
            fixturesContainer.innerHTML = `<div class="ceefax-error">ERROR LOADING FIXTURES: ${error.message}</div>`;
        }
    }
}

function calculateCurrentGameweek(matches) {
    if (!matches || matches.length === 0) return 1;
    const finishedGameweeks = matches.filter(m => m.finished).map(m => m.event);
    if (finishedGameweeks.length === 0) return 1;
    return Math.min(Math.max(...finishedGameweeks) + 1, MAX_GAMEWEEKS);
}

function displayFixtures(gameweek) {
    if (!fixturesContainer || !leagueData || !leagueData.matches) {
        if (fixturesContainer) {
            fixturesContainer.innerHTML = '<div class="ceefax-error">NO FIXTURE DATA AVAILABLE</div>';
        }
        return;
    }

    if (currentGameweekDisplay) {
        currentGameweekDisplay.textContent = `GAMEWEEK ${gameweek}`;
    }

    // Build manager map by manager_id for looking up team names
    const managerMap = {};
    (leagueData.managers || []).forEach(m => {
        managerMap[m.manager_id] = m.entry_name || `Team ${m.manager_id}`;
    });

    const gameweekMatches = leagueData.matches.filter(m => m.event === gameweek);

    if (gameweekMatches.length === 0) {
        fixturesContainer.innerHTML = '<div class="ceefax-info">NO FIXTURES FOR THIS GAMEWEEK</div>';
        return;
    }

    fixturesContainer.innerHTML = '';

    gameweekMatches.forEach(match => {
        const homeTeamName = managerMap[match.league_entry_1] || `Team ${match.league_entry_1}`;
        const awayTeamName = managerMap[match.league_entry_2] || `Team ${match.league_entry_2}`;

        let status = 'UPCOMING';
        let statusClass = 'upcoming';

        if (match.finished) {
            status = `${match.league_entry_1_points}-${match.league_entry_2_points}`;
            statusClass = 'completed';
        } else if (match.started) {
            status = 'LIVE';
            statusClass = 'in-progress';
        }

        const fixtureEl = document.createElement('div');
        fixtureEl.className = `ceefax-fixture-item ${statusClass}`;
        fixtureEl.innerHTML = `
            <div class="ceefax-fixture-teams">${homeTeamName} v ${awayTeamName}</div>
            <div class="ceefax-fixture-status">${status}</div>
        `;

        fixtureEl.addEventListener('click', () => {
            window.location.href = `matchup.html?gw=${gameweek}&home=${match.league_entry_1}&away=${match.league_entry_2}`;
        });

        fixturesContainer.appendChild(fixtureEl);
    });

    if (prevGameweekButton && nextGameweekButton) {
        prevGameweekButton.disabled = gameweek <= 1;
        nextGameweekButton.disabled = gameweek >= MAX_GAMEWEEKS;
    }
}

function setupGameweekNavigation() {
    if (!prevGameweekButton || !nextGameweekButton) return;

    prevGameweekButton.addEventListener('click', () => {
        if (currentGameweek > 1) {
            currentGameweek--;
            displayFixtures(currentGameweek);
        }
    });

    nextGameweekButton.addEventListener('click', () => {
        if (currentGameweek < MAX_GAMEWEEKS) {
            currentGameweek++;
            displayFixtures(currentGameweek);
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    if (!fixturesContainer) return;

    if (timeDisplay) {
        updateTime();
        setInterval(updateTime, 1000);
    }

    if (prevGameweekButton && nextGameweekButton) {
        setupGameweekNavigation();
    }

    fetchLeagueData();
    setInterval(fetchLeagueData, 60000);
});

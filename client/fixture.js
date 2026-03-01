// FPL Draft fixture detail page (P307)
// Uses getConfig() instead of hardcoded LEAGUE_ID

const API_BASE_URL = '/api';

// DOM Elements
const timeDisplay = document.getElementById('ceefax-time');
const gameweekDisplay = document.getElementById('ceefax-gameweek');
const matchTeamsDisplay = document.getElementById('ceefax-match-teams');
const matchScoreDisplay = document.getElementById('ceefax-match-score');
const homeTeamHeader = document.getElementById('home-team-header');
const awayTeamHeader = document.getElementById('away-team-header');
const homeTeamPlayers = document.getElementById('home-team-players');
const awayTeamPlayers = document.getElementById('away-team-players');
const lastUpdatedElement = document.querySelector('.ceefax-update');

// State variables
let currentGameweek = 1;
let homeTeamId = null;
let awayTeamId = null;
let leagueData = null;
let homeTeamData = null;
let awayTeamData = null;

// Update the clock every second
function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    timeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
}

// Parse URL parameters
function getUrlParams() {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);

    const gameweek = parseInt(urlParams.get('gw')) || 1;
    const homeId = parseInt(urlParams.get('home'));
    const awayId = parseInt(urlParams.get('away'));

    return { gameweek, homeId, awayId };
}

// Fetch league and fixture data
async function fetchFixtureData() {
    try {
        homeTeamPlayers.innerHTML = '<div class="ceefax-loading">LOADING PLAYERS...</div>';
        awayTeamPlayers.innerHTML = '<div class="ceefax-loading">LOADING PLAYERS...</div>';

        // Get parameters from URL
        const { gameweek, homeId, awayId } = getUrlParams();
        currentGameweek = gameweek;
        homeTeamId = homeId;
        awayTeamId = awayId;

        if (!homeTeamId || !awayTeamId) {
            displayError("Missing team information");
            return;
        }

        // Update gameweek display
        gameweekDisplay.textContent = `GAMEWEEK ${currentGameweek}`;

        // Get leagueId from config
        const { leagueId } = await getConfig();
        if (!leagueId) {
            displayError("CONFIG NOT AVAILABLE");
            return;
        }

        // Fetch league data
        const leagueResponse = await fetch(`${API_BASE_URL}/league/${leagueId}/db`);
        if (!leagueResponse.ok) {
            console.error(`HTTP error! Status: ${leagueResponse.status}`);
            throw new Error(`HTTP error! Status: ${leagueResponse.status}`);
        }

        leagueData = await leagueResponse.json();

        // Find the fixture
        const fixture = leagueData.matches.find(match =>
            match.event === currentGameweek &&
            match.league_entry_1 === homeTeamId &&
            match.league_entry_2 === awayTeamId
        );

        if (!fixture) {
            displayError("Fixture not found");
            return;
        }

        // Get team data by manager_id
        const homeTeamEntry = leagueData.managers.find(entry => entry.manager_id === homeTeamId);
        const awayTeamEntry = leagueData.managers.find(entry => entry.manager_id === awayTeamId);

        if (!homeTeamEntry || !awayTeamEntry) {
            displayError("Team information not found");
            return;
        }

        // Update header displays
        const homeTeamName = homeTeamEntry.entry_name || `Team ${homeTeamId}`;
        const awayTeamName = awayTeamEntry.entry_name || `Team ${awayTeamId}`;

        matchTeamsDisplay.textContent = `${homeTeamName} v ${awayTeamName}`;

        // Determine score display
        let scoreText = "v";
        if (fixture.started) {
            scoreText = `${fixture.league_entry_1_points}-${fixture.league_entry_2_points}`;
        }
        matchScoreDisplay.textContent = scoreText;

        // Update team headers
        homeTeamHeader.textContent = homeTeamName;
        awayTeamHeader.textContent = awayTeamName;

        // Fetch team picks for this gameweek (parallel)
        try {
            const [homeResponse, awayResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/league/manager/${homeTeamId}/gameweek/${currentGameweek}/team`),
                fetch(`${API_BASE_URL}/league/manager/${awayTeamId}/gameweek/${currentGameweek}/team`),
            ]);

            if (!homeResponse.ok) throw new Error(`Home team HTTP error! Status: ${homeResponse.status}`);
            if (!awayResponse.ok) throw new Error(`Away team HTTP error! Status: ${awayResponse.status}`);

            homeTeamData = await homeResponse.json();
            awayTeamData = await awayResponse.json();

            // Render team data
            renderTeamData(homeTeamData, fixture.league_entry_1_points, true);
            renderTeamData(awayTeamData, fixture.league_entry_2_points, false);

            // Update last updated time
            const now = new Date();
            lastUpdatedElement.textContent = `UPDATED: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        } catch (error) {
            console.error("Error fetching team data:", error);
            displayError("Could not load team data");
        }
    } catch (error) {
        console.error('Error fetching fixture data:', error);
        displayError(`Error: ${error.message}`);
    }
}

// Display an error message in both player containers
function displayError(message) {
    const errorHtml = `<div class="ceefax-error">${message}</div>`;
    homeTeamPlayers.innerHTML = errorHtml;
    awayTeamPlayers.innerHTML = errorHtml;
}

// Render team data with real player information
function renderTeamData(teamData, fixturePoints, isHome) {
    const playerContainer = isHome ? homeTeamPlayers : awayTeamPlayers;

    // Clear container
    playerContainer.innerHTML = '';

    // Create table header
    const tableHeader = document.createElement('div');
    tableHeader.className = 'ceefax-players-header';
    tableHeader.innerHTML = `
        <div class="ceefax-player-name">PLAYER</div>
        <div class="ceefax-player-points">PTS</div>
    `;
    playerContainer.appendChild(tableHeader);

    // Position mapping
    const positionMap = {
        1: 'GK',
        2: 'DEF',
        3: 'MID',
        4: 'FWD'
    };

    // Sort players by position
    const sortedPlayers = [...teamData.players].sort((a, b) => a.position - b.position);

    // Starting 11 only (positions 1-11)
    const startingPlayers = sortedPlayers.filter(player => player.position <= 11);

    // Use the total from the API response if available
    const calculatedTotal = teamData.total_points || 0;

    // Create player elements with actual data
    for (const player of startingPlayers) {
        const playerEl = document.createElement('div');
        playerEl.className = 'ceefax-player-item';

        const playerPoints = player.points || 0;

        playerEl.innerHTML = `
            <div class="ceefax-player-name">${player.is_captain ? '(C) ' : ''}${player.web_name}</div>
            <div class="ceefax-player-points">${playerPoints}</div>
        `;

        playerContainer.appendChild(playerEl);
    }

    // Add total points at bottom
    const totalEl = document.createElement('div');
    totalEl.className = 'ceefax-player-total';
    totalEl.innerHTML = `
        <div class="ceefax-player-name">TOTAL</div>
        <div class="ceefax-player-points">${calculatedTotal || fixturePoints || 0}</div>
    `;
    playerContainer.appendChild(totalEl);
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Initial clock update
    updateTime();
    setInterval(updateTime, 1000);

    // Load fixture data
    fetchFixtureData();

    // Auto-refresh data every minute
    setInterval(fetchFixtureData, 60000);
});

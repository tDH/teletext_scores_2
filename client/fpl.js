// FPL Draft standings page (P305)
// Uses getConfig() instead of hardcoded LEAGUE_ID

const API_BASE_URL = '/api';

const standingsContainer = document.getElementById('ceefax-standings');
const leagueTitleElement = document.getElementById('ceefax-league-title');
const timeDisplay = document.getElementById('ceefax-time');
const lastUpdatedElement = document.querySelector('.ceefax-update');

function updateTime() {
    if (!timeDisplay) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    timeDisplay.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function fetchAndRenderStandings() {
    try {
        standingsContainer.innerHTML = '<div class="ceefax-loading">LOADING STANDINGS...</div>';

        const { leagueId } = await getConfig();
        if (!leagueId) {
            standingsContainer.innerHTML = '<div class="ceefax-error">CONFIG NOT AVAILABLE</div>';
            return;
        }

        const response = await fetch(`${API_BASE_URL}/league/${leagueId}/db`);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const leagueData = await response.json();

        if (!leagueData || !leagueData.standings || !leagueData.managers) {
            standingsContainer.innerHTML = '<div class="ceefax-error">NO STANDINGS DATA AVAILABLE</div>';
            return;
        }

        if (leagueData.league && leagueData.league.name) {
            leagueTitleElement.textContent = leagueData.league.name.toUpperCase();
        } else {
            leagueTitleElement.textContent = 'FPL DRAFT LEAGUE';
        }

        const currentGameweek = calculateCurrentGameweek(leagueData.matches);
        renderStandings(leagueData, currentGameweek);

        if (lastUpdatedElement) {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            lastUpdatedElement.textContent = `UPDATED: ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        }
    } catch (error) {
        console.error('Error fetching league data:', error);
        standingsContainer.innerHTML = `<div class="ceefax-error">ERROR LOADING STANDINGS: ${error.message}</div>`;
    }
}

function calculateCurrentGameweek(matches) {
    if (!matches || !matches.length) return null;
    const finishedMatches = matches.filter(m => m.finished);
    if (finishedMatches.length === 0) return 1;
    return Math.max(...finishedMatches.map(m => m.event));
}

function renderStandings(leagueData, currentGameweek) {
    standingsContainer.innerHTML = '';

    const tableHeader = document.createElement('div');
    tableHeader.className = 'ceefax-draft-table-header';
    tableHeader.innerHTML = `
        <div class="ceefax-draft-pos">POS</div>
        <div class="ceefax-draft-team-name">TEAM (MANAGER)</div>
        <div class="ceefax-draft-record">W-D</div>
        <div class="ceefax-draft-points">PTS</div>
    `;
    standingsContainer.appendChild(tableHeader);

    const standings = [...leagueData.standings].sort((a, b) => a.rank - b.rank);

    // Build map using manager_id (not entry_id) since standings.league_entry = manager_id
    const managerMap = {};
    leagueData.managers.forEach(m => {
        managerMap[m.manager_id] = {
            team: m.entry_name,
            manager: `${m.player_first_name || ''} ${m.player_last_name || ''}`.trim()
        };
    });

    const totalTeams = standings.length;

    standings.forEach((team) => {
        const teamRow = document.createElement('div');

        // Top 4 green, bottom 4 red, rest white
        let rowColour = '';
        if (team.rank <= 4) rowColour = 'ceefax-standing-promotion';
        else if (team.rank > totalTeams - 4) rowColour = 'ceefax-standing-relegation';
        teamRow.className = `ceefax-draft-team ${rowColour}`;

        const info = managerMap[team.league_entry] || { team: '', manager: '' };

        // Blank entry_name is the CPU average team
        const teamName = info.team || 'BANG AVERAGE';
        const managerName = info.manager || 'CPU';

        // Manager initials from first/last name
        const initials = managerName
            .split(' ')
            .filter(Boolean)
            .map(w => w[0].toUpperCase())
            .join('');

        const displayName = `${teamName} (${initials || 'CPU'})`;
        const record = `${team.matches_won}-${team.matches_drawn}`;

        teamRow.innerHTML = `
            <div class="ceefax-draft-pos">${team.rank}</div>
            <div class="ceefax-draft-team-name">${displayName.toUpperCase()}</div>
            <div class="ceefax-draft-record">${record}</div>
            <div class="ceefax-draft-points">${team.total}</div>
        `;

        standingsContainer.appendChild(teamRow);
    });

    if (currentGameweek) {
        const gwInfo = document.createElement('div');
        gwInfo.className = 'ceefax-info';
        gwInfo.textContent = `CURRENT GAMEWEEK: ${currentGameweek}`;
        standingsContainer.appendChild(gwInfo);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    updateTime();
    fetchAndRenderStandings();
    setInterval(updateTime, 1000);
    setInterval(fetchAndRenderStandings, 60000);
});

// Home page — league index
// Uses getConfig() so the FPL league ID is not hardcoded

document.addEventListener('DOMContentLoaded', async function() {
    const timeDisplay = document.getElementById('ceefax-time');
    const leagueListContainer = document.querySelector('.ceefax-league-list');

    function updateTime() {
        if (!timeDisplay) return;
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        timeDisplay.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    setInterval(updateTime, 1000);
    updateTime();

    // Get league ID from server config (not hardcoded)
    const { leagueId: fplLeagueId } = await getConfig();

    const ukLeagues = [
        { id: 39, name: 'Premier League', country: 'England' },
        { id: 40, name: 'Championship', country: 'England' },
        { id: 41, name: 'League One', country: 'England' },
        { id: 42, name: 'League Two', country: 'England' },
        { id: 43, name: 'FA Cup', country: 'England' },
        { id: 45, name: 'League Cup', country: 'England' },
        { id: 501, name: 'Premier League', country: 'Scotland' },
        { id: 48, name: 'Championship', country: 'Scotland' },
        { id: 183, name: 'League One', country: 'Scotland' },
        { id: 184, name: 'League Two', country: 'Scotland' },
        { id: 181, name: 'Scottish Cup', country: 'Scotland' },
        { id: fplLeagueId,    name: 'League Standings', country: 'Fantasy Football', href: 'fpl.html',          page: 'P305' },
        { id: 'fpl-fixtures', name: 'Fixtures',         country: 'Fantasy Football', href: 'fixtureslist.html', page: 'P306' },
        { id: 'fpl-stats',    name: 'Stats',            country: 'Fantasy Football', href: 'fpl-stats.html',    page: 'P309' },
        { id: 'fpl-form',     name: 'Form',             country: 'Fantasy Football', href: 'fpl-form.html',     page: 'P310' },
    ];

    async function checkTodaysFixtures() {
        try {
            leagueListContainer.innerHTML = '<div class="ceefax-loading">LOADING LEAGUES...</div>';

            const today = new Date().toISOString().split('T')[0];

            let leaguesWithFixtures = {};
            ukLeagues.forEach(l => { leaguesWithFixtures[l.id] = false; });

            try {
                const leagueIds = ukLeagues
                    .filter(l => !l.href)
                    .map(l => l.id)
                    .join(',');
                const res = await fetch(`/api/fixtures/today?leagues=${leagueIds}`);
                if (res.ok) {
                    const data = await res.json();
                    Object.assign(leaguesWithFixtures, data);
                }
            } catch (apiError) {
                console.warn('Could not fetch fixture status, using defaults');
            }

            displayLeagueList(leaguesWithFixtures);
        } catch (error) {
            console.error('Error fetching fixtures:', error);
            leagueListContainer.innerHTML = '<div class="ceefax-error">ERROR LOADING LEAGUES</div>';
        }
    }

    function displayLeagueList(leaguesWithFixtures) {
        leagueListContainer.innerHTML = '';

        const countries = {};
        ukLeagues.forEach(league => {
            if (!countries[league.country]) countries[league.country] = [];
            countries[league.country].push(league);
        });

        for (const country in countries) {
            const countryHeader = document.createElement('div');
            countryHeader.className = 'ceefax-league-header';
            countryHeader.textContent = country.toUpperCase();
            leagueListContainer.appendChild(countryHeader);

            countries[country].forEach(league => {
                const leagueItem = document.createElement('div');
                leagueItem.className = 'ceefax-league-item';

                const pageNum = league.page || `P${300 + ukLeagues.indexOf(league) + 10}`;

                const hasFixtures = leaguesWithFixtures[league.id] === true;
                if (hasFixtures) leagueItem.classList.add('ceefax-league-active');

                leagueItem.innerHTML = `
                    <span class="ceefax-league-name">
                        ${hasFixtures ? '<span class="ceefax-fixture-indicator"></span>' : ''}
                        ${league.name.toUpperCase()}
                    </span>
                    <span class="ceefax-league-page">${pageNum}</span>
                `;

                leagueItem.addEventListener('click', function() {
                    window.location.href = league.href
                        ? league.href
                        : `league.html?id=${league.id}&name=${encodeURIComponent(league.name)}`;
                });

                leagueListContainer.appendChild(leagueItem);
            });
        }

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const updateEl = document.querySelector('.ceefax-update');
        if (updateEl) {
            updateEl.textContent = `UPDATED: ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        }
    }

    checkTodaysFixtures();
});

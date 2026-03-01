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
        { id: fplLeagueId, name: 'FPL Draft League', country: 'Fantasy Football' }
    ];

    async function checkTodaysFixtures() {
        try {
            leagueListContainer.innerHTML = '<div class="ceefax-loading">LOADING LEAGUES...</div>';

            const today = new Date().toISOString().split('T')[0];

            let leaguesWithFixtures = {};
            ukLeagues.forEach(l => { leaguesWithFixtures[l.id] = false; });

            try {
                const res = await fetch(`/api/fpl/game`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.leagues) {
                        leaguesWithFixtures = { ...leaguesWithFixtures, ...data.leagues };
                    }
                }
            } catch (apiError) {
                console.warn('Could not fetch fixture data from API, using defaults');
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

                let pageNum = `P${300 + ukLeagues.indexOf(league) + 10}`;
                if (league.id === fplLeagueId) {
                    pageNum = 'P305';
                }

                const hasFixtures = leaguesWithFixtures[league.id] === true;

                leagueItem.innerHTML = `
                    <span class="ceefax-league-name">
                        ${hasFixtures ? '<span class="ceefax-fixture-indicator"></span>' : ''}
                        ${league.name.toUpperCase()}
                    </span>
                    <span class="ceefax-league-page">${pageNum}</span>
                `;

                leagueItem.addEventListener('click', function() {
                    if (league.id === fplLeagueId) {
                        window.location.href = 'fpl.html';
                    } else {
                        window.location.href = `league.html?id=${league.id}&name=${encodeURIComponent(league.name)}`;
                    }
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

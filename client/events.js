// Events page — fixture details and match events
// API key moved to server. Calls /api/fixtures instead of RapidAPI directly.

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const fixtureId = urlParams.get('id');

    const timeDisplay = document.getElementById('ceefax-time');

    function updateTime() {
        if (!timeDisplay) return;
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        timeDisplay.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    updateTime();
    setInterval(updateTime, 1000);

    async function fetchFixtureEvents() {
        if (!fixtureId) {
            document.querySelector('.ceefax-match-overview').innerHTML =
                '<div class="ceefax-error">FIXTURE ID NOT PROVIDED</div>';
            return;
        }

        try {
            // Server-side proxy — no API key in client JS
            const params = new URLSearchParams({ id: fixtureId });
            const response = await fetch(`/api/fixtures?${params}`);

            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);

            const data = await response.json();

            if (!data.response || data.response.length === 0) {
                throw new Error('No fixture data found');
            }

            const fixture = data.response[0];
            displayFixtureOverview(fixture);
            displayEvents(fixture.events || [], fixture);

            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            document.querySelector('.ceefax-update').textContent =
                `LAST UPDATED: ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        } catch (error) {
            console.error('Error fetching fixture data:', error);
            document.querySelector('.ceefax-match-overview').innerHTML =
                `<div class="ceefax-error">ERROR: ${error.message}</div>`;
        }
    }

    function displayFixtureOverview(fixture) {
        const overviewContainer = document.querySelector('.ceefax-match-overview');
        overviewContainer.innerHTML = '';

        const homeTeam = fixture.teams.home.name.toUpperCase();
        const awayTeam = fixture.teams.away.name.toUpperCase();
        const matchDate = new Date(fixture.fixture.date);
        const formattedDate = matchDate.toLocaleDateString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        document.getElementById('match-title').textContent = `${homeTeam} v ${awayTeam}`;

        const status = fixture.fixture.status.short;
        let scoreDisplay = '';

        if (isUpcoming(status)) {
            const pad = (n) => String(n).padStart(2, '0');
            scoreDisplay = `${pad(matchDate.getHours())}:${pad(matchDate.getMinutes())}`;
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
        matchElement.className = 'ceefax-match-header';
        matchElement.innerHTML = `
            <div class="ceefax-match-date">${formattedDate}</div>
            <div class="ceefax-match-teams">
                <span class="ceefax-team home">${homeTeam}</span>
                <span class="ceefax-score">${scoreDisplay}</span>
                <span class="ceefax-team away">${awayTeam}</span>
            </div>
            <div class="ceefax-match-status">${getDisplayStatus(status)}</div>
            <div class="ceefax-match-venue">${(fixture.fixture.venue && fixture.fixture.venue.name) || ''}</div>
        `;
        overviewContainer.appendChild(matchElement);
    }

    function displayEvents(events, fixture) {
        const eventsContainer = document.querySelector('.ceefax-events-container');
        eventsContainer.innerHTML = '';

        if (!events || events.length === 0) {
            eventsContainer.innerHTML = '<div class="ceefax-info">NO EVENTS DATA AVAILABLE</div>';
            return;
        }

        events.sort((a, b) => {
            if (a.time.elapsed !== b.time.elapsed) return a.time.elapsed - b.time.elapsed;
            return (a.time.extra || 0) - (b.time.extra || 0);
        });

        const eventsHeader = document.createElement('div');
        eventsHeader.className = 'ceefax-events-header';
        eventsHeader.textContent = 'MATCH EVENTS';
        eventsContainer.appendChild(eventsHeader);

        const goals = events.filter(e => e.type === 'Goal');
        const cards = events.filter(e => e.type === 'Card');
        const subs = events.filter(e => e.type === 'subst');
        const vars = events.filter(e => e.type === 'Var');
        const other = events.filter(e => !['Goal', 'Card', 'subst', 'Var'].includes(e.type));

        if (goals.length > 0) eventsContainer.appendChild(createEventSection('GOALS', goals, fixture));
        if (cards.length > 0) eventsContainer.appendChild(createEventSection('CARDS', cards, fixture));
        if (subs.length > 0) eventsContainer.appendChild(createEventSection('SUBSTITUTIONS', subs, fixture));
        if (vars.length > 0) eventsContainer.appendChild(createEventSection('VAR DECISIONS', vars, fixture));
        if (other.length > 0) eventsContainer.appendChild(createEventSection('OTHER EVENTS', other, fixture));
    }

    function createEventSection(title, events, fixture) {
        const section = document.createElement('div');
        section.className = 'ceefax-event-section';

        const header = document.createElement('div');
        header.className = 'ceefax-event-section-header';
        header.textContent = title;
        section.appendChild(header);

        events.forEach(event => {
            const item = document.createElement('div');
            item.className = 'ceefax-event-item';

            const minute = event.time.elapsed;
            const extra = event.time.extra ? `+${event.time.extra}` : '';
            const timeStr = `${minute}'${extra}`;

            const isHome = event.team.id === fixture.teams.home.id;
            const teamSide = isHome ? 'home' : 'away';
            const teamName = isHome
                ? fixture.teams.home.name.toUpperCase()
                : fixture.teams.away.name.toUpperCase();

            let desc = '';
            if (event.type === 'Goal') {
                const scorer = event.player.name.split(' ').pop().toUpperCase();
                desc = scorer;
                if (event.detail === 'Penalty') desc += ' (Penalty)';
                else if (event.detail === 'Own Goal') desc += ' (Own Goal)';
                if (event.assist && event.assist.name) {
                    desc += ` (assist: ${event.assist.name.split(' ').pop().toUpperCase()})`;
                }
            } else if (event.type === 'Card') {
                desc = `${event.player.name.split(' ').pop().toUpperCase()} (${event.detail})`;
            } else if (event.type === 'subst') {
                const inn = event.player.name.split(' ').pop().toUpperCase();
                const out = event.assist ? event.assist.name.split(' ').pop().toUpperCase() : 'Unknown';
                desc = `IN: ${inn}, OUT: ${out}`;
            } else if (event.type === 'Var') {
                desc = event.detail;
            } else {
                desc = event.detail || event.type;
            }

            item.innerHTML = `
                <span class="ceefax-event-time">${timeStr}</span>
                <span class="ceefax-event-team ${teamSide}">${teamName}</span>
                <span class="ceefax-event-description">${desc}</span>
            `;

            section.appendChild(item);
        });

        return section;
    }

    function isUpcoming(status) {
        return status === 'NS' || status === 'TBD';
    }

    function getDisplayStatus(status) {
        const map = {
            'NS': 'NOT STARTED', 'TBD': 'TO BE DETERMINED',
            '1H': 'FIRST HALF', '2H': 'SECOND HALF',
            'HT': 'HALF TIME', 'ET': 'EXTRA TIME',
            'P': 'PENALTY SHOOTOUT', 'FT': 'FULL TIME',
            'AET': 'AFTER EXTRA TIME', 'PEN': 'PENALTIES',
            'BT': 'BREAK TIME', 'INT': 'INTERRUPTED'
        };
        return map[status] || status;
    }

    fetchFixtureEvents();
    setInterval(fetchFixtureEvents, 30 * 1000);
});

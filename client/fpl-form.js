// Form Guide page (P310)
// Shows each FPL team's results over their last 5 completed matches,
// ranked by H2H form points (W=3, D=1, L=0), tiebroken by total fantasy points.

const FORM_MATCHES = 5;

document.addEventListener('DOMContentLoaded', async function () {
    const timeDisplay = document.getElementById('ceefax-time');
    const formContainer = document.getElementById('form-container');
    const lastUpdatedEl = document.querySelector('.ceefax-update');

    function updateTime() {
        if (!timeDisplay) return;
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        timeDisplay.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    updateTime();
    setInterval(updateTime, 1000);

    async function fetchAndRender() {
        try {
            formContainer.innerHTML = '<div class="ceefax-loading">LOADING FORM...</div>';

            const { leagueId } = await getConfig();
            if (!leagueId) {
                formContainer.innerHTML = '<div class="ceefax-error">CONFIG NOT AVAILABLE</div>';
                return;
            }

            const res = await fetch(`/api/league/${leagueId}/db`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (!data || !data.managers || !data.matches) {
                formContainer.innerHTML = '<div class="ceefax-error">NO DATA AVAILABLE</div>';
                return;
            }

            renderForm(data);

            if (lastUpdatedEl) {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                lastUpdatedEl.textContent = `UPDATED: ${pad(now.getHours())}:${pad(now.getMinutes())}`;
            }
        } catch (err) {
            console.error('Error loading form data:', err);
            formContainer.innerHTML = `<div class="ceefax-error">ERROR: ${err.message}</div>`;
        }
    }

    function renderForm(data) {
        const { managers, matches } = data;

        // Build manager info map keyed by manager_id
        const managerMap = {};
        managers.forEach(m => {
            const fullName = `${m.player_first_name || ''} ${m.player_last_name || ''}`.trim();
            const initials = fullName.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).join('');
            managerMap[m.manager_id] = {
                team: (m.entry_name || 'BANG AVERAGE').toUpperCase(),
                initials: initials || 'CPU',
            };
        });

        // Only finished matches, sorted newest first
        const finished = matches
            .filter(m => m.finished)
            .sort((a, b) => b.event - a.event);

        // Calculate form for each manager
        const formRows = Object.keys(managerMap).map(id => {
            const managerId = Number(id);

            // Last N finished matches for this manager, then reverse for oldest-first display
            const recent = finished
                .filter(m => m.league_entry_1 === managerId || m.league_entry_2 === managerId)
                .slice(0, FORM_MATCHES)
                .reverse();

            let h2hPts = 0;
            let totalFplPts = 0;
            const results = recent.map(m => {
                const isEntry1 = m.league_entry_1 === managerId;
                const myPts  = Number(isEntry1 ? m.league_entry_1_points : m.league_entry_2_points) || 0;
                const oppPts = Number(isEntry1 ? m.league_entry_2_points : m.league_entry_1_points) || 0;
                totalFplPts += myPts;
                if (myPts > oppPts)  { h2hPts += 3; return 'W'; }
                if (myPts === oppPts) { h2hPts += 1; return 'D'; }
                return 'L';
            });

            return {
                managerId,
                info: managerMap[managerId],
                results,       // array of 'W'/'D'/'L', oldest first
                h2hPts,
                totalFplPts,
                played: recent.length,
            };
        });

        // Sort by H2H form points, then total FPL points as tiebreaker
        formRows.sort((a, b) => b.h2hPts - a.h2hPts || b.totalFplPts - a.totalFplPts);

        formContainer.innerHTML = '';

        // Sub-heading with last-N note
        const subHead = document.createElement('div');
        subHead.className = 'ceefax-info';
        subHead.textContent = `LAST ${FORM_MATCHES} MATCHES`;
        formContainer.appendChild(subHead);

        // Table header
        const header = document.createElement('div');
        header.className = 'ceefax-form-table-header';
        header.innerHTML = `
            <div class="ceefax-form-pos">#</div>
            <div class="ceefax-form-team">TEAM (MGR)</div>
            <div class="ceefax-form-results" style="padding-left:5px;">FORM</div>
            <div class="ceefax-form-pts">PTS</div>
        `;
        formContainer.appendChild(header);

        formRows.forEach((row, idx) => {
            const teamEl = document.createElement('div');
            teamEl.className = 'ceefax-form-row';

            const displayName = `${row.info.team} (${row.info.initials})`;

            // Build form results HTML — pad with dashes if fewer than 5 played
            const resultItems = [];
            const padded = Array(FORM_MATCHES).fill(null);
            // Fill from right so most recent is on right
            const offset = FORM_MATCHES - row.results.length;
            row.results.forEach((r, i) => { padded[offset + i] = r; });

            padded.forEach((r, i) => {
                if (i > 0) {
                    resultItems.push(`<span class="ceefax-form-sep">/</span>`);
                }
                if (r === null) {
                    resultItems.push(`<span class="ceefax-form-result" style="color:var(--ceefax-blue)">-</span>`);
                } else {
                    const cls = r === 'W' ? 'ceefax-form-result--w' : r === 'D' ? 'ceefax-form-result--d' : 'ceefax-form-result--l';
                    resultItems.push(`<span class="ceefax-form-result ${cls}">${r}</span>`);
                }
            });

            teamEl.innerHTML = `
                <div class="ceefax-form-pos">${idx + 1}</div>
                <div class="ceefax-form-team">${displayName}</div>
                <div class="ceefax-form-results">${resultItems.join('')}</div>
                <div class="ceefax-form-pts">${row.h2hPts}</div>
            `;

            formContainer.appendChild(teamEl);
        });
    }

    fetchAndRender();
    setInterval(fetchAndRender, 60 * 1000);
});

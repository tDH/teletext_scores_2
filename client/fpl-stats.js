const API_BASE_URL = '/api';

// Clock
function updateTime() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const el = document.getElementById('ceefax-time');
    if (el) el.textContent = `${h}:${m}:${s}`;
}
setInterval(updateTime, 1000);
updateTime();

// Build manager display name: "TEAM NAME (INI)"
function buildManagerMap(managers) {
    const map = {};
    managers.forEach(m => {
        const fullName = `${m.player_first_name || ''} ${m.player_last_name || ''}`.trim();
        const initials = fullName.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).join('') || 'CPU';
        const team = m.entry_name || 'BANG AVERAGE';
        map[m.manager_id] = `${team.toUpperCase()} (${initials})`;
    });
    return map;
}

function computeStats(matches, managerMap) {
    const finished = matches.filter(m => m.finished);

    // ── Highest GW score ──────────────────────────────────────────────────────
    let highScore = { name: '—', gw: 0, points: -Infinity };
    finished.forEach(m => {
        if (m.league_entry_1_points > highScore.points) {
            highScore = { name: managerMap[m.league_entry_1] || '—', gw: m.event, points: m.league_entry_1_points };
        }
        if (m.league_entry_2_points > highScore.points) {
            highScore = { name: managerMap[m.league_entry_2] || '—', gw: m.event, points: m.league_entry_2_points };
        }
    });

    // ── Lowest GW score (exclude 0 — unplayed / BYE) ─────────────────────────
    let lowScore = { name: '—', gw: 0, points: Infinity };
    finished.forEach(m => {
        if (m.league_entry_1_points > 0 && m.league_entry_1_points < lowScore.points) {
            lowScore = { name: managerMap[m.league_entry_1] || '—', gw: m.event, points: m.league_entry_1_points };
        }
        if (m.league_entry_2_points > 0 && m.league_entry_2_points < lowScore.points) {
            lowScore = { name: managerMap[m.league_entry_2] || '—', gw: m.event, points: m.league_entry_2_points };
        }
    });

    // ── Biggest win margin ────────────────────────────────────────────────────
    let bigMargin = { name: '—', gw: 0, margin: 0 };
    finished.forEach(m => {
        const margin = Math.abs(m.league_entry_1_points - m.league_entry_2_points);
        if (margin > bigMargin.margin) {
            const winnerId = m.league_entry_1_points >= m.league_entry_2_points
                ? m.league_entry_1
                : m.league_entry_2;
            bigMargin = { name: managerMap[winnerId] || '—', gw: m.event, margin };
        }
    });

    // ── Win / loss streaks ────────────────────────────────────────────────────
    const allManagerIds = [...new Set(
        finished.flatMap(m => [m.league_entry_1, m.league_entry_2])
    )];

    let longestWin  = { name: '—', length: 0 };
    let longestLoss = { name: '—', length: 0 };

    // Active streak entries: { name, length } for each manager
    const activeWinEntries  = [];
    const activeLossEntries = [];

    allManagerIds.forEach(managerId => {
        const myMatches = finished
            .filter(m => m.league_entry_1 === managerId || m.league_entry_2 === managerId)
            .sort((a, b) => a.event - b.event);

        let curWin = 0, maxWin = 0;
        let curLoss = 0, maxLoss = 0;

        myMatches.forEach(m => {
            const myPts  = m.league_entry_1 === managerId ? m.league_entry_1_points : m.league_entry_2_points;
            const oppPts = m.league_entry_1 === managerId ? m.league_entry_2_points : m.league_entry_1_points;

            if (myPts > oppPts) {
                curWin++;  maxWin  = Math.max(maxWin,  curWin);  curLoss = 0;
            } else if (myPts < oppPts) {
                curLoss++; maxLoss = Math.max(maxLoss, curLoss); curWin  = 0;
            } else {
                curWin = 0; curLoss = 0; // draw resets both
            }
        });

        const name = managerMap[managerId] || '—';
        if (maxWin  > longestWin.length)  longestWin  = { name, length: maxWin };
        if (maxLoss > longestLoss.length) longestLoss = { name, length: maxLoss };

        // Active streak — count consecutive same result from the most recent match backwards
        let activeWin = 0, activeLoss = 0;
        for (let i = myMatches.length - 1; i >= 0; i--) {
            const m = myMatches[i];
            const myPts  = m.league_entry_1 === managerId ? m.league_entry_1_points : m.league_entry_2_points;
            const oppPts = m.league_entry_1 === managerId ? m.league_entry_2_points : m.league_entry_1_points;
            if (myPts > oppPts) {
                if (activeLoss > 0) break;
                activeWin++;
            } else if (myPts < oppPts) {
                if (activeWin > 0) break;
                activeLoss++;
            } else {
                break; // draw ends streak
            }
        }
        if (activeWin  > 0) activeWinEntries.push({ name, length: activeWin });
        if (activeLoss > 0) activeLossEntries.push({ name, length: activeLoss });
    });

    // Keep only teams sharing the longest active streak
    const maxActiveWin  = activeWinEntries.reduce((m, e) => Math.max(m, e.length), 0);
    const maxActiveLoss = activeLossEntries.reduce((m, e) => Math.max(m, e.length), 0);
    const activeWinStreak  = activeWinEntries.filter(e => e.length === maxActiveWin);
    const activeLossStreak = activeLossEntries.filter(e => e.length === maxActiveLoss);

    return { highScore, lowScore, bigMargin, longestWin, longestLoss, activeWinStreak, activeLossStreak };
}

function renderStatBlock(label, rows) {
    const rowsHtml = rows.map(row => `
        <div class="ceefax-stat-row ${row.colour || ''}">
            <div class="ceefax-stat-name">${row.detail}${row.sub ? `<span class="ceefax-stat-gw"> ${row.sub}</span>` : ''}</div>
            <div class="ceefax-stat-value">${row.value}</div>
        </div>
    `).join('');
    return `<div class="ceefax-stat-block"><div class="ceefax-stat-label">${label}</div>${rowsHtml}</div>`;
}

function renderStats(stats) {
    const container = document.getElementById('stats-container');

    const activeWinRows = stats.activeWinStreak.length
        ? stats.activeWinStreak.map(e => ({ detail: e.name, sub: '', value: `${e.length} WINS`, colour: 'ceefax-standing-promotion' }))
        : [{ detail: '—', sub: '', value: '0 WINS', colour: '' }];

    const activeLossRows = stats.activeLossStreak.length
        ? stats.activeLossStreak.map(e => ({ detail: e.name, sub: '', value: `${e.length} LOSSES`, colour: 'ceefax-standing-relegation' }))
        : [{ detail: '—', sub: '', value: '0 LOSSES', colour: '' }];

    container.innerHTML = [
        renderStatBlock('HIGHEST SCORE', [{ detail: stats.highScore.name, sub: `GW ${stats.highScore.gw}`, value: `${stats.highScore.points} PTS`, colour: 'ceefax-standing-promotion' }]),
        renderStatBlock('LOWEST SCORE',  [{ detail: stats.lowScore.name,  sub: `GW ${stats.lowScore.gw}`,  value: `${stats.lowScore.points} PTS`,  colour: 'ceefax-standing-relegation' }]),
        renderStatBlock('BIGGEST WIN MARGIN', [{ detail: stats.bigMargin.name, sub: `GW ${stats.bigMargin.gw}`, value: `+${stats.bigMargin.margin} PTS`, colour: '' }]),
        renderStatBlock('LONGEST WIN STREAK',    [{ detail: stats.longestWin.name,  sub: '', value: `${stats.longestWin.length} WINS`,    colour: '' }]),
        renderStatBlock('LONGEST LOSING STREAK', [{ detail: stats.longestLoss.name, sub: '', value: `${stats.longestLoss.length} LOSSES`, colour: '' }]),
        renderStatBlock('ACTIVE WIN STREAK',    activeWinRows),
        renderStatBlock('ACTIVE LOSING STREAK', activeLossRows),
    ].join('');
}

async function init() {
    try {
        const config = await window.getConfig();
        const leagueId = config.leagueId;

        const response = await fetch(`${API_BASE_URL}/league/${leagueId}/db`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const managerMap = buildManagerMap(data.managers);
        const stats = computeStats(data.matches, managerMap);
        renderStats(stats);

        // Update timestamp
        const now = new Date();
        const updateEl = document.querySelector('.ceefax-update');
        if (updateEl) {
            updateEl.textContent = `UPDATED: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        }
    } catch (err) {
        document.getElementById('stats-container').innerHTML =
            `<div class="ceefax-error">ERROR LOADING STATS</div>`;
        console.error('Stats error:', err);
    }
}

init();
